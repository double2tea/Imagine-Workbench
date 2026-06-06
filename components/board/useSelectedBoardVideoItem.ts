"use client";

import { useEffect, useRef, useState } from "react";
import { resolveAssetOriginalUrl } from "@/lib/assets/resolve-url";
import { getAssetMeta, type StorageItem } from "@/lib/db";

function isVideoPlaybackUrl(url: string): boolean {
  return (
    url.startsWith("data:video/") ||
    url.startsWith("blob:") ||
    url.startsWith("http://") ||
    url.startsWith("https://")
  );
}

export default function useSelectedBoardVideoItem(item: StorageItem, isSelected: boolean): StorageItem | null {
  const [videoItem, setVideoItem] = useState<StorageItem | null>(null);
  const latestItemRef = useRef(item);
  const itemId = item.id;
  const itemType = item.type;
  const itemUrl = item.url.trim();

  useEffect(() => {
    latestItemRef.current = item;
  }, [item]);

  useEffect(() => {
    if (!isSelected || itemType !== "video") {
      setVideoItem(null);
      return undefined;
    }

    const currentItem = latestItemRef.current;
    if (isVideoPlaybackUrl(itemUrl)) {
      setVideoItem(current => (current?.id === itemId && current.url === itemUrl ? current : currentItem));
      return undefined;
    }

    let isActive = true;
    setVideoItem(current => (current?.id === itemId && isVideoPlaybackUrl(current.url) ? current : null));
    void (async () => {
      const meta = await getAssetMeta(itemId);
      const sourceItem = latestItemRef.current.id === itemId ? latestItemRef.current : currentItem;
      const originalUrl = await resolveAssetOriginalUrl(meta ?? sourceItem);
      if (!isActive) return;
      const nextItem = isVideoPlaybackUrl(originalUrl)
        ? meta
          ? { ...sourceItem, ...meta, url: originalUrl }
          : { ...sourceItem, url: originalUrl }
        : null;
      setVideoItem(current => {
        if (!nextItem) return current?.id === itemId && isVideoPlaybackUrl(current.url) ? current : null;
        return current?.id === nextItem.id && current.url === nextItem.url ? current : nextItem;
      });
    })();

    return () => {
      isActive = false;
    };
  }, [isSelected, itemId, itemType, itemUrl]);

  return videoItem;
}
