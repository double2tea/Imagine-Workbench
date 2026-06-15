"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from "react";
import { Box, RotateCcw, Sun, X } from "lucide-react";
import type { CanvasMaskEditorOutput } from "@/components/CanvasMaskEditor";
import {
  OperationActionButton,
  OperationControlGroup,
  OperationSection,
  OperationSegmentButton,
} from "@/components/workbench/OperationControls";
import {
  buildAngleAdjustmentPrompt,
  buildLightingAdjustmentPrompt,
  LIGHT_HEIGHT_HIGH_THRESHOLD,
  LIGHT_HEIGHT_LOW_THRESHOLD,
  LIGHT_TEMPERATURE_COOL_THRESHOLD,
  LIGHT_TEMPERATURE_WARM_THRESHOLD,
  type AngleAdjustmentState,
  type LightingAdjustmentState,
} from "@/lib/image-visual-adjustment-prompts";
import { scaleToFitSize, type CanvasSize } from "@/lib/canvas-editor";
import { getImageResolutionOptions } from "@/lib/providers/model-catalog";
import { gsap, prefersReducedWorkbenchMotion, useGSAP, WORKBENCH_GSAP_EASE } from "@/lib/workbench-gsap";

interface VisualPromptAdjustEditorProps {
  editModel?: string;
  imageUrl: string;
  isOpen: boolean;
  onApply: (output: CanvasMaskEditorOutput) => void | Promise<void>;
  onClose: () => void;
  operation: "angle" | "lighting";
}

const PREVIEW_MAX_SIZE: CanvasSize = { width: 760, height: 520 };
const DEFAULT_ANGLE_STATE: AngleAdjustmentState = {
  rotation: 0,
  tilt: 0,
  zoom: 50,
  wideAngle: false,
};
const DEFAULT_LIGHTING_STATE: LightingAdjustmentState = {
  direction: "front",
  height: 0,
  intensity: 50,
  temperature: 5600,
  rimLight: false,
};
const LIGHT_DIRECTIONS: Array<{ value: LightingAdjustmentState["direction"]; label: string }> = [
  { value: "left", label: "左侧" },
  { value: "top", label: "顶部" },
  { value: "right", label: "右侧" },
  { value: "front", label: "前方" },
  { value: "bottom", label: "底部" },
  { value: "back", label: "后方" },
];
const ANGLE_VIEW_PRESETS: Array<{
  className: string;
  label: string;
  state: Pick<AngleAdjustmentState, "rotation" | "tilt">;
}> = [
  { className: "left-1/2 top-6 -translate-x-1/2", label: "T", state: { rotation: 0, tilt: -50 } },
  { className: "left-8 top-1/2 -translate-y-1/2", label: "L", state: { rotation: -80, tilt: 0 } },
  { className: "right-8 top-1/2 -translate-y-1/2", label: "R", state: { rotation: 80, tilt: 0 } },
  { className: "bottom-8 left-1/2 -translate-x-1/2", label: "B", state: { rotation: 0, tilt: 50 } },
  { className: "left-[23%] top-[28%]", label: "BK", state: { rotation: 180, tilt: 0 } },
];
const ANGLE_PANEL_DEPTH = 54;
const ANGLE_BASE_ROTATE_Y = 0;
const ANGLE_BASE_ROTATE_X = 0;
const ANGLE_ROTATION_SENSITIVITY = 1;
const ANGLE_TILT_SENSITIVITY = 0.72;
const ANGLE_POINTER_ROTATION_SENSITIVITY = 0.45;
const ANGLE_POINTER_TILT_SENSITIVITY = 0.28;
const ANGLE_BASE_SCALE = 0.82;
const ANGLE_ZOOM_SCALE_DIVISOR = 180;
const ANGLE_SHADOW_BASE_Y = 20;
const ANGLE_SHADOW_TILT_FACTOR = 0.14;
const ANGLE_SHADOW_BASE_SCALE = 0.78;
const ANGLE_SHADOW_ZOOM_SCALE_DIVISOR = 420;
const ANGLE_WIDE_LENS_INSET = 62;
const ANGLE_NATURAL_LENS_INSET = 18;
const ANGLE_WIDE_SIDE_GLOW_OPACITY = 0.34;
const ANGLE_NATURAL_SIDE_GLOW_OPACITY = 0.2;
const LIGHT_GUIDE_CORE_ALPHA = 0.85;
const LIGHT_GUIDE_MID_STOP = 0.35;
const LIGHT_GUIDE_MID_ALPHA = 0.38;
const LIGHT_GUIDE_SHADOW_ALPHA = 0.85;
const LIGHT_VISUAL_BASE_OPACITY = 0.22;
const LIGHT_VISUAL_OPACITY_DIVISOR = 210;
const LIGHT_HEIGHT_TILT_FACTOR = -0.06;
const LIGHT_BEAM_BASE_WIDTH = 30;
const LIGHT_BEAM_WIDTH_FACTOR = 0.22;
const LIGHT_BEAM_BACK_OPACITY = 0.42;
const LIGHT_BEAM_VISIBLE_OPACITY = 0.76;
const LIGHT_DOME_CORE_ALPHA = 0.34;
const LIGHT_DOME_EDGE_ALPHA = 0.13;
const LIGHT_ORB_MID_ALPHA = 0.45;
const LIGHT_ORB_BASE_SIZE = 24;
const LIGHT_ORB_SIZE_FACTOR = 0.42;
const LIGHT_ORB_BACK_OPACITY = 0.45;
const LIGHT_ORB_VISIBLE_OPACITY = 0.84;
const LIGHT_SURFACE_CORE_ALPHA = 0.58;
const LIGHT_RIM_OPACITY = 0.62;
const LIGHT_PANEL_DEPTH = 34;

