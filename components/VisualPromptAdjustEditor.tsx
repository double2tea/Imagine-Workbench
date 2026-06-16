"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslations } from "@/lib/i18n";
import * as THREE from "three";
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
import type { CanvasSize } from "@/lib/canvas-editor";
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
  { value: "left", label: "lightingControls.directionLabels.left" },
  { value: "top", label: "lightingControls.directionLabels.top" },
  { value: "right", label: "lightingControls.directionLabels.right" },
  { value: "front", label: "lightingControls.directionLabels.front" },
  { value: "bottom", label: "lightingControls.directionLabels.bottom" },
  { value: "back", label: "lightingControls.directionLabels.back" },
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
const STUDIO_FLOOR_Y = -1.34;
const ANGLE_PANEL_DEPTH = 0.11;
const ANGLE_BASE_ROTATE_Y = 0;
const ANGLE_BASE_ROTATE_X = 0;
const ANGLE_ROTATION_SENSITIVITY = 1;
const ANGLE_TILT_SENSITIVITY = 0.72;
const ANGLE_POINTER_ROTATION_SENSITIVITY = 0.45;
const ANGLE_POINTER_TILT_SENSITIVITY = 0.28;
const ANGLE_BASE_SCALE = 0.78;
const ANGLE_ZOOM_SCALE_DIVISOR = 240;
const ANGLE_SIDE_SCALE_REDUCTION = 0.13;
const ANGLE_TILT_SCALE_REDUCTION = 0.05;
const RELIEF_GRID_COLUMNS = 128;
const RELIEF_GRID_ROWS = 84;
const RELIEF_PREVIEW_TEXTURE_SIZE = 192;
const ANGLE_RELIEF_DEPTH = 0.34;
const LIGHTING_RELIEF_DEPTH = 0.42;
const ANGLE_VISUAL_SIDE_LIMIT = 74;
const ANGLE_VISUAL_BACK_START = 120;
const ANGLE_VISUAL_BACK_LIMIT = 160;
const LIGHT_GUIDE_CORE_ALPHA = 0.85;
const LIGHT_GUIDE_MID_STOP = 0.35;
const LIGHT_GUIDE_MID_ALPHA = 0.38;
const LIGHT_GUIDE_SHADOW_ALPHA = 0.85;
const LIGHT_HEIGHT_TILT_FACTOR = -0.06;
const LIGHT_PANEL_DEPTH = 0.08;
const THREE_COOL_LIGHT_COLOR = 0xbfdcff;
const THREE_WARM_LIGHT_COLOR = 0xffbf7a;
const THREE_NEUTRAL_LIGHT_COLOR = 0xffffff;

