import { t } from "@/lib/i18n-core";
import { API_ROUTES } from "./api/routes";

export const REFERENCE_IMAGE_MAX_EDGE = 2048;
export const REFERENCE_IMAGE_OUTPUT_TYPE = "image/webp";
export const REFERENCE_IMAGE_OUTPUT_QUALITY = 0.85;
export const REFERENCE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const REFERENCE_IMAGES_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
export const REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES = 90 * 1024 * 1024;
export const REFERENCE_IMAGE_MAX_ORIGINAL_TRANSCODE_EDGE = 4096;
export const REFERENCE_IMAGE_MAX_ORIGINAL_TRANSCODE_PIXELS = 16 * 1024 * 1024;

export interface ReferenceImageCompressionPolicy {
  maxBytes: number;
  outputType: string;
  initialMaxEdge: number;
  minMaxEdge: number;
  qualitySteps: readonly number[];
  edgeScaleSteps: readonly number[];
}

export interface ReferenceImageCompressionAttempt {
  width: number;
  height: number;
  outputType: string;
  quality: number;
}

export interface CompressedReferenceImage {
  dataUrl: string;
  height: number;
  width: number;
}

export const REFERENCE_IMAGE_COMPRESSION_POLICY: ReferenceImageCompressionPolicy = {
  maxBytes: REFERENCE_IMAGE_MAX_BYTES,
  outputType: REFERENCE_IMAGE_OUTPUT_TYPE,
  initialMaxEdge: REFERENCE_IMAGE_MAX_EDGE,
  minMaxEdge: 1024,
  qualitySteps: [REFERENCE_IMAGE_OUTPUT_QUALITY, 0.75, 0.65, 0.55],
  edgeScaleSteps: [1, 0.8, 0.625, 0.5],
};

export function isImageDataUri(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

export function isVideoDataUri(value: string): boolean {
  return /^data:video\/[a-z0-9.+-]+;base64,/i.test(value);
}

export function isAudioDataUri(value: string): boolean {
  return /^data:audio\/[a-z0-9.+-]+;base64,/i.test(value);
}

export function isSameOriginTeamAssetMediaUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return isTeamAssetMediaPath(trimmed);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  if (!origin) return false;
  try {
    const url = new URL(trimmed);
    return url.origin === origin && isTeamAssetMediaPath(`${url.pathname}${url.search}`);
  } catch {
    return false;
  }
}