export default function VisualPromptAdjustEditor({
  editModel,
  imageUrl,
  isOpen,
  onApply,
  onClose,
  operation,
}: VisualPromptAdjustEditorProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<CanvasSize>({ width: 1, height: 1 });
  const [previewSize, setPreviewSize] = useState<CanvasSize>({ width: 360, height: 240 });
  const [imageResolution, setImageResolution] = useState("auto");
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [angleState, setAngleState] = useState<AngleAdjustmentState>(DEFAULT_ANGLE_STATE);
  const [lightingState, setLightingState] = useState<LightingAdjustmentState>(DEFAULT_LIGHTING_STATE);

  const aspectRatio = aspectRatioFromSize(imageSize);
  const resolutionOptions = getEditorResolutionOptions(editModel, aspectRatio);
  const selectedImageResolution = resolutionOptions.some(option => option.value === imageResolution)
    ? imageResolution
    : resolutionOptions[0]?.value ?? "auto";
  const title = operation === "angle" ? "角度" : "打光";
  const Icon = operation === "angle" ? Box : Sun;

  useEffect(() => {
    if (!isOpen) return;
    setAngleState(DEFAULT_ANGLE_STATE);
    setLightingState(DEFAULT_LIGHTING_STATE);
    setImageResolution("auto");
    setIsImageLoaded(false);
    setIsApplying(false);
    setErrorMessage("");
  }, [isOpen, imageUrl, operation]);

  useEffect(() => {
    if (!isOpen || !imageUrl) return;
    const img = new Image();
    imageRef.current = null;
    setIsImageLoaded(false);
    setErrorMessage("");
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const nextSize = { width: img.width || 1, height: img.height || 1 };
      imageRef.current = img;
      setImageSize(nextSize);
      setPreviewSize(scaleToFitSize(nextSize, PREVIEW_MAX_SIZE));
      setIsImageLoaded(true);
    };
    img.onerror = () => {
      console.error("Visual adjustment image failed to load:", imageUrl);
      imageRef.current = null;
      setIsImageLoaded(false);
      setErrorMessage("图片加载失败，请换一张图片后重试。");
    };
    img.src = imageUrl;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!resolutionOptions.some(option => option.value === imageResolution)) {
      setImageResolution(resolutionOptions[0]?.value ?? "auto");
    }
  }, [imageResolution, isOpen, resolutionOptions]);

  const prompt = useMemo(() => (
    operation === "angle"
      ? buildAngleAdjustmentPrompt(angleState, editModel)
      : buildLightingAdjustmentPrompt(lightingState, editModel)
  ), [angleState, editModel, lightingState, operation]);
  const angleVisual = useMemo(() => angleVisualState(angleState), [angleState]);
  const lightingVisual = useMemo(() => lightingVisualState(lightingState), [lightingState]);

  const handleApply = useCallback(async () => {
    const img = imageRef.current;
    if (!img) {
      setErrorMessage("图片尚未加载完成。");
      return;
    }
    setIsApplying(true);
    setErrorMessage("");
    try {
      const imageBase64 = renderImageDataUrl(img, imageSize);
      const guide = operation === "lighting" ? renderLightingGuide(imageSize, lightingState) : "";
      await onApply({
        imageBase64,
        imageResolution: selectedImageResolution,
        maskBase64: "",
        mergedImageBase64: guide || imageBase64,
        operation,
        outputSize: imageSize,
        prompt,
      });
    } catch (error) {
      console.error("Visual adjustment apply failed:", error);
      setErrorMessage("视觉调整应用失败，请检查图片后重试。");
    } finally {
      setIsApplying(false);
    }
  }, [imageSize, lightingState, onApply, operation, prompt, selectedImageResolution]);

  if (!isOpen) return null;

  return (
    <div className="imagine-visual-adjust-overlay fixed inset-0 z-[80] flex items-center justify-center px-4 py-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visual-adjust-title"
        className="imagine-visual-adjust-editor grid max-h-[90vh] w-full max-w-7xl overflow-hidden rounded-[22px] border lg:grid-cols-[minmax(0,1fr)_360px]"
      >
        <div className="imagine-visual-adjust-main min-w-0 border-b p-5 lg:border-b-0 lg:border-r">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="h-5 w-5" />
              <h2 id="visual-adjust-title" className="truncate text-lg font-semibold">{title}</h2>
            </div>
            <button
              type="button"
              className="imagine-visual-adjust-close imagine-motion-interactive rounded-full p-2"
              onClick={onClose}
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <PreviewStage
            angleState={angleState}
            angleVisual={angleVisual}
            imageUrl={imageUrl}
            lightingState={lightingState}
            lightingVisual={lightingVisual}
            onAngleChange={setAngleState}
            onLightingChange={setLightingState}
            operation={operation}
            previewSize={previewSize}
          />
        </div>

        <div className="imagine-visual-adjust-controls min-w-0 overflow-y-auto p-5">
          {operation === "angle" ? (
            <AngleControls state={angleState} onChange={setAngleState} />
          ) : (
            <LightingControls state={lightingState} onChange={setLightingState} />
          )}
          <OperationSection label="分辨率" className="mt-4">
            <select
              className="imagine-visual-adjust-select imagine-control--sm mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3 text-sm text-white outline-none focus:border-white/30"
              value={selectedImageResolution}
              onChange={event => setImageResolution(event.target.value)}
            >
              {resolutionOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </OperationSection>
          <div className="mt-4 flex items-center justify-between gap-2">
            <OperationActionButton
              type="button"
              tone="neutral"
              onClick={() => {
                setAngleState(DEFAULT_ANGLE_STATE);
                setLightingState(DEFAULT_LIGHTING_STATE);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置
            </OperationActionButton>
            <OperationActionButton
              type="button"
              tone="success"
              variant="primary"
              disabled={!isImageLoaded || isApplying}
              onClick={handleApply}
            >
              {isApplying ? "提交中" : "开始生成"}
            </OperationActionButton>
          </div>
          {errorMessage ? (
            <p className="mt-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface AngleVisualState {
  cardTransform: string;
  floorShadowTransform: string;
  lensInset: number;
  sideGlowOpacity: number;
}

interface LightingVisualState {
  beamStyle: CSSProperties;
  domeStyle: CSSProperties;
  markerStyle: CSSProperties;
  orbStyle: CSSProperties;
  overlayStyle: CSSProperties;
  panelTransform: string;
  rimOpacity: number;
}

function PreviewStage({
  angleState,
  angleVisual,
  imageUrl,
  lightingState,
  lightingVisual,
  onAngleChange,
  onLightingChange,
  operation,
  previewSize,
}: {
  angleState: AngleAdjustmentState;
  angleVisual: AngleVisualState;
  imageUrl: string;
  lightingState: LightingAdjustmentState;
  lightingVisual: LightingVisualState;
  onAngleChange: (state: AngleAdjustmentState) => void;
  onLightingChange: (state: LightingAdjustmentState) => void;
  operation: "angle" | "lighting";
  previewSize: CanvasSize;
}) {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const angleDragRef = useRef<{ x: number; y: number; state: AngleAdjustmentState } | null>(null);
  const lightingDragRef = useRef(false);
  const panelSize = scaleToFitSize(previewSize, operation === "angle"
    ? { width: 430, height: 300 }
    : { width: 280, height: 200 });

  useGSAP(() => {
    if (prefersReducedWorkbenchMotion()) return;
    gsap.fromTo(
      ".visual-adjust-motion-item",
      { opacity: 0, scale: 0.96, y: 8 },
      { opacity: 1, scale: 1, y: 0, duration: 0.26, ease: WORKBENCH_GSAP_EASE, stagger: 0.035 },
    );
  }, { dependencies: [operation, imageUrl], revertOnUpdate: true, scope: scopeRef });

  const handleAnglePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    angleDragRef.current = { x: event.clientX, y: event.clientY, state: angleState };
  };
  const handleAnglePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = angleDragRef.current;
    if (!drag) return;
    const nextState = {
      ...drag.state,
      rotation: clampNumber(drag.state.rotation + (event.clientX - drag.x) * ANGLE_POINTER_ROTATION_SENSITIVITY, -180, 180),
      tilt: clampNumber(drag.state.tilt + (event.clientY - drag.y) * ANGLE_POINTER_TILT_SENSITIVITY, -60, 60),
    };
    angleDragRef.current = { x: event.clientX, y: event.clientY, state: nextState };
    onAngleChange(nextState);
  };
  const handleAnglePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    angleDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleAngleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    onAngleChange({
      ...angleState,
      zoom: clampNumber(angleState.zoom - event.deltaY * 0.08, 0, 100),
    });
  };
  const applyLightingPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 100;
    const y = (event.clientY - rect.top) / rect.height * 100;
    onLightingChange({
      ...lightingState,
      direction: directionFromPreviewPoint(x, y),
      height: clampNumber((50 - y) * 2, -100, 100),
    });
  };
  const handleLightingPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    lightingDragRef.current = true;
    applyLightingPointer(event);
  };
  const handleLightingPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!lightingDragRef.current) return;
    applyLightingPointer(event);
  };
  const handleLightingPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    lightingDragRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleLightingWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    onLightingChange({
      ...lightingState,
      intensity: clampNumber(lightingState.intensity - event.deltaY * 0.08, 0, 100),
    });
  };

  return (
    <div ref={scopeRef} className="imagine-visual-adjust-stage relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-[26px] border border-white/10 bg-[#2a2a2a] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-70px_90px_rgba(0,0,0,0.22)] lg:min-h-[560px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_26%,rgba(255,255,255,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-x-10 bottom-8 h-32 rounded-[999px] bg-black/40 blur-3xl" />
      <div
        className="visual-adjust-motion-item relative h-[360px] w-full max-w-[760px] lg:h-[460px]"
        style={{
          perspective: 1100,
        }}
      >
        {operation === "angle" ? (
          <div
            aria-label="拖拽方块调整角度"
            className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerCancel={handleAnglePointerEnd}
            onPointerDown={handleAnglePointerDown}
            onPointerMove={handleAnglePointerMove}
            onPointerUp={handleAnglePointerEnd}
            onWheel={handleAngleWheel}
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="absolute left-1/2 top-[52%] h-[74%] max-h-[380px] w-[72%] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/10 bg-[#242424] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03),0_24px_80px_rgba(0,0,0,0.26)]" />
            <div
              className="absolute left-1/2 top-[68%] h-[30%] w-[56%] rounded-[999px] border border-white/10 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.1),rgba(255,255,255,0.035)_46%,rgba(0,0,0,0.28)_100%)]"
              style={{ transform: "translateX(-50%) rotateX(66deg)" }}
            />
            <div className="absolute left-1/2 top-[53%] h-[74%] w-px -translate-x-1/2 -translate-y-1/2 bg-white/[0.07]" />
            <div className="absolute left-1/2 top-[53%] h-px w-[62%] -translate-x-1/2 -translate-y-1/2 bg-white/[0.07]" />
            <div className="absolute left-[17%] top-[58%] h-px w-[66%] -translate-y-1/2 rotate-[-22deg] bg-white/[0.05]" />
            <div className="absolute left-[17%] top-[58%] h-px w-[66%] -translate-y-1/2 rotate-[22deg] bg-white/[0.05]" />
            <div className="absolute left-1/2 top-[66%] h-20 w-[38%] -translate-x-1/2 rounded-[999px] bg-black/50 blur-2xl" />
            <div
              className="absolute left-1/2 top-[73%] h-16 w-[38%] -translate-x-1/2 rounded-[999px] bg-black/50 blur-2xl"
              style={{ transform: angleVisual.floorShadowTransform }}
            />
            <div className="pointer-events-none absolute left-1/2 top-[53%] h-[72%] w-[72%] max-w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_50%_50%,transparent_0_42%,rgba(255,255,255,0.08)_43%,transparent_44%)]" />
            <div
              className="absolute left-1/2 top-1/2 transition-transform duration-200 ease-out"
              style={{
                height: panelSize.height,
                transform: `translate(-50%, -48%) ${angleVisual.cardTransform}`,
                transformStyle: "preserve-3d",
                width: panelSize.width,
              }}
            >
              <div
                className="absolute -inset-4 rounded-[24px] border border-white/15"
                style={{
                  background: `radial-gradient(circle at 78% 12%, rgba(255,255,255,${angleVisual.sideGlowOpacity}), transparent 34%)`,
                  transform: `translateZ(${-ANGLE_PANEL_DEPTH}px)`,
                }}
              />
              <ImageSlab imageUrl={imageUrl} depth={ANGLE_PANEL_DEPTH} lensInset={angleVisual.lensInset} />
            </div>
            {ANGLE_VIEW_PRESETS.map(preset => (
              <button
                key={preset.label}
                type="button"
                aria-label={`${preset.label} 视角`}
                className={`imagine-angle-view-button absolute ${preset.className}`}
                data-active={isAnglePresetActive(angleState, preset.state)}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  onAngleChange({ ...angleState, ...preset.state });
                }}
              >
                {preset.label}
              </button>
            ))}
            <AngleOrbitMap imageUrl={imageUrl} state={angleState} onChange={onAngleChange} />
          </div>
        ) : (
          <div
            aria-label="拖拽光源调整打光"
            className="absolute inset-0 cursor-crosshair touch-none select-none"
            onPointerCancel={handleLightingPointerEnd}
            onPointerDown={handleLightingPointerDown}
            onPointerMove={handleLightingPointerMove}
            onPointerUp={handleLightingPointerEnd}
            onWheel={handleLightingWheel}
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="absolute left-1/2 top-[76%] h-28 w-[52%] -translate-x-1/2 rounded-[999px] bg-black/40 blur-2xl" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[84%] max-h-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-[radial-gradient(circle_at_38%_34%,rgba(255,255,255,0.24),rgba(255,255,255,0.07)_34%,rgba(20,23,25,0.18)_68%,rgba(0,0,0,0.34)_100%)] shadow-[inset_0_0_82px_rgba(255,255,255,0.14),inset_34px_12px_70px_rgba(255,255,255,0.08),0_34px_100px_rgba(0,0,0,0.35)]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[84%] max-h-[430px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={lightingVisual.domeStyle} />
            <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square h-[60%] max-h-[310px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute z-10" style={lightingVisual.beamStyle} />
            <div
              className="absolute left-1/2 top-1/2 z-20 transition-transform duration-200 ease-out"
              style={{
                height: panelSize.height,
                transform: `translate(-50%, -52%) ${lightingVisual.panelTransform}`,
                transformStyle: "preserve-3d",
                width: panelSize.width,
              }}
            >
              <div
                className="absolute -inset-3 rounded-[22px] border border-white/10 bg-black/20 shadow-[0_30px_80px_rgba(0,0,0,0.42)]"
                style={{ transform: "translateZ(-30px)" }}
              />
              <ImageSlab imageUrl={imageUrl} depth={LIGHT_PANEL_DEPTH} lensInset={ANGLE_NATURAL_LENS_INSET} />
              <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[15px]" style={{ transform: `translateZ(${LIGHT_PANEL_DEPTH / 2 + 2}px)` }}>
                <div className="pointer-events-none absolute inset-0" style={lightingVisual.overlayStyle} />
                <div className="pointer-events-none absolute inset-0 rounded-[18px] ring-4 ring-white/70" style={{ opacity: lightingVisual.rimOpacity }} />
              </div>
            </div>
            <div className="pointer-events-none absolute z-20 rounded-full blur-2xl" style={lightingVisual.orbStyle} />
            <div className="pointer-events-none absolute z-30 h-5 w-5 rounded-full border-2 border-white bg-white shadow-[0_0_24px_rgba(255,255,255,0.95)]" style={lightingVisual.markerStyle} />
            <LightingCompassMap imageUrl={imageUrl} state={lightingState} onChange={onLightingChange} />
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-1 text-xs font-semibold text-white/70">主光源</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ImageSlab({
  depth,
  imageUrl,
  lensInset,
}: {
  depth: number;
  imageUrl: string;
  lensInset: number;
}) {
  const halfDepth = depth / 2;
  return (
    <>
      <div
        className="absolute inset-0 overflow-hidden rounded-[16px] border border-white/45 bg-[#111] shadow-[0_24px_55px_rgba(0,0,0,0.44)]"
        style={{ backfaceVisibility: "hidden", transform: `translateZ(${halfDepth}px)` }}
      >
        <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            boxShadow: `inset ${lensInset}px 0 90px rgba(15,23,42,0.16), inset ${-lensInset}px 0 90px rgba(255,255,255,0.2)`,
          }}
        />
      </div>
      <div
        className="absolute inset-0 overflow-hidden rounded-[16px] border border-white/20 bg-[#191919]"
        style={{ backfaceVisibility: "hidden", transform: `rotateY(180deg) translateZ(${halfDepth}px)` }}
      >
        <img src={imageUrl} alt="" className="h-full w-full scale-105 object-cover opacity-25 blur-[1px]" draggable={false} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.14),rgba(20,20,20,0.86)_58%,rgba(0,0,0,0.96)_100%)]" />
        <div className="absolute inset-5 rounded-[12px] border border-white/10" />
      </div>
      <div
        className="absolute bottom-0 top-0 rounded-r-[14px] border border-white/10 bg-gradient-to-r from-[#5a5a5a] via-[#363636] to-[#171717]"
        style={{
          right: -halfDepth,
          transform: "rotateY(90deg)",
          transformOrigin: "left center",
          width: depth,
        }}
      />
      <div
        className="absolute bottom-0 top-0 rounded-l-[14px] border border-white/10 bg-gradient-to-l from-[#5a5a5a] via-[#363636] to-[#171717]"
        style={{
          left: -halfDepth,
          transform: "rotateY(-90deg)",
          transformOrigin: "right center",
          width: depth,
        }}
      />
      <div
        className="absolute left-0 right-0 rounded-t-[14px] border border-white/10 bg-gradient-to-t from-[#5a5a5a] via-[#363636] to-[#171717]"
        style={{
          height: depth,
          top: -halfDepth,
          transform: "rotateX(90deg)",
          transformOrigin: "bottom center",
        }}
      />
      <div
        className="absolute left-0 right-0 rounded-b-[14px] border border-white/10 bg-gradient-to-b from-[#5a5a5a] via-[#363636] to-[#171717]"
        style={{
          bottom: -halfDepth,
          height: depth,
          transform: "rotateX(-90deg)",
          transformOrigin: "top center",
        }}
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-px w-px rounded-full bg-white/40 shadow-[0_0_18px_rgba(255,255,255,0.5)]"
        style={{ transform: `translate3d(-50%, -50%, ${halfDepth + 4}px)` }}
      />
    </>
  );
}

