import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteLibraryAssetRecord,
  getAssetMetasByIds,
  hydrateAssets,
  listLibraryAssetRecords,
  saveLibraryAssetRecord,
  type LibraryAssetRecord,
  type StorageItem,
} from "@/lib/db";
import {
  addSourceAssetToLibrary,
  importFilesToLibrary,
} from "@/lib/asset-library";

export interface LibraryAssetEntry {
  record: LibraryAssetRecord;
  item: StorageItem | null;
}

export function useAssetLibrary() {
  const [records, setRecords] = useState<LibraryAssetRecord[]>([]);
  const [itemsById, setItemsById] = useState<Map<string, StorageItem>>(() => new Map());
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nextRecords = await listLibraryAssetRecords();
      const metas = await getAssetMetasByIds(nextRecords.map(record => record.assetId));
      const items = await hydrateAssets(metas);
      setRecords(nextRecords);
      setItemsById(new Map(items.map(item => [item.id, item])));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const entries = useMemo<LibraryAssetEntry[]>(
    () => records.map(record => ({ record, item: itemsById.get(record.assetId) ?? null })),
    [itemsById, records],
  );

  const addSource = useCallback(async (source: StorageItem) => {
    const result = await addSourceAssetToLibrary(source);
    await reload();
    return result;
  }, [reload]);

  const importFiles = useCallback(async (files: File[]) => {
    const imported = await importFilesToLibrary(files);
    await reload();
    return imported;
  }, [reload]);

  const updateRecord = useCallback(async (record: LibraryAssetRecord) => {
    await saveLibraryAssetRecord({
      ...record,
      updatedAt: new Date().toISOString(),
    });
    await reload();
  }, [reload]);

  const removeRecord = useCallback(async (record: LibraryAssetRecord) => {
    await deleteLibraryAssetRecord(record.id);
    await reload();
  }, [reload]);

  return {
    entries,
    loading,
    records,
    addSource,
    importFiles,
    reload,
    removeRecord,
    updateRecord,
  };
}
