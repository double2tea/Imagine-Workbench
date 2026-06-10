'use client';

import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  Crop,
  Eraser,
  Paintbrush,
  RefreshCw,
  RotateCcw,
  Sliders,
  Type,
  X,
} from "lucide-react";
import {
  clampRectToBounds,
  createAspectRectFromDrag,
  createCenteredAspectRect,
  isUsableCrop,
  moveRectWithinBounds,
  normalizeRect,
  pointInRect,
  resizeRectFromHandle,
  scaleToFitSize,
  type AspectRatio,
  type CanvasRect,
  type CanvasSize,
  type CropResizeHandle,
} from "@/lib/canvas-editor";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import { getImageResolutionOptions } from "@/lib/providers/model-catalog";

export interface CanvasMaskEditorOutput {
  imageBase64: string;
  imageResolution: string;
  maskBase64: string;
  mergedImageBase64: string;
  operation?: ImageEditFeature;
  outputSize: CanvasSize;
  prompt: string;
}

interface CanvasMaskEditorProps {
  imageUrl: string;
  editModel?: string;
  isOpen: boolean;
  operation?: ImageEditFeature;
  initialImageResolution?: string;
  initialPrompt?: string;
  onClose: () => void;
  onSaveMask: (output: CanvasMaskEditorOutput) => void;
}

type EditorMode = "mask" | "erase" | "text" | "crop" | "outpaint";
type OutpaintSide = "left" | "right" | "top" | "bottom";
type CropPresetId = "free" | "original" | "1:1" | "4:5" | "3:4" | "4:3" | "16:9" | "9:16";
type CropDragState =
  | { type: "create"; start: CanvasPoint }
  | { type: "move"; offsetX: number; offsetY: number }
  | { type: "resize"; handle: CropResizeHandle };
type OutpaintDragState = {
  margins: ReturnType<typeof defaultOutpaintMargins>;
  side: OutpaintSide;
  start: CanvasPoint;
};

interface CanvasPoint {
  x: number;
  y: number;
}

interface TextOverlay {
  id: number;
  x: number;
  y: number;
  value: string;
  size: number;
  color: string;
}

const TEXT_COLORS = ["#ffffff", "#111827", "#f97316", "#38bdf8", "#facc15"] as const;
const CROP_HANDLE_HIT_SIZE = 14;
const CROP_MIN_SIZE = 16;
const OUTPAINT_HANDLE_HIT_SIZE = 28;
const OUTPAINT_MAX_MARGIN = 600;
const CROP_PRESETS: Array<{ id: CropPresetId; label: string; ratio: AspectRatio | null }> = [
  { id: "free", label: "自由", ratio: null },
  { id: "original", label: "原图", ratio: null },
  { id: "1:1", label: "1:1", ratio: { width: 1, height: 1 } },
  { id: "4:5", label: "4:5", ratio: { width: 4, height: 5 } },
  { id: "3:4", label: "3:4", ratio: { width: 3, height: 4 } },
  { id: "4:3", label: "4:3", ratio: { width: 4, height: 3 } },
  { id: "16:9", label: "16:9", ratio: { width: 16, height: 9 } },
  { id: "9:16", label: "9:16", ratio: { width: 9, height: 16 } },
];
const EDITOR_MODE_OPTIONS: Array<{ mode: EditorMode; label: string; hint: string; icon: React.ReactNode }> = [
  { mode: "mask", label: "遮罩", hint: "标记需要重绘的区域", icon: <Paintbrush className="h-3.5 w-3.5" /> },
  { mode: "erase", label: "橡皮", hint: "擦除已绘制遮罩", icon: <Eraser className="h-3.5 w-3.5" /> },
  { mode: "text", label: "文字", hint: "点击画布放置文字", icon: <Type className="h-3.5 w-3.5" /> },
  { mode: "crop", label: "裁切", hint: "拖动选框或把手调整构图", icon: <Crop className="h-3.5 w-3.5" /> },
  { mode: "outpaint", label: "扩图", hint: "设置四周扩展像素", icon: <Crop className="h-3.5 w-3.5" /> },
];

const OPERATION_COPY: Record<ImageEditFeature, { title: string; hint: string; promptPlaceholder: string }> = {
  redraw: {
    title: "重绘",
    hint: "绘制蒙版并描述要替换的新内容",
    promptPlaceholder: "例如：把杯子换成玻璃花瓶，保持原有光线",
  },
  erase: {
    title: "擦除",
    hint: "绘制要移除的区域，系统会补全背景",
    promptPlaceholder: "可选：补全背景的要求",
  },
  outpaint: {
    title: "扩图",
    hint: "设置扩展边距并描述延展方向",
    promptPlaceholder: "例如：向右延展厨房台面和窗外自然光",
  },
  cutout: {
    title: "抠图",
    hint: "移除背景并保留主体",
    promptPlaceholder: "可选：主体保留要求",
  },
};