export default function VisualPromptAdjustEditor({
  editModel,
  imageUrl,
  isOpen,
  onApply,
  onClose,
  operation,
}: VisualPromptAdjustEditorProps) {
  const { t } = useTranslations("creation");
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<CanvasSize>({ width: 1, height: 1 });
  const [imageResolution, setImageResolution] = useState("auto");
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [angleState, setAngleState] = useState<AngleAdjustmentState>(DEFAULT_ANGLE_STATE);
  const [lightingState, setLightingState] = useState<LightingAdjustmentState>(DEFAULT_LIGHTING_STATE);

  const aspectRatio = aspectRatioFromSize(imageSize);
  const resolutionOptions = useMemo(() => getEditorResolutionOptions(editModel, aspectRatio), [aspectRatio, editModel]);
  const selectedImageResolution = resolutionOptions.some(option => option.value === imageResolution)
    ? imageResolution
    : resolutionOptions[0]?.value ?? "auto";
  const title = operation === "angle" ? t("visualAdjust.titleAngle") : t("visualAdjust.titleLighting");
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
      setIsImageLoaded(true);
    };
    img.onerror = () => {
      console.error("Visual adjustment image failed to load:", imageUrl);
      imageRef.current = null;
      setIsImageLoaded(false);
      setErrorMessage(t("visualAdjust.errorMessageImageLoadFailed"));
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

  const handleApply = useCallback(async () => {
    const img = imageRef.current;
    if (!img) {
      setErrorMessage(t("visualAdjust.errorMessageImageNotLoaded"));
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
      setErrorMessage(t("visualAdjust.errorMessageApplyFailed"));
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
              aria-label={t("visualAdjust.closeAriaLabel")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <PreviewStage
            angleState={angleState}
            angleVisual={angleVisual}
            imageUrl={imageUrl}
            lightingState={lightingState}
            onAngleChange={setAngleState}
            onLightingChange={setLightingState}
            operation={operation}
          />
        </div>

        <div className="imagine-visual-adjust-controls min-w-0 overflow-y-auto p-5">
          {operation === "angle" ? (
            <AngleControls state={angleState} onChange={setAngleState} />
          ) : (
            <LightingControls state={lightingState} onChange={setLightingState} />
          )}
          <OperationSection label={t("visualAdjust.resolutionSectionLabel")} className="mt-4">
            <select
              aria-label={t("visualAdjust.resolutionAriaLabel")}
              className="imagine-visual-adjust-select imagine-control--sm mt-2 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-3 text-sm text-white outline-none focus:border-white/30"
              name="visual-adjust-resolution"
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
              {t("visualAdjust.resetButton")}
            </OperationActionButton>
            <OperationActionButton
              type="button"
              tone="success"
              variant="primary"
              disabled={!isImageLoaded || isApplying}
              onClick={handleApply}
            >
              {isApplying ? t("visualAdjust.submittingLabel") : t("visualAdjust.applyButton")}
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
  scale: number;
  tilt: number;
  yaw: number;
}

function PreviewStage({
  angleState,
  angleVisual,
  imageUrl,
  lightingState,
  onAngleChange,
  onLightingChange,
  operation,
}: {
  angleState: AngleAdjustmentState;
  angleVisual: AngleVisualState;
  imageUrl: string;
  lightingState: LightingAdjustmentState;
  onAngleChange: (state: AngleAdjustmentState) => void;
  onLightingChange: (state: LightingAdjustmentState) => void;
  operation: "angle" | "lighting";
}) {
  const { t } = useTranslations("creation");
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const angleWheelRef = useRef<HTMLDivElement | null>(null);
  const lightingWheelRef = useRef<HTMLDivElement | null>(null);
  const angleDragRef = useRef<{ x: number; y: number; state: AngleAdjustmentState } | null>(null);
  const lightingDragRef = useRef(false);
  const angleStateRef = useRef(angleState);
  const lightingStateRef = useRef(lightingState);

  useEffect(() => {
    angleStateRef.current = angleState;
  }, [angleState]);

  useEffect(() => {
    lightingStateRef.current = lightingState;
  }, [lightingState]);
  useGSAP(() => {
    if (prefersReducedWorkbenchMotion()) return;
    gsap.fromTo(
      ".visual-adjust-motion-item",
      { opacity: 0, scale: 0.96, y: 8 },
      { opacity: 1, scale: 1, y: 0, duration: 0.26, ease: WORKBENCH_GSAP_EASE },
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
      rotation: clampInt(drag.state.rotation + (event.clientX - drag.x) * ANGLE_POINTER_ROTATION_SENSITIVITY, -180, 180),
      tilt: clampInt(drag.state.tilt + (event.clientY - drag.y) * ANGLE_POINTER_TILT_SENSITIVITY, -60, 60),
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
  const applyLightingPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 100;
    const y = (event.clientY - rect.top) / rect.height * 100;
    onLightingChange({
      ...lightingState,
      direction: directionFromPreviewPoint(x, y),
      height: clampInt((50 - y) * 2, -100, 100),
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
  useEffect(() => {
    if (operation !== "angle") return undefined;
    const element = angleWheelRef.current;
    if (!element) return undefined;
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const current = angleStateRef.current;
      onAngleChange({
        ...current,
        zoom: clampInt(current.zoom - event.deltaY * 0.08, 0, 100),
      });
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [onAngleChange, operation]);

  useEffect(() => {
    if (operation !== "lighting") return undefined;
    const element = lightingWheelRef.current;
    if (!element) return undefined;
    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const current = lightingStateRef.current;
      onLightingChange({
        ...current,
        intensity: clampInt(current.intensity - event.deltaY * 0.08, 0, 100),
      });
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [onLightingChange, operation]);

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
            ref={angleWheelRef}
            aria-label={t("visualAdjust.dragAngleAriaLabel")}
            className="absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerCancel={handleAnglePointerEnd}
            onPointerDown={handleAnglePointerDown}
            onPointerMove={handleAnglePointerMove}
            onPointerUp={handleAnglePointerEnd}
            style={{ transformStyle: "preserve-3d" }}
          >
            <ThreeCardViewport
              angleVisual={angleVisual}
              imageUrl={imageUrl}
              lightingState={lightingState}
              operation="angle"
            />
            {ANGLE_VIEW_PRESETS.map(preset => (
              <button
                key={preset.label}
                type="button"
                aria-label={`${preset.label} ${t("visualAdjust.titleAngle")}`}
                className={`imagine-angle-view-button absolute z-30 ${preset.className}`}
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
            ref={lightingWheelRef}
            aria-label={t("visualAdjust.dragLightingAriaLabel")}
            className="absolute inset-0 cursor-crosshair touch-none select-none"
            onPointerCancel={handleLightingPointerEnd}
            onPointerDown={handleLightingPointerDown}
            onPointerMove={handleLightingPointerMove}
            onPointerUp={handleLightingPointerEnd}
            style={{ transformStyle: "preserve-3d" }}
          >
            <ThreeCardViewport
              imageUrl={imageUrl}
              lightingState={lightingState}
              operation="lighting"
            />
            <LightingCompassMap imageUrl={imageUrl} state={lightingState} onChange={onLightingChange} />
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-1 text-xs font-semibold text-white/70">{t("visualAdjust.mainLightLabel")}</div>
          </div>
        )}
      </div>
    </div>
  );
}

interface ThreeCardScene {
  ambientLight: THREE.AmbientLight;
  alive: { current: boolean };
  camera: THREE.PerspectiveCamera;
  cardGroup: THREE.Group;
  guideGroup: THREE.Group;
  keyLight: THREE.PointLight;
  lightBeam: THREE.Mesh;
  lightHalo: THREE.Mesh;
  lightMarker: THREE.Mesh;
  renderer: THREE.WebGLRenderer;
  rimLight: THREE.DirectionalLight;
  scheduleRender: () => void;
  scene: THREE.Scene;
  scratch: ThreeCardScratch;
}

interface ThreeCardScratch {
  lightColor: THREE.Color;
  lightDirection: THREE.Vector3;
  lightHaloPosition: THREE.Vector3;
  lightMidpoint: THREE.Vector3;
  lightPosition: THREE.Vector3;
  lightTarget: THREE.Vector3;
  upVector: THREE.Vector3;
}

function ThreeCardViewport({
  angleVisual,
  imageUrl,
  lightingState,
  operation,
}: {
  angleVisual?: AngleVisualState;
  imageUrl: string;
  lightingState: LightingAdjustmentState;
  operation: "angle" | "lighting";
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<ThreeCardScene | null>(null);
  const angleVisualRef = useRef(angleVisual);
  const lightingStateRef = useRef(lightingState);

  useEffect(() => {
    angleVisualRef.current = angleVisual;
    lightingStateRef.current = lightingState;
  }, [angleVisual, lightingState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x111111, 5.8, 11.2);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0.28, 6.25);
    camera.lookAt(0, -0.1, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
    const keyLight = new THREE.PointLight(0xffffff, 2.2, 12, 1.6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.35);
    rimLight.position.set(-2.4, 1.8, -2.6);
    scene.add(ambientLight, keyLight, rimLight);

    const cardGroup = new THREE.Group();
    scene.add(cardGroup);

    const studioGroup = createStudioRoom();
    scene.add(studioGroup);

    const guideGroup = createThreeGuideGroup();
    scene.add(guideGroup);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 5.6), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.34 }));
    floor.position.set(0, STUDIO_FLOOR_Y + 0.012, 0.4);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const lightBeam = new THREE.Mesh(
      new THREE.ConeGeometry(0.78, 1, 64, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthWrite: false,
        opacity: 0.16,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    );
    scene.add(lightBeam);

    const lightHalo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 32, 20),
      new THREE.MeshBasicMaterial({
        blending: THREE.AdditiveBlending,
        color: 0xffffff,
        depthWrite: false,
        opacity: 0.2,
        transparent: true,
      }),
    );
    scene.add(lightHalo);

    const lightMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    scene.add(lightMarker);

    const alive = { current: true };
    let renderFrameId: number | null = null;
    const renderNow = () => {
      if (!alive.current || !renderer.domElement.isConnected) return;
      renderer.render(scene, camera);
    };
    const scheduleRender = () => {
      if (!alive.current || renderFrameId !== null) return;
      renderFrameId = window.requestAnimationFrame(() => {
        renderFrameId = null;
        renderNow();
      });
    };
    const scratch: ThreeCardScratch = {
      lightColor: new THREE.Color(0xffffff),
      lightDirection: new THREE.Vector3(),
      lightHaloPosition: new THREE.Vector3(),
      lightMidpoint: new THREE.Vector3(),
      lightPosition: new THREE.Vector3(),
      lightTarget: new THREE.Vector3(0, -0.08, -0.22),
      upVector: new THREE.Vector3(0, 1, 0),
    };
    const sceneHandle: ThreeCardScene = {
      alive,
      ambientLight,
      camera,
      cardGroup,
      guideGroup,
      keyLight,
      lightBeam,
      lightHalo,
      lightMarker,
      renderer,
      rimLight,
      scheduleRender,
      scene,
      scratch,
    };
    sceneRef.current = sceneHandle;

    let reliefDepth: ReliefDepthData | null = null;
    let depthTexture: THREE.CanvasTexture | null = null;
    let backTexture: THREE.Texture | null = null;
    let loadedTextureRef: THREE.Texture | null = null;
    new THREE.TextureLoader().load(imageUrl, loadedTexture => {
      if (disposed) {
        loadedTexture.dispose();
        return;
      }
      loadedTextureRef = loadedTexture;
      loadedTexture.colorSpace = THREE.SRGBColorSpace;
      loadedTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      backTexture = loadedTexture.clone();
      backTexture.wrapS = THREE.RepeatWrapping;
      backTexture.repeat.x = -1;
      backTexture.offset.x = 1;
      backTexture.needsUpdate = true;
      const image = loadedTexture.image as HTMLImageElement | undefined;
      const aspect = image && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 1.5;
      const width = operation === "angle" ? 3.08 : 3.18;
      const height = width / aspect;
      const depth = operation === "angle" ? ANGLE_PANEL_DEPTH : LIGHT_PANEL_DEPTH;
      reliefDepth = image ? createReliefDepthData(image) : null;
      depthTexture = reliefDepth ? createDepthTexture(reliefDepth) : null;
      const backingGeometry = new THREE.BoxGeometry(width, height, depth);
      const sideMaterial = new THREE.MeshStandardMaterial({
        color: 0x505050,
        metalness: 0.08,
        roughness: 0.78,
      });
      const backingFrontMaterial = new THREE.MeshStandardMaterial({
        color: 0x303030,
        metalness: 0.05,
        roughness: 0.82,
      });
      const backingBackMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: operation === "angle" ? 0.08 : 0.03,
        emissiveMap: backTexture,
        map: backTexture,
        metalness: 0,
        roughness: 0.72,
      });
      const backing = new THREE.Mesh(backingGeometry, [
        sideMaterial,
        sideMaterial,
        sideMaterial,
        sideMaterial,
        backingFrontMaterial,
        backingBackMaterial,
      ]);
      backing.castShadow = true;
      backing.receiveShadow = true;
      backing.position.z = -depth / 2;
      cardGroup.add(backing);

      const reliefGeometry = new THREE.PlaneGeometry(width * 0.985, height * 0.985, RELIEF_GRID_COLUMNS, RELIEF_GRID_ROWS);
      if (reliefDepth) {
        applyReliefDepthToGeometry(reliefGeometry, reliefDepth, operation === "angle" ? ANGLE_RELIEF_DEPTH : LIGHTING_RELIEF_DEPTH);
      }
      const reliefMaterial = new THREE.MeshStandardMaterial({
        bumpMap: depthTexture ?? undefined,
        bumpScale: operation === "angle" ? 0.07 : 0.095,
        emissive: 0xffffff,
        emissiveIntensity: operation === "angle" ? 0.12 : 0.035,
        emissiveMap: loadedTexture,
        map: loadedTexture,
        metalness: 0,
        roughness: 0.56,
        side: THREE.DoubleSide,
      });
      const relief = new THREE.Mesh(reliefGeometry, reliefMaterial);
      relief.castShadow = true;
      relief.receiveShadow = true;
      relief.position.z = depth / 2 + 0.012;
      cardGroup.add(relief);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(backingGeometry),
        new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.12, transparent: true }),
      );
      cardGroup.add(edges);
      applyThreeCardState(
        sceneHandle,
        operation,
        angleVisualRef.current,
        lightingStateRef.current,
      );
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderNow();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    return () => {
      disposed = true;
      alive.current = false;
      if (renderFrameId !== null) window.cancelAnimationFrame(renderFrameId);
      resizeObserver.disconnect();
      gsap.killTweensOf([
        ambientLight,
        cardGroup.position,
        cardGroup.rotation,
        cardGroup.scale,
        guideGroup.rotation,
        guideGroup.scale,
        keyLight,
        keyLight.position,
        lightHalo.position,
        lightHalo.scale,
        lightMarker.position,
        rimLight,
      ]);
      const disposedMaterials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            if (disposedMaterials.has(material)) continue;
            material.dispose();
            disposedMaterials.add(material);
          }
        }
      });
      depthTexture?.dispose();
      backTexture?.dispose();
      loadedTextureRef?.dispose();
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [imageUrl, operation]);

  useEffect(() => {
    const sceneHandle = sceneRef.current;
    if (!sceneHandle?.alive.current || !sceneHandle.renderer.domElement.isConnected) return;
    applyThreeCardState(sceneHandle, operation, angleVisual, lightingState);
  }, [angleVisual, lightingState, operation]);

  return (
    <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-20 h-full w-full" />
  );
}

function createStudioRoom(): THREE.Group {
  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.035,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const floorMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.026,
    side: THREE.DoubleSide,
    transparent: true,
  });

  const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 6.2), floorMaterial);
  floorPlane.position.set(0, STUDIO_FLOOR_Y, 0.2);
  floorPlane.rotation.x = -Math.PI / 2;
  group.add(floorPlane);

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.4), wallMaterial);
  backWall.position.set(0, 0.2, -2.45);
  group.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.2), wallMaterial.clone());
  leftWall.position.set(-3.45, 0.08, 0.2);
  leftWall.rotation.y = Math.PI / 2;
  group.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.2), wallMaterial.clone());
  rightWall.position.set(3.45, 0.08, 0.2);
  rightWall.rotation.y = -Math.PI / 2;
  group.add(rightWall);

  const gridMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.12, transparent: true });
  for (let index = -6; index <= 6; index += 1) {
    const x = index * 0.46;
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, STUDIO_FLOOR_Y + 0.01, -2.35), new THREE.Vector3(x * 1.45, STUDIO_FLOOR_Y + 0.01, 2.9)]),
      gridMaterial,
    ));
  }
  for (let index = 0; index <= 9; index += 1) {
    const z = -2.35 + index * 0.58;
    const spread = 2.85 + index * 0.16;
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-spread, STUDIO_FLOOR_Y + 0.012, z), new THREE.Vector3(spread, STUDIO_FLOOR_Y + 0.012, z)]),
      gridMaterial,
    ));
  }

  const horizon = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2.9, -0.15, -2.42), new THREE.Vector3(2.9, -0.15, -2.42)]),
    new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.16, transparent: true }),
  );
  group.add(horizon);

  return group;
}

