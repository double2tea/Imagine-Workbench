"use client";

import { Camera, Columns4, Grid3X3, Loader2, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StorageItem } from "@/lib/db";
import {
  PANORAMA_CAPTURE_SIZES,
  PANORAMA_FOUR_VIEW_CAMERAS,
  PANORAMA_TWELVE_VIEW_CAMERAS,
  type PanoramaCaptureSize,
  type PanoramaCaptureSizeId,
  type PanoramaCamera,
  type PanoramaScreenshot,
} from "@/lib/panorama/capture";
import { useTranslations, type TFunction } from "@/lib/i18n";

interface PanoramaOverlayProps {
  item: StorageItem;
  onClose: () => void;
  onSaveScreenshots: (item: StorageItem, screenshots: PanoramaScreenshot[]) => Promise<void> | void;
}

type PanoramaSaveMode = "current" | "four" | "twelve";

interface ExportablePanoramaRenderer {
  render(
    pitch: number,
    yaw: number,
    hfov: number,
    params: { returnImage: true },
  ): unknown;
}

const actionButtonClass = "imagine-secondary-action flex h-9 items-center gap-1.5 px-2.5 text-xs font-semibold backdrop-blur transition hover:border-[var(--iw-tone-teal-border)] hover:bg-[color-mix(in_srgb,var(--iw-tone-teal-bg)_40%,transparent)] hover:text-[var(--iw-tone-teal-text)] disabled:cursor-not-allowed disabled:opacity-45";
const iconButtonClass = "imagine-secondary-action flex h-9 w-9 items-center justify-center backdrop-blur transition";
const sizeSelectClass = "h-9 rounded-md border border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-panel)_86%,transparent)] px-2.5 text-xs font-semibold text-[var(--iw-text)] outline-none backdrop-blur transition hover:border-[color-mix(in_srgb,var(--iw-tone-teal-border)_55%,transparent)] focus:border-[color-mix(in_srgb,var(--iw-tone-teal-border)_70%,transparent)]";

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then(response => response.blob());
}

async function imageSizeFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(await dataUrlToBlob(dataUrl));
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

function renderPanoramaImage(renderer: Pannellum.Renderer, camera: PanoramaCamera): string {
  const exportRenderer = renderer as unknown as ExportablePanoramaRenderer;
  const result = exportRenderer.render(
    degreesToRadians(camera.pitch),
    degreesToRadians(camera.yaw),
    degreesToRadians(camera.hfov),
    { returnImage: true },
  );
  if (typeof result !== "string" || !result.startsWith("data:image/")) {
    throw new Error("renderFailed");
  }
  return result;
}

function getCaptureSize(id: PanoramaCaptureSizeId): PanoramaCaptureSize {
  const size = PANORAMA_CAPTURE_SIZES.find(option => option.id === id);
  if (!size) throw new Error("unknownSize");
  return size;
}

function readCaptureSizeId(value: string): PanoramaCaptureSizeId {
  const size = PANORAMA_CAPTURE_SIZES.find(option => option.id === value);
  if (!size) throw new Error("unknownSize");
  return size.id;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "loadFailed";
}

