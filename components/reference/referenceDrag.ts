import { isMediaReferenceType, type MediaReferenceType } from "@/lib/media-references";

export const REFERENCE_ASSET_MIME = "application/x-imagine-reference-asset";

const REFERENCE_DROP_TOKEN_PREFIX = "[[IMAGINE_ASSET:";
const REFERENCE_DROP_TOKEN_SUFFIX = "]]";

export interface DraggedReferenceAsset {
  height?: number;
  id: string;
  type?: MediaReferenceType;
  url: string;
  width?: number;
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
    (!("height" in value) || value.height === undefined || (typeof value.height === "number" && Number.isInteger(value.height) && value.height > 0)) &&
    (!("width" in value) || value.width === undefined || (typeof value.width === "number" && Number.isInteger(value.width) && value.width > 0)) &&
    (!("type" in value) || value.type === undefined || isMediaReferenceType(value.type))
  ) {
    return {
      height: "height" in value && typeof value.height === "number" ? value.height : undefined,
      id: value.id,
      type: "type" in value && isMediaReferenceType(value.type) ? value.type : undefined,
      url: value.url,
      width: "width" in value && typeof value.width === "number" ? value.width : undefined,
    };
  }

  throw new Error("Invalid dragged reference asset payload");
}