function createThreeGuideGroup(): THREE.Group {
  const group = new THREE.Group();
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 2.72),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.018,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  panel.position.set(0, -0.02, -1.55);
  group.add(panel);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.72, 0.012, 8, 128),
    new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.18, transparent: true }),
  );
  ring.position.set(0, STUDIO_FLOOR_Y + 0.03, -0.18);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.12, transparent: true });
  const lines: Array<[THREE.Vector3, THREE.Vector3]> = [
    [new THREE.Vector3(-2.05, STUDIO_FLOOR_Y + 0.04, -0.18), new THREE.Vector3(2.05, STUDIO_FLOOR_Y + 0.04, -0.18)],
    [new THREE.Vector3(0, STUDIO_FLOOR_Y + 0.04, -2.05), new THREE.Vector3(0, STUDIO_FLOOR_Y + 0.04, 1.7)],
    [new THREE.Vector3(-1.62, STUDIO_FLOOR_Y + 0.04, -1.8), new THREE.Vector3(1.62, STUDIO_FLOOR_Y + 0.04, 1.44)],
    [new THREE.Vector3(-1.62, STUDIO_FLOOR_Y + 0.04, 1.44), new THREE.Vector3(1.62, STUDIO_FLOOR_Y + 0.04, -1.8)],
    [new THREE.Vector3(-2.05, -0.18, -1.56), new THREE.Vector3(2.05, -0.18, -1.56)],
    [new THREE.Vector3(0, -1.12, -1.56), new THREE.Vector3(0, 1.24, -1.56)],
  ];
  for (const [from, to] of lines) {
    const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
    group.add(new THREE.Line(geometry, lineMaterial));
  }
  return group;
}

