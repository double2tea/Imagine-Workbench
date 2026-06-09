#!/usr/bin/env python3
"""
Create a DaVinci Resolve .cube LUT from a source frame and an AI-styled target.

The script reuses Imagine Workbench's existing image generation API to create a
styled version of the source frame, then fits a smooth 3D LUT from source->styled.
It can run standalone from the shell or inside Resolve to read the current Color
page thumbnail and apply the generated LUT to the current video item.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw


DEFAULT_WORKBENCH_URL = "http://localhost:3000"
DEFAULT_IMAGE_MODEL = "12ai:gemini-3.1-flash-image-preview"
DEFAULT_IMAGE_RESOLUTION = "1K"
DEFAULT_LUT_SIZE = 33
DEFAULT_POLL_INTERVAL_SECONDS = 4.0
DEFAULT_POLL_TIMEOUT_SECONDS = 600.0
DEFAULT_HTTP_TIMEOUT_SECONDS = 360

LUT_FEASIBILITY_CONSTRAINT = (
    "The result must only change color grade, tone curve, contrast, saturation, "
    "white balance, highlight/shadow color, and overall color mood; preserve the "
    "original composition, objects, identity, texture detail, geometry, lighting "
    "direction, depth of field, exposure structure, and healthy natural skin hue "
    "so the look can be reproduced by a DaVinci Resolve 3D color LUT."
)

STYLE_PRESETS: dict[str, str] = {
    "clean-commercial": (
        "premium commercial grade, clean neutral whites, controlled contrast, "
        "natural skin, polished product-ad color, crisp but not over-sharpened"
    ),
    "orange-teal": (
        "cinematic orange and teal grade, warm skin highlights, cooler cyan "
        "shadows, medium-high contrast, restrained saturation"
    ),
    "warm-film": (
        "warm film print grade, amber highlights, soft shoulder, gentle blacks, "
        "slightly muted greens, elegant midtone warmth"
    ),
    "cool-luxury": (
        "cool luxury campaign grade, clean blue-gray shadows, pearly highlights, "
        "low saturation, refined contrast, premium editorial mood"
    ),
    "bleach-bypass": (
        "bleach bypass inspired grade, reduced saturation, strong contrast, dense "
        "blacks, metallic highlights, gritty but controlled"
    ),
    "soft-pastel": (
        "soft pastel grade, lifted shadows, low contrast, creamy highlights, "
        "gentle color separation, airy commercial mood"
    ),
}


@dataclass(frozen=True)
class LutMetadata:
    prompt: str
    preset: str | None
    reference_image: str | None
    source_color_space: str
    target_color_space: str
    lut_size: int
    strength: float
    workbench_url: str | None
    image_model: str | None
    source_image: str
    styled_image: str
    lut_file: str
    preview_image: str
    scope_report: str
    scope_metrics: str
    grade_spec: str | None
    feasibility_report: str
    validation_report: str
    applied_to_resolve: bool


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    source_path = args.source.expanduser().resolve() if args.source else output_dir / "resolve_source.png"
    if args.source:
        source_image = load_rgb_image(source_path)
    else:
        source_image = read_resolve_current_thumbnail()
        source_image.save(source_path)

    if args.target:
        styled_path = args.target.expanduser().resolve()
        styled_image = load_rgb_image(styled_path)
    else:
        styled_path = output_dir / "styled_frame.png"
        styled_image = generate_styled_frame(args, source_path)
        styled_image.save(styled_path)

    lut_path = resolve_lut_output_path(args, output_dir)
    preview_path = output_dir / "lut_preview.png"
    metadata_path = output_dir / "lut_metadata.json"

    grade_spec_path = output_dir / "grade_spec.json"
    grade_spec = analyze_lut_grade_spec(args, source_image, styled_image, source_path, styled_path, output_dir) if args.llm_grade_spec else None
    if grade_spec is not None:
        grade_spec_path.write_text(json.dumps(grade_spec, ensure_ascii=False, indent=2), encoding="utf-8")
    feasibility_report_path = output_dir / "feasibility_report.json"
    feasibility_report = assess_lut_feasibility(source_image, styled_image, grade_spec, args.skin_roi)
    feasibility_report_path.write_text(json.dumps(feasibility_report, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.allow_unsafe_target and not feasibility_report["passes"]:
        raise RuntimeError(f"Target is not safe to compile as a LUT: {'; '.join(feasibility_report['reasons'])}")

    transform_spec = fit_color_transform(
        source_image,
        styled_image,
        args.sample_count,
        grade_spec,
        args.tone_match_strength,
        args.chroma_match_strength,
        args.skin_roi,
    )
    write_cube_lut(lut_path, transform_spec, args.lut_size, args.strength)
    preview_image = apply_transform(source_image, transform_spec, args.strength)
    preview_image.save(preview_path)
    scope_report_path = output_dir / "scope_report.png"
    scope_metrics_path = output_dir / "scope_metrics.json"
    scope_metrics = write_scope_report(source_image, styled_image, preview_image, scope_report_path)
    scope_metrics_path.write_text(json.dumps(scope_metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    validation_report_path = output_dir / "validation_report.json"
    validation_report = validate_lut_preview(source_image, styled_image, preview_image, args.skin_roi)
    validation_report_path.write_text(json.dumps(validation_report, ensure_ascii=False, indent=2), encoding="utf-8")
    if not args.allow_unsafe_target and not validation_report["passes"]:
        raise RuntimeError(f"Compiled LUT failed scope validation: {'; '.join(validation_report['reasons'])}")

    applied_to_resolve = False
    if args.apply_resolve:
        apply_lut_to_resolve_current_item(lut_path)
        applied_to_resolve = True

    metadata = LutMetadata(
        prompt=build_style_prompt(args.prompt, args.preset, bool(args.reference)),
        preset=args.preset,
        reference_image=str(args.reference.expanduser().resolve()) if args.reference else None,
        source_color_space=args.source_color_space,
        target_color_space=args.target_color_space,
        lut_size=args.lut_size,
        strength=args.strength,
        workbench_url=args.workbench_url if not args.target else None,
        image_model=args.model if not args.target else None,
        source_image=str(source_path),
        styled_image=str(styled_path),
        lut_file=str(lut_path),
        preview_image=str(preview_path),
        scope_report=str(scope_report_path),
        scope_metrics=str(scope_metrics_path),
        grade_spec=str(grade_spec_path) if grade_spec is not None else None,
        feasibility_report=str(feasibility_report_path),
        validation_report=str(validation_report_path),
        applied_to_resolve=applied_to_resolve,
    )
    metadata_path.write_text(json.dumps(asdict(metadata), ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(asdict(metadata), ensure_ascii=False, indent=2))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate an AI-styled frame through Imagine Workbench and fit a DaVinci Resolve .cube LUT.",
    )
    parser.add_argument("--source", type=Path, help="Source frame image. Omit inside Resolve to use the current Color page thumbnail.")
    parser.add_argument("--target", type=Path, help="Already-styled target image. When provided, Workbench generation is skipped.")
    parser.add_argument("--reference", type=Path, help="Optional visual style reference image.")
    parser.add_argument("--prompt", required=True, help="Color style instruction.")
    parser.add_argument("--preset", choices=sorted(STYLE_PRESETS), help="Optional built-in style preset.")
    parser.add_argument("--workbench-url", default=os.environ.get("IMAGINE_WORKBENCH_URL", DEFAULT_WORKBENCH_URL))
    parser.add_argument("--model", default=os.environ.get("IMAGINE_LUT_IMAGE_MODEL", DEFAULT_IMAGE_MODEL))
    parser.add_argument("--image-resolution", default=os.environ.get("IMAGINE_LUT_IMAGE_RESOLUTION", DEFAULT_IMAGE_RESOLUTION))
    parser.add_argument("--aspect-ratio", default="source", help='Image generation aspect ratio, or "source" to infer it from the source frame.')
    parser.add_argument("--thinking-level", default="")
    parser.add_argument("--api-key", default=os.environ.get("IMAGINE_PROVIDER_API_KEY", ""))
    parser.add_argument("--base-url", default=os.environ.get("IMAGINE_PROVIDER_BASE_URL", ""))
    parser.add_argument("--provider-label", default=os.environ.get("IMAGINE_PROVIDER_LABEL", ""))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs/resolve-lut"))
    parser.add_argument("--lut-name", default="imagine_workbench_ai_grade.cube")
    parser.add_argument("--lut-size", type=int, default=DEFAULT_LUT_SIZE)
    parser.add_argument("--strength", type=float, default=1.0)
    parser.add_argument("--sample-count", type=int, default=180_000)
    parser.add_argument("--source-color-space", default="Rec.709 Gamma 2.4")
    parser.add_argument("--target-color-space", default="Rec.709 Gamma 2.4")
    parser.add_argument("--llm-grade-spec", action="store_true", help="Ask Imagine Workbench multimodal chat to analyze source/target/scopes before compiling the LUT.")
    parser.add_argument("--chat-model", default=os.environ.get("IMAGINE_LUT_CHAT_MODEL", "12ai:gemini-3.1-flash-lite-preview"))
    parser.add_argument("--tone-match-strength", type=float, default=0.62)
    parser.add_argument("--chroma-match-strength", type=float, default=0.45)
    parser.add_argument("--skin-roi", type=parse_roi, help="Optional source-space face/skin ROI as x,y,w,h for skin-aware fitting and validation.")
    parser.add_argument("--allow-unsafe-target", action="store_true", help="Write/apply a LUT even when feasibility or scope validation fails.")
    parser.add_argument("--apply-resolve", action="store_true", help="Apply the generated LUT to the current Resolve video item.")
    args = parser.parse_args()

    if args.lut_size < 2:
        raise SystemExit("--lut-size must be at least 2")
    if not 0.0 <= args.strength <= 1.0:
        raise SystemExit("--strength must be between 0 and 1")
    if args.sample_count < 1024:
        raise SystemExit("--sample-count must be at least 1024")
    if not 0.0 <= args.tone_match_strength <= 1.0:
        raise SystemExit("--tone-match-strength must be between 0 and 1")
    if not 0.0 <= args.chroma_match_strength <= 1.0:
        raise SystemExit("--chroma-match-strength must be between 0 and 1")
    if args.reference and not args.reference.expanduser().exists():
        raise SystemExit(f"Reference image not found: {args.reference}")
    return args


def parse_roi(value: str) -> tuple[int, int, int, int]:
    parts = [int(part.strip()) for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("--skin-roi must be x,y,w,h")
    x, y, width, height = parts
    if width <= 0 or height <= 0:
        raise argparse.ArgumentTypeError("--skin-roi width and height must be positive")
    return x, y, width, height


def build_style_prompt(prompt: str, preset: str | None, has_reference: bool) -> str:
    parts = [
        "Create a color-graded version of the first source image.",
        "Keep the same frame content and make it look like the exact same shot after professional color grading.",
    ]
    if preset:
        parts.append(f"Preset look: {STYLE_PRESETS[preset]}.")
    if prompt.strip():
        parts.append(f"User color direction: {prompt.strip()}.")
    if has_reference:
        parts.append("Use the second image only as color, tone, contrast, and mood reference.")
    parts.append(LUT_FEASIBILITY_CONSTRAINT)
    return " ".join(parts)


def generate_styled_frame(args: argparse.Namespace, source_path: Path) -> Image.Image:
    references = [image_to_data_uri(source_path)]
    if args.reference:
        references.append(image_to_data_uri(args.reference.expanduser().resolve()))

    request_body: dict[str, Any] = {
        "prompt": build_style_prompt(args.prompt, args.preset, bool(args.reference)),
        "model": args.model,
        "aspectRatio": args.aspect_ratio,
        "imageResolution": args.image_resolution,
        "referenceImages": references,
    }
    if args.thinking_level:
        request_body["thinkingLevel"] = args.thinking_level

    request_body["aspectRatio"] = resolve_generation_aspect_ratio(args.aspect_ratio, source_path)
    response = post_json(f"{args.workbench_url.rstrip('/')}/api/gemini/generate-image", request_body, provider_headers(args))
    content_type = response["content_type"]
    body = response["body"]
    if content_type.startswith("image/"):
        return Image.open(body).convert("RGB")

    data = read_json_response_body(body, content_type, "image generation")
    if not isinstance(data, dict):
        raise RuntimeError("Image generation response is not an object")

    image_url = read_string(data, "imageUrl")
    if image_url:
        return image_from_url_or_data_uri(image_url, args)

    operation_name = read_string(data, "operationName")
    if operation_name:
        return wait_for_image_operation(args, operation_name)

    raise RuntimeError("Image generation response did not include imageUrl or operationName")


def wait_for_image_operation(args: argparse.Namespace, operation_name: str) -> Image.Image:
    deadline = time.time() + DEFAULT_POLL_TIMEOUT_SECONDS
    while time.time() < deadline:
        status_response = post_json(
            f"{args.workbench_url.rstrip('/')}/api/gemini/video-status",
            {"operationName": operation_name, "model": args.model},
            provider_headers(args),
        )
        status_body = read_json_response_body(status_response["body"], status_response["content_type"], "image status")
        if not isinstance(status_body, dict):
            raise RuntimeError("Image status response is not an object")
        if status_body.get("done") is True and status_body.get("status") == "failed":
            message = read_string(status_body, "errorMessage") or "Async image operation failed"
            raise RuntimeError(message)
        if status_body.get("done") is True:
            download_response = post_json(
                f"{args.workbench_url.rstrip('/')}/api/gemini/image-download",
                {"operationName": operation_name},
                provider_headers(args),
            )
            return Image.open(download_response["body"]).convert("RGB")
        time.sleep(DEFAULT_POLL_INTERVAL_SECONDS)
    raise RuntimeError(f"Timed out waiting for image operation: {operation_name}")


def provider_headers(args: argparse.Namespace) -> dict[str, str]:
    headers: dict[str, str] = {}
    if args.api_key:
        headers["x-ai-api-key"] = args.api_key
    if args.base_url:
        headers["x-ai-base-url"] = args.base_url
    if args.provider_label:
        headers["x-ai-provider-label"] = args.provider_label
    return headers


def resolve_generation_aspect_ratio(value: str, source_path: Path) -> str:
    if value != "source":
        return value
    with Image.open(source_path) as image:
        width, height = image.size
    return nearest_supported_aspect_ratio(width, height)


def nearest_supported_aspect_ratio(width: int, height: int) -> str:
    if width <= 0 or height <= 0:
        raise RuntimeError("Source image dimensions must be positive")
    ratios = [
        ("1:1", 1.0),
        ("2:3", 2 / 3),
        ("3:2", 3 / 2),
        ("3:4", 3 / 4),
        ("4:3", 4 / 3),
        ("4:5", 4 / 5),
        ("5:4", 5 / 4),
        ("9:16", 9 / 16),
        ("16:9", 16 / 9),
        ("21:9", 21 / 9),
        ("1:4", 1 / 4),
        ("1:8", 1 / 8),
        ("4:1", 4.0),
        ("8:1", 8.0),
    ]
    actual = width / height
    return min(ratios, key=lambda item: abs(math.log(actual / item[1])))[0]


def post_json(url: str, body: dict[str, Any], extra_headers: dict[str, str]) -> dict[str, Any]:
    payload = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            **extra_headers,
        },
        method="POST",
    )
    try:
        response = urllib.request.urlopen(request, timeout=DEFAULT_HTTP_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} from {url}: {summarize_http_error(detail)}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(
            f"Cannot connect to Imagine Workbench at {url}. Start the Workbench dev server first, "
            "for example: TWELVE_AI_API_KEY=\"sk_...\" PORT=3001 pnpm dev"
        ) from error
    except TimeoutError as error:
        raise RuntimeError(f"Timed out waiting for Imagine Workbench at {url}") from error
    return {
        "content_type": response.headers.get("Content-Type", ""),
        "body": response,
    }


def read_json_response_body(body: Any, content_type: str, label: str) -> dict[str, Any]:
    text = body.read().decode("utf-8", errors="replace")
    if "application/json" not in content_type.lower():
        raise RuntimeError(f"Workbench {label} response was not JSON: {summarize_http_error(text)}")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Workbench {label} response was invalid JSON: {text[:500]}") from error
    if not isinstance(data, dict):
        raise RuntimeError(f"Workbench {label} response is not an object")
    if isinstance(data.get("error"), str):
        raise RuntimeError(data["error"])
    return data


def summarize_http_error(text: str) -> str:
    stripped = text.strip()
    if not stripped:
        return "empty response"
    if stripped.startswith("<!DOCTYPE html") or stripped.startswith("<html"):
        return "HTML error page returned. Check the Imagine Workbench dev server terminal and restart it if needed."
    return stripped[:1200]


def image_from_url_or_data_uri(value: str, args: argparse.Namespace) -> Image.Image:
    if value.startswith("data:image/"):
        return image_from_data_uri(value)
    if value.startswith("http://") or value.startswith("https://"):
        request = urllib.request.Request(value, headers=provider_headers(args), method="GET")
        response = urllib.request.urlopen(request, timeout=DEFAULT_HTTP_TIMEOUT_SECONDS)
        return Image.open(response).convert("RGB")
    raise RuntimeError("Unsupported imageUrl response")


def read_string(value: dict[str, Any], key: str) -> str | None:
    field = value.get(key)
    return field.strip() if isinstance(field, str) and field.strip() else None


def image_to_data_uri(path: Path) -> str:
    mime_type = mimetypes.guess_type(path.name)[0] or "image/png"
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{data}"


def image_from_data_uri(data_uri: str) -> Image.Image:
    prefix = "base64,"
    marker = data_uri.find(prefix)
    if marker == -1:
        raise RuntimeError("Invalid image data URI")
    raw = base64.b64decode(data_uri[marker + len(prefix):])
    from io import BytesIO

    return Image.open(BytesIO(raw)).convert("RGB")


def load_rgb_image(path: Path) -> Image.Image:
    if not path.exists():
        raise RuntimeError(f"Image not found: {path}")
    return Image.open(path).convert("RGB")


def analyze_lut_grade_spec(
    args: argparse.Namespace,
    source_image: Image.Image,
    styled_image: Image.Image,
    source_path: Path,
    styled_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    scope_input_path = output_dir / "llm_scope_input.png"
    scope_metrics = write_scope_report(source_image, styled_image, styled_image, scope_input_path)
    request_body = {
        "prompt": build_style_prompt(args.prompt, args.preset, bool(args.reference)),
        "model": args.chat_model,
        "sourceImage": image_to_data_uri(source_path),
        "targetImage": image_to_data_uri(styled_path),
        "scopeReport": image_to_data_uri(scope_input_path),
        "scopeMetrics": scope_metrics,
    }
    response = post_json(
        f"{args.workbench_url.rstrip('/')}/api/resolve/lut-grade-spec",
        request_body,
        provider_headers(args),
    )
    data = read_json_response_body(response["body"], response["content_type"], "LUT grade spec")
    grade_spec = data.get("gradeSpec")
    if not isinstance(grade_spec, dict):
        raise RuntimeError("LUT grade spec response did not include gradeSpec")
    return grade_spec


def fit_color_transform(
    source: Image.Image,
    target: Image.Image,
    sample_count: int,
    grade_spec: dict[str, Any] | None,
    tone_match_strength: float,
    chroma_match_strength: float,
    skin_roi: tuple[int, int, int, int] | None,
) -> dict[str, Any]:
    source_array, target_array = aligned_image_arrays(source, target)
    source_y, source_cb, source_cr = rgb_to_ycbcr(source_array)
    target_y, target_cb, target_cr = rgb_to_ycbcr(target_array)
    valid = valid_scope_mask(source_array, source_y)
    skin = skin_scope_mask(source, source_array, source_y, source_cb, source_cr, skin_roi)
    sample_indexes = deterministic_sample_indexes(int(valid.sum()), sample_count)
    valid_indexes = np.flatnonzero(valid.reshape(-1))[sample_indexes]

    source_y_sample = source_y.reshape(-1)[valid_indexes]
    target_y_sample = target_y.reshape(-1)[valid_indexes]
    source_cb_sample = source_cb.reshape(-1)[valid_indexes]
    source_cr_sample = source_cr.reshape(-1)[valid_indexes]
    target_cb_sample = target_cb.reshape(-1)[valid_indexes]
    target_cr_sample = target_cr.reshape(-1)[valid_indexes]
    if source_y_sample.shape[0] < 1024:
        raise RuntimeError("Not enough valid color samples to fit LUT")

    quantile_points = np.array([0.0, 0.02, 0.05, 0.1, 0.18, 0.3, 0.5, 0.7, 0.82, 0.9, 0.95, 0.98, 1.0])
    source_quantiles = np.quantile(source_y_sample, quantile_points)
    target_quantiles = np.quantile(target_y_sample, quantile_points)
    tone_strength = read_grade_number(grade_spec, "toneStrength", tone_match_strength)
    output_quantiles = source_quantiles + (target_quantiles - source_quantiles) * tone_strength
    output_quantiles = apply_grade_tone_controls(source_quantiles, output_quantiles, grade_spec)
    output_quantiles[0] = 0.0
    output_quantiles[-1] = 1.0
    output_quantiles = np.maximum.accumulate(output_quantiles)

    source_chroma = np.sqrt(source_cb_sample * source_cb_sample + source_cr_sample * source_cr_sample)
    target_chroma = np.sqrt(target_cb_sample * target_cb_sample + target_cr_sample * target_cr_sample)
    saturation_ratio = float(np.median(target_chroma) / (np.median(source_chroma) + 1e-6))
    saturation = float(np.clip(1.0 + (saturation_ratio - 1.0) * chroma_match_strength, 0.25, 1.22))
    if grade_spec is not None:
        saturation = read_grade_number(grade_spec, "saturation", saturation)
    centers, cb_shifts, cr_shifts = zone_chroma_shifts(
        source_y_sample,
        source_cb_sample,
        source_cr_sample,
        target_cb_sample,
        target_cr_sample,
        saturation,
    )
    if grade_spec is not None:
        chroma_strength = read_grade_number(grade_spec, "chromaStrength", 1.0)
        temperature_shift = read_grade_number(grade_spec, "temperatureShift", 0.0)
        tint_shift = read_grade_number(grade_spec, "tintShift", 0.0)
        cb_shifts = cb_shifts * chroma_strength - temperature_shift * 0.5 - tint_shift * 0.2
        cr_shifts = cr_shifts * chroma_strength + temperature_shift * 0.5 + tint_shift * 0.2
    else:
        chroma_strength = 1.0
    if int(skin.sum()) >= 2048:
        skin_source_chroma = np.sqrt(source_cb[skin] * source_cb[skin] + source_cr[skin] * source_cr[skin])
        skin_target_chroma = np.sqrt(target_cb[skin] * target_cb[skin] + target_cr[skin] * target_cr[skin])
        skin_saturation = float(np.median(skin_target_chroma) / (np.median(skin_source_chroma) + 1e-6))
        skin_saturation = float(np.clip(skin_saturation, 0.45, 1.12))
        skin_cb_shift = float(np.median(target_cb[skin] - source_cb[skin] * skin_saturation))
        skin_cr_shift = float(np.median(target_cr[skin] - source_cr[skin] * skin_saturation))
    else:
        skin_saturation = 1.0
        skin_cb_shift = 0.0
        skin_cr_shift = 0.0

    return {
        "source_quantiles": source_quantiles,
        "output_quantiles": output_quantiles,
        "centers": centers,
        "cb_shifts": cb_shifts,
        "cr_shifts": cr_shifts,
        "saturation": saturation,
        "skin_protection": read_grade_number(grade_spec, "skinProtection", 1.0),
        "skin_saturation": skin_saturation,
        "skin_cb_shift": float(np.clip(skin_cb_shift, -0.035, 0.035)),
        "skin_cr_shift": float(np.clip(skin_cr_shift, -0.035, 0.035)),
        "chroma_strength": chroma_strength,
    }


def apply_grade_tone_controls(
    source_quantiles: np.ndarray,
    output_quantiles: np.ndarray,
    grade_spec: dict[str, Any] | None,
) -> np.ndarray:
    if grade_spec is None:
        return np.maximum.accumulate(output_quantiles)
    y = source_quantiles
    shadow = read_grade_number(grade_spec, "shadowLift", 0.0) * (1.0 - smoothstep(0.18, 0.45, y))
    midtone = read_grade_number(grade_spec, "midtoneLift", 0.0) * smoothstep(0.18, 0.45, y) * (1.0 - smoothstep(0.62, 0.9, y))
    highlight = read_grade_number(grade_spec, "highlightLift", 0.0) * smoothstep(0.62, 0.9, y)
    contrast = read_grade_number(grade_spec, "contrast", 1.0)
    adjusted = output_quantiles + shadow + midtone + highlight
    adjusted = 0.5 + (adjusted - 0.5) * contrast
    adjusted[0] = 0.0
    adjusted[-1] = 1.0
    return np.maximum.accumulate(np.clip(adjusted, 0.0, 1.0))


def read_grade_number(grade_spec: dict[str, Any] | None, key: str, default: float) -> float:
    if grade_spec is None:
        return default
    value = grade_spec.get(key)
    return float(value) if isinstance(value, (int, float)) and math.isfinite(float(value)) else default


def assess_lut_feasibility(
    source: Image.Image,
    target: Image.Image,
    grade_spec: dict[str, Any] | None,
    skin_roi: tuple[int, int, int, int] | None,
) -> dict[str, Any]:
    source_array, target_array = aligned_image_arrays(source, target)
    source_y, source_cb, source_cr = rgb_to_ycbcr(source_array)
    target_y, target_cb, target_cr = rgb_to_ycbcr(target_array)
    valid = valid_scope_mask(source_array, source_y)
    skin = skin_scope_mask(source, source_array, source_y, source_cb, source_cr, skin_roi)
    source_valid = source_y[valid]
    target_valid = target_y[valid]
    source_percentiles = np.quantile(source_valid, [0.02, 0.1, 0.5, 0.9, 0.98])
    target_percentiles = np.quantile(target_valid, [0.02, 0.1, 0.5, 0.9, 0.98])
    structure_similarity = gradient_similarity(source_y, target_y, valid)
    luma_shift = float(abs(target_percentiles[2] - source_percentiles[2]))
    black_shift = float(abs(target_percentiles[0] - source_percentiles[0]))
    white_shift = float(abs(target_percentiles[-1] - source_percentiles[-1]))
    llm_feasibility = read_grade_number(grade_spec, "lutFeasibility", 1.0 if grade_spec is None else 0.0)
    reasons: list[str] = []
    if structure_similarity < 0.72:
        reasons.append(f"structure similarity is too low ({structure_similarity:.3f})")
    if luma_shift > 0.24:
        reasons.append(f"median luma shift is too large ({luma_shift:.3f})")
    if black_shift > 0.16:
        reasons.append(f"shadow floor shift is too large ({black_shift:.3f})")
    if white_shift > 0.14:
        reasons.append(f"highlight ceiling shift is too large ({white_shift:.3f})")
    if llm_feasibility < 0.65:
        reasons.append(f"LLM LUT feasibility is too low ({llm_feasibility:.3f})")
    skin_report = skin_comparison_metrics(source_y, source_cb, source_cr, target_y, target_cb, target_cr, skin)
    if skin_report["pixels"] >= 2048:
        if skin_report["target_to_source_chroma_ratio"] < 0.45:
            reasons.append(f"target skin chroma is too low ({skin_report['target_to_source_chroma_ratio']:.3f})")
        if skin_report["target_to_source_chroma_ratio"] > 1.25:
            reasons.append(f"target skin chroma is too high ({skin_report['target_to_source_chroma_ratio']:.3f})")
        if skin_report["angle_delta_degrees"] > 12.0:
            reasons.append(f"target skin hue angle shifts too far ({skin_report['angle_delta_degrees']:.2f} deg)")
    non_lut_changes = grade_spec.get("nonLutChanges") if grade_spec else []
    return {
        "passes": len(reasons) == 0,
        "reasons": reasons,
        "structure_similarity": round(structure_similarity, 4),
        "median_luma_shift": round(luma_shift, 4),
        "shadow_floor_shift": round(black_shift, 4),
        "highlight_ceiling_shift": round(white_shift, 4),
        "llm_lut_feasibility": round(llm_feasibility, 4),
        "non_lut_changes": non_lut_changes if isinstance(non_lut_changes, list) else [],
        "source_luma_percentiles": [round(float(v), 4) for v in source_percentiles],
        "target_luma_percentiles": [round(float(v), 4) for v in target_percentiles],
        "skin_roi": list(skin_roi) if skin_roi is not None else None,
        "skin": skin_report,
    }


def gradient_similarity(source_y: np.ndarray, target_y: np.ndarray, valid: np.ndarray) -> float:
    source_gradient = gradient_magnitude(source_y)
    target_gradient = gradient_magnitude(target_y)
    mask = valid & np.isfinite(source_gradient) & np.isfinite(target_gradient)
    if int(mask.sum()) < 1024:
        return 0.0
    source_values = source_gradient[mask]
    target_values = target_gradient[mask]
    source_values = source_values - float(source_values.mean())
    target_values = target_values - float(target_values.mean())
    denominator = float(np.linalg.norm(source_values) * np.linalg.norm(target_values))
    if denominator <= 1e-9:
        return 0.0
    return float(np.clip(np.dot(source_values, target_values) / denominator, -1.0, 1.0))


def gradient_magnitude(y: np.ndarray) -> np.ndarray:
    gradient_x = np.zeros_like(y)
    gradient_y = np.zeros_like(y)
    gradient_x[:, 1:] = np.diff(y, axis=1)
    gradient_y[1:, :] = np.diff(y, axis=0)
    return np.sqrt(gradient_x * gradient_x + gradient_y * gradient_y)


def validate_lut_preview(
    source: Image.Image,
    target: Image.Image,
    preview: Image.Image,
    skin_roi: tuple[int, int, int, int] | None,
) -> dict[str, Any]:
    source_array, target_array = aligned_image_arrays(source, target)
    preview_array, _ = aligned_image_arrays(preview, source)
    source_y, source_cb, source_cr = rgb_to_ycbcr(source_array)
    target_y, target_cb, target_cr = rgb_to_ycbcr(target_array)
    preview_y, preview_cb, preview_cr = rgb_to_ycbcr(preview_array)
    valid = valid_scope_mask(source_array, source_y)
    skin = skin_scope_mask(source, source_array, source_y, source_cb, source_cr, skin_roi)
    source_percentiles = np.quantile(source_y[valid], [0.02, 0.1, 0.5, 0.9, 0.98])
    target_percentiles = np.quantile(target_y[valid], [0.02, 0.1, 0.5, 0.9, 0.98])
    preview_percentiles = np.quantile(preview_y[valid], [0.02, 0.1, 0.5, 0.9, 0.98])
    source_chroma = np.sqrt(source_cb * source_cb + source_cr * source_cr)
    target_chroma = np.sqrt(target_cb * target_cb + target_cr * target_cr)
    preview_chroma = np.sqrt(preview_cb * preview_cb + preview_cr * preview_cr)
    preview_to_source_chroma = float(np.median(preview_chroma[valid]) / (np.median(source_chroma[valid]) + 1e-6))
    preview_to_target_chroma = float(np.median(preview_chroma[valid]) / (np.median(target_chroma[valid]) + 1e-6))
    reasons: list[str] = []
    if not np.all(np.diff(preview_percentiles) >= -1e-6):
        reasons.append("preview luma percentiles are not monotonic")
    if preview_percentiles[0] < source_percentiles[0] - 0.04 or preview_percentiles[0] > target_percentiles[0] + 0.08:
        reasons.append("preview shadow floor is outside safe scope range")
    if preview_percentiles[-1] > 0.96:
        reasons.append("preview highlight ceiling is too close to clipping")
    if not 0.72 <= preview_to_target_chroma <= 1.28:
        reasons.append(f"preview chroma does not match target ({preview_to_target_chroma:.3f})")
    skin_report = skin_comparison_metrics(target_y, target_cb, target_cr, preview_y, preview_cb, preview_cr, skin)
    if skin_report["pixels"] >= 2048:
        if not 0.78 <= skin_report["target_to_source_chroma_ratio"] <= 1.25:
            reasons.append(f"preview skin chroma does not match target ({skin_report['target_to_source_chroma_ratio']:.3f})")
        if skin_report["angle_delta_degrees"] > 7.0:
            reasons.append(f"preview skin hue angle does not match target ({skin_report['angle_delta_degrees']:.2f} deg)")
    return {
        "passes": len(reasons) == 0,
        "reasons": reasons,
        "source_luma_percentiles": [round(float(v), 4) for v in source_percentiles],
        "target_luma_percentiles": [round(float(v), 4) for v in target_percentiles],
        "preview_luma_percentiles": [round(float(v), 4) for v in preview_percentiles],
        "preview_to_source_chroma_ratio": round(preview_to_source_chroma, 4),
        "preview_to_target_chroma_ratio": round(preview_to_target_chroma, 4),
        "skin_roi": list(skin_roi) if skin_roi is not None else None,
        "skin": skin_report,
    }


def aligned_image_arrays(source: Image.Image, target: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    if target.size != source.size:
        target = target.resize(source.size, Image.Resampling.BICUBIC)
    source_array = np.asarray(source, dtype=np.float64) / 255.0
    target_array = np.asarray(target, dtype=np.float64) / 255.0
    return source_array, target_array


def deterministic_sample_indexes(total: int, sample_count: int) -> np.ndarray:
    if total <= sample_count:
        return np.arange(total)
    return np.linspace(0, total - 1, sample_count, dtype=np.int64)


def rgb_to_ycbcr(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    y = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    return y, rgb[..., 2] - y, rgb[..., 0] - y


def ycbcr_to_rgb(y: np.ndarray, cb: np.ndarray, cr: np.ndarray) -> np.ndarray:
    red = y + cr
    blue = y + cb
    green = (y - 0.2126 * red - 0.0722 * blue) / 0.7152
    return np.clip(np.stack((red, green, blue), axis=-1), 0.0, 1.0)


def valid_scope_mask(rgb: np.ndarray, y: np.ndarray) -> np.ndarray:
    return (y > 0.045) & (y < 0.94) & (rgb.max(axis=-1) > 0.06)


def skin_scope_mask(
    source: Image.Image,
    source_array: np.ndarray,
    source_y: np.ndarray,
    source_cb: np.ndarray,
    source_cr: np.ndarray,
    skin_roi: tuple[int, int, int, int] | None,
) -> np.ndarray:
    valid = valid_scope_mask(source_array, source_y)
    if skin_roi is None:
        return valid & (likely_skin_weight(source_cb, source_cr) > 0.35)
    return roi_to_mask(skin_roi, source.size) & valid & (likely_skin_weight(source_cb, source_cr) > 0.12)


def roi_to_mask(roi: tuple[int, int, int, int], size: tuple[int, int]) -> np.ndarray:
    x, y, width, height = roi
    image_width, image_height = size
    mask = np.zeros((image_height, image_width), dtype=bool)
    left = max(0, x)
    top = max(0, y)
    right = min(image_width, x + width)
    bottom = min(image_height, y + height)
    mask[top:bottom, left:right] = True
    return mask


def zone_chroma_shifts(
    source_y: np.ndarray,
    source_cb: np.ndarray,
    source_cr: np.ndarray,
    target_cb: np.ndarray,
    target_cr: np.ndarray,
    saturation: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    centers = [0.0]
    cb_shifts = [0.0]
    cr_shifts = [0.0]
    for low, high in ((0.05, 0.32), (0.25, 0.68), (0.58, 0.93)):
        mask = (source_y >= low) & (source_y <= high)
        if int(mask.sum()) < 256:
            cb_shift = 0.0
            cr_shift = 0.0
        else:
            cb_shift = float(np.median(target_cb[mask] - source_cb[mask] * saturation))
            cr_shift = float(np.median(target_cr[mask] - source_cr[mask] * saturation))
        centers.append((low + high) / 2.0)
        cb_shifts.append(float(np.clip(cb_shift, -0.035, 0.035)))
        cr_shifts.append(float(np.clip(cr_shift, -0.035, 0.035)))
    centers.append(1.0)
    cb_shifts.append(0.0)
    cr_shifts.append(0.0)
    return np.array(centers), np.array(cb_shifts), np.array(cr_shifts)


def transform_rgb(rgb: np.ndarray, transform_spec: dict[str, Any], strength: float) -> np.ndarray:
    y, cb, cr = rgb_to_ycbcr(rgb)
    source_quantiles = transform_spec["source_quantiles"]
    output_quantiles = transform_spec["output_quantiles"]
    centers = transform_spec["centers"]
    cb_shifts = transform_spec["cb_shifts"]
    cr_shifts = transform_spec["cr_shifts"]
    saturation = float(transform_spec["saturation"])
    skin_protection = float(transform_spec["skin_protection"])
    skin_saturation = float(transform_spec["skin_saturation"])
    skin_cb_shift = float(transform_spec["skin_cb_shift"])
    skin_cr_shift = float(transform_spec["skin_cr_shift"])

    tone_mapped = np.interp(y, source_quantiles, output_quantiles)
    scope_weight = smoothstep(0.035, 0.16, y) * (1.0 - smoothstep(0.92, 1.0, y) * 0.65)
    tone_output = y * (1.0 - scope_weight) + tone_mapped * scope_weight

    skin_weight = likely_skin_weight(cb, cr)
    chroma_weight = scope_weight * (1.0 - skin_protection * skin_weight)
    saturation_field = 1.0 + (saturation - 1.0) * scope_weight * (1.0 - skin_protection * 0.75 * skin_weight)
    cb_output = cb * saturation_field + np.interp(y, centers, cb_shifts) * chroma_weight
    cr_output = cr * saturation_field + np.interp(y, centers, cr_shifts) * chroma_weight
    skin_saturation_field = 1.0 + (skin_saturation - 1.0) * scope_weight
    skin_cb_output = cb * skin_saturation_field + skin_cb_shift * scope_weight
    skin_cr_output = cr * skin_saturation_field + skin_cr_shift * scope_weight
    skin_blend = np.clip(skin_weight * skin_protection, 0.0, 1.0)
    cb_output = cb_output * (1.0 - skin_blend) + skin_cb_output * skin_blend
    cr_output = cr_output * (1.0 - skin_blend) + skin_cr_output * skin_blend

    mapped = ycbcr_to_rgb(tone_output, cb_output, cr_output)
    return np.clip(rgb * (1.0 - strength) + mapped * strength, 0.0, 1.0)


def likely_skin_weight(cb: np.ndarray, cr: np.ndarray) -> np.ndarray:
    red_axis = smoothstep(0.015, 0.085, cr)
    blue_axis = 1.0 - smoothstep(0.02, 0.16, np.abs(cb + 0.055))
    return np.clip(red_axis * blue_axis, 0.0, 1.0)


def skin_comparison_metrics(
    source_y: np.ndarray,
    source_cb: np.ndarray,
    source_cr: np.ndarray,
    target_y: np.ndarray,
    target_cb: np.ndarray,
    target_cr: np.ndarray,
    skin: np.ndarray,
) -> dict[str, Any]:
    pixels = int(skin.sum())
    if pixels < 1:
        return {
            "pixels": 0,
            "target_to_source_chroma_ratio": 1.0,
            "angle_delta_degrees": 0.0,
            "source_angle_degrees": 0.0,
            "target_angle_degrees": 0.0,
            "source_median_chroma": 0.0,
            "target_median_chroma": 0.0,
            "source_median_luma": 0.0,
            "target_median_luma": 0.0,
        }
    source_chroma = np.sqrt(source_cb[skin] * source_cb[skin] + source_cr[skin] * source_cr[skin])
    target_chroma = np.sqrt(target_cb[skin] * target_cb[skin] + target_cr[skin] * target_cr[skin])
    source_angle = circular_angle_degrees(source_cb[skin], source_cr[skin], source_chroma)
    target_angle = circular_angle_degrees(target_cb[skin], target_cr[skin], target_chroma)
    return {
        "pixels": pixels,
        "target_to_source_chroma_ratio": round(float(np.median(target_chroma) / (np.median(source_chroma) + 1e-6)), 4),
        "angle_delta_degrees": round(angle_delta_degrees(source_angle, target_angle), 4),
        "source_angle_degrees": round(source_angle, 4),
        "target_angle_degrees": round(target_angle, 4),
        "source_median_chroma": round(float(np.median(source_chroma)), 4),
        "target_median_chroma": round(float(np.median(target_chroma)), 4),
        "source_median_luma": round(float(np.median(source_y[skin])), 4),
        "target_median_luma": round(float(np.median(target_y[skin])), 4),
    }


def circular_angle_degrees(cb: np.ndarray, cr: np.ndarray, weight: np.ndarray) -> float:
    angles = np.arctan2(cr, cb)
    weights = np.maximum(weight, 1e-5)
    return float(np.degrees(np.arctan2(np.sum(np.sin(angles) * weights), np.sum(np.cos(angles) * weights))))


def angle_delta_degrees(left: float, right: float) -> float:
    delta = (right - left + 180.0) % 360.0 - 180.0
    return float(abs(delta))


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    scaled = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return scaled * scaled * (3.0 - 2.0 * scaled)


def apply_transform(source: Image.Image, transform_spec: dict[str, Any], strength: float) -> Image.Image:
    source_array = np.asarray(source, dtype=np.float64) / 255.0
    flat = source_array.reshape(-1, 3)
    mapped = transform_rgb(flat, transform_spec, strength)
    output = (mapped.reshape(source_array.shape) * 255.0).round().astype(np.uint8)
    return Image.fromarray(output, "RGB")


def write_cube_lut(path: Path, transform_spec: dict[str, Any], size: int, strength: float) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    denominator = size - 1
    with path.open("w", encoding="utf-8") as file:
        file.write('TITLE "Imagine Workbench AI Grade"\n')
        file.write(f"LUT_3D_SIZE {size}\n")
        file.write("DOMAIN_MIN 0.0 0.0 0.0\n")
        file.write("DOMAIN_MAX 1.0 1.0 1.0\n")
        for blue_index in range(size):
            for green_index in range(size):
                for red_index in range(size):
                    rgb = np.array([[red_index / denominator, green_index / denominator, blue_index / denominator]])
                    out = transform_rgb(rgb, transform_spec, strength)[0]
                    file.write(f"{out[0]:.7f} {out[1]:.7f} {out[2]:.7f}\n")


def write_scope_report(source: Image.Image, target: Image.Image, preview: Image.Image, path: Path) -> dict[str, Any]:
    source_array = np.asarray(source.convert("RGB"), dtype=np.float64) / 255.0
    source_y, source_cb, source_cr = rgb_to_ycbcr(source_array)
    source_skin = valid_scope_mask(source_array, source_y) & (likely_skin_weight(source_cb, source_cr) > 0.35)
    if int(source_skin.sum()) < 2048:
        source_skin = None
    images = [
        ("Source", source.convert("RGB")),
        ("AI target", target.convert("RGB").resize(source.size, Image.Resampling.BICUBIC)),
        ("LUT preview", preview.convert("RGB").resize(source.size, Image.Resampling.BICUBIC)),
    ]
    metrics = {label: scope_metrics(image, source_skin) for label, image in images}
    cell_width = 280
    cell_height = 180
    label_height = 24
    report = Image.new("RGB", (cell_width * 4, (cell_height + label_height) * len(images)), (245, 245, 245))
    draw = ImageDraw.Draw(report)
    for row, (label, image) in enumerate(images):
        y = row * (cell_height + label_height)
        draw_scope_label(draw, label, 0, y + cell_height, cell_width, label_height)
        thumbnail = image.copy()
        thumbnail.thumbnail((cell_width, cell_height), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (cell_width, cell_height), "black")
        canvas.paste(thumbnail, ((cell_width - thumbnail.width) // 2, (cell_height - thumbnail.height) // 2))
        report.paste(canvas, (0, y))

        histogram = draw_rgb_histogram(image, cell_width, cell_height)
        report.paste(histogram, (cell_width, y))
        draw_scope_label(draw, "RGB histogram", cell_width, y + cell_height, cell_width, label_height)

        waveform = draw_luma_waveform(image, cell_width, cell_height)
        report.paste(waveform, (cell_width * 2, y))
        draw_scope_label(draw, "Y waveform", cell_width * 2, y + cell_height, cell_width, label_height)

        vectorscope = draw_vectorscope(image, cell_width, cell_height)
        report.paste(vectorscope, (cell_width * 3, y))
        draw_scope_label(draw, "Cb/Cr vectorscope", cell_width * 3, y + cell_height, cell_width, label_height)
    path.parent.mkdir(parents=True, exist_ok=True)
    report.save(path)
    return metrics


def draw_scope_label(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, width: int, height: int) -> None:
    draw.rectangle((x, y, x + width, y + height), fill=(255, 255, 255))
    draw.text((x + 8, y + 6), text, fill=(0, 0, 0))


def scope_metrics(image: Image.Image, source_skin: np.ndarray | None = None) -> dict[str, Any]:
    rgb = np.asarray(image, dtype=np.float64) / 255.0
    y, cb, cr = rgb_to_ycbcr(rgb)
    valid = valid_scope_mask(rgb, y)
    chroma = np.sqrt(cb * cb + cr * cr)
    metrics = {
        "luma_percentiles": [round(float(v), 4) for v in np.quantile(y[valid], [0.02, 0.1, 0.5, 0.9, 0.98])],
        "rgb_mean": [round(float(v), 4) for v in rgb[valid].reshape(-1, 3).mean(axis=0)],
        "rgb_stddev": [round(float(v), 4) for v in rgb[valid].reshape(-1, 3).std(axis=0)],
        "median_chroma": round(float(np.median(chroma[valid])), 4),
        "cbcr_median": [
            round(float(np.median(cb[valid])), 4),
            round(float(np.median(cr[valid])), 4),
        ],
    }
    if source_skin is not None and source_skin.shape == y.shape:
        metrics["source_skin_region"] = {
            "pixels": int(source_skin.sum()),
            "luma_median": round(float(np.median(y[source_skin])), 4),
            "chroma_median": round(float(np.median(chroma[source_skin])), 4),
            "cbcr_median": [
                round(float(np.median(cb[source_skin])), 4),
                round(float(np.median(cr[source_skin])), 4),
            ],
            "angle_degrees": round(circular_angle_degrees(cb[source_skin], cr[source_skin], chroma[source_skin]), 4),
        }
    return metrics


def draw_rgb_histogram(image: Image.Image, width: int, height: int) -> Image.Image:
    rgb = np.asarray(image, dtype=np.uint8).reshape(-1, 3)
    canvas = Image.new("RGB", (width, height), (12, 12, 12))
    draw = ImageDraw.Draw(canvas, "RGBA")
    colors = [(255, 80, 80, 130), (80, 255, 110, 130), (80, 140, 255, 130)]
    for channel, color in enumerate(colors):
        hist = np.bincount(rgb[:, channel], minlength=256).astype(np.float64)
        hist = hist / max(float(hist.max()), 1.0)
        points = []
        for index, value in enumerate(hist):
            x = int(index / 255 * (width - 1))
            y = int((1.0 - value) * (height - 12)) + 6
            points.append((x, y))
        draw.line(points, fill=color, width=1)
    return canvas


def draw_luma_waveform(image: Image.Image, width: int, height: int) -> Image.Image:
    rgb = np.asarray(image, dtype=np.float64) / 255.0
    y, _, _ = rgb_to_ycbcr(rgb)
    canvas = Image.new("RGB", (width, height), (12, 12, 12))
    draw = ImageDraw.Draw(canvas, "RGBA")
    for x in range(width):
        source_x = int(x / max(width - 1, 1) * (y.shape[1] - 1))
        column = y[:, source_x]
        low, mid, high = np.quantile(column, [0.05, 0.5, 0.95])
        y_low = int((1.0 - low) * (height - 1))
        y_mid = int((1.0 - mid) * (height - 1))
        y_high = int((1.0 - high) * (height - 1))
        draw.line((x, y_high, x, y_low), fill=(180, 180, 180, 80))
        draw.point((x, y_mid), fill=(255, 255, 255, 210))
    for level in (0.0, 0.25, 0.5, 0.75, 1.0):
        y_level = int((1.0 - level) * (height - 1))
        draw.line((0, y_level, width, y_level), fill=(60, 60, 60, 120))
    return canvas


def draw_vectorscope(image: Image.Image, width: int, height: int) -> Image.Image:
    rgb = np.asarray(image.resize((max(1, width // 2), max(1, height // 2))), dtype=np.float64) / 255.0
    _, cb, cr = rgb_to_ycbcr(rgb)
    canvas = Image.new("RGB", (width, height), (12, 12, 12))
    draw = ImageDraw.Draw(canvas, "RGBA")
    center_x = width // 2
    center_y = height // 2
    radius = min(width, height) * 0.45
    draw.ellipse((center_x - radius, center_y - radius, center_x + radius, center_y + radius), outline=(70, 70, 70, 150))
    draw.line((center_x, 0, center_x, height), fill=(55, 55, 55, 150))
    draw.line((0, center_y, width, center_y), fill=(55, 55, 55, 150))
    draw.line((center_x, center_y, center_x - radius * 0.45, center_y - radius * 0.7), fill=(230, 190, 120, 160))
    flat_cb = cb.reshape(-1)
    flat_cr = cr.reshape(-1)
    step = max(1, flat_cb.shape[0] // 8000)
    for cb_value, cr_value in zip(flat_cb[::step], flat_cr[::step]):
        x = int(center_x + cb_value * radius * 2.2)
        y = int(center_y - cr_value * radius * 2.2)
        if 0 <= x < width and 0 <= y < height:
            draw.point((x, y), fill=(140, 220, 255, 55))
    return canvas


def resolve_lut_output_path(args: argparse.Namespace, output_dir: Path) -> Path:
    lut_name = args.lut_name if args.lut_name.endswith(".cube") else f"{args.lut_name}.cube"
    if args.apply_resolve:
        return resolve_user_lut_dir() / "ImagineWorkbench" / lut_name
    return output_dir / lut_name


def resolve_user_lut_dir() -> Path:
    if sys.platform == "darwin":
        return Path("/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT")
    if os.name == "nt":
        app_data = os.environ.get("APPDATA")
        if not app_data:
            raise RuntimeError("APPDATA is not set; cannot locate Resolve LUT folder")
        return Path(app_data) / "Blackmagic Design/DaVinci Resolve/Support/LUT"
    return Path.home() / ".local/share/DaVinciResolve/LUT"


def read_resolve_current_thumbnail() -> Image.Image:
    resolve = get_resolve()
    project = resolve.GetProjectManager().GetCurrentProject()
    if project is None:
        raise RuntimeError("No current Resolve project")
    timeline = project.GetCurrentTimeline()
    if timeline is None:
        raise RuntimeError("No current Resolve timeline")
    thumbnail = timeline.GetCurrentClipThumbnailImage()
    if not thumbnail:
        raise RuntimeError("No current media thumbnail. Open the Color page and select a clip.")
    width = int(thumbnail["width"])
    height = int(thumbnail["height"])
    data = base64.b64decode(thumbnail["data"])
    return Image.frombytes("RGB", (width, height), data)


def apply_lut_to_resolve_current_item(lut_path: Path) -> None:
    resolve = get_resolve()
    project = resolve.GetProjectManager().GetCurrentProject()
    if project is None:
        raise RuntimeError("No current Resolve project")
    timeline = project.GetCurrentTimeline()
    if timeline is None:
        raise RuntimeError("No current Resolve timeline")
    item = timeline.GetCurrentVideoItem()
    if item is None:
        raise RuntimeError("No current Resolve video item")
    if not project.RefreshLUTList():
        raise RuntimeError("Resolve failed to refresh LUT list")
    relative_lut_path = resolve_relative_lut_path(lut_path)
    node_index = 1
    if item.GetNumNodes() < node_index:
        raise RuntimeError("Current Resolve item has no color nodes")
    if not item.SetLUT(node_index, relative_lut_path):
        raise RuntimeError(f"Resolve failed to apply LUT: {relative_lut_path}")


def resolve_relative_lut_path(lut_path: Path) -> str:
    root = resolve_user_lut_dir().resolve()
    resolved = lut_path.resolve()
    try:
        return str(resolved.relative_to(root))
    except ValueError as error:
        raise RuntimeError(f"LUT must be inside Resolve LUT folder when applying: {root}") from error


def get_resolve() -> Any:
    try:
        import DaVinciResolveScript as dvr_script
    except ImportError:
        scripting_modules = Path("/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules")
        if scripting_modules.exists():
            sys.path.append(str(scripting_modules))
        import DaVinciResolveScript as dvr_script

    resolve = dvr_script.scriptapp("Resolve")
    if resolve is None:
        raise RuntimeError("DaVinci Resolve scripting app is unavailable")
    return resolve


if __name__ == "__main__":
    raise SystemExit(main())