function AngleOrbitMap({
  imageUrl,
  onChange,
  state,
}: {
  imageUrl: string;
  onChange: (state: AngleAdjustmentState) => void;
  state: AngleAdjustmentState;
}) {
  const draggingRef = useRef(false);
  const camera = orbitPointFromRotation(state.rotation);
  const setRotationFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 100;
    const y = (event.clientY - rect.top) / rect.height * 100;
    onChange({ ...state, rotation: rotationFromOrbitPoint(x, y) });
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setRotationFromEvent(event);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setRotationFromEvent(event);
  };
  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="absolute bottom-4 left-4 h-28 w-28 touch-none rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur"
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
        <ellipse cx="50" cy="50" rx="32" ry="32" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <line x1={camera.x} y1={camera.y} x2="50" y2="50" stroke="rgba(255,255,255,0.42)" strokeWidth="1.2" />
        <circle cx={camera.x} cy={camera.y} r="5" fill="white" />
      </svg>
      <div className="absolute left-1/2 top-1/2 h-9 w-12 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-white/35 bg-[#111] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
        <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-11 w-14 -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/10" />
    </div>
  );
}

function LightingCompassMap({
  imageUrl,
  onChange,
  state,
}: {
  imageUrl: string;
  onChange: (state: LightingAdjustmentState) => void;
  state: LightingAdjustmentState;
}) {
  const draggingRef = useRef(false);
  const point = lightStagePoint(state);
  const lightColor = colorStop(state.temperature, 1);
  const setLightingFromEvent = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 100;
    const y = (event.clientY - rect.top) / rect.height * 100;
    onChange({
      ...state,
      direction: directionFromPreviewPoint(x, y),
      height: clampNumber((50 - y) * 2, -100, 100),
    });
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setLightingFromEvent(event);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    setLightingFromEvent(event);
  };
  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className="absolute bottom-4 left-4 h-28 w-28 touch-none rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur"
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
        <rect x="31" y="37" width="38" height="26" rx="4" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.22)" />
        <line x1={point.x} y1={point.y} x2="50" y2="50" stroke={lightColor} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx={point.x} cy={point.y} r="6" fill={lightColor} />
        <circle cx={point.x} cy={point.y} r="13" fill={lightColor} opacity="0.18" />
      </svg>
      <div className="absolute left-1/2 top-1/2 h-8 w-11 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded border border-white/30 bg-[#111]">
        <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      </div>
      <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[10px] font-semibold text-white/45">T</span>
      <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-white/45">B</span>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white/45">L</span>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white/45">R</span>
    </div>
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

