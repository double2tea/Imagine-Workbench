import { getAssetBlobPayload, getAssetPreviewRecord, type StorageItemMeta } from "@/lib/db";

const ORIGINAL_URL_CACHE_MAX = 8;
const PREVIEW_URL_CACHE_MAX = 128;
const originalUrlCache = new Map<string, string>();
const previewUrlCache = new Map<string, string>();

function isRemoteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function rememberUrl(cache: Map<string, string>, maxSize: number, id: string, url: string): string {
  if (cache.size >= maxSize) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(id, url);
  return url;
}

export function peekCachedAssetUrl(id: string): string | undefined {
  return originalUrlCache.get(id);
}

export function invalidateCachedAssetUrl(id: string): void {
  originalUrlCache.delete(id);
  previewUrlCache.delete(id);
}

export async function resolveAssetPreviewUrl(meta: Pick<StorageItemMeta, "id" | "type" | "url" | "hasBlob">): Promise<string> {
  if (previewUrlCache.has(meta.id)) return previewUrlCache.get(meta.id) ?? "";

  const preview = await getAssetPreviewRecord(meta.id);
  if (preview) {
    return rememberUrl(previewUrlCache, PREVIEW_URL_CACHE_MAX, meta.id, preview.dataUrl);
  }

  if (meta.url && isRemoteUrl(meta.url)) {
    return rememberUrl(previewUrlCache, PREVIEW_URL_CACHE_MAX, meta.id, meta.url);
  }

  return rememberUrl(previewUrlCache, PREVIEW_URL_CACHE_MAX, meta.id, "");
}

export async function resolveAssetOriginalUrl(meta: Pick<StorageItemMeta, "id" | "url" | "hasBlob">): Promise<string> {
  if (originalUrlCache.has(meta.id)) return originalUrlCache.get(meta.id) ?? "";

  if (meta.url && isRemoteUrl(meta.url)) {
    return rememberUrl(originalUrlCache, ORIGINAL_URL_CACHE_MAX, meta.id, meta.url);
  }

  if (meta.hasBlob) {
    const payload = await getAssetBlobPayload(meta.id);
    if (payload) return rememberUrl(originalUrlCache, ORIGINAL_URL_CACHE_MAX, meta.id, payload);
  }

  return rememberUrl(originalUrlCache, ORIGINAL_URL_CACHE_MAX, meta.id, meta.url ?? "");
}
