"use client";

import { t } from "@/lib/i18n";
import {
  getAssetPreviewRecord,
  hydrateAsset,
  saveAssetPreviewRecord,
  saveToDB,
  updateAssetPreviewMetadata,
  type AssetPreviewRecord,
  type StorageItem,
  type StorageItemMeta,
} from "@/lib/db";
import { invalidateCachedAssetUrl } from "@/lib/assets/resolve-url";

const PREVIEW_MAX_EDGE = 384;
const PREVIEW_MIME_TYPE = "image/webp";
const PREVIEW_QUALITY = 0.72;

function isImageDataUrl(url: string): boolean {
  return url.startsWith("data:image/");
}

function isVideoDataUrl(url: string): boolean {
  return url.startsWith("data:video/");
}

function isRemoteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function previewSize(width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    throw new Error(t("common.errors.previewMediaSizeInvalid"));
  }
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function drawPreview(source: CanvasImageSource, width: number, height: number): Omit<AssetPreviewRecord, "assetId" | "type" | "createdAt"> {
  const size = previewSize(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(t("common.errors.canvasContextCreationFailed"));
  }
  context.drawImage(source, 0, 0, size.width, size.height);
  return {
    dataUrl: canvas.toDataURL(PREVIEW_MIME_TYPE, PREVIEW_QUALITY),
    width: size.width,
    height: size.height,
    mimeType: PREVIEW_MIME_TYPE,
  };
}

function loadImage(sourceUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t("common.errors.referenceMediaNotFound")));
    image.src = sourceUrl;
  });
}

async function createImagePreview(item: StorageItem): Promise<AssetPreviewRecord> {
  const image = await loadImage(item.url);
  return {
    assetId: item.id,
    type: item.type,
    createdAt: new Date().toISOString(),
    ...drawPreview(image, image.naturalWidth, image.naturalHeight),
  };
}

function createVideoPreview(item: StorageItem): Promise<AssetPreviewRecord> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let didFinish = false;
    let timeout: number | undefined;

    const cleanup = (): void => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
    };

    const fail = (error: Error): void => {
      if (didFinish) return;
      didFinish = true;
      cleanup();
      reject(error);
    };

    const finish = (): void => {
      if (didFinish) return;
      try {
        const record = drawPreview(video, video.videoWidth, video.videoHeight);
        didFinish = true;
        cleanup();
        resolve({
          assetId: item.id,
          type: item.type,
          createdAt: new Date().toISOString(),
          ...record,
        });
      } catch (error) {
        fail(error instanceof Error ? error : new Error(t("common.errors.videoPreviewDrawFailed")));
      }
    };

    timeout = window.setTimeout(() => fail(new Error(t("common.notices.videoPreviewTimeout"))), 8000);
    video.onerror = () => {
      fail(new Error(t("common.errors.videoPreviewLoadFailed")));
    };
    video.onloadeddata = finish;
    video.src = item.url;
    video.load();
  });
}

async function createAssetPreviewRecord(item: StorageItem): Promise<AssetPreviewRecord | null> {
  if (item.type === "image" && isImageDataUrl(item.url)) {
    return createImagePreview(item);
  }
  if (item.type === "video" && isVideoDataUrl(item.url)) {
    return createVideoPreview(item);
  }
  return null;
}

export async function saveItemWithPreview(item: StorageItem): Promise<StorageItem> {
  await saveToDB(item);
  try {
    const preview = await createAssetPreviewRecord(item);
    if (!preview) {
      const updatedAt = new Date().toISOString();
      await updateAssetPreviewMetadata(item.id, { status: "missing", updatedAt });
      invalidateCachedAssetUrl(item.id);
      return {
        ...item,
        url: isRemoteUrl(item.url) ? item.url : "",
        previewStatus: "missing",
        previewUpdatedAt: updatedAt,
      };
    }
    await saveAssetPreviewRecord(preview);
    await updateAssetPreviewMetadata(item.id, { status: "ready", updatedAt: preview.createdAt });
    invalidateCachedAssetUrl(item.id);
    return {
      ...item,
      url: preview.dataUrl,
      previewStatus: "ready",
      previewUpdatedAt: preview.createdAt,
    };
  } catch {
    const updatedAt = new Date().toISOString();
    await updateAssetPreviewMetadata(item.id, { status: "failed", updatedAt });
    invalidateCachedAssetUrl(item.id);
    return {
      ...item,
      url: isRemoteUrl(item.url) ? item.url : "",
      previewStatus: "failed",
      previewUpdatedAt: updatedAt,
    };
  }
}

export async function ensureAssetPreviewUrl(meta: StorageItemMeta): Promise<string> {
  const existing = await getAssetPreviewRecord(meta.id);
  if (existing) return existing.dataUrl;

  const item = await hydrateAsset(meta);
  try {
    const preview = await createAssetPreviewRecord(item);
    if (!preview) {
      const updatedAt = new Date().toISOString();
      await updateAssetPreviewMetadata(item.id, { status: "missing", updatedAt });
      invalidateCachedAssetUrl(item.id);
      return isRemoteUrl(item.url) ? item.url : "";
    }
    await saveAssetPreviewRecord(preview);
    await updateAssetPreviewMetadata(item.id, { status: "ready", updatedAt: preview.createdAt });
    invalidateCachedAssetUrl(item.id);
    return preview.dataUrl;
  } catch {
    const updatedAt = new Date().toISOString();
    await updateAssetPreviewMetadata(item.id, { status: "failed", updatedAt });
    invalidateCachedAssetUrl(item.id);
    return isRemoteUrl(item.url) ? item.url : "";
  }
}
