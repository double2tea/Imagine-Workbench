import { getAssetBlobPayload, type StorageItemMeta } from "@/lib/db";

const URL_CACHE_MAX = 64;
const urlCache = new Map<string, string>();

function rememberUrl(id: string, url: string): string {
  if (urlCache.size >= URL_CACHE_MAX) {
    const oldest = urlCache.keys().next().value;
    if (oldest) urlCache.delete(oldest);
  }
  urlCache.set(id, url);
  return url;
}

export function peekCachedAssetUrl(id: string): string | undefined {
  return urlCache.get(id);
}

export function invalidateCachedAssetUrl(id: string): void {
  urlCache.delete(id);
}

export async function resolveAssetUrl(meta: Pick<StorageItemMeta, "id" | "url" | "hasBlob">): Promise<string> {
  const cached = urlCache.get(meta.id);
  if (cached) return cached;

  if (meta.url && (meta.url.startsWith("http://") || meta.url.startsWith("https://"))) {
    return rememberUrl(meta.id, meta.url);
  }

  if (meta.hasBlob) {
    const payload = await getAssetBlobPayload(meta.id);
    if (payload) return rememberUrl(meta.id, payload);
  }

  return rememberUrl(meta.id, meta.url ?? "");
}