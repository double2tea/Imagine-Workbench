#!/usr/bin/env python3

from __future__ import annotations

import base64
import json
import os
import tempfile
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from threading import Thread
from typing import Any

from imagine_resolve_bridge import BridgeConfig, BridgeRoutes, ImagineResolveBridge, ResolveController, job_to_argv, main, panel_values_to_job, run_cli, run_in_resolve
from install_resolve_bridge import install, uninstall


class MockServer:
    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []
        self.server = HTTPServer(("127.0.0.1", 0), self._handler())
        self.thread = Thread(target=self.server.serve_forever, daemon=True)

    @property
    def url(self) -> str:
        host, port = self.server.server_address
        return f"http://{host}:{port}"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()

    def _handler(self) -> type[BaseHTTPRequestHandler]:
        parent = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                parent.requests.append({"method": "GET", "path": self.path})
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"name": "imagine-resolve-bridge"}).encode("utf-8"))

            def do_POST(self) -> None:
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(length)
                parent.requests.append({
                    "method": "POST",
                    "path": self.path,
                    "content_type": self.headers.get("Content-Type", ""),
                    "authorization": self.headers.get("Authorization", ""),
                    "provider_key": self.headers.get("x-ai-api-key", ""),
                    "body": body,
                })
                if self.path == "/v1/images/generations":
                    self._json({"data": [{"b64_json": base64.b64encode(b"image").decode("ascii")}]})
                    return
                if self.path == "/v1/images/edits":
                    self._json({"data": [{"b64_json": base64.b64encode(b"image").decode("ascii")}]})
                    return
                if self.path == "/v1/audio/speech":
                    self.send_response(200)
                    self.send_header("Content-Type", "audio/wav")
                    self.end_headers()
                    self.wfile.write(b"audio")
                    return
                if self.path == "/v1/audio/transcriptions":
                    self._json({"text": "hello from transcript"})
                    return
                if self.path == "/api/media/generate-video":
                    self._json({"operationName": "mock:video:task_1", "source": "mock"})
                    return
                if self.path == "/api/media/status":
                    self._json({"done": True, "mediaType": "video", "progress": 100, "status": "completed"})
                    return
                if self.path == "/api/media/video-download":
                    self.send_response(200)
                    self.send_header("Content-Type", "video/mp4")
                    self.end_headers()
                    self.wfile.write(b"video")
                    return
                self.send_response(404)
                self.end_headers()

            def log_message(self, format: str, *args: Any) -> None:
                return

            def _json(self, payload: dict[str, Any]) -> None:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode("utf-8"))

        return Handler


class ImagineResolveBridgeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = MockServer()
        self.server.start()
        self.tmp = tempfile.TemporaryDirectory()
        self.bridge = ImagineResolveBridge(BridgeConfig(
            base_url=self.server.url,
            output_dir=Path(self.tmp.name),
            cache_dir=Path(self.tmp.name) / "cache",
            routes=BridgeRoutes(),
            gateway_api_key="gateway",
            provider_api_key="provider",
        ))

    def tearDown(self) -> None:
        self.tmp.cleanup()
        self.server.stop()

    def test_generate_image_saves_openai_b64_response(self) -> None:
        path = self.bridge.generate_image("prompt", "mock:image", "image_result")

        self.assertEqual(path.read_bytes(), b"image")
        request = self.server.requests[-1]
        self.assertEqual(request["path"], "/v1/images/generations")
        self.assertEqual(request["authorization"], "Bearer gateway")
        self.assertEqual(request["provider_key"], "provider")
        body = json.loads(request["body"].decode("utf-8"))
        self.assertEqual(body["response_format"], "b64_json")

    def test_tts_saves_binary_audio(self) -> None:
        path = self.bridge.tts("hello", "mimo:mimo-v2.5-tts", "voice", "Chloe", None)

        self.assertEqual(path.suffix, ".wav")
        self.assertEqual(path.read_bytes(), b"audio")

    def test_transcribe_writes_txt_and_srt(self) -> None:
        audio = Path(self.tmp.name) / "input.wav"
        audio.write_bytes(b"audio")

        txt, srt = self.bridge.transcribe(audio, "mimo:mimo-v2.5-asr", "subtitle", "auto")

        self.assertEqual(txt.read_text(encoding="utf-8"), "hello from transcript")
        self.assertIn("00:00:00,000 --> 00:00:05,000", srt.read_text(encoding="utf-8"))
        self.assertIn("multipart/form-data", self.server.requests[-1]["content_type"])

    def test_generate_video_polls_and_downloads_result(self) -> None:
        path = self.bridge.generate_video("shot", "mock:video", "video_result", [], 10)

        self.assertEqual(path.suffix, ".mp4")
        self.assertEqual(path.read_bytes(), b"video")
        self.assertEqual([item["path"] for item in self.server.requests[-3:]], [
            "/api/media/generate-video",
            "/api/media/status",
            "/api/media/video-download",
        ])

    def test_doctor_reports_backend_and_resolve_summary(self) -> None:
        bridge = ImagineResolveBridge(self.bridge.config, ResolveController(FakeResolve(Path(self.tmp.name) / "source.mp4")))

        result = bridge.doctor()

        self.assertEqual(result["backend"]["name"], "imagine-resolve-bridge")
        self.assertEqual(result["resolve"]["project"], "Project")
        self.assertEqual(result["resolve"]["timeline"], "Timeline")

    def test_doctor_cli_does_not_require_output_name(self) -> None:
        outputs = run_cli([
            "--base-url", self.server.url,
            "--output-dir", self.tmp.name,
            "doctor",
        ])

        self.assertEqual(outputs, [])
        self.assertEqual(self.server.requests[-1]["path"], "/api/resolve/capabilities")

    def test_run_in_resolve_creates_default_doctor_job(self) -> None:
        job_path = Path(self.tmp.name) / "missing-job.json"
        previous = os.environ.get("IMAGINE_RESOLVE_JOB")
        os.environ["IMAGINE_RESOLVE_JOB"] = str(job_path)
        try:
            outputs = run_in_resolve()
        finally:
            if previous is None:
                os.environ.pop("IMAGINE_RESOLVE_JOB", None)
            else:
                os.environ["IMAGINE_RESOLVE_JOB"] = previous

        self.assertEqual(outputs, [])
        self.assertEqual(json.loads(job_path.read_text(encoding="utf-8"))["operation"], "doctor")

    def test_no_arg_main_runs_in_resolve_job(self) -> None:
        job_path = Path(self.tmp.name) / "direct-script-job.json"
        job_path.write_text(json.dumps({
            "operation": "doctor",
            "baseUrl": self.server.url,
        }), encoding="utf-8")
        previous = os.environ.get("IMAGINE_RESOLVE_JOB")
        os.environ["IMAGINE_RESOLVE_JOB"] = str(job_path)
        try:
            outputs = main([])
        finally:
            if previous is None:
                os.environ.pop("IMAGINE_RESOLVE_JOB", None)
            else:
                os.environ["IMAGINE_RESOLVE_JOB"] = previous

        self.assertEqual(outputs, [])
        self.assertEqual(self.server.requests[-1]["path"], "/api/resolve/capabilities")

    def test_run_in_resolve_uses_internal_resolve_for_current_frame(self) -> None:
        job_path = Path(self.tmp.name) / "current-frame-job.json"
        job_path.write_text(json.dumps({
            "operation": "edit-image",
            "baseUrl": self.server.url,
            "outputDir": self.tmp.name,
            "cacheDir": str(Path(self.tmp.name) / "cache"),
            "image": "current-frame",
            "model": "mock:image",
            "prompt": "edit",
            "outputName": "internal_frame",
        }), encoding="utf-8")
        previous = os.environ.get("IMAGINE_RESOLVE_JOB")
        os.environ["IMAGINE_RESOLVE_JOB"] = str(job_path)
        try:
            outputs = run_in_resolve(FakeResolve(Path(self.tmp.name) / "source.mp4"))
        finally:
            if previous is None:
                os.environ.pop("IMAGINE_RESOLVE_JOB", None)
            else:
                os.environ["IMAGINE_RESOLVE_JOB"] = previous

        self.assertEqual(outputs[0].read_bytes(), b"image")
        self.assertTrue((Path(self.tmp.name) / "cache" / "internal_frame.png").is_file())

    def test_current_frame_input_exports_from_resolve_for_image_edit(self) -> None:
        resolve = FakeResolve(Path(self.tmp.name) / "source.mp4")
        outputs = run_cli([
            "--base-url", self.server.url,
            "--output-dir", self.tmp.name,
            "edit-image",
            "--image", "current-frame",
            "--model", "mock:image",
            "--prompt", "edit",
            "--output-name", "edited",
        ], resolve)

        self.assertEqual(outputs[0].read_bytes(), b"image")
        self.assertTrue((Path(self.tmp.name) / "edited.png").is_file())

    def test_current_clip_source_can_feed_video_reference(self) -> None:
        source = Path(self.tmp.name) / "source.mp4"
        source.write_bytes(b"video-source")

        outputs = run_cli([
            "--base-url", self.server.url,
            "--output-dir", self.tmp.name,
            "generate-video",
            "--reference", "current-clip-source",
            "--model", "mock:video",
            "--prompt", "shot",
            "--output-name", "video_from_clip",
        ], FakeResolve(source))

        self.assertEqual(outputs[0].read_bytes(), b"video")
        body = json.loads(self.server.requests[-3]["body"].decode("utf-8"))
        self.assertEqual(body["referenceMedia"][0]["type"], "video")

    def test_current_clip_render_can_feed_video_reference_from_cache(self) -> None:
        cache_dir = Path(self.tmp.name) / "render-cache"

        outputs = run_cli([
            "--base-url", self.server.url,
            "--output-dir", self.tmp.name,
            "--cache-dir", str(cache_dir),
            "generate-video",
            "--reference", "current-clip-render",
            "--model", "mock:video",
            "--prompt", "shot",
            "--output-name", "video_from_render",
        ], FakeResolve(Path(self.tmp.name) / "source.mp4"))

        self.assertEqual(outputs[0].read_bytes(), b"video")
        self.assertTrue((cache_dir / "video_from_render_reference_1.mp4").is_file())
        body = json.loads(self.server.requests[-3]["body"].decode("utf-8"))
        self.assertEqual(body["referenceMedia"][0]["type"], "video")
        self.assertIn("cmVuZGVyZWQ6MjA6NDA=", body["referenceMedia"][0]["dataUri"])

    def test_timeline_inout_render_can_feed_transcription_from_cache(self) -> None:
        cache_dir = Path(self.tmp.name) / "render-cache"

        outputs = run_cli([
            "--base-url", self.server.url,
            "--output-dir", self.tmp.name,
            "--cache-dir", str(cache_dir),
            "transcribe",
            "--audio", "timeline-inout-render",
            "--model", "mimo:mimo-v2.5-asr",
            "--output-name", "timeline_subtitle",
        ], FakeResolve(Path(self.tmp.name) / "source.mp4"))

        self.assertEqual(outputs[0], Path(self.tmp.name) / "timeline_subtitle.txt")
        self.assertTrue((cache_dir / "timeline_subtitle.mp4").is_file())
        self.assertIn(b"rendered:100:130", self.server.requests[-1]["body"])

    def test_job_to_argv_keeps_global_options_before_operation(self) -> None:
        argv = job_to_argv({
            "operation": "generate-video",
            "baseUrl": self.server.url,
            "cacheDir": str(Path(self.tmp.name) / "cache"),
            "outputDir": self.tmp.name,
            "model": "mock:video",
            "prompt": "shot",
            "reference": ["timeline-inout-render"],
        })

        self.assertLess(argv.index("--base-url"), argv.index("generate-video"))
        self.assertLess(argv.index("--cache-dir"), argv.index("generate-video"))
        self.assertGreater(argv.index("--reference"), argv.index("generate-video"))

    def test_panel_values_build_generate_video_job(self) -> None:
        job = panel_values_to_job({
            "operation": "generate-video",
            "baseUrl": self.server.url,
            "model": "mock:video",
            "prompt": "extend this shot",
            "source": "timeline-inout-render",
            "outputName": "shot_extension",
            "importToResolve": True,
            "appendToTimeline": True,
        })

        self.assertEqual(job["reference"], ["timeline-inout-render"])
        self.assertEqual(job["prompt"], "extend this shot")
        self.assertEqual(job["outputName"], "shot_extension")
        self.assertTrue(job["importToResolve"])
        self.assertTrue(job["appendToTimeline"])

    def test_panel_values_build_transcribe_job(self) -> None:
        job = panel_values_to_job({
            "operation": "transcribe",
            "baseUrl": self.server.url,
            "model": "mimo:mimo-v2.5-asr",
            "source": "current-clip-render",
            "language": "auto",
        })

        self.assertEqual(job["audio"], "current-clip-render")
        self.assertEqual(job["language"], "auto")
        self.assertNotIn("prompt", job)

    def test_install_and_uninstall_helper_copies_bridge_files(self) -> None:
        source_dir = Path(self.tmp.name) / "source"
        target_dir = Path(self.tmp.name) / "target"
        source_dir.mkdir()
        for name in ("ImagineWorkbenchResolve.py", "imagine_resolve_bridge.py"):
            (source_dir / name).write_text(name, encoding="utf-8")

        install(target_dir, source_dir)
        self.assertTrue((target_dir / "ImagineWorkbenchResolve.py").is_file())
        self.assertTrue((target_dir / "imagine_resolve_bridge.py").is_file())

        uninstall(target_dir)
        self.assertFalse((target_dir / "ImagineWorkbenchResolve.py").exists())
        self.assertFalse((target_dir / "imagine_resolve_bridge.py").exists())