interface ReliefDepthData {
  data: Float32Array;
  size: number;
}

function createReliefDepthData(image: HTMLImageElement): ReliefDepthData {
  const size = RELIEF_PREVIEW_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建深度预览画布");
  context.drawImage(image, 0, 0, size, size);
  const imageData = context.getImageData(0, 0, size, size);
  const pixels = imageData.data;
  const depthData = new Float32Array(size * size);
  const luminanceAt = (x: number, y: number): number => {
    const clampedX = Math.min(size - 1, Math.max(0, x));
    const clampedY = Math.min(size - 1, Math.max(0, y));
    const index = (clampedY * size + clampedX) * 4;
    return (pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114) / 255;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const red = pixels[index] / 255;
      const green = pixels[index + 1] / 255;
      const blue = pixels[index + 2] / 255;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const luminance = luminanceAt(x, y);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const edge = Math.min(1, Math.abs(luminanceAt(x + 1, y) - luminanceAt(x - 1, y)) * 2.8 + Math.abs(luminanceAt(x, y + 1) - luminanceAt(x, y - 1)) * 2.8);
      const nx = x / (size - 1) - 0.5;
      const ny = y / (size - 1) - 0.5;
      const centerWeight = Math.max(0, 1 - Math.sqrt(nx * nx + ny * ny) * 1.65);
      const subjectWeight = Math.max(0, 1 - luminance) * 0.36 + saturation * 0.46 + edge * 0.48 + centerWeight * 0.22;
      depthData[y * size + x] = smoothstep(0.18, 0.86, subjectWeight);
    }
  }
  blurDepthData(depthData, size);
  return { data: depthData, size };
}