function orbitPointFromRotation(rotation: number): { x: number; y: number } {
  const radians = rotation * Math.PI / 180;
  return {
    x: 50 + Math.sin(radians) * 32,
    y: 50 + Math.cos(radians) * 32,
  };
}

function rotationFromOrbitPoint(x: number, y: number): number {
  return clampNumber(Math.atan2(x - 50, y - 50) * 180 / Math.PI, -180, 180);
}

function directionFromPreviewPoint(x: number, y: number): LightingAdjustmentState["direction"] {
  if (y < 24) return "top";
  if (y > 78) return "bottom";
  if (x < 28) return "left";
  if (x > 74) return "right";
  if (y < 42) return "back";
  return "front";
}

function isAnglePresetActive(
  state: AngleAdjustmentState,
  preset: Pick<AngleAdjustmentState, "rotation" | "tilt">,
): boolean {
  return Math.abs(state.rotation - preset.rotation) <= 8 && Math.abs(state.tilt - preset.tilt) <= 8;
}

function AngleControls({
  onChange,
  state,
}: {
  onChange: (state: AngleAdjustmentState) => void;
  state: AngleAdjustmentState;
}) {
  return (
    <div className="grid gap-4">
      <RangeControl label="旋转" max={180} min={-180} suffix="deg" value={state.rotation} onChange={rotation => onChange({ ...state, rotation })} />
      <RangeControl label="倾斜" max={60} min={-60} suffix="deg" value={state.tilt} onChange={tilt => onChange({ ...state, tilt })} />
      <RangeControl label="缩放" max={100} min={0} value={state.zoom} onChange={zoom => onChange({ ...state, zoom })} />
      <label className="imagine-visual-adjust-toggle-row flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
        <span className="font-medium">广角镜头</span>
        <input
          className="accent-blue-500"
          type="checkbox"
          checked={state.wideAngle}
          onChange={event => onChange({ ...state, wideAngle: event.target.checked })}
        />
      </label>
    </div>
  );
}

