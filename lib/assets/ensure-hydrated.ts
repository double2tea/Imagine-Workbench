import { hydrateAsset, type StorageItem } from "@/lib/db";
import { peekCachedAssetUrl } from "@/lib/assets/resolve-url";

function hasResolvableUrl(item: Pick<StorageItem, "url" | "hasBlob" | "id">): boolean {
  const url = item.url ?? "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return true;
  if (item.hasBlob && peekCachedAssetUrl(item.id)) return true;
  return false;
}

/** Hydrate blob-backed placeholders before board insert or generation handoff. */
export async function ensureHydratedStorageItem(item: StorageItem): Promise<StorageItem> {
  if (hasResolvableUrl(item)) {
    const cached = peekCachedAssetUrl(item.id);
    if (cached && !item.url) return { ...item, url: cached };
    return item;
  }
  if (!item.hasBlob) return item;
  return hydrateAsset(item);
}