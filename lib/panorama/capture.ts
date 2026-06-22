import { t } from "@/lib/i18n-core";
import { buildStorageItem, type StorageItem } from "@/lib/db";

export interface PanoramaCamera {
  hfov: number;
  label: string;
  pitch: number;
  yaw: number;
}

export interface PanoramaScreenshot {
  camera: PanoramaCamera;
  dataUrl: string;
  height: number;
  width: number;
}

export type PanoramaCaptureSizeId = "16:9" | "4:3" | "1:1" | "9:16";

export interface PanoramaCaptureSize {
  height: number;
  id: PanoramaCaptureSizeId;
  label: string;
  width: number;
}

export const PANORAMA_CAPTURE_SIZES: PanoramaCaptureSize[] = [
  { id: "16:9", label: "16:9 1920x1080", width: 1920, height: 1080 },
  { id: "4:3", label: "4:3 1600x1200", width: 1600, height: 1200 },
  { id: "1:1", label: "1:1 1536x1536", width: 1536, height: 1536 },
  { id: "9:16", label: "9:16 1080x1920", width: 1080, height: 1920 },
];

export const PANORAMA_FOUR_VIEW_CAMERAS: PanoramaCamera[] = [
  { label: t("media.panoramaCameras.front"), yaw: 0, pitch: 0, hfov: 90 },
  { label: t("media.panoramaCameras.right"), yaw: 90, pitch: 0, hfov: 90 },
  { label: t("media.panoramaCameras.back"), yaw: 180, pitch: 0, hfov: 90 },
  { label: t("media.panoramaCameras.left"), yaw: -90, pitch: 0, hfov: 90 },
];

export const PANORAMA_TWELVE_VIEW_CAMERAS: PanoramaCamera[] = [
  { label: t("media.panoramaCameras.front"), yaw: 0, pitch: 0, hfov: 80 },
  { label: t("media.panoramaCameras.frontRight"), yaw: 45, pitch: 0, hfov: 80 },
  { label: t("media.panoramaCameras.right"), yaw: 90, pitch: 0, hfov: 80 },
  { label: t("media.panoramaCameras.backRight"), yaw: 135, pitch: 0, hfov: 80 },
  { label: t("media.panoramaCameras.back"), yaw: 180, pitch: 0, hfov: 80 },
  { label: t("media.panoramaCameras.backLeft"), yaw: -135, pitch: 0, hfov: 80 },
  { label: t("media.panoramaCameras.left"), yaw: -90, pitch: 0, hfov: 80 },
  { label: t("media.panoramaCameras.frontLeft"), yaw: -45, pitch: 0, hfov: 80 },
  { label: t("media.panoramaCameras.upFront"), yaw: 0, pitch: 42, hfov: 80 },
  { label: t("media.panoramaCameras.upBack"), yaw: 180, pitch: 42, hfov: 80 },
  { label: t("media.panoramaCameras.downFront"), yaw: 0, pitch: -36, hfov: 80 },
  { label: t("media.panoramaCameras.downBack"), yaw: 180, pitch: -36, hfov: 80 },
];

export function createPanoramaScreenshotStorageItem(
  source: StorageItem,
  screenshot: PanoramaScreenshot,
  id: string,
  options?: { boardId?: string; sourceBoardNodeId?: string },
): StorageItem {
  return buildStorageItem(
    {
      id,
      type: "image",
      url: screenshot.dataUrl,
      prompt: `${source.prompt} (${t("media.panoramaScreenshotLabel")}-${screenshot.camera.label})`,
      model: source.model,
      aspectRatio: `${screenshot.width}x${screenshot.height}`,
      createdAt: new Date().toISOString(),
      status: "complete",
      progress: 100,
      operationName: "panorama-screenshot",
      sourceBoardNodeId: options?.sourceBoardNodeId ?? source.sourceBoardNodeId,
      sourceBoardResultStackKey: source.sourceBoardResultStackKey,
    },
    { boardId: options?.boardId ?? (source.boardId || undefined) },
  );
}