function LightingControls({
  onChange,
  state,
}: {
  onChange: (state: LightingAdjustmentState) => void;
  state: LightingAdjustmentState;
}) {
  return (
    <div className="grid gap-4">
      <OperationSection label="主光源">
        <OperationControlGroup className="mt-2 grid grid-cols-3 gap-1 p-1">
          {LIGHT_DIRECTIONS.map(direction => (
            <OperationSegmentButton
              key={direction.value}
              type="button"
              active={state.direction === direction.value}
              onClick={() => onChange({ ...state, direction: direction.value })}
            >
              {direction.label}
            </OperationSegmentButton>
          ))}
        </OperationControlGroup>
      </OperationSection>
      <RangeControl label="高度" max={100} min={-100} value={state.height} onChange={height => onChange({ ...state, height })} />
      <RangeControl label="强度" max={100} min={0} suffix="%" value={state.intensity} onChange={intensity => onChange({ ...state, intensity })} />
      <RangeControl label="色温" max={7500} min={2500} step={100} suffix="K" value={state.temperature} onChange={temperature => onChange({ ...state, temperature })} />
      <label className="imagine-visual-adjust-toggle-row flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
        <span className="font-medium">轮廓光</span>
        <input
          className="accent-blue-500"
          type="checkbox"
          checked={state.rimLight}
          onChange={event => onChange({ ...state, rimLight: event.target.checked })}
        />
      </label>
    </div>
  );
}