async function preparePanoramaUrl(sourceUrl: string): Promise<{ url: string; revoke: (() => void) | null }> {
  if (!sourceUrl.startsWith("data:")) return { url: sourceUrl, revoke: null };
  const objectUrl = URL.createObjectURL(await dataUrlToBlob(sourceUrl));
  return {
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

function createPanoramaViewer(container: HTMLElement, panoramaUrl: string, t: TFunction, camera?: PanoramaCamera): Pannellum.Viewer {
  return window.pannellum.viewer(container, {
    type: "equirectangular",
    panorama: panoramaUrl,
    autoLoad: true,
    showControls: false,
    showFullscreenCtrl: false,
    showZoomCtrl: false,
    keyboardZoom: true,
    mouseZoom: true,
    compass: false,
    yaw: camera?.yaw ?? 0,
    pitch: camera?.pitch ?? 0,
    hfov: camera?.hfov ?? 90,
    minHfov: 45,
    maxHfov: 120,
    strings: {
      loadingLabel: t("panorama.loadingLabel"),
      genericWebGLError: t("panorama.genericWebGLError"),
      textureSizeError: t("panorama.textureSizeError"),
    },
  });
}

function waitForPanoramaLoad(viewer: Pannellum.Viewer): Promise<void> {
  if (viewer.isLoaded()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    viewer.on("load", () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    viewer.on("error", message => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    });
  });
}

function waitForPaintFrame(): Promise<void> {
  return new Promise(resolve => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function renderSizedPanoramaImage(
  panoramaUrl: string,
  camera: PanoramaCamera,
  size: PanoramaCaptureSize,
  t: TFunction,
): Promise<string> {
  const captureContainer = document.createElement("div");
  captureContainer.setAttribute("aria-hidden", "true");
  captureContainer.style.position = "fixed";
  captureContainer.style.left = "-10000px";
  captureContainer.style.top = "0";
  captureContainer.style.width = `${size.width}px`;
  captureContainer.style.height = `${size.height}px`;
  captureContainer.style.pointerEvents = "none";
  captureContainer.style.opacity = "0";
  document.body.appendChild(captureContainer);

  const captureViewer = createPanoramaViewer(captureContainer, panoramaUrl, t, camera);
  try {
    await waitForPanoramaLoad(captureViewer);
    captureViewer.lookAt(camera.pitch, camera.yaw, camera.hfov, false);
    await waitForPaintFrame();
    return renderPanoramaImage(captureViewer.getRenderer(), camera);
  } finally {
    captureViewer.destroy();
    captureContainer.remove();
  }
}

export default function PanoramaOverlay({ item, onClose, onSaveScreenshots }: PanoramaOverlayProps) {
  const { t } = useTranslations("common");
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Pannellum.Viewer | null>(null);
  const panoramaUrlRef = useRef<string | null>(null);
  const revokeUrlRef = useRef<(() => void) | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [savingMode, setSavingMode] = useState<PanoramaSaveMode | null>(null);
  const [captureSizeId, setCaptureSizeId] = useState<PanoramaCaptureSizeId>(PANORAMA_CAPTURE_SIZES[0].id);

  useEffect(() => {
    let isActive = true;

    async function buildViewer(): Promise<void> {
      setErrorMessage(null);
      setIsReady(false);
      await import("pannellum/build/pannellum.js");
      const container = containerRef.current;
      if (!container || !isActive) return;
      viewerRef.current?.destroy();
      revokeUrlRef.current?.();
      const prepared = await preparePanoramaUrl(item.url);
      if (!isActive) {
        prepared.revoke?.();
        return;
      }
      revokeUrlRef.current = prepared.revoke;
      panoramaUrlRef.current = prepared.url;
      viewerRef.current = createPanoramaViewer(container, prepared.url, t);
      viewerRef.current.on("load", () => {
        if (isActive) setIsReady(true);
      });
      viewerRef.current.on("error", message => {
        if (isActive) setErrorMessage(message);
      });
    }

    void buildViewer().catch(() => {
      if (isActive) setErrorMessage(t("panorama.loadFailed"));
    });

    return () => {
      isActive = false;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      panoramaUrlRef.current = null;
      revokeUrlRef.current?.();
      revokeUrlRef.current = null;
    };
  }, [item.url, t]);

  const captureCamera = useCallback(async (camera: PanoramaCamera): Promise<PanoramaScreenshot> => {
    const panoramaUrl = panoramaUrlRef.current;
    if (!panoramaUrl) throw new Error("notReady");
    const dataUrl = await renderSizedPanoramaImage(panoramaUrl, camera, getCaptureSize(captureSizeId), t);
    const size = await imageSizeFromDataUrl(dataUrl);
    return { camera, dataUrl, ...size };
  }, [captureSizeId, t]);

  const captureCurrent = useCallback(async (): Promise<PanoramaScreenshot> => {
    const viewer = viewerRef.current;
    if (!viewer) throw new Error("notReady");
    return captureCamera({
      label: t("panorama.currentView"),
      yaw: viewer.getYaw(),
      pitch: viewer.getPitch(),
      hfov: viewer.getHfov(),
    });
  }, [captureCamera, t]);

  const saveScreenshots = useCallback(async (mode: PanoramaSaveMode) => {
    if (savingMode !== null || !isReady) return;
    setSavingMode(mode);
    setErrorMessage(null);
    try {
      const screenshots: PanoramaScreenshot[] = [];
      if (mode === "current") {
        screenshots.push(await captureCurrent());
      } else {
        const cameras = mode === "four" ? PANORAMA_FOUR_VIEW_CAMERAS : PANORAMA_TWELVE_VIEW_CAMERAS;
        for (const camera of cameras) {
          screenshots.push(await captureCamera(camera));
        }
      }
      await onSaveScreenshots(item, screenshots);
    } catch (error) {
      const msg = readErrorMessage(error);
      const panoramaErrorMessageMap: Record<string, string> = {
        loadFailed: t("panorama.loadFailed"),
        renderFailed: t("panorama.renderFailed"),
        unknownSize: t("panorama.unknownSize"),
        notReady: t("panorama.viewerNotReady"),
      };
      setErrorMessage(panoramaErrorMessageMap[msg] ?? msg);
    } finally {
      setSavingMode(null);
    }
  }, [captureCamera, captureCurrent, isReady, item, onSaveScreenshots, savingMode, t]);

  const resetView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.lookAt(0, 0, 90, 180);
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex bg-[color-mix(in_srgb,var(--iw-bg)_96%,transparent)] p-2 backdrop-blur-md sm:p-4">
      <div className="relative flex h-full min-h-0 w-full overflow-hidden rounded-lg border border-[var(--iw-border)] bg-[var(--iw-bg)] shadow-[var(--iw-card-shadow)]">
        <div ref={containerRef} className="h-full min-h-0 w-full" />

        {!isReady && !errorMessage && (
          <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--iw-bg)_70%,transparent)] text-sm font-semibold text-[var(--iw-text)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--iw-tone-teal-text)]" />
            {t("panorama.loading")}
          </div>
        )}

        {errorMessage && (
          <div className="absolute left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-red-300/20 bg-red-950/86 px-4 py-3 text-sm text-red-100 shadow-xl">
            {errorMessage}
          </div>
        )}

        <div className="absolute left-3 top-3 flex max-w-[calc(100%-4.5rem)] flex-wrap gap-2 sm:left-4 sm:top-4">
          <button
            type="button"
            onClick={() => void saveScreenshots("current")}
            disabled={!isReady || savingMode !== null}
            className={actionButtonClass}
            title={t("panorama.captureCurrent")}
          >
            {savingMode === "current" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            <span>{t("panorama.capture")}</span>
          </button>
          <button
            type="button"
            onClick={() => void saveScreenshots("four")}
            disabled={!isReady || savingMode !== null}
            className={actionButtonClass}
            title={t("panorama.captureFour")}
          >
            {savingMode === "four" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Columns4 className="h-4 w-4" />}
            <span>{t("panorama.fourView")}</span>
          </button>
          <button
            type="button"
            onClick={() => void saveScreenshots("twelve")}
            disabled={!isReady || savingMode !== null}
            className={actionButtonClass}
            title={t("panorama.captureTwelve")}
          >
            {savingMode === "twelve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Grid3X3 className="h-4 w-4" />}
            <span>{t("panorama.twelveView")}</span>
          </button>
          <button type="button" onClick={resetView} disabled={!isReady} className={iconButtonClass} title={t("panorama.resetView")}>
            <RotateCcw className="h-4 w-4" />
          </button>
          <label className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-panel)_86%,transparent)] px-2 text-xs font-semibold text-[var(--iw-text)] backdrop-blur">
            <span>{t("panorama.sizeLabel")}</span>
            <select
              value={captureSizeId}
              onChange={event => setCaptureSizeId(readCaptureSizeId(event.target.value))}
              className={sizeSelectClass}
              title={t("panorama.sizeTitle")}
            >
              {PANORAMA_CAPTURE_SIZES.map(size => (
                <option key={size.id} value={size.id}>
                  {size.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button type="button" onClick={onClose} className={`absolute right-3 top-3 sm:right-4 sm:top-4 ${iconButtonClass}`} aria-label={t("panorama.exitPanorama")}>
          <X className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}