class FakeResolve:
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path
        if not self.source_path.exists():
            self.source_path.write_bytes(b"source")

    def GetProjectManager(self) -> "FakeProjectManager":
        return FakeProjectManager(self.source_path)

    def GetCurrentPage(self) -> str:
        return "edit"


class FakeProjectManager:
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path

    def GetCurrentProject(self) -> "FakeProject":
        return FakeProject(self.source_path)


class FakeProject:
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path
        self.render_settings: dict[str, Any] = {}
        self.rendering = False

    def GetName(self) -> str:
        return "Project"

    def GetCurrentTimeline(self) -> "FakeTimeline":
        return FakeTimeline(self.source_path)

    def ExportCurrentFrameAsStill(self, path: str) -> bool:
        Path(path).write_bytes(b"frame")
        return True

    def GetMediaPool(self) -> "FakeMediaPool":
        return FakeMediaPool()

    def SetCurrentRenderFormatAndCodec(self, render_format: str, codec: str) -> bool:
        return render_format == "mp4" and codec == "H.264"

    def SetRenderSettings(self, settings: dict[str, Any]) -> bool:
        self.render_settings = settings
        return True

    def AddRenderJob(self) -> str:
        return "job_1"

    def StartRendering(self, job_ids: list[str], interactive: bool) -> bool:
        target_dir = Path(str(self.render_settings["TargetDir"]))
        target_dir.mkdir(parents=True, exist_ok=True)
        output = target_dir / f"{self.render_settings['CustomName']}.mp4"
        output.write_bytes(f"rendered:{self.render_settings['MarkIn']}:{self.render_settings['MarkOut']}".encode("utf-8"))
        self.rendering = False
        return job_ids == ["job_1"] and interactive is False

    def IsRenderingInProgress(self) -> bool:
        return self.rendering

    def StopRendering(self) -> None:
        self.rendering = False

    def GetRenderJobStatus(self, job_id: str) -> dict[str, str]:
        return {"JobStatus": "Complete" if job_id == "job_1" else "Unknown"}


class FakeTimeline:
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path

    def GetName(self) -> str:
        return "Timeline"

    def GetCurrentVideoItem(self) -> "FakeTimelineItem":
        return FakeTimelineItem(self.source_path)

    def GetMarkInOut(self) -> dict[str, dict[str, int]]:
        return {"video": {"in": 100, "out": 130}, "audio": {"in": 100, "out": 130}}


class FakeTimelineItem:
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path

    def GetMediaPoolItem(self) -> "FakeMediaPoolItem":
        return FakeMediaPoolItem(self.source_path)

    def GetStart(self, subframe_precision: bool) -> int:
        return 20

    def GetEnd(self, subframe_precision: bool) -> int:
        return 40


class FakeMediaPoolItem:
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path

    def GetClipProperty(self, key: str) -> str:
        if key != "File Path":
            return ""
        return str(self.source_path)


class FakeMediaPool:
    def ImportMedia(self, paths: list[str]) -> list[str]:
        return paths

    def AppendToTimeline(self, items: list[str]) -> bool:
        return len(items) > 0


if __name__ == "__main__":
    unittest.main()