function createDepthTexture(depth: ReliefDepthData): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = depth.size;
  canvas.height = depth.size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建深度纹理");
  const imageData = context.createImageData(depth.size, depth.size);
  for (let index = 0; index < depth.data.length; index += 1) {
    const value = Math.round(depth.data[index] * 255);
    const pixelIndex = index * 4;
    imageData.data[pixelIndex] = value;
    imageData.data[pixelIndex + 1] = value;
    imageData.data[pixelIndex + 2] = value;
    imageData.data[pixelIndex + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function applyReliefDepthToGeometry(geometry: THREE.PlaneGeometry, depth: ReliefDepthData, strength: number): void {
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const u = geometry.parameters.width === 0 ? 0.5 : x / geometry.parameters.width + 0.5;
    const v = geometry.parameters.height === 0 ? 0.5 : 0.5 - y / geometry.parameters.height;
    const depthValue = sampleDepth(depth, u, v);
    const edgeFalloff = Math.min(1, Math.max(0, Math.min(u, 1 - u, v, 1 - v) * 10));
    positions.setZ(index, depthValue * strength * edgeFalloff);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

function sampleDepth(depth: ReliefDepthData, u: number, v: number): number {
  const x = Math.min(depth.size - 1, Math.max(0, Math.round(u * (depth.size - 1))));
  const y = Math.min(depth.size - 1, Math.max(0, Math.round(v * (depth.size - 1))));
  return depth.data[y * depth.size + x] ?? 0;
}

function blurDepthData(data: Float32Array, size: number): void {
  const copy = new Float32Array(data);
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const index = y * size + x;
      data[index] = (
        copy[index] * 4
        + copy[index - 1]
        + copy[index + 1]
        + copy[index - size]
        + copy[index + size]
      ) / 8;
    }
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const ratio = clampRatio((value - edge0) / (edge1 - edge0));
  return ratio * ratio * (3 - 2 * ratio);
}

function applyThreeCardState(
  sceneHandle: ThreeCardScene,
  operation: "angle" | "lighting",
  angleVisual: AngleVisualState | undefined,
  lightingState: LightingAdjustmentState,
): void {
  if (!sceneHandle.alive.current || !sceneHandle.renderer.domElement.isConnected) return;
  const scheduleRender = sceneHandle.scheduleRender;
  if (operation === "angle" && angleVisual) {
    gsap.to(sceneHandle.cardGroup.rotation, {
      duration: 0.24,
      ease: "power2.out",
      onUpdate: scheduleRender,
      overwrite: "auto",
      x: THREE.MathUtils.degToRad(angleVisual.tilt),
      y: THREE.MathUtils.degToRad(angleVisual.yaw),
      z: 0,
    });
    gsap.to(sceneHandle.cardGroup.scale, {
      duration: 0.24,
      ease: "power2.out",
      onUpdate: scheduleRender,
      overwrite: "auto",
      x: angleVisual.scale * 1.18,
      y: angleVisual.scale * 1.18,
      z: angleVisual.scale * 1.18,
    });
    gsap.to(sceneHandle.cardGroup.position, {
      duration: 0.24,
      ease: "power2.out",
      onUpdate: scheduleRender,
      overwrite: "auto",
      x: 0,
      y: -0.08,
      z: -0.22,
    });
    sceneHandle.guideGroup.visible = true;
    gsap.to(sceneHandle.guideGroup.scale, { duration: 0.24, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: 1, y: 1, z: 1 });
    gsap.to(sceneHandle.guideGroup.rotation, { duration: 0.24, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: 0, y: 0, z: 0 });
    gsap.to(sceneHandle.ambientLight, { duration: 0.22, ease: "power2.out", intensity: 1.38, onUpdate: scheduleRender, overwrite: "auto" });
    sceneHandle.keyLight.color.set(0xffffff);
    gsap.to(sceneHandle.keyLight, { duration: 0.22, ease: "power2.out", intensity: 2.1, onUpdate: scheduleRender, overwrite: "auto" });
    gsap.to(sceneHandle.keyLight.position, { duration: 0.24, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: 2.6, y: 2.2, z: 3.2 });
    gsap.to(sceneHandle.rimLight, { duration: 0.22, ease: "power2.out", intensity: 0.45, onUpdate: scheduleRender, overwrite: "auto" });
    sceneHandle.lightBeam.visible = false;
    sceneHandle.lightHalo.visible = false;
    sceneHandle.lightMarker.visible = false;
  } else {
    const lightPosition = setThreeLightPosition(lightingState, sceneHandle.scratch.lightPosition);
    const color = setThreeTemperatureColor(lightingState.temperature, sceneHandle.scratch.lightColor);
    gsap.to(sceneHandle.cardGroup.rotation, {
      duration: 0.28,
      ease: "power2.out",
      onUpdate: scheduleRender,
      overwrite: "auto",
      x: THREE.MathUtils.degToRad(-8 + lightingState.height * LIGHT_HEIGHT_TILT_FACTOR),
      y: THREE.MathUtils.degToRad(24),
      z: 0,
    });
    gsap.to(sceneHandle.cardGroup.scale, { duration: 0.28, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: 0.96, y: 0.96, z: 0.96 });
    gsap.to(sceneHandle.cardGroup.position, { duration: 0.28, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: 0, y: -0.08, z: -0.22 });
    sceneHandle.guideGroup.visible = true;
    gsap.to(sceneHandle.guideGroup.scale, { duration: 0.28, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: 1.03, y: 1.03, z: 1.03 });
    gsap.to(sceneHandle.guideGroup.rotation, { duration: 0.28, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: 0, y: THREE.MathUtils.degToRad(6), z: 0 });
    gsap.to(sceneHandle.ambientLight, { duration: 0.2, ease: "power2.out", intensity: 0.88, onUpdate: scheduleRender, overwrite: "auto" });
    sceneHandle.keyLight.color.copy(color);
    gsap.to(sceneHandle.keyLight, { duration: 0.2, ease: "power2.out", intensity: 1.55 + lightingState.intensity / 24, onUpdate: scheduleRender, overwrite: "auto" });
    gsap.to(sceneHandle.keyLight.position, { duration: 0.26, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: lightPosition.x, y: lightPosition.y, z: lightPosition.z });
    gsap.to(sceneHandle.rimLight, { duration: 0.22, ease: "power2.out", intensity: lightingState.rimLight ? 0.75 : 0.18, onUpdate: scheduleRender, overwrite: "auto" });
    updateThreeLightBeam(sceneHandle.lightBeam, lightPosition, color, lightingState.intensity, sceneHandle.scratch);
    sceneHandle.lightHalo.visible = true;
    const haloPosition = sceneHandle.scratch.lightHaloPosition.copy(lightPosition).multiplyScalar(0.78);
    gsap.to(sceneHandle.lightHalo.position, { duration: 0.26, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: haloPosition.x, y: haloPosition.y, z: haloPosition.z });
    const haloScale = 0.72 + lightingState.intensity / 115;
    gsap.to(sceneHandle.lightHalo.scale, { duration: 0.22, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: haloScale, y: haloScale, z: haloScale });
    const haloMaterial = sceneHandle.lightHalo.material;
    if (haloMaterial instanceof THREE.MeshBasicMaterial) {
      haloMaterial.color.copy(color);
      haloMaterial.opacity = 0.16 + lightingState.intensity / 420;
    }
    sceneHandle.lightMarker.visible = true;
    gsap.to(sceneHandle.lightMarker.position, { duration: 0.26, ease: "power2.out", onUpdate: scheduleRender, overwrite: "auto", x: haloPosition.x, y: haloPosition.y, z: haloPosition.z });
    const markerMaterial = sceneHandle.lightMarker.material;
    if (markerMaterial instanceof THREE.MeshBasicMaterial) markerMaterial.color.copy(color);
  }
  scheduleRender();
}

function updateThreeLightBeam(mesh: THREE.Mesh, lightPosition: THREE.Vector3, color: THREE.Color, intensity: number, scratch: ThreeCardScratch): void {
  const direction = scratch.lightDirection.copy(lightPosition).sub(scratch.lightTarget);
  const distance = direction.length();
  const midpoint = scratch.lightMidpoint.copy(scratch.lightTarget).addScaledVector(direction, 0.48);
  mesh.visible = true;
  mesh.position.copy(midpoint);
  mesh.scale.set(0.22 + intensity / 360, distance * 0.72, 0.22 + intensity / 360);
  mesh.quaternion.setFromUnitVectors(scratch.upVector, direction.normalize());
  const material = mesh.material;
  if (material instanceof THREE.MeshBasicMaterial) {
    material.color.copy(color);
    material.opacity = 0.035 + intensity / 1600;
  }
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
      height: clampInt((50 - y) * 2, -100, 100),
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
  return Math.min(max, Math.max(min, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function orbitPointFromRotation(rotation: number): { x: number; y: number } {
  const radians = rotation * Math.PI / 180;
  return {
    x: 50 + Math.sin(radians) * 32,
    y: 50 + Math.cos(radians) * 32,
  };
}

function rotationFromOrbitPoint(x: number, y: number): number {
  return clampInt(Math.atan2(x - 50, y - 50) * 180 / Math.PI, -180, 180);
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
  const { t } = useTranslations("creation");
  return (
    <div className="grid gap-4">
      <RangeControl label={t("visualAdjust.angleControls.rotationLabel")} max={180} min={-180} suffix="deg" value={state.rotation} onChange={rotation => onChange({ ...state, rotation })} />
      <RangeControl label={t("visualAdjust.angleControls.tiltLabel")} max={60} min={-60} suffix="deg" value={state.tilt} onChange={tilt => onChange({ ...state, tilt })} />
      <RangeControl label={t("visualAdjust.angleControls.zoomLabel")} max={100} min={0} value={state.zoom} onChange={zoom => onChange({ ...state, zoom })} />
      <label className="imagine-visual-adjust-toggle-row flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
        <span className="font-medium">{t("visualAdjust.angleControls.wideAngleLabel")}</span>
        <input
          aria-label={t("visualAdjust.angleControls.wideAngleLabel")}
          className="accent-blue-500"
          name="visual-adjust-wide-angle"
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
  const { t } = useTranslations("creation");
  return (
    <div className="grid gap-4">
      <OperationSection label={t("visualAdjust.lightingControls.mainLightSectionLabel")}>
        <OperationControlGroup className="mt-2 grid grid-cols-3 gap-1 p-1">
          {LIGHT_DIRECTIONS.map(direction => (
            <OperationSegmentButton
              key={direction.value}
              type="button"
              active={state.direction === direction.value}
              onClick={() => onChange({ ...state, direction: direction.value })}
            >
              {t(`visualAdjust.lightingControls.directionLabels.${direction.value}`)}
            </OperationSegmentButton>
          ))}
        </OperationControlGroup>
      </OperationSection>
      <RangeControl label={t("visualAdjust.lightingControls.heightLabel")} max={100} min={-100} value={state.height} onChange={height => onChange({ ...state, height })} />
      <RangeControl label={t("visualAdjust.lightingControls.intensityLabel")} max={100} min={0} suffix="%" value={state.intensity} onChange={intensity => onChange({ ...state, intensity })} />
      <RangeControl label={t("visualAdjust.lightingControls.temperatureLabel")} max={7500} min={2500} step={100} suffix="K" value={state.temperature} onChange={temperature => onChange({ ...state, temperature })} />
      <label className="imagine-visual-adjust-toggle-row flex items-center justify-between rounded-xl border px-4 py-3 text-sm">
        <span className="font-medium">{t("visualAdjust.lightingControls.rimLightLabel")}</span>
        <input
          aria-label={t("visualAdjust.lightingControls.rimLightLabel")}
          className="accent-blue-500"
          name="visual-adjust-rim-light"
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
        aria-label={label}
        className="accent-blue-500"
        name={`visual-adjust-${label}`}
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
  const rotateY = ANGLE_BASE_ROTATE_Y + visualYawFromRotation(state.rotation) * ANGLE_ROTATION_SENSITIVITY;
  const rotateX = ANGLE_BASE_ROTATE_X - state.tilt * ANGLE_TILT_SENSITIVITY;
  const sideCompression = Math.abs(Math.sin(rotateY * Math.PI / 180)) * ANGLE_SIDE_SCALE_REDUCTION;
  const tiltCompression = Math.abs(state.tilt) / 60 * ANGLE_TILT_SCALE_REDUCTION;
  const scale = Math.max(0.58, ANGLE_BASE_SCALE + state.zoom / ANGLE_ZOOM_SCALE_DIVISOR - sideCompression - tiltCompression);
  return {
    scale: state.wideAngle ? scale * 0.94 : scale,
    tilt: rotateX,
    yaw: rotateY,
  };
}

function visualYawFromRotation(rotation: number): number {
  const sign = rotation < 0 ? -1 : 1;
  const absoluteRotation = Math.abs(rotation);
  if (absoluteRotation <= ANGLE_VISUAL_BACK_START) {
    return sign * Math.min(absoluteRotation, ANGLE_VISUAL_SIDE_LIMIT);
  }
  const backProgress = clampRatio((absoluteRotation - ANGLE_VISUAL_BACK_START) / (180 - ANGLE_VISUAL_BACK_START));
  return sign * (ANGLE_VISUAL_SIDE_LIMIT + backProgress * (ANGLE_VISUAL_BACK_LIMIT - ANGLE_VISUAL_SIDE_LIMIT));
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

function setThreeLightPosition(state: LightingAdjustmentState, target: THREE.Vector3): THREE.Vector3 {
  const height = state.height / 42;
  if (state.direction === "back") return target.set(0, 1.5 + height, -3.4);
  if (state.direction === "bottom") return target.set(0, -2.7, 1.4);
  if (state.direction === "left") return target.set(-3.3, 1.1 + height, 1.9);
  if (state.direction === "right") return target.set(3.3, 1.1 + height, 1.9);
  if (state.direction === "top") return target.set(0, 3.2, 1.6);
  return target.set(0, 1.2 + height, 3.5);
}

function setThreeTemperatureColor(temperature: number, target: THREE.Color): THREE.Color {
  if (temperature >= LIGHT_TEMPERATURE_COOL_THRESHOLD) return target.setHex(THREE_COOL_LIGHT_COLOR);
  if (temperature <= LIGHT_TEMPERATURE_WARM_THRESHOLD) return target.setHex(THREE_WARM_LIGHT_COLOR);
  return target.setHex(THREE_NEUTRAL_LIGHT_COLOR);
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
