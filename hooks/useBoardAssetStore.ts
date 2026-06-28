"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  collectBoardAssetIdsFromNodes,
  collectBoardNodeIdsFromNodes,
  mergeBoardScopedMetas,
} from "@/lib/assets/board-scope";
import { ensureAssetPreviewUrl } from "@/lib/assets/previews";
import { resolveAssetOriginalUrl, resolveAssetPreviewUrl } from "@/lib/assets/resolve-url";
import type { BoardNode } from "@/lib/board/types";
import {
  listBoardScopedAssetMetas,
  mergeStorageItems,
  metaToPlaceholderItem,
  type StorageItem,
  type StorageItemMeta,
} from "@/lib/db";
import { fetchAllTeamAssets, fetchTeamAssetsByIds, teamAssetRecordToStorageItem } from "@/lib/storage/team-client";

interface UseBoardAssetStoreResult {
  items: StorageItem[];
  metas: StorageItemMeta[];
  loading: boolean;
  isCurrentScopeLoaded: boolean;
  referencedAssetIds: string[];
  reload: () => Promise<void>;
  upsertItem: (item: StorageItem) => void;
  setItems: React.Dispatch<React.SetStateAction<StorageItem[]>>;
}

const ID_KEY_SEPARATOR = "\u0000";

function assetIdKey(ids: Iterable<string>): string {
  return Array.from(ids).sort().join(ID_KEY_SEPARATOR);
}

function idsFromKey(key: string): string[] {
  return key ? key.split(ID_KEY_SEPARATOR) : [];
}

type BoardAssetStorageTarget = "indexeddb" | "postgres";

function boardAssetScopeKey(
  boardId: string,
  referencedAssetIdsKey: string,
  boardNodeIdsKey: string,
  storageTarget: BoardAssetStorageTarget,
): string {
  return [storageTarget, boardId, referencedAssetIdsKey, boardNodeIdsKey].join(ID_KEY_SEPARATOR);
}

async function hydrateAssetPreviews(metas: StorageItemMeta[]): Promise<StorageItem[]> {
  const batchSize = 48;
  const hydrated: StorageItem[] = [];
  for (let offset = 0; offset < metas.length; offset += batchSize) {
    const slice = metas.slice(offset, offset + batchSize);
    const previewUrls = await Promise.all(slice.map(meta => resolveAssetPreviewUrl(meta)));
    for (let index = 0; index < slice.length; index += 1) {
      const meta = slice[index];
      let url = previewUrls[index] ?? "";
      if (meta.type === "transcript" && meta.hasBlob) {
        url = await resolveAssetOriginalUrl(meta);
      }
      if (!url && (meta.type === "image" || meta.type === "video") && meta.hasBlob) {
        url = await ensureAssetPreviewUrl(meta);
      }
      hydrated.push({ ...meta, url });
    }
  }
  return hydrated;
}

function storageItemToMeta(item: StorageItem): StorageItemMeta {
  const { url, ...meta } = item;
  return {
    ...meta,
    url: url && (url.startsWith("http://") || url.startsWith("https://")) ? url : undefined,
  };
}

async function loadTeamBoardAssetItems(
  boardId: string,
  referencedAssetIds: string[],
): Promise<{ items: StorageItem[]; metas: StorageItemMeta[] }> {
  const [boardAssets, referencedAssets] = await Promise.all([
    fetchAllTeamAssets({ boardId }),
    referencedAssetIds.length > 0
      ? fetchTeamAssetsByIds(referencedAssetIds)
      : Promise.resolve(null),
  ]);
  const items = mergeStorageItems(
    boardAssets.assets.map(teamAssetRecordToStorageItem),
    referencedAssets?.assets.map(teamAssetRecordToStorageItem) ?? [],
  );
  return {
    items,
    metas: items.map(storageItemToMeta),
  };
}

export function useBoardAssetStore(
  boardId: string,
  nodes: BoardNode[],
  storageTarget: BoardAssetStorageTarget = "indexeddb",
): UseBoardAssetStoreResult {
  const referencedAssetIdsKey = useMemo(() => assetIdKey(collectBoardAssetIdsFromNodes(nodes)), [nodes]);
  const boardNodeIdsKey = useMemo(() => assetIdKey(collectBoardNodeIdsFromNodes(nodes)), [nodes]);
  const scopeKey = useMemo(
    () => boardAssetScopeKey(boardId, referencedAssetIdsKey, boardNodeIdsKey, storageTarget),
    [boardId, boardNodeIdsKey, referencedAssetIdsKey, storageTarget],
  );
  const referencedAssetIds = useMemo(() => idsFromKey(referencedAssetIdsKey), [referencedAssetIdsKey]);
  const boardNodeIds = useMemo(() => idsFromKey(boardNodeIdsKey), [boardNodeIdsKey]);

  const [metas, setMetas] = useState<StorageItemMeta[]>([]);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const activeReloadTokenRef = useRef(0);

  const reload = useCallback(async () => {
    const reloadScopeKey = scopeKey;
    const reloadToken = activeReloadTokenRef.current + 1;
    let didLoadScope = false;
    activeReloadTokenRef.current = reloadToken;
    setLoading(true);
    try {
      if (storageTarget === "postgres") {
        const scoped = await loadTeamBoardAssetItems(boardId, referencedAssetIds);
        if (activeReloadTokenRef.current !== reloadToken) return;
        setMetas(scoped.metas);
        setItems(scoped.items);
        didLoadScope = true;
        return;
      }
      const scopedMetas = await listBoardScopedAssetMetas(boardId, referencedAssetIds, boardNodeIds);
      if (activeReloadTokenRef.current !== reloadToken) return;
      setMetas(scopedMetas);
      const placeholders = scopedMetas.map(metaToPlaceholderItem);
      setItems(placeholders);
      const hydratedPreviews = await hydrateAssetPreviews(scopedMetas);
      if (activeReloadTokenRef.current !== reloadToken) return;
      setItems(current => mergeStorageItems(current, hydratedPreviews));
      didLoadScope = true;
    } finally {
      if (activeReloadTokenRef.current === reloadToken) {
        if (didLoadScope) setLoadedScopeKey(reloadScopeKey);
        setLoading(false);
      }
    }
  }, [boardId, boardNodeIds, referencedAssetIds, scopeKey, storageTarget]);

  const upsertItem = useCallback((item: StorageItem) => {
    const { url: _url, ...meta } = item;
    const metaOnly: StorageItemMeta = {
      ...meta,
      url: item.url && (item.url.startsWith("http://") || item.url.startsWith("https://")) ? item.url : undefined,
    };
    setMetas(current => mergeBoardScopedMetas(current, [metaOnly]));
    setItems(current => mergeStorageItems(current, [item]));
  }, []);

  return {
    items,
    metas,
    loading,
    isCurrentScopeLoaded: loadedScopeKey === scopeKey,
    referencedAssetIds,
    reload,
    upsertItem,
    setItems,
  };
}
