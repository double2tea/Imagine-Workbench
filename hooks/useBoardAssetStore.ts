"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  collectBoardAssetIdsFromNodes,
  collectBoardNodeIdsFromNodes,
  mergeBoardScopedMetas,
} from "@/lib/assets/board-scope";
import type { BoardNode } from "@/lib/board/types";
import {
  hydrateAssets,
  listBoardScopedAssetMetas,
  mergeStorageItems,
  metaToPlaceholderItem,
  type StorageItem,
  type StorageItemMeta,
} from "@/lib/db";

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

function boardAssetScopeKey(boardId: string, referencedAssetIdsKey: string, boardNodeIdsKey: string): string {
  return [boardId, referencedAssetIdsKey, boardNodeIdsKey].join(ID_KEY_SEPARATOR);
}

export function useBoardAssetStore(boardId: string, nodes: BoardNode[]): UseBoardAssetStoreResult {
  const referencedAssetIdsKey = useMemo(() => assetIdKey(collectBoardAssetIdsFromNodes(nodes)), [nodes]);
  const boardNodeIdsKey = useMemo(() => assetIdKey(collectBoardNodeIdsFromNodes(nodes)), [nodes]);
  const scopeKey = useMemo(
    () => boardAssetScopeKey(boardId, referencedAssetIdsKey, boardNodeIdsKey),
    [boardId, boardNodeIdsKey, referencedAssetIdsKey],
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
      const scopedMetas = await listBoardScopedAssetMetas(boardId, referencedAssetIds, boardNodeIds);
      if (activeReloadTokenRef.current !== reloadToken) return;
      setMetas(scopedMetas);
      const placeholders = scopedMetas.map(metaToPlaceholderItem);
      setItems(placeholders);
      const priorityIds = new Set(referencedAssetIds);
      const priorityMetas = scopedMetas.filter(meta => priorityIds.has(meta.id));
      const restMetas = scopedMetas.filter(meta => !priorityIds.has(meta.id));
      const hydratedPriority = priorityMetas.length > 0 ? await hydrateAssets(priorityMetas) : [];
      if (activeReloadTokenRef.current !== reloadToken) return;
      setItems(current => mergeStorageItems(current, hydratedPriority));
      const hydrateRest = restMetas.slice(0, 48);
      if (hydrateRest.length > 0) {
        const hydratedRest = await hydrateAssets(hydrateRest);
        if (activeReloadTokenRef.current !== reloadToken) return;
        setItems(current => mergeStorageItems(current, hydratedRest));
      }
      didLoadScope = true;
    } finally {
      if (activeReloadTokenRef.current === reloadToken) {
        if (didLoadScope) setLoadedScopeKey(reloadScopeKey);
        setLoading(false);
      }
    }
  }, [boardId, boardNodeIds, referencedAssetIds, scopeKey]);

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
