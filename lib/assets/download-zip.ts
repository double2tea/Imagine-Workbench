import JSZip from "jszip";
import type { StorageItem } from "@/lib/db";
import { mediaReferenceFileExtension, mediaReferenceMimeFromDataUri } from "@/lib/media-references";

type ResolveOriginalStorageItem = (item: StorageItem) => Promise<StorageItem>;

interface DownloadStorageItemsZipOptions {
  archiveName: string;
  fileNamePrefix: string;
  items: StorageItem[];
  resolveOriginalItem: ResolveOriginalStorageItem;
}

interface ExportMetadata {
  id: string;
  fileName: string;
  type: StorageItem["type"];
  prompt: string;
  model: string;
  aspectRatio: string;
  createdAt: string;
}

function defaultDownloadMimeType(type: StorageItem["type"]): string {
  if (type === "image") return "image/png";
  if (type === "video") return "video/mp4";
  if (type === "transcript") return "text/plain;charset=utf-8";
  return "audio/mpeg";
}

export function storageItemDownloadExtension(item: StorageItem): string {
  if (item.type === "transcript") return "txt";
  return mediaReferenceFileExtension(mediaReferenceMimeFromDataUri(item.url), item.type);
}

export function storageItemDownloadMimeType(item: StorageItem): string {
  return mediaReferenceMimeFromDataUri(item.url) ?? defaultDownloadMimeType(item.type);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function addStorageItemFileToZip(zip: JSZip, fileName: string, item: StorageItem): Promise<void> {
  if (item.url.startsWith("data:")) {
    const parts = item.url.split(";base64,");
    if (parts.length === 2) {
      zip.file(fileName, parts[1], { base64: true });
      return;
    }
  }

  const fileRes = await fetch(item.url);
  if (fileRes.ok) {
    zip.file(fileName, await fileRes.blob());
    return;
  }
  zip.file(`link_fallback_${item.id}.txt`, item.url);
}

export async function downloadStorageItemsZip({
  archiveName,
  fileNamePrefix,
  items,
  resolveOriginalItem,
}: DownloadStorageItemsZipOptions): Promise<void> {
  if (items.length === 0) return;

  const zip = new JSZip();
  const metadataList: ExportMetadata[] = [];

  await Promise.all(items.map(async item => {
    try {
      const originalItem = await resolveOriginalItem(item);
      const fileName = `${fileNamePrefix}_${originalItem.id}.${storageItemDownloadExtension(originalItem)}`;
      metadataList.push({
        id: originalItem.id,
        fileName,
        type: originalItem.type,
        prompt: originalItem.prompt,
        model: originalItem.model,
        aspectRatio: originalItem.aspectRatio,
        createdAt: originalItem.createdAt,
      });
      await addStorageItemFileToZip(zip, fileName, originalItem);
    } catch (error) {
      console.error(`Error adding file ${item.id} to zip:`, error);
      zip.file(`error_log_${item.id}.txt`, `Failed to add original media for: ${item.id}\nError: ${errorText(error)}`);
    }
  }));

  zip.file("workspace_metadata.json", JSON.stringify(metadataList, null, 2));
  downloadBlob(await zip.generateAsync({ type: "blob" }), `${archiveName}.zip`);
}
