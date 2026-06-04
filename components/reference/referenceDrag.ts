import { isMediaReferenceType, type MediaReferenceType } from "@/lib/media-references";

export const REFERENCE_ASSET_MIME = "application/x-imagine-reference-asset";

const REFERENCE_DROP_TOKEN_PREFIX = "[[IMAGINE_ASSET:";
const REFERENCE_DROP_TOKEN_SUFFIX = "]]";

export interface DraggedReferenceAsset {
  id: string;
  type?: MediaReferenceType;
  url: string;
}

export function makeReferenceDropToken(id: string): string {
  return `${REFERENCE_DROP_TOKEN_PREFIX}${id}${REFERENCE_DROP_TOKEN_SUFFIX}`;
}

export function hasDraggedReferenceAsset(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(REFERENCE_ASSET_MIME);
}

export function readDraggedReferenceAsset(dataTransfer: DataTransfer): DraggedReferenceAsset | null {
  const raw = dataTransfer.getData(REFERENCE_ASSET_MIME);
  if (!raw) return null;

  const value: unknown = JSON.parse(raw);
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "url" in value &&
    typeof value.id === "string" &&
    typeof value.url === "string" &&
    value.id.length > 0 &&
    value.url.length > 0 &&
    (!("type" in value) || value.type === undefined || isMediaReferenceType(value.type))
  ) {
    return { id: value.id, type: "type" in value && isMediaReferenceType(value.type) ? value.type : undefined, url: value.url };
  }

  throw new Error("Invalid dragged reference asset payload");
}