function RangeControl({
  label,
  max,
  min,
  onChange,
  step = 1,
  suffix = "",
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
  value: number;
}) {
  return (
    <label className="imagine-visual-adjust-range grid gap-2 text-sm">
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <span className="imagine-visual-adjust-range-value font-mono text-xs">{value}{suffix}</span>
      </span>
      <input
        className="accent-blue-500"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function angleVisualState(state: AngleAdjustmentState): AngleVisualState {
  const rotateY = ANGLE_BASE_ROTATE_Y + state.rotation * ANGLE_ROTATION_SENSITIVITY;
  const rotateX = ANGLE_BASE_ROTATE_X - state.tilt * ANGLE_TILT_SENSITIVITY;
  const scale = ANGLE_BASE_SCALE + state.zoom / ANGLE_ZOOM_SCALE_DIVISOR;
  return {
    cardTransform: `translateZ(${state.wideAngle ? 18 : 36}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
    floorShadowTransform: `translateY(${ANGLE_SHADOW_BASE_Y + Math.abs(state.tilt) * ANGLE_SHADOW_TILT_FACTOR}px) scale(${ANGLE_SHADOW_BASE_SCALE + state.zoom / ANGLE_SHADOW_ZOOM_SCALE_DIVISOR}) rotateX(68deg) rotateZ(${state.rotation * 0.08}deg)`,
    lensInset: state.wideAngle ? ANGLE_WIDE_LENS_INSET : ANGLE_NATURAL_LENS_INSET,
    sideGlowOpacity: state.wideAngle ? ANGLE_WIDE_SIDE_GLOW_OPACITY : ANGLE_NATURAL_SIDE_GLOW_OPACITY,
  };
}

function getEditorResolutionOptions(model: string | undefined, aspectRatio: string): Array<{ value: string; label: string }> {
  if (!model) return [{ value: "auto", label: "Auto" }];
  const options = getImageResolutionOptions(model, aspectRatio).filter(option => option.value !== "custom");
  return options.length > 0 ? options : [{ value: "auto", label: "Auto" }];
}

function aspectRatioFromSize(size: CanvasSize): string {
  const divisor = gcd(size.width, size.height);
  return `${Math.round(size.width / divisor)}:${Math.round(size.height / divisor)}`;
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

function renderImageDataUrl(img: HTMLImageElement, size: CanvasSize): string {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建图片编辑画布");
  ctx.drawImage(img, 0, 0, size.width, size.height);
  return canvas.toDataURL("image/png");
}

function renderLightingGuide(size: CanvasSize, state: LightingAdjustmentState): string {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建打光参考图");
  const point = lightPoint(size, state);
  const radius = Math.max(size.width, size.height) * 0.75;
  const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  gradient.addColorStop(0, colorStop(state.temperature, LIGHT_GUIDE_CORE_ALPHA));
  gradient.addColorStop(LIGHT_GUIDE_MID_STOP, colorStop(state.temperature, LIGHT_GUIDE_MID_ALPHA));
  // Shadow stop stays neutral black instead of following the temperature tint.
  gradient.addColorStop(1, `rgba(0,0,0,${LIGHT_GUIDE_SHADOW_ALPHA})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size.width, size.height);
  return canvas.toDataURL("image/png");
}

function lightingVisualState(state: LightingAdjustmentState): LightingVisualState {
  const point = lightStagePoint(state);
  const surfacePoint = lightSurfacePoint(state);
  const color = colorStop(state.temperature, 1);
  const opacity = LIGHT_VISUAL_BASE_OPACITY + state.intensity / LIGHT_VISUAL_OPACITY_DIVISOR;
  const heightTilt = state.height * LIGHT_HEIGHT_TILT_FACTOR;
  const beamAngle = Math.atan2(50 - point.y, 50 - point.x) * 180 / Math.PI;
  const beamWidth = LIGHT_BEAM_BASE_WIDTH + state.intensity * LIGHT_BEAM_WIDTH_FACTOR;
  const orbSize = LIGHT_ORB_BASE_SIZE + state.intensity * LIGHT_ORB_SIZE_FACTOR;
  return {
    beamStyle: {
      background: `linear-gradient(90deg, ${colorStop(state.temperature, opacity)} 0%, ${colorStop(state.temperature, opacity * 0.5)} 38%, rgba(255,255,255,0.04) 72%, transparent 100%)`,
      clipPath: "polygon(0% 42%, 100% 0%, 100% 100%, 0% 58%)",
      height: "24%",
      left: `${point.x}%`,
      opacity: state.direction === "back" ? LIGHT_BEAM_BACK_OPACITY : LIGHT_BEAM_VISIBLE_OPACITY,
      top: `${point.y}%`,
      transform: `translate(0, -50%) rotate(${beamAngle}deg)`,
      transformOrigin: "0% 50%",
      width: `${beamWidth}%`,
    },
    domeStyle: {
      background: `radial-gradient(circle at ${point.x}% ${point.y}%, ${colorStop(state.temperature, LIGHT_DOME_CORE_ALPHA)} 0%, ${colorStop(state.temperature, LIGHT_DOME_EDGE_ALPHA)} 24%, transparent 58%)`,
    },
    markerStyle: {
      left: `${point.x}%`,
      top: `${point.y}%`,
      transform: "translate(-50%, -50%)",
    },
    orbStyle: {
      background: `radial-gradient(circle, ${color} 0%, ${colorStop(state.temperature, LIGHT_ORB_MID_ALPHA)} 28%, transparent 70%)`,
      height: `${orbSize}%`,
      left: `${point.x}%`,
      opacity: state.direction === "back" ? LIGHT_ORB_BACK_OPACITY : LIGHT_ORB_VISIBLE_OPACITY,
      top: `${point.y}%`,
      transform: "translate(-50%, -50%)",
      width: `${orbSize}%`,
    },
    overlayStyle: {
      background: [
        `radial-gradient(circle at ${surfacePoint.x}% ${surfacePoint.y}%, ${colorStop(state.temperature, LIGHT_SURFACE_CORE_ALPHA)} 0%, rgba(255,255,255,0.12) ${Math.max(16, state.intensity / 2)}%, transparent 68%)`,
        `linear-gradient(${shadowGradientAngle(state.direction)}deg, rgba(15,23,42,0.42), transparent 48%)`,
      ].join(", "),
      mixBlendMode: "screen",
    },
    panelTransform: `translateZ(42px) rotateX(${-10 + heightTilt}deg) rotateY(24deg) scale(0.86)`,
    rimOpacity: state.rimLight ? LIGHT_RIM_OPACITY : 0,
  };
}

function shadowGradientAngle(direction: LightingAdjustmentState["direction"]): number {
  const angles: Record<LightingAdjustmentState["direction"], number> = {
    // Back/front/top keep the stage gradient subtle; the visible beam and surface hotspot carry direction.
    back: 0,
    bottom: 180,
    front: 0,
    left: 90,
    right: 270,
    top: 0,
  };
  return angles[direction];
}

function lightPoint(size: CanvasSize, state: LightingAdjustmentState): { x: number; y: number } {
  const yBase = resolveHeightBase(state.height, 18, 82, 50);
  const points: Record<LightingAdjustmentState["direction"], { x: number; y: number }> = {
    back: { x: 50, y: 18 },
    bottom: { x: 50, y: 88 },
    front: { x: 50, y: yBase },
    left: { x: 12, y: yBase },
    right: { x: 88, y: yBase },
    top: { x: 50, y: 12 },
  };
  const point = points[state.direction];
  return { x: size.width * point.x / 100, y: size.height * point.y / 100 };
}

function lightStagePoint(state: LightingAdjustmentState): { x: number; y: number } {
  const yBase = resolveHeightBase(state.height, 24, 76, 58);
  const points: Record<LightingAdjustmentState["direction"], { x: number; y: number }> = {
    back: { x: 66, y: 28 },
    bottom: { x: 50, y: 86 },
    front: { x: 18, y: yBase },
    left: { x: 14, y: yBase },
    right: { x: 86, y: yBase },
    top: { x: 50, y: 16 },
  };
  return points[state.direction];
}

function lightSurfacePoint(state: LightingAdjustmentState): { x: number; y: number } {
  const yBase = resolveHeightBase(state.height, 20, 80, 50);
  const points: Record<LightingAdjustmentState["direction"], { x: number; y: number }> = {
    back: { x: 58, y: 24 },
    bottom: { x: 50, y: 92 },
    front: { x: 50, y: yBase },
    left: { x: 4, y: yBase },
    right: { x: 96, y: yBase },
    top: { x: 50, y: 8 },
  };
  return points[state.direction];
}

function resolveHeightBase(height: number, high: number, low: number, middle: number): number {
  if (height >= LIGHT_HEIGHT_HIGH_THRESHOLD) return high;
  if (height <= LIGHT_HEIGHT_LOW_THRESHOLD) return low;
  return middle;
}

function colorStop(temperature: number, alpha: number): string {
  if (temperature >= LIGHT_TEMPERATURE_COOL_THRESHOLD) return `rgba(190,220,255,${alpha})`;
  if (temperature <= LIGHT_TEMPERATURE_WARM_THRESHOLD) return `rgba(255,190,120,${alpha})`;
  return `rgba(255,255,245,${alpha})`;
}
