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

export function mediaReferenceTypeFromDataUri(dataUri: string): MediaReferenceType | null {
  const match = dataUri.match(/^data:([^;,]+)[;,]/i);
  return match ? mediaReferenceTypeFromMime(match[1].toLowerCase()) : null;
}

export function mediaReferenceLabel(type: MediaReferenceType): string {
  if (type === "image") return "图片";
  if (type === "video") return "视频";
  return "音频";
}

export function getMediaReferencePromptToken(index: number): string {
  return `@图片${index + 1}`;
}
