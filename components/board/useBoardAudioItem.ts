"use client";

import { useEffect, useRef, useState } from "react";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
import { getAssetMeta, type StorageItem } from "@/lib/db";

function isAudioPlaybackUrl(url: string): boolean {
  return (
    url.startsWith("data:audio/") ||
    url.startsWith("blob:") ||
    url.startsWith("http://") ||
    url.startsWith("https://")
  );
}

export default function useBoardAudioItem(item: StorageItem): StorageItem | null {
  const [audioItem, setAudioItem] = useState<StorageItem | null>(null);
  const latestItemRef = useRef(item);
  const itemId = item.id;
  const itemType = item.type;
  const itemUrl = item.url.trim();

  useEffect(() => {
    latestItemRef.current = item;
  }, [item]);

  useEffect(() => {
    if (itemType !== "audio") {
      setAudioItem(null);
      return undefined;
    }

    const currentItem = latestItemRef.current;
    if (isAudioPlaybackUrl(itemUrl)) {
      setAudioItem(current => (current?.id === itemId && current.url === itemUrl ? current : currentItem));
      return undefined;
    }

    let isActive = true;
    setAudioItem(current => (current?.id === itemId && isAudioPlaybackUrl(current.url) ? current : null));
    void (async () => {
      const meta = await getAssetMeta(itemId);
      const sourceItem = latestItemRef.current.id === itemId ? latestItemRef.current : currentItem;
      const originalUrl = await resolveAssetOriginalUrl(meta ?? sourceItem);
      if (!isActive) return;
      const nextItem = isAudioPlaybackUrl(originalUrl)
        ? meta
          ? { ...sourceItem, ...meta, url: originalUrl }
          : { ...sourceItem, url: originalUrl }
        : null;
      setAudioItem(current => {
        if (!nextItem) return current?.id === itemId && isAudioPlaybackUrl(current.url) ? current : null;
        return current?.id === nextItem.id && current.url === nextItem.url ? current : nextItem;
      });
    })();

    return () => {
      isActive = false;
    };
  }, [itemId, itemType, itemUrl]);

  return audioItem;
}
