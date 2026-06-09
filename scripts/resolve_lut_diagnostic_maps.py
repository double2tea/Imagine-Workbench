#!/usr/bin/env python3
"""Write visual diagnostic maps for a source/target/LUT-preview comparison."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw


def main() -> int:
    args = parse_args()
    source = load_rgb(args.source)
    target = load_rgb(args.target).resize(source.size, Image.Resampling.BICUBIC)
    preview = load_rgb(args.preview).resize(source.size, Image.Resampling.BICUBIC)
    reference = load_rgb(args.reference) if args.reference else None
    skin_roi = parse_roi(args.skin_roi) if args.skin_roi else None
    out_dir = args.output_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    board_path = out_dir / "lut_diagnostic_board.png"
    metrics_path = out_dir / "lut_diagnostic_metrics.json"
    metrics = write_diagnostic_board(source, target, preview, reference, skin_roi, board_path)
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"board": str(board_path), "metrics": str(metrics_path)}, ensure_ascii=False, indent=2))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create LUT color diagnostic maps.")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--skin-roi", help="Optional source-space skin ROI as x,y,w,h.")
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def load_rgb(path: Path) -> Image.Image:
    return Image.open(path.expanduser().resolve()).convert("RGB")


def parse_roi(value: str) -> tuple[int, int, int, int]:
    parts = [int(part.strip()) for part in value.split(",")]
    if len(parts) != 4:
        raise ValueError("--skin-roi must be x,y,w,h")
    x, y, width, height = parts
    if width <= 0 or height <= 0:
        raise ValueError("--skin-roi width and height must be positive")
    return x, y, width, height


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


def write_diagnostic_board(
    source: Image.Image,
    target: Image.Image,
    preview: Image.Image,
    reference: Image.Image | None,
    skin_roi: tuple[int, int, int, int] | None,
    path: Path,
) -> dict[str, Any]:
    source_array = image_array(source)
    target_array = image_array(target)
    preview_array = image_array(preview)
    source_y, source_cb, source_cr = rgb_to_ycbcr(source_array)
    target_y, target_cb, target_cr = rgb_to_ycbcr(target_array)
    preview_y, preview_cb, preview_cr = rgb_to_ycbcr(preview_array)
    valid = valid_mask(source_array, source_y)
    skin = valid & (likely_skin_weight(source_cb, source_cr) > 0.35)
    if skin_roi is not None:
        skin = roi_to_mask(skin_roi, source.size) & valid & (likely_skin_weight(source_cb, source_cr) > 0.12)

    diagnostics = [
        ("Source", source),
        ("Target", target),
        ("LUT preview", preview),
        ("Skin mask on source", draw_mask_overlay(source, skin, (255, 190, 70))),
        ("Luma delta: preview-target", luma_delta_map(preview_y - target_y)),
        ("DeltaE heat: preview-target", delta_e_map(target_array, preview_array, valid)),
        ("Hue delta: preview-target", hue_delta_map(target_cb, target_cr, preview_cb, preview_cr, valid)),
        ("Chroma ratio: preview/target", chroma_ratio_map(target_cb, target_cr, preview_cb, preview_cr, valid)),
        ("Source tone zones", tone_zone_map(source, source_y, valid)),
        ("RGB parade", draw_rgb_parade(source, target, preview, 420, 220)),
        ("Vectorscope + skin", draw_vectorscope_triplet(source, target, preview, skin, 420, 220)),
        ("Tone curve percentiles", draw_tone_curves(source_y, target_y, preview_y, valid, 420, 220)),
        ("ROI color chips", draw_color_chips(source_array, target_array, preview_array, valid, skin, 420, 220)),
    ]
    if reference is not None:
        diagnostics.append(("Reference stats", draw_reference_panel(reference, 420, 220)))

    cell_w, cell_h, label_h = 420, 220, 28
    columns = 3
    rows = math.ceil(len(diagnostics) / columns)
    board = Image.new("RGB", (columns * cell_w, rows * (cell_h + label_h)), (12, 12, 12))
    draw = ImageDraw.Draw(board)
    for index, (label, image) in enumerate(diagnostics):
        x = (index % columns) * cell_w
        y = (index // columns) * (cell_h + label_h)
        tile = contain(image, cell_w, cell_h)
        board.paste(tile, (x, y))
        draw.rectangle((x, y + cell_h, x + cell_w, y + cell_h + label_h), fill=(245, 245, 245))
        draw.text((x + 8, y + cell_h + 8), label, fill=(0, 0, 0))
    board.save(path)

    return {
        "global": {
            "source": image_stats(source_array, valid),
            "target": image_stats(target_array, valid),
            "preview": image_stats(preview_array, valid),
            "reference": image_stats(image_array(reference), None) if reference is not None else None,
        },
        "source_skin_region": {
            "roi": list(skin_roi) if skin_roi is not None else None,
            "source": region_stats(source_array, skin),
            "target": region_stats(target_array, skin),
            "preview": region_stats(preview_array, skin),
        },
        "preview_minus_target": {
            "luma_median_delta": round(float(np.median((preview_y - target_y)[valid])), 4),
            "luma_p10_p90_delta": [round(float(v), 4) for v in np.quantile((preview_y - target_y)[valid], [0.1, 0.9])],
            "skin_luma_median_delta": round(float(np.median((preview_y - target_y)[skin])), 4),
            "skin_chroma_ratio": round(chroma_ratio(target_cb, target_cr, preview_cb, preview_cr, skin), 4),
            "skin_angle_delta_degrees": round(angle_delta(region_angle(target_cb, target_cr, skin), region_angle(preview_cb, preview_cr, skin)), 4),
            "delta_e": delta_e_stats(target_array, preview_array, valid),
            "skin_delta_e": delta_e_stats(target_array, preview_array, skin),
        },
    }


def contain(image: Image.Image, width: int, height: int) -> Image.Image:
    output = Image.new("RGB", (width, height), (0, 0, 0))
    copy = image.convert("RGB")
    copy.thumbnail((width, height), Image.Resampling.LANCZOS)
    output.paste(copy, ((width - copy.width) // 2, (height - copy.height) // 2))
    return output


def image_array(image: Image.Image | None) -> np.ndarray:
    if image is None:
        raise ValueError("image is required")
    return np.asarray(image.convert("RGB"), dtype=np.float64) / 255.0


def rgb_to_ycbcr(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    y = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    return y, rgb[..., 2] - y, rgb[..., 0] - y


def valid_mask(rgb: np.ndarray, y: np.ndarray) -> np.ndarray:
    return (y > 0.045) & (y < 0.94) & (rgb.max(axis=-1) > 0.06)


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    scaled = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return scaled * scaled * (3.0 - 2.0 * scaled)


def likely_skin_weight(cb: np.ndarray, cr: np.ndarray) -> np.ndarray:
    red_axis = smoothstep(0.015, 0.085, cr)
    blue_axis = 1.0 - smoothstep(0.02, 0.16, np.abs(cb + 0.055))
    return np.clip(red_axis * blue_axis, 0.0, 1.0)


def draw_mask_overlay(image: Image.Image, mask: np.ndarray, color: tuple[int, int, int]) -> Image.Image:
    base = np.asarray(image.convert("RGB"), dtype=np.float64)
    overlay = np.zeros_like(base)
    overlay[..., 0] = color[0]
    overlay[..., 1] = color[1]
    overlay[..., 2] = color[2]
    alpha = mask[..., None].astype(np.float64) * 0.52
    output = base * (1.0 - alpha) + overlay * alpha
    return Image.fromarray(np.clip(output, 0, 255).astype(np.uint8), "RGB")


def luma_delta_map(delta: np.ndarray) -> Image.Image:
    scaled = np.clip(delta / 0.18, -1.0, 1.0)
    rgb = np.zeros(delta.shape + (3,), dtype=np.float64)
    rgb[..., 0] = np.clip(scaled, 0.0, 1.0)
    rgb[..., 2] = np.clip(-scaled, 0.0, 1.0)
    rgb[..., 1] = 1.0 - np.abs(scaled)
    return Image.fromarray((rgb * 255).astype(np.uint8), "RGB")


def hue_delta_map(
    target_cb: np.ndarray,
    target_cr: np.ndarray,
    preview_cb: np.ndarray,
    preview_cr: np.ndarray,
    valid: np.ndarray,
) -> Image.Image:
    target_angle = np.arctan2(target_cr, target_cb)
    preview_angle = np.arctan2(preview_cr, preview_cb)
    delta = np.angle(np.exp(1j * (preview_angle - target_angle)))
    chroma = np.sqrt(target_cb * target_cb + target_cr * target_cr)
    visible = valid & (chroma > 0.025)
    normalized = (delta / math.pi + 1.0) * 0.5
    hsv = np.zeros(delta.shape + (3,), dtype=np.float64)
    hsv[..., 0] = normalized
    hsv[..., 1] = visible.astype(np.float64)
    hsv[..., 2] = np.where(visible, 0.95, 0.12)
    return hsv_to_rgb_image(hsv)


def chroma_ratio_map(
    target_cb: np.ndarray,
    target_cr: np.ndarray,
    preview_cb: np.ndarray,
    preview_cr: np.ndarray,
    valid: np.ndarray,
) -> Image.Image:
    target_chroma = np.sqrt(target_cb * target_cb + target_cr * target_cr)
    preview_chroma = np.sqrt(preview_cb * preview_cb + preview_cr * preview_cr)
    ratio = np.clip(preview_chroma / (target_chroma + 1e-6), 0.0, 2.0)
    rgb = np.zeros(ratio.shape + (3,), dtype=np.float64)
    rgb[..., 0] = np.clip(ratio - 1.0, 0.0, 1.0)
    rgb[..., 1] = 1.0 - np.abs(ratio - 1.0)
    rgb[..., 2] = np.clip(1.0 - ratio, 0.0, 1.0)
    rgb[~valid] = 0.05
    return Image.fromarray((rgb * 255).astype(np.uint8), "RGB")


def delta_e_map(target: np.ndarray, preview: np.ndarray, valid: np.ndarray) -> Image.Image:
    delta = delta_e76(target, preview)
    scaled = np.clip(delta / 24.0, 0.0, 1.0)
    rgb = np.zeros(delta.shape + (3,), dtype=np.float64)
    rgb[..., 0] = scaled
    rgb[..., 1] = np.clip(1.0 - np.abs(scaled - 0.35) / 0.35, 0.0, 1.0)
    rgb[..., 2] = np.clip(1.0 - scaled * 2.4, 0.0, 1.0)
    rgb[~valid] = 0.05
    return Image.fromarray((rgb * 255).astype(np.uint8), "RGB")


def delta_e_stats(left: np.ndarray, right: np.ndarray, mask: np.ndarray) -> dict[str, float]:
    delta = delta_e76(left, right)[mask]
    return {
        "median": round(float(np.median(delta)), 3),
        "p90": round(float(np.quantile(delta, 0.9)), 3),
        "p98": round(float(np.quantile(delta, 0.98)), 3),
    }


def delta_e76(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    left_lab = srgb_to_lab(left)
    right_lab = srgb_to_lab(right)
    diff = left_lab - right_lab
    return np.sqrt(np.sum(diff * diff, axis=-1))


def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    transform = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]
    )
    xyz = linear @ transform.T
    xyz = xyz / np.array([0.95047, 1.0, 1.08883])
    epsilon = 216.0 / 24389.0
    kappa = 24389.0 / 27.0
    f = np.where(xyz > epsilon, np.cbrt(xyz), (kappa * xyz + 16.0) / 116.0)
    l = 116.0 * f[..., 1] - 16.0
    a = 500.0 * (f[..., 0] - f[..., 1])
    b = 200.0 * (f[..., 1] - f[..., 2])
    return np.stack((l, a, b), axis=-1)


def tone_zone_map(image: Image.Image, y: np.ndarray, valid: np.ndarray) -> Image.Image:
    base = np.asarray(image.convert("RGB"), dtype=np.float64) / 255.0
    zones = np.zeros_like(base)
    zones[(y < 0.18) & valid] = (0.08, 0.22, 0.85)
    zones[(y >= 0.18) & (y < 0.55) & valid] = (0.18, 0.75, 0.28)
    zones[(y >= 0.55) & (y < 0.82) & valid] = (0.95, 0.70, 0.12)
    zones[(y >= 0.82) & valid] = (0.92, 0.14, 0.12)
    output = base * 0.35 + zones * 0.65
    return Image.fromarray((np.clip(output, 0, 1) * 255).astype(np.uint8), "RGB")


def draw_rgb_parade(source: Image.Image, target: Image.Image, preview: Image.Image, width: int, height: int) -> Image.Image:
    images = [source, target, preview]
    canvas = Image.new("RGB", (width, height), (10, 10, 10))
    draw = ImageDraw.Draw(canvas, "RGBA")
    section = width // 3
    colors = [(255, 70, 70, 120), (70, 255, 110, 120), (80, 140, 255, 120)]
    for index, image in enumerate(images):
        rgb = np.asarray(image.resize((section, height)), dtype=np.float64) / 255.0
        for channel, color in enumerate(colors):
            for x in range(section):
                values = rgb[:, x, channel]
                low, mid, high = np.quantile(values, [0.05, 0.5, 0.95])
                x_pos = index * section + x
                draw.line((x_pos, (1 - high) * height, x_pos, (1 - low) * height), fill=color)
                draw.point((x_pos, (1 - mid) * height), fill=(255, 255, 255, 160))
        draw.text((index * section + 8, 8), ["S", "T", "P"][index], fill=(230, 230, 230))
    return canvas


def draw_vectorscope_triplet(source: Image.Image, target: Image.Image, preview: Image.Image, skin: np.ndarray, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGB", (width, height), (10, 10, 10))
    draw = ImageDraw.Draw(canvas, "RGBA")
    section = width // 3
    for index, image in enumerate([source, target, preview]):
        x_offset = index * section
        draw_single_vectorscope(draw, image.resize(skin.shape[::-1]), skin, x_offset, 0, section, height)
        draw.text((x_offset + 8, 8), ["S", "T", "P"][index], fill=(230, 230, 230))
    return canvas


def draw_single_vectorscope(
    draw: ImageDraw.ImageDraw,
    image: Image.Image,
    skin: np.ndarray,
    x_offset: int,
    y_offset: int,
    width: int,
    height: int,
) -> None:
    rgb = image_array(image)
    _, cb, cr = rgb_to_ycbcr(rgb)
    center_x = x_offset + width // 2
    center_y = y_offset + height // 2
    radius = min(width, height) * 0.42
    draw.ellipse((center_x - radius, center_y - radius, center_x + radius, center_y + radius), outline=(65, 65, 65, 180))
    draw.line((center_x, center_y, center_x - radius * 0.45, center_y - radius * 0.7), fill=(230, 190, 120, 180))
    flat_cb = cb.reshape(-1)
    flat_cr = cr.reshape(-1)
    flat_skin = skin.reshape(-1)
    step = max(1, flat_cb.shape[0] // 5000)
    for cb_value, cr_value, is_skin in zip(flat_cb[::step], flat_cr[::step], flat_skin[::step]):
        x = int(center_x + cb_value * radius * 2.2)
        y = int(center_y - cr_value * radius * 2.2)
        if x_offset <= x < x_offset + width and 0 <= y < height:
            draw.point((x, y), fill=(255, 210, 70, 130) if is_skin else (120, 220, 255, 60))


def draw_tone_curves(source_y: np.ndarray, target_y: np.ndarray, preview_y: np.ndarray, valid: np.ndarray, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGB", (width, height), (10, 10, 10))
    draw = ImageDraw.Draw(canvas, "RGBA")
    quantiles = np.linspace(0.02, 0.98, 49)
    source_q = np.quantile(source_y[valid], quantiles)
    target_q = np.quantile(target_y[valid], quantiles)
    preview_q = np.quantile(preview_y[valid], quantiles)
    draw.line((30, height - 24, width - 12, height - 24), fill=(80, 80, 80))
    draw.line((30, height - 24, 30, 12), fill=(80, 80, 80))
    draw_curve(draw, source_q, target_q, width, height, (90, 200, 255, 220))
    draw_curve(draw, source_q, preview_q, width, height, (255, 210, 70, 220))
    draw.text((40, 14), "cyan=target  yellow=preview", fill=(220, 220, 220))
    return canvas


def draw_curve(draw: ImageDraw.ImageDraw, x_values: np.ndarray, y_values: np.ndarray, width: int, height: int, color: tuple[int, int, int, int]) -> None:
    points = []
    for x_value, y_value in zip(x_values, y_values):
        x = int(30 + x_value * (width - 44))
        y = int((1.0 - y_value) * (height - 36)) + 12
        points.append((x, y))
    draw.line(points, fill=color, width=2)


def draw_color_chips(
    source: np.ndarray,
    target: np.ndarray,
    preview: np.ndarray,
    valid: np.ndarray,
    skin: np.ndarray,
    width: int,
    height: int,
) -> Image.Image:
    canvas = Image.new("RGB", (width, height), (18, 18, 18))
    draw = ImageDraw.Draw(canvas)
    regions = [
        ("skin", skin),
        ("shadow", valid & (rgb_to_ycbcr(source)[0] < 0.22)),
        ("midtone", valid & (rgb_to_ycbcr(source)[0] >= 0.22) & (rgb_to_ycbcr(source)[0] < 0.62)),
        ("highlight", valid & (rgb_to_ycbcr(source)[0] >= 0.62)),
    ]
    columns = [("S", source), ("T", target), ("P", preview)]
    chip_w, chip_h = 72, 34
    for row, (name, mask) in enumerate(regions):
        y = 28 + row * 44
        draw.text((12, y + 10), name, fill=(230, 230, 230))
        for column, (label, array) in enumerate(columns):
            color = median_rgb(array, mask)
            x = 100 + column * 96
            draw.rectangle((x, y, x + chip_w, y + chip_h), fill=color)
            draw.text((x + 4, y + 8), label, fill=(0, 0, 0))
    return canvas


def draw_reference_panel(reference: Image.Image, width: int, height: int) -> Image.Image:
    canvas = contain(reference, width, height)
    rgb = image_array(reference)
    y, cb, cr = rgb_to_ycbcr(rgb)
    chroma = np.sqrt(cb * cb + cr * cr)
    draw = ImageDraw.Draw(canvas, "RGBA")
    text = [
        f"Y median {np.median(y) * 255:.1f}",
        f"Y p98 {np.quantile(y, 0.98) * 255:.1f}",
        f"Chroma med {np.median(chroma):.3f}",
    ]
    draw.rectangle((8, 8, 170, 70), fill=(0, 0, 0, 145))
    for index, line in enumerate(text):
        draw.text((16, 16 + index * 16), line, fill=(245, 245, 245))
    return canvas


def median_rgb(array: np.ndarray, mask: np.ndarray) -> tuple[int, int, int]:
    if int(mask.sum()) < 1:
        return (40, 40, 40)
    values = np.median(array[mask].reshape(-1, 3), axis=0)
    return tuple(int(v) for v in np.clip(values * 255, 0, 255))


def image_stats(array: np.ndarray, valid: np.ndarray | None) -> dict[str, Any]:
    y, cb, cr = rgb_to_ycbcr(array)
    mask = valid if valid is not None else np.ones(y.shape, dtype=bool)
    chroma = np.sqrt(cb * cb + cr * cr)
    return {
        "mean_luma": round(float(y[mask].mean() * 255), 2),
        "median_luma": round(float(np.median(y[mask]) * 255), 2),
        "p02_p98_luma": [round(float(v * 255), 2) for v in np.quantile(y[mask], [0.02, 0.98])],
        "median_chroma": round(float(np.median(chroma[mask])), 4),
        "cbcr_median": [round(float(np.median(cb[mask])), 4), round(float(np.median(cr[mask])), 4)],
    }


def region_stats(array: np.ndarray, mask: np.ndarray) -> dict[str, Any]:
    if int(mask.sum()) < 1:
        return {
            "pixels": 0,
            "median_luma": 0.0,
            "median_chroma": 0.0,
            "angle_degrees": 0.0,
            "cbcr_median": [0.0, 0.0],
        }
    y, cb, cr = rgb_to_ycbcr(array)
    chroma = np.sqrt(cb * cb + cr * cr)
    return {
        "pixels": int(mask.sum()),
        "median_luma": round(float(np.median(y[mask]) * 255), 2),
        "median_chroma": round(float(np.median(chroma[mask])), 4),
        "angle_degrees": round(region_angle(cb, cr, mask), 2),
        "cbcr_median": [round(float(np.median(cb[mask])), 4), round(float(np.median(cr[mask])), 4)],
    }


def region_angle(cb: np.ndarray, cr: np.ndarray, mask: np.ndarray) -> float:
    chroma = np.sqrt(cb * cb + cr * cr)
    angles = np.arctan2(cr[mask], cb[mask])
    weights = np.maximum(chroma[mask], 1e-5)
    return float(np.degrees(np.arctan2(np.sum(np.sin(angles) * weights), np.sum(np.cos(angles) * weights))))


def chroma_ratio(target_cb: np.ndarray, target_cr: np.ndarray, preview_cb: np.ndarray, preview_cr: np.ndarray, mask: np.ndarray) -> float:
    target_chroma = np.sqrt(target_cb * target_cb + target_cr * target_cr)
    preview_chroma = np.sqrt(preview_cb * preview_cb + preview_cr * preview_cr)
    return float(np.median(preview_chroma[mask]) / (np.median(target_chroma[mask]) + 1e-6))


def angle_delta(left: float, right: float) -> float:
    return float(abs((right - left + 180.0) % 360.0 - 180.0))


def hsv_to_rgb_image(hsv: np.ndarray) -> Image.Image:
    h = hsv[..., 0] * 6.0
    s = hsv[..., 1]
    v = hsv[..., 2]
    c = v * s
    x = c * (1.0 - np.abs(h % 2.0 - 1.0))
    m = v - c
    z = np.zeros_like(h)
    rgb = np.zeros(hsv.shape, dtype=np.float64)
    conditions = [
        (0 <= h) & (h < 1),
        (1 <= h) & (h < 2),
        (2 <= h) & (h < 3),
        (3 <= h) & (h < 4),
        (4 <= h) & (h < 5),
        (5 <= h) & (h < 6),
    ]
    values = [(c, x, z), (x, c, z), (z, c, x), (z, x, c), (x, z, c), (c, z, x)]
    for condition, value in zip(conditions, values):
        rgb[..., 0] = np.where(condition, value[0], rgb[..., 0])
        rgb[..., 1] = np.where(condition, value[1], rgb[..., 1])
        rgb[..., 2] = np.where(condition, value[2], rgb[..., 2])
    rgb = rgb + m[..., None]
    return Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB")


if __name__ == "__main__":
    raise SystemExit(main())
