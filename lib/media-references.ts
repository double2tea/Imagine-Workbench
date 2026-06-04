export type MediaReferenceType = "image" | "video" | "audio";
export type MediaReferenceRole = "start" | "end" | "general";

export interface MediaReference {
  id: string;
  url: string;
  role?: MediaReferenceRole;
  type?: MediaReferenceType;
}

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

export function mediaReferenceTypeFromDataUri(dataUri: string): MediaReferenceType | null {
  const mimeType = mediaReferenceMimeFromDataUri(dataUri);
  return mimeType ? mediaReferenceTypeFromMime(mimeType) : null;
}

export function mediaReferenceTypeFromBase64DataUri(dataUri: string): MediaReferenceType | null {
  const mimeType = mediaReferenceMimeFromBase64DataUri(dataUri);
  return mimeType ? mediaReferenceTypeFromMime(mimeType) : null;
}

export function mediaReferenceLabel(type: MediaReferenceType): string {
  if (type === "image") return "图片";
  if (type === "video") return "视频";
  return "音频";
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

export function getMediaReferencePromptToken(index: number): string {
  return `@图片${index + 1}`;
}
