import {
  buildStorageItem,
  deleteFromDB,
  deleteLibraryAssetRecord,
  getLibraryAssetRecordBySourceAssetId,
  hydrateAsset,
  saveLibraryAssetRecord,
  saveToDB,
  type LibraryAssetCategory,
  type LibraryAssetMediaType,
  type LibraryAssetRecord,
  type StorageItem,
} from "@/lib/db";
import { createLocalUploadAsset } from "@/lib/data-management";
import { t } from "@/lib/i18n-core";

export const LIBRARY_ASSET_CATEGORIES: readonly LibraryAssetCategory[] = ["character", "scene", "prop", "style", "other"];
export const LIBRARY_ASSET_MEDIA_TYPES: readonly LibraryAssetMediaType[] = ["image", "video", "audio"];

export const LIBRARY_ASSET_CATEGORY_LABELS: Record<LibraryAssetCategory, string> = {
  character: t("common.library.category.character"),
  scene: t("common.library.category.scene"),
  prop: t("common.library.category.prop"),
  style: t("common.library.category.style"),
  other: t("common.library.category.other"),
};

export const LIBRARY_ASSET_MEDIA_TYPE_LABELS: Record<LibraryAssetMediaType, string> = {
  audio: t("media.referenceLabels.audio"),
  image: t("media.referenceLabels.image"),
  video: t("media.referenceLabels.video"),
};

function makeClientId(prefix: string): string {
  const cryptoApi = typeof crypto !== "undefined" ? crypto : null;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function isLibraryMediaType(type: StorageItem["type"]): type is LibraryAssetMediaType {
  return type === "image" || type === "video" || type === "audio";
}

function isLibraryFileType(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/");
}

function defaultLibraryTitle(item: Pick<StorageItem, "prompt" | "model" | "operationName">, fallback: string): string {
  const prompt = item.prompt.trim();
  if (prompt) return prompt.slice(0, 80);
  const operation = item.operationName?.trim();
  if (operation) return operation;
  const model = item.model.trim();
  return model || fallback;
}

async function buildLibraryBackingAsset(
  source: StorageItem,
  recordId: string,
  assetId: string,
): Promise<StorageItem> {
  const hydrated = await hydrateAsset(source);
  const backing = buildStorageItem({
    ...hydrated,
    id: assetId,
    createdAt: new Date().toISOString(),
    operationName: "asset-library",
    sourceBoardNodeId: undefined,
    sourceBoardResultStackKey: undefined,
    libraryItemId: recordId,
  });
  return backing;
}

async function saveLibraryAssetPair(backing: StorageItem, record: LibraryAssetRecord): Promise<void> {
  await saveToDB(backing);
  try {
    await saveLibraryAssetRecord(record);
  } catch (error) {
    try {
      await deleteFromDB(backing.id);
    } catch {
      // Best-effort rollback; preserve the original save error for callers.
    }
    throw error;
  }
}

export async function addSourceAssetToLibrary(
  source: StorageItem,
  category: LibraryAssetCategory = "other",
): Promise<{ record: LibraryAssetRecord; created: boolean }> {
  if (source.status !== "complete") throw new Error(t("common.notices.addToLibraryFailed"));
  if (!isLibraryMediaType(source.type)) throw new Error(t("common.notices.libraryImportFailed"));

  const existing = await getLibraryAssetRecordBySourceAssetId(source.id);
  if (existing) return { record: existing, created: false };

  const now = new Date().toISOString();
  const recordId = makeClientId("library_item");
  const backingAssetId = makeClientId("library_asset");
  const backing = await buildLibraryBackingAsset(source, recordId, backingAssetId);
  const record: LibraryAssetRecord = {
    id: recordId,
    assetId: backingAssetId,
    sourceAssetId: source.id,
    origin: "promoted",
    mediaType: source.type,
    category,
    title: defaultLibraryTitle(source, LIBRARY_ASSET_MEDIA_TYPE_LABELS[source.type]),
    notes: "",
    tags: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
  await saveLibraryAssetPair(backing, record);
  return { record, created: true };
}

export async function importFilesToLibrary(files: File[]): Promise<LibraryAssetRecord[]> {
  const records: LibraryAssetRecord[] = [];
  const backingAssetIds: string[] = [];
  try {
    for (const file of files) {
      if (!isLibraryFileType(file)) throw new Error(t("common.notices.libraryImportFailed"));
      const recordId = makeClientId("library_item");
      const asset = await createLocalUploadAsset(file, makeClientId("library_asset"));
      if (!isLibraryMediaType(asset.type)) throw new Error(t("common.notices.libraryImportFailed"));
      const mediaType = asset.type;
      const now = new Date().toISOString();
      const backing = buildStorageItem({
        ...asset,
        operationName: "asset-library",
        libraryItemId: recordId,
      });
      const record: LibraryAssetRecord = {
        id: recordId,
        assetId: backing.id,
        origin: "imported",
        mediaType,
        category: "other",
        title: file.name || defaultLibraryTitle(backing, LIBRARY_ASSET_MEDIA_TYPE_LABELS[mediaType]),
        notes: "",
        tags: [],
        favorite: false,
        createdAt: now,
        updatedAt: now,
      };
      backingAssetIds.push(backing.id);
      await saveLibraryAssetPair(backing, record);
      records.push(record);
    }
  } catch (error) {
    const recordedAssetIds = new Set(records.map(record => record.assetId));
    await Promise.all([
      ...records.map(record => deleteLibraryAssetRecord(record.id).catch(() => undefined)),
      ...backingAssetIds
        .filter(id => !recordedAssetIds.has(id))
        .map(id => deleteFromDB(id).catch(() => undefined)),
    ]);
    throw error;
  }
  return records;
}
