"use client";

import { useEffect, useState } from "react";
import { resolveAssetUrl } from "@/lib/assets/resolve-url";
import type { StorageItemMeta } from "@/lib/db";

function readRemoteUrl(meta: Pick<StorageItemMeta, "url">): string {
  if (meta.url && (meta.url.startsWith("http://") || meta.url.startsWith("https://"))) {
    return meta.url;
  }
  return "";
}

export function useResolvedAssetUrl(meta: Pick<StorageItemMeta, "id" | "url" | "hasBlob">): string {
  const remoteUrl = readRemoteUrl(meta);
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => {
    if (!meta.hasBlob) return;
    let active = true;
    void resolveAssetUrl(meta).then(resolved => {
      if (active) setBlobUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [meta.hasBlob, meta.id, meta.url]);

  if (remoteUrl) return remoteUrl;
  if (meta.hasBlob) return blobUrl;
  return meta.url ?? "";
}