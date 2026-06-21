import { t, type TFunction } from "@/lib/i18n";

export type MediaReferenceType = "image" | "video" | "audio";
export type MediaReferenceRole = "start" | "end" | "general";

export interface MediaReference {
  height?: number;
  id: string;
  sourceAssetId?: string;
  url: string;
  role?: MediaReferenceRole;
  type?: MediaReferenceType;
  width?: number;
}

export interface MediaReferenceDimensions {
  height: number;
  width: number;
}

export const CUSTOM_IMAGE_SIZE_GRID = 16;
export const CUSTOM_IMAGE_SIZE_MAX_EDGE = 3840;
export const CUSTOM_IMAGE_SIZE_MAX_ASPECT_RATIO = 3;
export const CUSTOM_IMAGE_SIZE_MIN_PIXELS = 655360;
export const CUSTOM_IMAGE_SIZE_MAX_PIXELS = 8294400;

export function getMediaReferenceType(reference: Pick<MediaReference, "type">): MediaReferenceType {
  return reference.type ?? "image";
}

export function isMediaReferenceType(value: unknown): value is MediaReferenceType {
  return value === "image" || value === "video" || value === "audio";
}

export function mediaReferenceTypeFromMime(mimeType: string): MediaReferenceType | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return null;
}

export function mediaReferenceMimeFromDataUri(dataUri: string): string | null {
  const match = dataUri.match(/^data:([^;,]+)[;,]/i);
  return match ? match[1].toLowerCase() : null;
}

export function mediaReferenceMimeFromBase64DataUri(dataUri: string): string | null {
  const match = dataUri.match(/^data:([^;,]+);base64,/i);
  return match ? match[1].toLowerCase() : null;
}

const FALLBACK_MEDIA_REFERENCE_LABELS: Record<MediaReferenceType, string> = {
  audio: "Audio",
  image: "Image",
  video: "Video",
};

const PROMPT_REFERENCE_TOKEN_LABELS: Record<MediaReferenceType, readonly string[]> = {
  audio: ["音频", "Audio"],
  image: ["图片", "Image"],
  video: ["视频", "Video"],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mediaReferenceTypeFromDataUri(dataUri: string): MediaReferenceType | null {
  const mimeType = mediaReferenceMimeFromDataUri(dataUri);
  return mimeType ? mediaReferenceTypeFromMime(mimeType) : null;
}

export function mediaReferenceTypeFromBase64DataUri(dataUri: string): MediaReferenceType | null {
  const mimeType = mediaReferenceMimeFromBase64DataUri(dataUri);
  return mimeType ? mediaReferenceTypeFromMime(mimeType) : null;
}

export function parseMediaReferenceDimensions(value: string | undefined): MediaReferenceDimensions | null {
  const match = value?.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

export function formatMediaReferenceDimensions(dimensions: MediaReferenceDimensions): string {
  return `${dimensions.width}x${dimensions.height}`;
}

export function isValidCustomImageDimensions(dimensions: MediaReferenceDimensions): boolean {
  const { height, width } = dimensions;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return false;
  if (width > CUSTOM_IMAGE_SIZE_MAX_EDGE || height > CUSTOM_IMAGE_SIZE_MAX_EDGE) return false;
  if (width % CUSTOM_IMAGE_SIZE_GRID !== 0 || height % CUSTOM_IMAGE_SIZE_GRID !== 0) return false;
  if (Math.max(width, height) / Math.min(width, height) > CUSTOM_IMAGE_SIZE_MAX_ASPECT_RATIO) return false;
  const pixels = width * height;
  return pixels >= CUSTOM_IMAGE_SIZE_MIN_PIXELS && pixels <= CUSTOM_IMAGE_SIZE_MAX_PIXELS;
}

export function closestValidCustomImageDimensions(dimensions: MediaReferenceDimensions): MediaReferenceDimensions | null {
  if (!Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) {
    return null;
  }
  if (isValidCustomImageDimensions(dimensions)) return dimensions;

  const targetAspectRatio = dimensions.width / dimensions.height;
  let bestDimensions: MediaReferenceDimensions | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAspectDistance = Number.POSITIVE_INFINITY;

  for (let width = CUSTOM_IMAGE_SIZE_GRID; width <= CUSTOM_IMAGE_SIZE_MAX_EDGE; width += CUSTOM_IMAGE_SIZE_GRID) {
    for (let height = CUSTOM_IMAGE_SIZE_GRID; height <= CUSTOM_IMAGE_SIZE_MAX_EDGE; height += CUSTOM_IMAGE_SIZE_GRID) {
      const candidate = { width, height };
      if (!isValidCustomImageDimensions(candidate)) continue;

      const widthDistance = width - dimensions.width;
      const heightDistance = height - dimensions.height;
      const distance = widthDistance * widthDistance + heightDistance * heightDistance;
      const aspectDistance = Math.abs(width / height - targetAspectRatio);
      if (distance < bestDistance || (distance === bestDistance && aspectDistance < bestAspectDistance)) {
        bestDimensions = candidate;
        bestDistance = distance;
        bestAspectDistance = aspectDistance;
      }
    }
  }

  return bestDimensions;
}

export function buildPromptReferenceTokenPattern(labelT: TFunction = t): RegExp {
  const labels = (["image", "video", "audio"] as const).flatMap(type => [
    mediaReferenceLabel(type, labelT),
    ...PROMPT_REFERENCE_TOKEN_LABELS[type],
  ]);
  const uniqueLabels = [...new Set(labels)].map(escapeRegExp);
  return new RegExp(`@(${uniqueLabels.join("|")})(\\d+)`, "g");
}

export function mediaReferenceLabel(type: MediaReferenceType, labelT?: TFunction): string {
  return (labelT ?? t)(`media.referenceLabels.${type}`);
}

export function mediaReferenceTypeFromLabel(
  label: string,
  labelT?: TFunction,
): MediaReferenceType | null {
  const mediaLabel = label.trim();
  if (!mediaLabel) return null;
  const normalizedMediaLabel = mediaLabel.toLowerCase();
  const candidates: readonly MediaReferenceType[] = ["image", "video", "audio"];
  for (const candidate of candidates) {
    if (normalizedMediaLabel === mediaReferenceLabel(candidate, labelT).toLowerCase()) return candidate;
  }
  for (const candidate of candidates) {
    if (normalizedMediaLabel === FALLBACK_MEDIA_REFERENCE_LABELS[candidate].toLowerCase()) return candidate;
  }
  return null;
}

export function mediaReferenceFileExtension(mimeType: string | null, fallbackType: MediaReferenceType): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (fallbackType === "image") return "png";
  if (fallbackType === "video") return "mp4";
  return "mp3";
}

export function getMediaReferencePromptToken(index: number, type: MediaReferenceType = "image"): string {
  return `@${mediaReferenceLabel(type)}${index + 1}`;
}