function defaultOutpaintMargins() {
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

function gcd(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function aspectRatioFromSize(size: CanvasSize): string {
  const divisor = gcd(size.width, size.height);
  return `${Math.round(size.width / divisor)}:${Math.round(size.height / divisor)}`;
}

function clampOutpaintMargin(value: number): number {
  return Math.max(0, Math.min(OUTPAINT_MAX_MARGIN, Math.round(value)));
}

function outpaintPreviewSize(canvasSize: CanvasSize, margins: ReturnType<typeof defaultOutpaintMargins>): CanvasSize {
  return {
    width: canvasSize.width + margins.left + margins.right,
    height: canvasSize.height + margins.top + margins.bottom,
  };
}

function getEditorResolutionOptions(model: string | undefined, aspectRatio: string): Array<{ value: string; label: string }> {
  if (!model) return [{ value: "auto", label: "Auto" }];
  const options = getImageResolutionOptions(model, aspectRatio).filter(option => option.value !== "custom");
  return options.length > 0 ? options : [{ value: "auto", label: "Auto" }];
}

function getCropPresetRatio(presetId: CropPresetId, canvasSize: CanvasSize): AspectRatio | null {
  if (presetId === "original") return { width: canvasSize.width, height: canvasSize.height };

  return CROP_PRESETS.find(preset => preset.id === presetId)?.ratio ?? null;
}

function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>): CanvasPoint {
  const canvas = event.currentTarget;
  const rect = canvas.getBoundingClientRect();

  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function getCropResizeHandle(point: CanvasPoint, rect: CanvasRect): CropResizeHandle | null {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const handles: Array<{ handle: CropResizeHandle; x: number; y: number }> = [
    { handle: "nw", x: rect.x, y: rect.y },
    { handle: "ne", x: right, y: rect.y },
    { handle: "se", x: right, y: bottom },
    { handle: "sw", x: rect.x, y: bottom },
    { handle: "n", x: centerX, y: rect.y },
    { handle: "e", x: right, y: centerY },
    { handle: "s", x: centerX, y: bottom },
    { handle: "w", x: rect.x, y: centerY },
  ];

  return handles.find(item => Math.abs(point.x - item.x) <= CROP_HANDLE_HIT_SIZE && Math.abs(point.y - item.y) <= CROP_HANDLE_HIT_SIZE)?.handle ?? null;
}

function getCropCursor(handle: CropResizeHandle | null): string {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";

  return "crosshair";
}

function getOutpaintResizeSide(point: CanvasPoint, size: CanvasSize): OutpaintSide | null {
  const distances: Array<{ side: OutpaintSide; value: number }> = [
    { side: "left" as const, value: point.x },
    { side: "right" as const, value: size.width - point.x },
    { side: "top" as const, value: point.y },
    { side: "bottom" as const, value: size.height - point.y },
  ].filter(item => item.value >= 0 && item.value <= OUTPAINT_HANDLE_HIT_SIZE);

  distances.sort((left, right) => left.value - right.value);
  return distances[0]?.side ?? null;
}

function outpaintCursor(side: OutpaintSide | null): string {
  if (side === "left" || side === "right") return "ew-resize";
  if (side === "top" || side === "bottom") return "ns-resize";
  return "default";
}

function drawTextOverlay(ctx: CanvasRenderingContext2D, item: TextOverlay): void {
  ctx.fillStyle = item.color;
  ctx.font = `700 ${item.size}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = item.color === "#111827" ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.65)";
  ctx.lineWidth = Math.max(2, Math.round(item.size / 9));
  ctx.strokeText(item.value, item.x, item.y);
  ctx.fillText(item.value, item.x, item.y);
}

function drawScaledTextOverlay(
  ctx: CanvasRenderingContext2D,
  item: TextOverlay,
  scaleX: number,
  scaleY: number,
): void {
  drawTextOverlay(ctx, {
    ...item,
    x: item.x * scaleX,
    y: item.y * scaleY,
    size: item.size * Math.min(scaleX, scaleY),
  });
}

function canvasHasVisiblePixels(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 10) return true;
  }

  return false;
}

export default function CanvasMaskEditor({
  editModel,
  imageUrl,
  initialImageResolution = "auto",
  isOpen,
  operation,
  initialPrompt = "",
  onClose,
  onSaveMask,
}: CanvasMaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const cropDragStateRef = useRef<CropDragState | null>(null);
  const outpaintDragStateRef = useRef<OutpaintDragState | null>(null);
  const pendingMaskDataUrlRef = useRef<string | null>(null);
  const textIdRef = useRef(0);

  const [workingImageUrl, setWorkingImageUrl] = useState(imageUrl);
  const [isDrawing, setIsDrawing] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("mask");
  const [editPrompt, setEditPrompt] = useState(initialPrompt);
  const [outpaintMargins, setOutpaintMargins] = useState(defaultOutpaintMargins);
  const [brushSize, setBrushSize] = useState(24);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 500, height: 500 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [textValue, setTextValue] = useState("新文字");
  const [textSize, setTextSize] = useState(36);
  const [textColor, setTextColor] = useState<(typeof TEXT_COLORS)[number]>("#ffffff");
  const [textItems, setTextItems] = useState<TextOverlay[]>([]);
  const [cropRect, setCropRect] = useState<CanvasRect | null>(null);
  const [cropPresetId, setCropPresetId] = useState<CropPresetId>("free");
  const [cropCursor, setCropCursor] = useState("crosshair");
  const [imageResolution, setImageResolution] = useState(initialImageResolution);
  const [outpaintCursorValue, setOutpaintCursorValue] = useState("default");

  const currentOutpaintPreviewSize = outpaintPreviewSize(canvasSize, outpaintMargins);
  const editorStageSize = editorMode === "outpaint" ? currentOutpaintPreviewSize : canvasSize;
  const resolutionAspectRatio = aspectRatioFromSize(operation === "outpaint" ? currentOutpaintPreviewSize : canvasSize);
  const resolutionOptions = getEditorResolutionOptions(editModel, resolutionAspectRatio);
  const selectedImageResolution = resolutionOptions.some(option => option.value === imageResolution)
    ? imageResolution
    : resolutionOptions[0]?.value ?? "auto";
  const hasOutpaintMargins = Object.values(outpaintMargins).some(value => value > 0);
  const operationNeedsPrompt = operation === "redraw" || operation === "outpaint";
  const canApply = operation === "outpaint"
    ? hasOutpaintMargins && (!operationNeedsPrompt || Boolean(editPrompt.trim()))
    : operation
      ? (operation === "cutout" || hasDrawn) && (!operationNeedsPrompt || Boolean(editPrompt.trim()))
      : hasLocalEdits || hasDrawn || textItems.length > 0;
  const canApplyCrop = cropRect !== null && isUsableCrop(cropRect);
  const visibleModeOptions = operation === "outpaint"
    ? EDITOR_MODE_OPTIONS.filter(option => option.mode === "outpaint")
    : EDITOR_MODE_OPTIONS.filter(option => option.mode !== "outpaint");
  const activeMode = visibleModeOptions.find(option => option.mode === editorMode) ?? visibleModeOptions[0] ?? EDITOR_MODE_OPTIONS[0];
  const operationCopy = operation ? OPERATION_COPY[operation] : null;
  const cropSizeLabel = cropRect ? `${Math.round(cropRect.width)} x ${Math.round(cropRect.height)}` : "未选择";

  useEffect(() => {
    if (!isOpen || !workingImageUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const bounds = {
        width: Math.min(window.innerWidth - 64, 720),
        height: Math.min(window.innerHeight - 280, 560),
      };
      const nextSize = scaleToFitSize({ width: img.width, height: img.height }, bounds);

      bgImgRef.current = img;
      setCanvasSize(nextSize);
      setImgLoaded(true);
    };
    img.src = workingImageUrl;
  }, [isOpen, workingImageUrl]);

  useEffect(() => {
    if (!isOpen) return;
    setEditPrompt(initialPrompt);
    setImageResolution(initialImageResolution);
    setOutpaintMargins(defaultOutpaintMargins());
    if (operation === "outpaint") {
      setEditorMode("outpaint");
    } else if (operation === "erase") {
      setEditorMode("mask");
    } else {
      setEditorMode("mask");
    }
  }, [initialImageResolution, initialPrompt, isOpen, operation]);

  useEffect(() => {
    if (!isOpen) return;
    if (!resolutionOptions.some(option => option.value === imageResolution)) {
      setImageResolution(resolutionOptions[0]?.value ?? "auto");
    }
  }, [imageResolution, isOpen, resolutionOptions]);

  useEffect(() => {
    if (!imgLoaded || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pendingMask = pendingMaskDataUrlRef.current;
    if (!pendingMask) {
      setHasDrawn(false);
      return;
    }

    const maskImg = new Image();
    maskImg.onload = () => {
      ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
      setHasDrawn(canvasHasVisiblePixels(canvas));
      pendingMaskDataUrlRef.current = null;
    };
    maskImg.src = pendingMask;
  }, [canvasSize, imgLoaded]);

  if (!isOpen) return null;

  const configureMaskStroke = (ctx: CanvasRenderingContext2D) => {
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = editorMode === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = "rgba(239, 68, 68, 0.62)";
  };

  const addTextOverlay = (point: CanvasPoint) => {
    const value = textValue.trim();
    if (!value) return;

    textIdRef.current += 1;
    setTextItems(prev => [
      ...prev,
      {
        id: textIdRef.current,
        x: point.x,
        y: point.y,
        value,
        size: textSize,
        color: textColor,
      },
    ]);
    setHasLocalEdits(true);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const point = getCanvasPoint(event);

    if (editorMode === "text") {
      addTextOverlay(point);
      return;
    }

    if (editorMode === "outpaint") {
      const side = getOutpaintResizeSide(point, editorStageSize);
      if (!side) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      outpaintDragStateRef.current = { side, start: point, margins: outpaintMargins };
      setOutpaintCursorValue(outpaintCursor(side));
      return;
    }

    if (editorMode === "crop") {
      event.currentTarget.setPointerCapture(event.pointerId);
      const resizeHandle = cropRect ? getCropResizeHandle(point, cropRect) : null;
      if (resizeHandle) {
        cropDragStateRef.current = { type: "resize", handle: resizeHandle };
        return;
      }

      if (cropRect && pointInRect(point.x, point.y, cropRect)) {
        cropDragStateRef.current = {
          type: "move",
          offsetX: point.x - cropRect.x,
          offsetY: point.y - cropRect.y,
        };
        return;
      }

      cropDragStateRef.current = { type: "create", start: point };
      setCropRect({ ...point, width: 0, height: 0 });
      return;
    }

    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDrawing(true);
    setHasDrawn(true);
    configureMaskStroke(ctx);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.01, point.y + 0.01);
    ctx.stroke();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);

    if (editorMode === "outpaint") {
      const dragState = outpaintDragStateRef.current;
      if (dragState) {
        const dx = point.x - dragState.start.x;
        const dy = point.y - dragState.start.y;
        setOutpaintMargins({
          ...dragState.margins,
          left: dragState.side === "left" ? clampOutpaintMargin(dragState.margins.left - dx) : dragState.margins.left,
          right: dragState.side === "right" ? clampOutpaintMargin(dragState.margins.right + dx) : dragState.margins.right,
          top: dragState.side === "top" ? clampOutpaintMargin(dragState.margins.top - dy) : dragState.margins.top,
          bottom: dragState.side === "bottom" ? clampOutpaintMargin(dragState.margins.bottom + dy) : dragState.margins.bottom,
        });
        return;
      }
      setOutpaintCursorValue(outpaintCursor(getOutpaintResizeSide(point, editorStageSize)));
      return;
    }

    if (editorMode === "crop" && cropDragStateRef.current) {
      const dragState = cropDragStateRef.current;
      const cropRatio = getCropPresetRatio(cropPresetId, canvasSize);

      if (dragState.type === "move") {
        setCropRect(prev =>
          prev
            ? moveRectWithinBounds(prev, point.x - dragState.offsetX, point.y - dragState.offsetY, canvasSize)
            : prev,
        );
        return;
      }

      if (dragState.type === "resize") {
        setCropRect(prev =>
          prev
            ? resizeRectFromHandle(prev, dragState.handle, point.x, point.y, canvasSize, cropRatio, CROP_MIN_SIZE)
            : prev,
        );
        return;
      }

      const nextRect = cropRatio
        ? createAspectRectFromDrag(dragState.start.x, dragState.start.y, point.x, point.y, cropRatio, canvasSize)
        : clampRectToBounds(
            normalizeRect(dragState.start.x, dragState.start.y, point.x, point.y),
            canvasSize,
          );
      setCropRect(nextRect);
      return;
    }

    if (editorMode === "crop" && cropRect) {
      const resizeHandle = getCropResizeHandle(point, cropRect);
      setCropCursor(resizeHandle ? getCropCursor(resizeHandle) : pointInRect(point.x, point.y, cropRect) ? "move" : "crosshair");
      return;
    }

    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    configureMaskStroke(ctx);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const stopPointerAction = () => {
    if (editorMode === "crop") {
      cropDragStateRef.current = null;
      setCropRect(prev => (prev && isUsableCrop(prev) ? prev : null));
      return;
    }

    if (editorMode === "outpaint") {
      outpaintDragStateRef.current = null;
      return;
    }

    if (canvasRef.current) {
      setHasDrawn(canvasHasVisiblePixels(canvasRef.current));
    }
    setIsDrawing(false);
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const resetEditor = () => {
    clearMask();
    setWorkingImageUrl(imageUrl);
    setTextItems([]);
    setCropRect(null);
    setCropPresetId("free");
    setCropCursor("crosshair");
    setOutpaintMargins(defaultOutpaintMargins());
    setOutpaintCursorValue("default");
    setHasLocalEdits(false);
  };

  const clearText = () => {
    setTextItems([]);
    setHasLocalEdits(hasDrawn || workingImageUrl !== imageUrl);
  };

  const selectCropPreset = (presetId: CropPresetId) => {
    setCropPresetId(presetId);
    const cropRatio = getCropPresetRatio(presetId, canvasSize);
    if (cropRatio) {
      setCropRect(createCenteredAspectRect(canvasSize, cropRatio, 0.88));
      setCropCursor("move");
    }
  };

  const invertMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) {
        data[index] = 239;
        data[index + 1] = 68;
        data[index + 2] = 68;
        data[index + 3] = 160;
      } else {
        data[index + 3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    setHasDrawn(canvasHasVisiblePixels(canvas));
  };

  const applyCrop = () => {
    const canvas = canvasRef.current;
    const img = bgImgRef.current;
    if (!canvas || !img || !cropRect || !isUsableCrop(cropRect)) return;

    const crop = clampRectToBounds(cropRect, canvasSize);
    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const sourceCrop = {
      x: (crop.x / canvas.width) * sourceWidth,
      y: (crop.y / canvas.height) * sourceHeight,
      width: (crop.width / canvas.width) * sourceWidth,
      height: (crop.height / canvas.height) * sourceHeight,
    };
    const nextNaturalSize = {
      width: Math.max(1, Math.round(sourceCrop.width)),
      height: Math.max(1, Math.round(sourceCrop.height)),
    };

    const nextBaseCanvas = document.createElement("canvas");
    nextBaseCanvas.width = nextNaturalSize.width;
    nextBaseCanvas.height = nextNaturalSize.height;
    const nextBaseCtx = nextBaseCanvas.getContext("2d");
    if (!nextBaseCtx) return;

    nextBaseCtx.drawImage(
      img,
      sourceCrop.x,
      sourceCrop.y,
      sourceCrop.width,
      sourceCrop.height,
      0,
      0,
      nextBaseCanvas.width,
      nextBaseCanvas.height,
    );

    const nextMaskCanvas = document.createElement("canvas");
    nextMaskCanvas.width = nextBaseCanvas.width;
    nextMaskCanvas.height = nextBaseCanvas.height;
    const nextMaskCtx = nextMaskCanvas.getContext("2d");
    if (!nextMaskCtx) return;
    nextMaskCtx.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, nextMaskCanvas.width, nextMaskCanvas.height);

    const hasCroppedMask = canvasHasVisiblePixels(nextMaskCanvas);
    pendingMaskDataUrlRef.current = hasCroppedMask ? nextMaskCanvas.toDataURL("image/png") : null;
    const bounds = {
      width: Math.min(window.innerWidth - 64, 720),
      height: Math.min(window.innerHeight - 280, 560),
    };
    const nextCanvasSize = scaleToFitSize(nextNaturalSize, bounds);
    const textScaleX = crop.width > 0 ? nextCanvasSize.width / crop.width : 1;
    const textScaleY = crop.height > 0 ? nextCanvasSize.height / crop.height : 1;
    setHasDrawn(hasCroppedMask);
    setTextItems(prev =>
      prev
        .filter(item => item.x >= crop.x && item.x <= crop.x + crop.width && item.y >= crop.y && item.y <= crop.y + crop.height)
        .map(item => ({
          ...item,
          x: (item.x - crop.x) * textScaleX,
          y: (item.y - crop.y) * textScaleY,
          size: item.size * Math.min(textScaleX, textScaleY),
        })),
    );
    setCropRect(null);
    setHasLocalEdits(true);
    setImgLoaded(false);
    setWorkingImageUrl(nextBaseCanvas.toDataURL("image/png"));
  };

  const handleApply = () => {
    const canvas = canvasRef.current;
    const img = bgImgRef.current;
    if (!canvas || !img) return;

    if (operation === "outpaint") {
      applyOutpaint(img, canvasSize.width, canvasSize.height);
      return;
    }

    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const scaleX = sourceWidth / canvas.width;
    const scaleY = sourceHeight / canvas.height;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = sourceWidth;
    maskCanvas.height = sourceHeight;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;

    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskCtx.drawImage(canvas, 0, 0, maskCanvas.width, maskCanvas.height);

    const imgData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const data = imgData.data;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 10) {
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
      } else {
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
      }
      data[index + 3] = 255;
    }
    maskCtx.putImageData(imgData, 0, 0);

    const mergeCanvas = document.createElement("canvas");
    mergeCanvas.width = sourceWidth;
    mergeCanvas.height = sourceHeight;
    const mergeCtx = mergeCanvas.getContext("2d");
    if (!mergeCtx) return;

    mergeCtx.drawImage(img, 0, 0, sourceWidth, sourceHeight);
    textItems.forEach(item => drawScaledTextOverlay(mergeCtx, item, scaleX, scaleY));
    mergeCtx.drawImage(canvas, 0, 0, sourceWidth, sourceHeight);

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = sourceWidth;
    baseCanvas.height = sourceHeight;
    const baseCtx = baseCanvas.getContext("2d");
    if (!baseCtx) return;
    baseCtx.drawImage(img, 0, 0, sourceWidth, sourceHeight);
    textItems.forEach(item => drawScaledTextOverlay(baseCtx, item, scaleX, scaleY));

    onSaveMask({
      imageBase64: baseCanvas.toDataURL("image/png"),
      imageResolution: selectedImageResolution,
      maskBase64: maskCanvas.toDataURL("image/png"),
      mergedImageBase64: mergeCanvas.toDataURL("image/png"),
      operation,
      outputSize: { width: sourceWidth, height: sourceHeight },
      prompt: editPrompt.trim(),
    });
    onClose();
  };

  const applyOutpaint = (img: HTMLImageElement, width: number, height: number) => {
    const sourceWidth = img.naturalWidth || img.width;
    const sourceHeight = img.naturalHeight || img.height;
    const scaleX = sourceWidth / width;
    const scaleY = sourceHeight / height;
    const margins = {
      left: Math.round(outpaintMargins.left * scaleX),
      right: Math.round(outpaintMargins.right * scaleX),
      top: Math.round(outpaintMargins.top * scaleY),
      bottom: Math.round(outpaintMargins.bottom * scaleY),
    };
    const nextWidth = sourceWidth + margins.left + margins.right;
    const nextHeight = sourceHeight + margins.top + margins.bottom;
    if (nextWidth <= sourceWidth && nextHeight <= sourceHeight) return;

    const baseCanvas = document.createElement("canvas");
    baseCanvas.width = nextWidth;
    baseCanvas.height = nextHeight;
    const baseCtx = baseCanvas.getContext("2d");
    if (!baseCtx) return;
    baseCtx.fillStyle = "#000000";
    baseCtx.fillRect(0, 0, nextWidth, nextHeight);
    baseCtx.drawImage(img, margins.left, margins.top, sourceWidth, sourceHeight);

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = nextWidth;
    maskCanvas.height = nextHeight;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return;
    maskCtx.fillStyle = "#ffffff";
    maskCtx.fillRect(0, 0, nextWidth, nextHeight);
    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(margins.left, margins.top, sourceWidth, sourceHeight);

    onSaveMask({
      imageBase64: baseCanvas.toDataURL("image/png"),
      imageResolution: selectedImageResolution,
      maskBase64: maskCanvas.toDataURL("image/png"),
      mergedImageBase64: baseCanvas.toDataURL("image/png"),
      operation,
      outputSize: { width: nextWidth, height: nextHeight },
      prompt: editPrompt.trim(),
    });
    onClose();
  };

  const renderModeButton = ({ mode, label, hint, icon }: { mode: EditorMode; label: string; hint: string; icon: React.ReactNode }) => (
    <button
      key={mode}
      type="button"
      onClick={() => setEditorMode(mode)}
      className={`imagine-secondary-action flex h-9 min-w-16 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition ${
        editorMode === mode
          ? "bg-blue-600 text-white shadow-sm shadow-blue-950/40"
          : "text-[var(--iw-muted)] hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
      }`}
      title={hint}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--iw-bg)]/85 p-4 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--iw-border)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--iw-text)]">
              <Paintbrush className="h-4 w-4 text-blue-300" />
              {operationCopy ? operationCopy.title : "图片编辑器"}
            </h3>
            <p className="mt-1 text-xs text-[var(--iw-muted)]">
              {operationCopy ? operationCopy.hint : `${activeMode.label}: ${activeMode.hint}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="imagine-icon-button rounded-lg p-1.5 text-[var(--iw-muted)] transition"
            aria-label="关闭图片编辑器"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto bg-[var(--iw-bg)]/40 p-4 sm:p-6">
          {!imgLoaded ? (
            <div className="flex flex-col items-center justify-center gap-2 text-[var(--iw-muted)]">
              <RefreshCw className="h-8 w-8 animate-spin" />
              <span className="text-sm">正在加载工作面板像素...</span>
            </div>
          ) : (
            <div
              className="relative shrink-0 select-none overflow-hidden rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] shadow-inner"
              style={{
                width: editorStageSize.width,
                height: editorStageSize.height,
                backgroundImage: editorMode === "outpaint" ? undefined : `url(${workingImageUrl})`,
                backgroundPosition: "center",
                backgroundSize: "100% 100%",
              }}
            >
              {editorMode === "outpaint" && (
                <>
                  <div
                    className="pointer-events-none absolute z-0 bg-[var(--iw-bg)]/70"
                    style={{
                      left: outpaintMargins.left,
                      top: outpaintMargins.top,
                      width: canvasSize.width,
                      height: canvasSize.height,
                      backgroundImage: `url(${workingImageUrl})`,
                      backgroundPosition: "center",
                      backgroundSize: "100% 100%",
                    }}
                  />
                  <div
                    className="pointer-events-none absolute z-20 border border-blue-200/80 shadow-[0_0_0_9999px_rgba(59,130,246,0.10)]"
                    style={{
                      left: outpaintMargins.left,
                      top: outpaintMargins.top,
                      width: canvasSize.width,
                      height: canvasSize.height,
                    }}
                  />
                  {(["left", "right", "top", "bottom"] as const).map(side => (
                    <span
                      key={side}
                      className="pointer-events-none absolute z-30 rounded-full border border-blue-200/80 bg-blue-500/80 shadow-lg shadow-blue-950/35"
                      style={{
                        height: side === "left" || side === "right" ? 44 : 10,
                        width: side === "left" || side === "right" ? 10 : 44,
                        left: side === "left" ? 4 : side === "right" ? editorStageSize.width - 14 : "50%",
                        top: side === "top" ? 4 : side === "bottom" ? editorStageSize.height - 14 : "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                    />
                  ))}
                </>
              )}
              <canvas
                ref={canvasRef}
                width={editorStageSize.width}
                height={editorStageSize.height}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopPointerAction}
                onPointerCancel={stopPointerAction}
                onPointerLeave={stopPointerAction}
                className="absolute inset-0 z-10 touch-none"
                style={{
                  cursor: editorMode === "text"
                    ? "text"
                    : editorMode === "crop"
                      ? cropCursor
                      : editorMode === "outpaint"
                        ? outpaintCursorValue
                        : "crosshair",
                }}
              />

              {textItems.map(item => (
                <span
                  key={item.id}
                  className="pointer-events-none absolute z-20 max-w-full whitespace-pre-wrap break-words px-1 text-center font-bold leading-none"
                  style={{
                    color: item.color,
                    fontSize: item.size,
                    left: item.x,
                    top: item.y,
                    textShadow: item.color === "#111827" ? "0 1px 4px rgba(255,255,255,0.8)" : "0 1px 5px rgba(0,0,0,0.8)",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {item.value}
                </span>
              ))}

              {cropRect && (
                <div
                  className="pointer-events-none absolute z-30 border border-blue-300 bg-blue-400/12 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]"
                  style={{
                    left: cropRect.x,
                    top: cropRect.y,
                    width: cropRect.width,
                    height: cropRect.height,
                  }}
                >
                  <span className="absolute left-1/3 top-0 h-full border-l border-blue-100/35" />
                  <span className="absolute left-2/3 top-0 h-full border-l border-blue-100/35" />
                  <span className="absolute left-0 top-1/3 w-full border-t border-blue-100/35" />
                  <span className="absolute left-0 top-2/3 w-full border-t border-blue-100/35" />
                  <span className="absolute left-2 top-2 rounded bg-[var(--iw-bg)]/75 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-blue-100 shadow-sm">
                    {cropSizeLabel}
                  </span>
                  {(["nw", "ne", "se", "sw", "n", "e", "s", "w"] as const).map(handle => {
                    const isWest = handle.includes("w");
                    const isEast = handle.includes("e");
                    const isNorth = handle.includes("n");
                    const isSouth = handle.includes("s");

                    return (
                      <span
                        key={handle}
                        className="absolute h-3 w-3 rounded-sm border border-blue-200 bg-[var(--iw-bg)] shadow-sm shadow-blue-950/40"
                        style={{
                          left: isWest ? 0 : isEast ? "100%" : "50%",
                          top: isNorth ? 0 : isSouth ? "100%" : "50%",
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--iw-border)] bg-[var(--iw-panel)]/60 px-4 py-3 sm:px-5">
          <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start">
            <div className="min-w-0">
              <span className="mb-1.5 block text-[10px] font-semibold tracking-widest text-[var(--iw-muted)]">工具</span>
              <div className="flex flex-wrap items-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]/80 p-0.5">
                {visibleModeOptions.map(option => renderModeButton(option))}
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold tracking-widest text-[var(--iw-muted)]">参数</span>
                <span className="truncate text-[10px] text-[var(--iw-muted)]">{activeMode.hint}</span>
              </div>

              {operation && operation !== "cutout" && (
                <div className="mb-2 flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-bg)]/35 px-3 py-2">
                  <label className="flex items-center gap-2 text-[10px] font-semibold text-[var(--iw-muted)]">
                    <span>分辨率</span>
                    <select
                      value={selectedImageResolution}
                      onChange={event => setImageResolution(event.target.value)}
                      className="imagine-input h-8 w-28 text-xs"
                      aria-label="图片编辑分辨率"
                    >
                      {resolutionOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {(editorMode === "mask" || editorMode === "erase") && (
                <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-bg)]/35 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-[var(--iw-text)]">
                    <Sliders className="h-3.5 w-3.5 text-[var(--iw-muted)]" />
                    <span className="w-11 font-mono">{brushSize}px</span>
                    <input
                      type="range"
                      min="5"
                      max="80"
                      value={brushSize}
                      onChange={(event) => setBrushSize(Number(event.target.value))}
                      className="h-1 w-32 cursor-pointer accent-blue-500"
                      aria-label="笔刷大小"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={invertMask}
                    className="imagine-secondary-action h-8 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2.5 text-xs font-semibold text-[var(--iw-text)] transition hover:bg-[var(--iw-panel-soft)]"
                    title="反选遮罩区域"
                  >
                    反选
                  </button>
                  <button
                    type="button"
                    onClick={clearMask}
                    className="imagine-secondary-action flex h-8 items-center gap-1.5 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2.5 text-xs font-semibold text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
                    data-action="danger"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    清蒙版
                  </button>
                </div>
              )}

              {editorMode === "text" && (
                <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-bg)]/35 px-3 py-2">
                  <input
                    type="text"
                    value={textValue}
                    onChange={(event) => setTextValue(event.target.value)}
                    className="h-8 w-40 rounded-md border border-[var(--iw-border)] bg-[var(--iw-bg)]/70 px-3 text-xs text-[var(--iw-text)] outline-none transition focus:border-blue-400/45"
                    aria-label="文字内容"
                  />
                  <div className="flex items-center gap-2">
                    <span className="w-8 font-mono text-xs text-[var(--iw-muted)]">{textSize}</span>
                    <input
                      type="range"
                      min="16"
                      max="72"
                      value={textSize}
                      onChange={(event) => setTextSize(Number(event.target.value))}
                      className="h-1 w-24 cursor-pointer accent-blue-500"
                      aria-label="文字大小"
                    />
                  </div>
                  <div className="flex h-8 items-center gap-1 rounded-md border border-[var(--iw-border)] bg-[var(--iw-bg)]/60 px-2">
                    {TEXT_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setTextColor(color)}
                        className={`h-5 w-5 rounded-full border transition ${
                          textColor === color ? "border-blue-300 ring-2 ring-blue-400/30" : "border-white/20"
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`选择文字颜色 ${color}`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={clearText}
                    className="imagine-secondary-action h-8 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2.5 text-xs font-semibold text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
                    data-action="danger"
                  >
                    清文字
                  </button>
                </div>
              )}

              {editorMode === "crop" && (
                <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-bg)]/35 px-3 py-2">
                  <div className="flex h-8 max-w-full items-center gap-1 overflow-x-auto rounded-md border border-[var(--iw-border)] bg-[var(--iw-bg)]/60 px-1.5">
                    {CROP_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => selectCropPreset(preset.id)}
                        className={`h-6 shrink-0 rounded px-2 font-mono text-[10px] font-semibold transition ${
                          cropPresetId === preset.id
                            ? "bg-blue-600 text-white"
                            : "text-[var(--iw-muted)] hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <span className="rounded-md border border-[var(--iw-border)] bg-[var(--iw-bg)]/60 px-2.5 py-1.5 font-mono text-[10px] text-[var(--iw-muted)]">
                    {cropSizeLabel}
                  </span>
                  <button
                    type="button"
                    onClick={applyCrop}
                    disabled={!canApplyCrop}
                    className={`imagine-secondary-action flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition ${
                      canApplyCrop
                        ? "border border-blue-400/30 bg-blue-500/16 text-blue-100 hover:bg-blue-500/24"
                        : "border border-[var(--iw-border)] bg-[var(--iw-bg)]/45 text-[var(--iw-muted)]"
                    }`}
                  >
                    <Crop className="h-3.5 w-3.5" />
                    执行裁切
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropRect(null)}
                    className="imagine-secondary-action h-8 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)]/45 px-3 text-xs font-semibold text-[var(--iw-muted)] transition hover:text-[var(--iw-text)]"
                    data-action="danger"
                  >
                    清选区
                  </button>
                </div>
              )}

              {editorMode === "outpaint" && (
                <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-bg)]/35 px-3 py-2">
                  {(["left", "right", "top", "bottom"] as const).map(side => (
                    <span key={side} className="rounded-md border border-[var(--iw-border)] bg-[var(--iw-bg)]/60 px-2.5 py-1.5 text-[10px] font-semibold text-[var(--iw-muted)]">
                      <span className="w-8">{side === "left" ? "左" : side === "right" ? "右" : side === "top" ? "上" : "下"}</span>
                      <span className="ml-2 font-mono">{outpaintMargins[side]}px</span>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setOutpaintMargins(defaultOutpaintMargins())}
                    className="imagine-secondary-action h-8 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2.5 text-xs font-semibold text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
                    data-action="danger"
                  >
                    清扩图
                  </button>
                </div>
              )}

              {operation && operation !== "cutout" ? (
                <div className="mt-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-bg)]/35 px-3 py-2">
                  <textarea
                    value={editPrompt}
                    onChange={event => setEditPrompt(event.target.value)}
                    placeholder={operationCopy?.promptPlaceholder}
                    className="imagine-field-textarea min-h-16 resize-y text-xs"
                    aria-label={`${operationCopy?.title ?? "图片编辑"}提示词`}
                  />
                </div>
              ) : null}
            </div>

            <div className="min-w-0">
              <span className="mb-1.5 block text-[10px] font-semibold tracking-widest text-[var(--iw-muted)]">操作</span>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={resetEditor}
                  className="imagine-secondary-action flex h-10 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-xs font-semibold text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
                  data-action="danger"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  重置
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!canApply}
                  className={`imagine-primary-action flex h-10 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold text-white transition ${
                    canApply
                      ? "bg-blue-600 shadow-md shadow-blue-950/30 hover:bg-blue-500"
                      : "cursor-not-allowed border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"
                  }`}
                >
                  <Check className="h-4 w-4" />
                  应用编辑
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
