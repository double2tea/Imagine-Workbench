#!/usr/bin/env python3
"""Imagine Workbench bridge for DaVinci Resolve.

The module is intentionally dependency-free so it can run both from a terminal
and from Resolve's embedded Python environment.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
from dataclasses import dataclass
from pathlib import Path
from time import sleep, time
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urljoin
from urllib.request import Request, urlopen
import uuid


DEFAULT_OUTPUT_DIR = Path("~/Movies/Imagine Resolve Bridge").expanduser()
DEFAULT_JOB_PATH = DEFAULT_OUTPUT_DIR / "job.json"


@dataclass(frozen=True)
class BridgeRoutes:
    image_generations: str = "/v1/images/generations"
    image_edits: str = "/v1/images/edits"
    generate_video: str = "/api/media/generate-video"
    generate_audio: str = "/api/media/generate-audio"
    status: str = "/api/media/status"
    image_download: str = "/api/media/image-download"
    video_download: str = "/api/media/video-download"
    audio_download: str = "/api/media/audio-download"
    audio_speech: str = "/v1/audio/speech"
    audio_transcriptions: str = "/v1/audio/transcriptions"


@dataclass(frozen=True)
class BridgeConfig:
    base_url: str
    output_dir: Path
    routes: BridgeRoutes
    gateway_api_key: str | None = None
    provider_api_key: str | None = None
    provider_base_url: str | None = None
    provider_label: str | None = None


class WorkbenchHttpClient:
    def __init__(self, config: BridgeConfig) -> None:
        self.config = config

    def get_json(self, path: str) -> dict[str, Any]:
        body, content_type = self._request("GET", path)
        self._require_json(content_type, path)
        return json.loads(body.decode("utf-8"))

    def post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        body, content_type = self._request(
            "POST",
            path,
            data=json.dumps(payload).encode("utf-8"),
            extra_headers={"Content-Type": "application/json"},
        )
        self._require_json(content_type, path)
        return json.loads(body.decode("utf-8"))

    def post_json_bytes(self, path: str, payload: dict[str, Any]) -> tuple[bytes, str]:
        return self._request(
            "POST",
            path,
            data=json.dumps(payload).encode("utf-8"),
            extra_headers={"Content-Type": "application/json"},
        )

    def post_multipart_json(
        self,
        path: str,
        fields: dict[str, str],
        files: dict[str, Path],
    ) -> dict[str, Any]:
        body, content_type = self.post_multipart_bytes(path, fields, files)
        self._require_json(content_type, path)
        return json.loads(body.decode("utf-8"))

    def post_multipart_bytes(
        self,
        path: str,
        fields: dict[str, str],
        files: dict[str, Path],
    ) -> tuple[bytes, str]:
        boundary = f"imagine-resolve-{uuid.uuid4().hex}"
        data = encode_multipart(boundary, fields, files)
        return self._request(
            "POST",
            path,
            data=data,
            extra_headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )

    def download(self, url: str) -> tuple[bytes, str]:
        request = Request(url, headers={"Accept": "*/*"})
        with urlopen(request, timeout=120) as response:
            return response.read(), response.headers.get("Content-Type", "application/octet-stream")

    def _request(
        self,
        method: str,
        path: str,
        data: bytes | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[bytes, str]:
        headers = self._headers()
        if extra_headers:
            headers.update(extra_headers)
        request = Request(self._url(path), data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=300) as response:
                return response.read(), response.headers.get("Content-Type", "")
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} failed with HTTP {error.code}: {detail}") from error

    def _url(self, path: str) -> str:
        return urljoin(self.config.base_url.rstrip("/") + "/", path.lstrip("/"))

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "*/*"}
        if self.config.gateway_api_key:
            headers["Authorization"] = f"Bearer {self.config.gateway_api_key}"
        if self.config.provider_api_key:
            headers["x-ai-api-key"] = self.config.provider_api_key
        if self.config.provider_base_url:
            headers["x-ai-base-url"] = self.config.provider_base_url
        if self.config.provider_label:
            headers["x-ai-provider-label"] = self.config.provider_label
        return headers

    @staticmethod
    def _require_json(content_type: str, path: str) -> None:
        if "application/json" not in content_type:
            raise RuntimeError(f"{path} returned {content_type or 'unknown content type'}, expected JSON")


class ResolveController:
    def __init__(self, resolve: Any) -> None:
        self.resolve = resolve

    @classmethod
    def connect(cls) -> "ResolveController":
        try:
            import DaVinciResolveScript as dvr_script  # type: ignore[import-not-found]
        except ImportError as error:
            raise RuntimeError("DaVinciResolveScript is not available. Configure Resolve scripting environment variables.") from error
        resolve = dvr_script.scriptapp("Resolve")
        if resolve is None:
            raise RuntimeError("Could not connect to a running DaVinci Resolve instance")
        return cls(resolve)

    def export_current_frame(self, output_path: Path) -> Path:
        project = self._project()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if not project.ExportCurrentFrameAsStill(str(output_path)):
            raise RuntimeError("Resolve failed to export the current frame")
        return output_path

    def current_clip_source_path(self) -> Path:
        item = self._current_video_item()
        media_pool_item = item.GetMediaPoolItem()
        if media_pool_item is None:
            raise RuntimeError("Current Resolve timeline item has no media pool item")
        file_path = media_pool_item.GetClipProperty("File Path")
        if not isinstance(file_path, str) or not file_path:
            raise RuntimeError("Current Resolve timeline item did not expose a source file path")
        path = Path(file_path).expanduser()
        if not path.is_file():
            raise RuntimeError(f"Current Resolve source file does not exist: {path}")
        return path

    def import_media(self, paths: list[Path], append_to_timeline: bool = False) -> None:
        media_pool = self._project().GetMediaPool()
        imported = media_pool.ImportMedia([str(path) for path in paths])
        if not imported:
            raise RuntimeError("Resolve failed to import generated media")
        if append_to_timeline and not media_pool.AppendToTimeline(imported):
            raise RuntimeError("Resolve failed to append generated media to the timeline")

    def summary(self) -> dict[str, Any]:
        project = self._project()
        timeline = project.GetCurrentTimeline()
        if timeline is None:
            raise RuntimeError("No active Resolve timeline")
        return {
            "project": project.GetName(),
            "timeline": timeline.GetName(),
            "currentPage": self.resolve.GetCurrentPage(),
        }

    def _current_video_item(self) -> Any:
        timeline = self._project().GetCurrentTimeline()
        if timeline is None:
            raise RuntimeError("No active Resolve timeline")
        item = timeline.GetCurrentVideoItem()
        if item is None:
            raise RuntimeError("No current video item at the Resolve playhead")
        return item

    def _project(self) -> Any:
        project_manager = self.resolve.GetProjectManager()
        project = project_manager.GetCurrentProject()
        if project is None:
            raise RuntimeError("No active Resolve project")
        return project


class ImagineResolveBridge:
    def __init__(self, config: BridgeConfig, resolve: ResolveController | None = None) -> None:
        self.config = config
        self.client = WorkbenchHttpClient(config)
        self.resolve = resolve
        self.config.output_dir.mkdir(parents=True, exist_ok=True)

    def capabilities(self) -> dict[str, Any]:
        return self.client.get_json("/api/resolve/capabilities")

    def doctor(self) -> dict[str, Any]:
        result = {
            "backend": self.capabilities(),
            "resolve": self.resolve.summary() if self.resolve else None,
            "outputDir": str(self.config.output_dir),
        }
        return result

    def generate_image(self, prompt: str, model: str, output_name: str) -> Path:
        require_text(prompt, "prompt")
        require_text(model, "model")
        response = self.client.post_json(self.config.routes.image_generations, {
            "model": model,
            "prompt": prompt,
            "response_format": "b64_json",
        })
        image_bytes = read_openai_b64_response(response, "image")
        return self._write(output_name, ".png", image_bytes)

    def edit_image(self, image_path: Path, prompt: str, model: str, operation: str, output_name: str) -> Path:
        require_text(prompt, "prompt")
        require_text(model, "model")
        if not image_path.is_file():
            raise RuntimeError(f"Image file does not exist: {image_path}")
        response = self.client.post_multipart_json(
            self.config.routes.image_edits,
            {
                "model": model,
                "prompt": prompt,
                "operation": operation,
                "response_format": "b64_json",
            },
            {"image": image_path},
        )
        image_bytes = read_openai_b64_response(response, "image")
        return self._write(output_name, ".png", image_bytes)

    def generate_video(
        self,
        prompt: str,
        model: str,
        output_name: str,
        reference_paths: list[Path],
        poll_seconds: int,
    ) -> Path:
        require_text(prompt, "prompt")
        require_text(model, "model")
        result = self.client.post_json(self.config.routes.generate_video, {
            "model": model,
            "prompt": prompt,
            "referenceMedia": [file_to_reference_media(path) for path in reference_paths],
        })
        operation_name = require_response_text(result, "operationName")
        self._wait_for_operation(operation_name, model, poll_seconds)
        video_bytes, content_type = self.client.post_json_bytes(
            self.config.routes.video_download,
            {"operationName": operation_name, "model": model},
        )
        return self._write(output_name, extension_for_content_type(content_type, ".mp4"), video_bytes)

    def tts(self, text: str, model: str, output_name: str, voice: str | None, instructions: str | None) -> Path:
        require_text(text, "text")
        require_text(model, "model")
        payload = {
            "model": model,
            "input": text,
            "response_format": "wav",
        }
        if voice:
            payload["voice"] = voice
        if instructions:
            payload["instructions"] = instructions
        audio_bytes, content_type = self.client.post_json_bytes(self.config.routes.audio_speech, payload)
        return self._write(output_name, extension_for_content_type(content_type, ".wav"), audio_bytes)

    def transcribe(self, audio_path: Path, model: str, output_name: str, language: str | None) -> tuple[Path, Path]:
        require_text(model, "model")
        if not audio_path.is_file():
            raise RuntimeError(f"Audio file does not exist: {audio_path}")
        fields = {"model": model, "response_format": "json"}
        if language:
            fields["language"] = language
        response = self.client.post_multipart_json(
            self.config.routes.audio_transcriptions,
            fields,
            {"file": audio_path},
        )
        text = require_response_text(response, "text")
        txt_path = self._write_text(output_name, ".txt", text)
        srt_path = self._write_text(output_name, ".srt", transcript_to_srt(text))
        return txt_path, srt_path

    def export_current_frame(self, output_name: str) -> Path:
        if self.resolve is None:
            raise RuntimeError("Current-frame export requires a Resolve connection")
        return self.resolve.export_current_frame(self.config.output_dir / f"{safe_stem(output_name)}.png")

    def current_clip_source_path(self) -> Path:
        if self.resolve is None:
            raise RuntimeError("current-clip-source requires a Resolve connection")
        return self.resolve.current_clip_source_path()

    def import_outputs(self, paths: list[Path], append_to_timeline: bool) -> None:
        if self.resolve is None:
            raise RuntimeError("Resolve import requested but no Resolve connection is available")
        self.resolve.import_media(paths, append_to_timeline)

    def _wait_for_operation(self, operation_name: str, model: str, poll_seconds: int) -> None:
        deadline = time() + poll_seconds
        while time() < deadline:
            status = self.client.post_json(self.config.routes.status, {"operationName": operation_name, "model": model})
            if status.get("done") is True:
                if status.get("errorMessage"):
                    raise RuntimeError(str(status["errorMessage"]))
                return
            sleep(2)
        raise RuntimeError(f"Timed out waiting for operation: {operation_name}")

    def _write(self, output_name: str, extension: str, data: bytes) -> Path:
        path = self.config.output_dir / f"{safe_stem(output_name)}{extension}"
        path.write_bytes(data)
        return path

    def _write_text(self, output_name: str, extension: str, text: str) -> Path:
        path = self.config.output_dir / f"{safe_stem(output_name)}{extension}"
        path.write_text(text, encoding="utf-8")
        return path


def build_config(args: argparse.Namespace) -> BridgeConfig:
    return BridgeConfig(
        base_url=args.base_url or os.environ.get("IMAGINE_WORKBENCH_URL", "http://localhost:3000"),
        gateway_api_key=args.api_key or os.environ.get("IMAGINE_WORKBENCH_API_KEY"),
        provider_api_key=args.provider_api_key or os.environ.get("IMAGINE_PROVIDER_API_KEY"),
        provider_base_url=args.provider_base_url or os.environ.get("IMAGINE_PROVIDER_BASE_URL"),
        provider_label=args.provider_label or os.environ.get("IMAGINE_PROVIDER_LABEL"),
        output_dir=Path(args.output_dir or os.environ.get("IMAGINE_RESOLVE_OUTPUT_DIR", str(DEFAULT_OUTPUT_DIR))).expanduser(),
        routes=BridgeRoutes(),
    )


def connect_resolve_if_needed(args: argparse.Namespace, internal_resolve: Any | None = None) -> ResolveController | None:
    if internal_resolve is not None:
        return ResolveController(internal_resolve)
    needs_resolve = args.connect_resolve or args.import_to_resolve
    if getattr(args, "image", None) == "current-frame":
        needs_resolve = True
    if getattr(args, "image", None) == "current-clip-source":
        needs_resolve = True
    if getattr(args, "audio", None) == "current-clip-source":
        needs_resolve = True
    if "current-frame" in getattr(args, "reference", []):
        needs_resolve = True
    if "current-clip-source" in getattr(args, "reference", []):
        needs_resolve = True
    if needs_resolve:
        return ResolveController.connect()
    return None


def run_cli(argv: list[str] | None = None, internal_resolve: Any | None = None) -> list[Path]:
    parser = build_parser()
    args = parser.parse_args(argv)
    bridge = ImagineResolveBridge(build_config(args), connect_resolve_if_needed(args, internal_resolve))
    outputs = execute_args(bridge, args)
    if args.import_to_resolve:
        bridge.import_outputs(outputs, args.append_to_timeline)
    for path in outputs:
        print(path)
    return outputs


def execute_args(bridge: ImagineResolveBridge, args: argparse.Namespace) -> list[Path]:
    if args.operation == "capabilities":
        print(json.dumps(bridge.capabilities(), ensure_ascii=False, indent=2))
        return []
    if args.operation == "doctor":
        print(json.dumps(bridge.doctor(), ensure_ascii=False, indent=2))
        return []
    output_name = args.output_name or f"imagine_{args.operation}_{int(time())}"
    if args.operation == "generate-image":
        return [bridge.generate_image(args.prompt, args.model, output_name)]
    if args.operation == "edit-image":
        image_path = resolve_media_input(bridge, args.image, output_name, "image")
        return [bridge.edit_image(image_path, args.prompt, args.model, args.image_operation, output_name)]
    if args.operation == "generate-video":
        references = [resolve_media_input(bridge, item, f"{output_name}_reference_{index + 1}", "reference") for index, item in enumerate(args.reference)]
        return [bridge.generate_video(args.prompt, args.model, output_name, references, args.poll_seconds)]
    if args.operation == "tts":
        return [bridge.tts(args.text, args.model, output_name, args.voice, args.instructions)]
    if args.operation == "transcribe":
        txt, srt = bridge.transcribe(resolve_media_input(bridge, args.audio, output_name, "audio"), args.model, output_name, args.language)
        return [txt, srt]
    raise RuntimeError(f"Unsupported operation: {args.operation}")


def run_job(job_path: Path, internal_resolve: Any | None = None) -> list[Path]:
    job = json.loads(job_path.expanduser().read_text(encoding="utf-8"))
    if not isinstance(job, dict):
        raise RuntimeError("Resolve bridge job JSON must be an object")
    argv = job_to_argv(job)
    return run_cli(argv, internal_resolve)


def run_in_resolve() -> list[Path]:
    job_path = Path(os.environ.get("IMAGINE_RESOLVE_JOB", str(DEFAULT_JOB_PATH))).expanduser()
    if not job_path.is_file():
        raise RuntimeError(f"Resolve job file not found: {job_path}")
    return run_job(job_path)


def job_to_argv(job: dict[str, Any]) -> list[str]:
    operation = require_job_text(job, "operation")
    argv = [operation]
    option_map = {
        "apiKey": "--api-key",
        "appendToTimeline": "--append-to-timeline",
        "baseUrl": "--base-url",
        "image": "--image",
        "imageOperation": "--image-operation",
        "importToResolve": "--import-to-resolve",
        "instructions": "--instructions",
        "language": "--language",
        "model": "--model",
        "outputDir": "--output-dir",
        "outputName": "--output-name",
        "pollSeconds": "--poll-seconds",
        "prompt": "--prompt",
        "providerApiKey": "--provider-api-key",
        "providerBaseUrl": "--provider-base-url",
        "providerLabel": "--provider-label",
        "text": "--text",
        "voice": "--voice",
        "audio": "--audio",
    }
    for key, flag in option_map.items():
        if key not in job:
            continue
        value = job[key]
        if isinstance(value, bool):
            if value:
                argv.append(flag)
            continue
        argv.extend([flag, str(value)])
    references = job.get("reference")
    if isinstance(references, list):
        for item in references:
            argv.extend(["--reference", str(item)])
    return argv


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Imagine Workbench DaVinci Resolve bridge")
    parser.add_argument("--base-url", default=None)
    parser.add_argument("--api-key", default=None)
    parser.add_argument("--provider-api-key", default=None)
    parser.add_argument("--provider-base-url", default=None)
    parser.add_argument("--provider-label", default=None)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--connect-resolve", action="store_true")
    parser.add_argument("--import-to-resolve", action="store_true")
    parser.add_argument("--append-to-timeline", action="store_true")

    subparsers = parser.add_subparsers(dest="operation", required=True)
    subparsers.add_parser("capabilities")
    subparsers.add_parser("doctor")

    image = subparsers.add_parser("generate-image")
    image.add_argument("--prompt", required=True)
    image.add_argument("--model", required=True)
    image.add_argument("--output-name", default=None)

    edit = subparsers.add_parser("edit-image")
    edit.add_argument("--image", required=True, help="Path to image file, current-frame, or current-clip-source")
    edit.add_argument("--prompt", required=True)
    edit.add_argument("--model", required=True)
    edit.add_argument("--image-operation", default="redraw", choices=["redraw", "erase", "outpaint", "cutout"])
    edit.add_argument("--output-name", default=None)

    video = subparsers.add_parser("generate-video")
    video.add_argument("--prompt", required=True)
    video.add_argument("--model", required=True)
    video.add_argument("--reference", action="append", default=[], help="Path, current-frame, or current-clip-source")
    video.add_argument("--poll-seconds", type=int, default=600)
    video.add_argument("--output-name", default=None)

    tts = subparsers.add_parser("tts")
    tts.add_argument("--text", required=True)
    tts.add_argument("--model", required=True)
    tts.add_argument("--voice", default=None)
    tts.add_argument("--instructions", default=None)
    tts.add_argument("--output-name", default=None)

    transcribe = subparsers.add_parser("transcribe")
    transcribe.add_argument("--audio", required=True, help="Path to audio file, or current-clip-source")
    transcribe.add_argument("--model", required=True)
    transcribe.add_argument("--language", default=None)
    transcribe.add_argument("--output-name", default=None)
    return parser


def resolve_media_input(bridge: ImagineResolveBridge, value: str, output_name: str, purpose: str) -> Path:
    if value == "current-frame":
        return bridge.export_current_frame(output_name)
    if value == "current-clip-source":
        return bridge.current_clip_source_path()
    path = Path(value).expanduser()
    if not path.is_file():
        raise RuntimeError(f"{purpose} file does not exist: {path}")
    return path


def encode_multipart(boundary: str, fields: dict[str, str], files: dict[str, Path]) -> bytes:
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
            value.encode("utf-8"),
            b"\r\n",
        ])
    for name, path in files.items():
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        chunks.extend([
            f"--{boundary}\r\n".encode("utf-8"),
            f'Content-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'.encode("utf-8"),
            f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
            path.read_bytes(),
            b"\r\n",
        ])
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks)


def read_openai_b64_response(response: dict[str, Any], kind: str) -> bytes:
    data = response.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], dict):
        raise RuntimeError(f"{kind} response did not include data[0]")
    b64_json = data[0].get("b64_json")
    if not isinstance(b64_json, str) or not b64_json:
        raise RuntimeError(f"{kind} response did not include data[0].b64_json")
    return base64.b64decode(b64_json)


def file_to_reference_media(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise RuntimeError(f"Reference file does not exist: {path}")
    data_uri = file_to_data_uri(path)
    media_type = data_uri.split(":", 1)[1].split("/", 1)[0]
    if media_type not in {"image", "video", "audio"}:
        raise RuntimeError(f"Unsupported reference media type: {path}")
    return {"dataUri": data_uri, "type": media_type}


def file_to_data_uri(path: Path) -> str:
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{content_type};base64,{data}"


def extension_for_content_type(content_type: str, default_extension: str) -> str:
    lower = content_type.lower()
    if "audio/wav" in lower or "audio/x-wav" in lower:
        return ".wav"
    if "audio/mpeg" in lower:
        return ".mp3"
    if "video/quicktime" in lower:
        return ".mov"
    if "video/" in lower:
        return ".mp4"
    if "image/jpeg" in lower:
        return ".jpg"
    if "image/webp" in lower:
        return ".webp"
    if "image/" in lower:
        return ".png"
    return default_extension


def transcript_to_srt(text: str) -> str:
    clean = " ".join(text.split())
    return f"1\n00:00:00,000 --> 00:00:05,000\n{clean}\n"


def safe_stem(value: str) -> str:
    safe = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in value.strip())
    if not safe:
        raise RuntimeError("output name is required")
    return safe[:96]


def require_text(value: str | None, name: str) -> str:
    if value is None or not value.strip():
        raise RuntimeError(f"{name} is required")
    return value


def require_response_text(response: dict[str, Any], key: str) -> str:
    value = response.get(key)
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"Response did not include {key}")
    return value


def require_job_text(job: dict[str, Any], key: str) -> str:
    value = job.get(key)
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"Job field {key} is required")
    return value


if __name__ == "__main__":
    run_cli()