export function scaleImageDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) throw new Error("Image dimensions must be positive");
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) return { width, height };

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function dataUriByteSize(dataUri: string): number | null {
  const match = dataUri.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) return null;

  const base64 = match[1];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export function buildReferenceImageCompressionAttempts(
  width: number,
  height: number,
  policy: ReferenceImageCompressionPolicy = REFERENCE_IMAGE_COMPRESSION_POLICY,
): ReferenceImageCompressionAttempt[] {
  if (policy.maxBytes <= 0) throw new Error("Reference image max bytes must be positive");
  if (policy.initialMaxEdge <= 0 || policy.minMaxEdge <= 0) throw new Error("Reference image max edge values must be positive");
  if (policy.qualitySteps.length === 0) throw new Error("Reference image compression quality steps must not be empty");
  if (policy.edgeScaleSteps.length === 0) throw new Error("Reference image compression edge scale steps must not be empty");

  const attempts: ReferenceImageCompressionAttempt[] = [];
  const seen = new Set<string>();

  if (canAttemptOriginalDimensionTranscode(width, height)) {
    for (const quality of policy.qualitySteps) {
      if (quality <= 0 || quality > 1) throw new Error("Reference image compression quality steps must be between 0 and 1");
      attempts.push({
        width,
        height,
        outputType: policy.outputType,
        quality,
      });
      seen.add(`${width}x${height}:${quality}`);
    }
  }

  for (const edgeScale of policy.edgeScaleSteps) {
    if (edgeScale <= 0) throw new Error("Reference image compression edge scale steps must be positive");
    const maxEdge = Math.max(policy.minMaxEdge, Math.round(policy.initialMaxEdge * edgeScale));
    const dimensions = scaleImageDimensions(width, height, maxEdge);

    for (const quality of policy.qualitySteps) {
      if (quality <= 0 || quality > 1) throw new Error("Reference image compression quality steps must be between 0 and 1");
      const key = `${dimensions.width}x${dimensions.height}:${quality}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attempts.push({
        width: dimensions.width,
        height: dimensions.height,
        outputType: policy.outputType,
        quality,
      });
    }
  }

  return attempts;
}

function canAttemptOriginalDimensionTranscode(width: number, height: number): boolean {
  return (
    width <= REFERENCE_IMAGE_MAX_ORIGINAL_TRANSCODE_EDGE &&
    height <= REFERENCE_IMAGE_MAX_ORIGINAL_TRANSCODE_EDGE &&
    width * height <= REFERENCE_IMAGE_MAX_ORIGINAL_TRANSCODE_PIXELS
  );
}

export function getReferenceImagePayloadError(referenceUrls: string[]): string | null {
  let totalBytes = 0;

  for (const url of referenceUrls) {
    const bytes = dataUriByteSize(url);
    if (bytes === null) continue;
    if (bytes > REFERENCE_IMAGE_MAX_BYTES) {
      return t("common.notices.referenceImageCompressOverLimit", { size: formatBytes(REFERENCE_IMAGE_MAX_BYTES) });
    }
    totalBytes += bytes;
  }

  if (totalBytes > REFERENCE_IMAGES_MAX_TOTAL_BYTES) {
    return t("common.notices.referenceImagesTotalOverLimit", { size: formatBytes(REFERENCE_IMAGES_MAX_TOTAL_BYTES) });
  }

  return null;
}

export function getReferenceMediaPayloadError(referenceUrls: string[]): string | null {
  let totalBytes = 0;

  for (const url of referenceUrls) {
    const bytes = dataUriByteSize(url);
    if (bytes === null) continue;
    if (isImageDataUri(url) && bytes > REFERENCE_IMAGE_MAX_BYTES) {
      return t("common.notices.referenceImageCompressOverLimit", { size: formatBytes(REFERENCE_IMAGE_MAX_BYTES) });
    }
    totalBytes += bytes;
  }

  if (totalBytes > REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) {
    return t("common.notices.referenceMediaTotalOverLimit", { size: formatBytes(REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) });
  }

  return null;
}

export async function compressReferenceImageFile(file: File): Promise<string> {
  return (await compressReferenceImageFileWithDimensions(file)).dataUrl;
}

export async function compressReferenceImageFileWithDimensions(file: File): Promise<CompressedReferenceImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error(t("common.notices.referenceMediaMustBeImage"));
  }

  return compressReferenceImageBlobWithDimensions(file);
}

export async function compressReferenceImageDataUrl(dataUrl: string): Promise<string> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return compressReferenceImageBlob(blob);
}

export async function prepareReferenceImageUrlForRequest(url: string): Promise<string> {
  if (isImageDataUri(url)) return url;
  if (url.startsWith("data:")) throw new Error(t("common.notices.referenceImageMustBeDataUri"));

  const response = await fetchReferenceImageUrl(url);
  if (!response.ok) {
    throw new Error(await readReferenceImageFetchError(response));
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error(t("common.notices.referenceMediaMustBeImage"));
  }
  return compressReferenceImageBlob(blob);
}

export async function prepareReferenceMediaUrlForRequest(url: string): Promise<string> {
  if (isImageDataUri(url)) return url;
  if (isVideoDataUri(url) || isAudioDataUri(url)) return url;
  if (url.startsWith("data:")) throw new Error(t("common.notices.referenceMediaMustBeDataUrl"));

  const response = await fetchReferenceMediaUrl(url);
  if (!response.ok) {
    throw new Error(await readReferenceImageFetchError(response));
  }

  const blob = await response.blob();
  if (blob.type.startsWith("image/")) return compressReferenceImageBlob(blob);
  if (blob.type.startsWith("video/") || blob.type.startsWith("audio/")) return readBlobAsDataUrl(blob);
  throw new Error(t("common.notices.referenceMediaMustBeFile"));
}

async function fetchReferenceImageUrl(url: string): Promise<Response> {
  if (url.startsWith("blob:")) return fetch(url);
  if (isSameOriginTeamAssetMediaUrl(url)) return fetch(url);
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return fetch(API_ROUTES.media.referenceImage, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  }
  throw new Error(t("common.notices.referenceImageMustBeSupported"));
}

async function fetchReferenceMediaUrl(url: string): Promise<Response> {
  if (url.startsWith("blob:")) return fetch(url);
  if (isSameOriginTeamAssetMediaUrl(url)) return fetch(url);
  if (url.startsWith("http://") || url.startsWith("https://")) return fetch(url);
  throw new Error(t("common.notices.referenceMediaMustBeSupported"));
}

function isTeamAssetMediaPath(value: string): boolean {
  return /^\/api\/storage\/team\/assets\/[^/?#]+\/media(?:[?#].*)?$/.test(value);
}

async function readReferenceImageFetchError(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === "object" && data !== null && "error" in data) {
      const error = (data as { error?: unknown }).error;
      if (typeof error === "string" && error.trim().length > 0) return error;
    }
  } catch {
  }
  return t("common.notices.referenceImageReadFailed", { status: response.status });
}

async function compressReferenceImageBlob(blob: Blob): Promise<string> {
  return (await compressReferenceImageBlobWithDimensions(blob)).dataUrl;
}

async function compressReferenceImageBlobWithDimensions(blob: Blob): Promise<CompressedReferenceImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    const policy = REFERENCE_IMAGE_COMPRESSION_POLICY;
    const attempts = buildReferenceImageCompressionAttempts(bitmap.width, bitmap.height, policy);

    for (const attempt of attempts) {
      canvas.width = attempt.width;
      canvas.height = attempt.height;

      const context = canvas.getContext("2d");
      if (!context) throw new Error(t("common.notices.browserCannotCreateCompressCanvas"));
      context.drawImage(bitmap, 0, 0, attempt.width, attempt.height);

      const compressedBlob = await canvasToBlob(canvas, attempt.outputType, attempt.quality);
      if (compressedBlob.size <= policy.maxBytes) {
        return {
          dataUrl: await readBlobAsDataUrl(compressedBlob),
          height: attempt.height,
          width: attempt.width,
        };
      }
    }

    throw new Error(t("common.notices.referenceImageCompressOverLimit", { size: formatBytes(policy.maxBytes) }));
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error(t("common.notices.referenceImageCompressFailed")));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error(t("common.notices.referenceImageCompressResultReadFailed")));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error(t("common.notices.referenceImageCompressResultReadFailed")));
    reader.readAsDataURL(blob);
  });
}

function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024);
  return `${Number.isInteger(mib) ? mib : mib.toFixed(1)} MB`;
}
