import type { ReferenceImageRef } from "../components/reference/ReferenceImagePicker";
import { getMediaReferenceType, type MediaReferenceType } from "./media-references";
import type { VideoReferenceMode } from "./providers/model-catalog";

export function selectVideoReferencesForMode(
  references: readonly ReferenceImageRef[],
  fallbackReference: string | null,
  mode: VideoReferenceMode,
  maxCount: number,
): ReferenceImageRef[] {
  if (maxCount === 0 || mode === "none") return [];

  if (mode === "firstLast") {
    const fallback = fallbackReference ? { id: "fallback-reference", type: "image" as const, url: fallbackReference, role: "general" as const } : undefined;
    const start = references.find(reference => reference.role === "start") ?? references[0] ?? fallback;
    const end =
      references.find(reference => reference.role === "end") ??
      references.find(reference => reference.url !== start?.url);
    return [start, end].filter((reference): reference is ReferenceImageRef => reference !== undefined && reference.url.length > 0).slice(0, maxCount);
  }

  const refs = references.filter(reference => reference.url.length > 0);
  if (refs.length === 0 && fallbackReference) refs.push({ id: "fallback-reference", type: "image", url: fallbackReference, role: "general" });
  return refs.slice(0, maxCount);
}

export function selectVideoReferenceTypesForMode(
  references: readonly ReferenceImageRef[],
  fallbackReference: string | null,
  mode: VideoReferenceMode,
  maxCount: number,
): MediaReferenceType[] {
  return selectVideoReferencesForMode(references, fallbackReference, mode, maxCount).map(reference => getMediaReferenceType(reference));
}
