"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!isSelected || item.type !== "video") {
      setVideoItem(null);
      return undefined;
    }

    const currentUrl = item.url.trim();
    if (isVideoPlaybackUrl(currentUrl)) {
      setVideoItem(item);
      return undefined;
    }

    let isActive = true;
    setVideoItem(null);
    void (async () => {
      const meta = await getAssetMeta(item.id);
      const originalUrl = await resolveAssetOriginalUrl(meta ?? item);
      if (!isActive) return;
      setVideoItem(
        isVideoPlaybackUrl(originalUrl)
          ? meta
            ? { ...item, ...meta, url: originalUrl }
            : { ...item, url: originalUrl }
          : null,
      );
    })();

    return () => {
      isActive = false;
    };
  }, [isSelected, item]);

  return videoItem;
}
