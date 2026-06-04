"use client";

import { useCallback, useMemo, useState } from "react";
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
  referencedAssetIds: string[];
  reload: () => Promise<void>;
  upsertItem: (item: StorageItem) => void;
  setItems: React.Dispatch<React.SetStateAction<StorageItem[]>>;
}

export function useBoardAssetStore(boardId: string, nodes: BoardNode[]): UseBoardAssetStoreResult {
  const referencedAssetIds = useMemo(() => Array.from(collectBoardAssetIdsFromNodes(nodes)), [nodes]);
  const boardNodeIds = useMemo(() => collectBoardNodeIdsFromNodes(nodes), [nodes]);

  const [metas, setMetas] = useState<StorageItemMeta[]>([]);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const scopedMetas = await listBoardScopedAssetMetas(boardId, referencedAssetIds, boardNodeIds);
      setMetas(scopedMetas);
      const placeholders = scopedMetas.map(metaToPlaceholderItem);
      setItems(placeholders);
      const priorityIds = new Set(referencedAssetIds);
      const priorityMetas = scopedMetas.filter(meta => priorityIds.has(meta.id));
      const restMetas = scopedMetas.filter(meta => !priorityIds.has(meta.id));
      const hydratedPriority = priorityMetas.length > 0 ? await hydrateAssets(priorityMetas) : [];
      setItems(current => mergeStorageItems(current, hydratedPriority));
      const hydrateRest = restMetas.slice(0, 48);
      if (hydrateRest.length > 0) {
        const hydratedRest = await hydrateAssets(hydrateRest);
        setItems(current => mergeStorageItems(current, hydratedRest));
      }
    } finally {
      setLoading(false);
    }
  }, [boardId, boardNodeIds, referencedAssetIds]);

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
    referencedAssetIds,
    reload,
    upsertItem,
    setItems,
  };
}
