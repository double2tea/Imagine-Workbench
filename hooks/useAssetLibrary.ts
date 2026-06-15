import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteLibraryAssetRecord,
  getAssetMetasByIds,
  hydrateAssets,
  getLibraryAssetRecord,
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

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function useAssetLibrary() {
  const [records, setRecords] = useState<LibraryAssetRecord[]>([]);
  const [itemsById, setItemsById] = useState<Map<string, StorageItem>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(false);
  const loadVersionRef = useRef(0);

  const reload = useCallback(async () => {
    const loadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = loadVersion;
    const canUpdate = () => mountedRef.current && loadVersionRef.current === loadVersion;
    if (canUpdate()) {
      setLoading(true);
      setError(null);
    }
    try {
      const nextRecords = await listLibraryAssetRecords();
      const metas = await getAssetMetasByIds(nextRecords.map(record => record.assetId));
      const items = await hydrateAssets(metas);
      if (canUpdate()) {
        setRecords(nextRecords);
        setItemsById(new Map(items.map(item => [item.id, item])));
      }
    } catch (caught) {
      const nextError = normalizeError(caught);
      if (canUpdate()) setError(nextError);
      throw nextError;
    } finally {
      if (canUpdate()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void reload().catch(() => undefined);
    return () => {
      loadVersionRef.current += 1;
      mountedRef.current = false;
    };
  }, [reload]);

  const entries = useMemo<LibraryAssetEntry[]>(
    () => records.map(record => ({ record, item: itemsById.get(record.assetId) ?? null })),
    [itemsById, records],
  );

  const addSource = useCallback(async (source: StorageItem) => {
    if (mountedRef.current) setError(null);
    try {
      const result = await addSourceAssetToLibrary(source);
      await reload();
      return result;
    } catch (caught) {
      const nextError = normalizeError(caught);
      if (mountedRef.current) setError(nextError);
      throw nextError;
    }
  }, [reload]);

  const importFiles = useCallback(async (files: File[]) => {
    if (mountedRef.current) setError(null);
    try {
      const imported = await importFilesToLibrary(files);
      await reload();
      return imported;
    } catch (caught) {
      const nextError = normalizeError(caught);
      if (mountedRef.current) setError(nextError);
      throw nextError;
    }
  }, [reload]);

  const updateRecord = useCallback(async (record: LibraryAssetRecord) => {
    if (mountedRef.current) setError(null);
    try {
      const existing = await getLibraryAssetRecord(record.id);
      if (!existing) throw new Error(`Library asset record not found: ${record.id}`);
      await saveLibraryAssetRecord({
        ...record,
        updatedAt: new Date().toISOString(),
      });
      await reload();
    } catch (caught) {
      const nextError = normalizeError(caught);
      if (mountedRef.current) setError(nextError);
      throw nextError;
    }
  }, [reload]);

  const removeRecord = useCallback(async (record: LibraryAssetRecord) => {
    if (mountedRef.current) setError(null);
    try {
      await deleteLibraryAssetRecord(record.id);
      await reload();
    } catch (caught) {
      const nextError = normalizeError(caught);
      if (mountedRef.current) setError(nextError);
      throw nextError;
    }
  }, [reload]);

  return {
    entries,
    error,
    loading,
    addSource,
    importFiles,
    reload,
    removeRecord,
    updateRecord,
  };
}
