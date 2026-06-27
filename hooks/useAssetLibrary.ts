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
  buildImportedLibraryAssetPair,
  defaultLibraryTitle,
  importFilesToLibrary,
  isLibraryMediaType,
  makeLibraryClientId,
} from "@/lib/asset-library";
import { t } from "@/lib/i18n-core";
import {
  deleteTeamAssetLibraryRecord,
  fetchTeamAssetLibrary,
  fetchWorkspaceStorageRuntimeStatus,
  readTeamCsrfToken,
  saveTeamAsset,
  saveTeamAssetLibraryRecord,
  teamAssetRecordToStorageItem,
} from "@/lib/storage/team-client";

export interface LibraryAssetEntry {
  record: LibraryAssetRecord;
  item: StorageItem | null;
}

type AssetLibraryStorageTarget = "indexeddb" | "postgres";

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function readAssetLibraryStorageTarget(): Promise<AssetLibraryStorageTarget> {
  const status = await fetchWorkspaceStorageRuntimeStatus();
  return status.targetKind === "postgres" ? "postgres" : "indexeddb";
}

function requireTeamCsrfToken(): string {
  const token = readTeamCsrfToken();
  if (!token) throw new Error("CSRF token is required");
  return token;
}

function createTeamLibraryRecordFromSource(source: StorageItem): LibraryAssetRecord {
  if (source.status !== "complete") throw new Error(t("common.notices.addToLibraryFailed"));
  if (!isLibraryMediaType(source.type)) throw new Error(t("common.notices.libraryImportFailed"));
  const now = new Date().toISOString();
  return {
    id: makeLibraryClientId("library_item"),
    assetId: source.id,
    sourceAssetId: source.id,
    origin: "promoted",
    mediaType: source.type,
    category: "other",
    title: defaultLibraryTitle(source, source.type),
    notes: "",
    tags: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
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
      const storageTarget = await readAssetLibraryStorageTarget();
      const nextRecords: LibraryAssetRecord[] = [];
      const items: StorageItem[] = [];
      if (storageTarget === "postgres") {
        const result = await fetchTeamAssetLibrary({ limit: 200 });
        nextRecords.push(...result.entries.map(entry => entry.record));
        items.push(...result.entries.flatMap(entry => entry.asset ? [teamAssetRecordToStorageItem(entry.asset)] : []));
      } else {
        nextRecords.push(...await listLibraryAssetRecords());
        const metas = await getAssetMetasByIds(nextRecords.map(record => record.assetId));
        items.push(...await hydrateAssets(metas));
      }
      if (canUpdate()) {
        setRecords(nextRecords);
        setItemsById(new Map(items.map(item => [item.id, item])));
      }
    } catch (caught) {
      const nextError = normalizeError(caught);
      if (!canUpdate()) return;
      setError(nextError);
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
      const storageTarget = await readAssetLibraryStorageTarget();
      const result = storageTarget === "postgres"
        ? await addSourceAssetToTeamLibrary(source)
        : await addSourceAssetToLibrary(source);
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
      const storageTarget = await readAssetLibraryStorageTarget();
      const imported = storageTarget === "postgres"
        ? await importFilesToTeamLibrary(files)
        : await importFilesToLibrary(files);
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
      const updated = { ...record, updatedAt: new Date().toISOString() };
      const storageTarget = await readAssetLibraryStorageTarget();
      if (storageTarget === "postgres") {
        await saveTeamAssetLibraryRecord(updated, requireTeamCsrfToken());
      } else {
        const existing = await getLibraryAssetRecord(record.id);
        if (!existing) throw new Error(`Library asset record not found: ${record.id}`);
        await saveLibraryAssetRecord(updated);
      }
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
      const storageTarget = await readAssetLibraryStorageTarget();
      if (storageTarget === "postgres") {
        await deleteTeamAssetLibraryRecord(record.id, requireTeamCsrfToken());
      } else {
        await deleteLibraryAssetRecord(record.id);
      }
      await reload();
    } catch (caught) {
      const nextError = normalizeError(caught);
      if (mountedRef.current) setError(nextError);
      throw nextError;
    }
  }, [reload]);

  return useMemo(() => ({
    entries,
    error,
    loading,
    addSource,
    importFiles,
    reload,
    removeRecord,
    updateRecord,
  }), [addSource, entries, error, importFiles, loading, reload, removeRecord, updateRecord]);
}

async function addSourceAssetToTeamLibrary(
  source: StorageItem,
): Promise<{ record: LibraryAssetRecord; created: boolean }> {
  const result = await fetchTeamAssetLibrary({ limit: 200 });
  const existing = result.entries.find(entry => entry.record.sourceAssetId === source.id)?.record;
  if (existing) return { record: existing, created: false };
  const record = createTeamLibraryRecordFromSource(source);
  await saveTeamAssetLibraryRecord(record, requireTeamCsrfToken());
  return { record, created: true };
}

async function importFilesToTeamLibrary(files: File[]): Promise<LibraryAssetRecord[]> {
  const records: LibraryAssetRecord[] = [];
  const csrfToken = requireTeamCsrfToken();
  for (const file of files) {
    const { backing, record } = await buildImportedLibraryAssetPair(file);
    await saveTeamAsset(backing, csrfToken);
    await saveTeamAssetLibraryRecord(record, csrfToken);
    records.push(record);
  }
  return records;
}
