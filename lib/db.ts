// IndexedDB: asset metadata (light) + blob payloads (heavy data URLs)
import {
  mediaReferenceTypeFromDataUri,
  type MediaReferenceRole,
  type MediaReferenceType,
} from "./media-references";
import type { AudioOperationMode } from "./providers/model-catalog";
import type { CinematicProfile } from "./cinematic-controls";
import type { RunningHubTaskNodeBinding, RunningHubYouchuanAdvancedSettings } from "./providers/types";

const DB_NAME = "ImagineWorkbenchDB";
const DB_VERSION = 9;
const META_STORE = "assets_meta";
const BLOB_STORE = "assets_blob";
const HASH_BLOB_STORE = "asset_blob_payloads";
const PREVIEW_STORE = "asset_previews";
const LEGACY_STORE = "assets";
const LIBRARY_STORE = "asset_library";
export const GENERATION_TASK_STORE = "generation_tasks";

export type AssetScope = "workspace" | "board";
export type AssetPreviewStatus = "ready" | "missing" | "failed";
export type StorageItemType = "image" | "video" | "audio" | "transcript";
export type LibraryAssetMediaType = Extract<StorageItemType, "image" | "video" | "audio">;
export type LibraryAssetCategory = "character" | "scene" | "prop" | "style" | "other";
export type LibraryAssetOrigin = "promoted" | "imported";

export interface GenerationReferenceMediaSnapshot {
  sourceAssetId?: string;
  url: string;
  type: MediaReferenceType;
  role?: MediaReferenceRole;
}

export interface GenerationRequestSnapshot {
  prompt: string;
  model: string;
  aspectRatio: string;
  imageResolution?: string;
  imageQuality?: string;
  thinkingLevel?: string;
  cinematicProfile?: CinematicProfile;
  videoDurationSeconds?: string;
  videoPreset?: string;
  videoReferenceMode?: "reference" | "firstLast";
  videoResolution?: string;
  audioFormat?: string;
  audioMode?: AudioOperationMode;
  audioStylePrompt?: string;
  asrLanguage?: "auto" | "zh" | "en";
  optimizeTextPreview?: boolean;
  voiceProfileId?: string;
  runningHubAccessPassword?: string;
  runningHubNodeInfoList?: RunningHubTaskNodeBinding[];
  runningHubYouchuan?: RunningHubYouchuanAdvancedSettings;
  referenceMedia?: GenerationReferenceMediaSnapshot[];
  /** @deprecated Use referenceMedia. Kept only for reading pre-migration assets. */
  referenceImages?: string[];
}

export interface StorageItemMeta {
  id: string;
  type: StorageItemType;
  prompt: string;
  model: string;
  aspectRatio: string;
  createdAt: string;
  status: "complete" | "processing" | "pending" | "failed";
  progress: number;
  scope: AssetScope;
  /** Empty string = workspace-global (indexed). */
  boardId: string;
  operationName?: string;
  errorMessage?: string;
  generationRequest?: GenerationRequestSnapshot;
  maskOriginalId?: string;
  sourceBoardNodeId?: string;
  sourceBoardResultStackKey?: string;
  /** Present only for hidden media records backing persistent library items. */
  libraryItemId?: string;
  /** Remote http(s) URL only when hasBlob is false. */
  url?: string;
  hasBlob: boolean;
  /** SHA-256 hash for shared local media payloads. */
  contentHash?: string;
  previewStatus?: AssetPreviewStatus;
  previewUpdatedAt?: string;
}

export interface LibraryAssetRecord {
  id: string;
  assetId: string;
  sourceAssetId?: string;
  origin: LibraryAssetOrigin;
  mediaType: LibraryAssetMediaType;
  category: LibraryAssetCategory;
  title: string;
  notes: string;
  tags: string[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Hydrated asset record used across UI and generation flows. */
export interface StorageItem extends StorageItemMeta {
  url: string;
}

export function getGenerationReferenceMedia(
  request: GenerationRequestSnapshot | undefined,
): GenerationReferenceMediaSnapshot[] {
  if (!request) return [];
  if (request.referenceMedia) return request.referenceMedia;
  return (request.referenceImages ?? []).map(url => ({
    url,
    type: mediaReferenceTypeFromDataUri(url) ?? "image",
  }));
}

interface AssetBlobRecord {
  id: string;
  data: string;
}

interface AssetBlobPayloadRecord {
  hash: string;
  data: string;
}

export interface AssetDatabaseDiagnostics {
  version: number;
  metaRecords: number;
  libraryRecords: number;
  legacyBlobRecords: number;
  sharedBlobRecords: number;
  previewRecords: number;
  legacyAssetRecords: number;
}

export interface AssetPreviewRecord {
  assetId: string;
  type: StorageItemType;
  dataUrl: string;
  width: number;
  height: number;
  mimeType: string;
  createdAt: string;
}

interface LegacyStorageItem {
  id: string;
  type: StorageItemType;
  url: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  createdAt: string;
  status: StorageItemMeta["status"];
  progress: number;
  operationName?: string;
  errorMessage?: string;
  generationRequest?: GenerationRequestSnapshot;
  maskOriginalId?: string;
  sourceBoardNodeId?: string;
  sourceBoardResultStackKey?: string;
  libraryItemId?: string;
  scope?: AssetScope;
  boardId?: string;
}

export interface ListAssetMetasOptions {
  boardId?: string;
  ids?: string[];
  statuses?: StorageItemMeta["status"][];
  limit?: number;
  offset?: number;
}

export interface AssetMetaPageCursor {
  createdAt: string;
  id: string;
}

export interface ListAssetMetaPageOptions {
  boardId?: string;
  cursor?: AssetMetaPageCursor;
  statuses?: StorageItemMeta["status"][];
  limit: number;
}

export interface AssetMetaPage {
  items: StorageItemMeta[];
  nextCursor?: AssetMetaPageCursor;
}

function isRemoteUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function shouldStoreInBlob(url: string): boolean {
  return url.startsWith("data:") || url.startsWith("blob:");
}

function normalizeBoardId(boardId: string | undefined, scope: AssetScope): string {
  if (scope === "board" && boardId?.trim()) return boardId.trim();
  return "";
}

function normalizeContentHash(value: string | undefined): string | undefined {
  const hash = value?.trim();
  return hash ? hash : undefined;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeLibraryCategory(value: LibraryAssetCategory | undefined): LibraryAssetCategory {
  if (value === "character" || value === "scene" || value === "prop" || value === "style") return value;
  return "other";
}

function normalizeLibraryMediaType(value: unknown): LibraryAssetMediaType {
  if (value === "image" || value === "video" || value === "audio") return value;
  // Keep one corrupted/future library record from blocking the whole library list.
  return "image";
}

function normalizeLibraryRecord(record: LibraryAssetRecord): LibraryAssetRecord {
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const notes = typeof record.notes === "string" ? record.notes.trim() : "";
  return {
    id: record.id,
    assetId: record.assetId,
    sourceAssetId: normalizeOptionalString(record.sourceAssetId),
    origin: record.origin === "imported" ? "imported" : "promoted",
    mediaType: normalizeLibraryMediaType(record.mediaType),
    category: normalizeLibraryCategory(record.category),
    title: title || record.assetId || record.id,
    notes,
    tags: record.tags.map(tag => tag.trim()).filter(tag => tag.length > 0),
    favorite: Boolean(record.favorite),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeMeta(meta: StorageItemMeta): StorageItemMeta {
  const scope: AssetScope = meta.scope === "board" ? "board" : "workspace";
  const hasBlob = Boolean(meta.hasBlob);
  const previewStatus = meta.previewStatus === "ready" || meta.previewStatus === "missing" || meta.previewStatus === "failed"
    ? meta.previewStatus
    : undefined;
  return {
    ...meta,
    scope,
    boardId: normalizeBoardId(meta.boardId, scope),
    hasBlob,
    contentHash: hasBlob ? normalizeContentHash(meta.contentHash) : undefined,
    libraryItemId: normalizeOptionalString(meta.libraryItemId),
    url: !hasBlob && meta.url && isRemoteUrl(meta.url) ? meta.url : undefined,
    previewStatus,
    previewUpdatedAt: meta.previewUpdatedAt,
  };
}

function sortMetas(metas: StorageItemMeta[]): StorageItemMeta[] {
  return [...metas].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function splitIncomingItem(item: StorageItem): { meta: StorageItemMeta; blob: string | null } {
  const scope: AssetScope = item.scope === "board" || item.boardId?.trim() ? "board" : "workspace";
  const boardId = normalizeBoardId(item.boardId, scope);
  const url = item.url ?? "";
  const blob = shouldStoreInBlob(url) ? url : null;
  const meta: StorageItemMeta = normalizeMeta({
    id: item.id,
    type: item.type,
    prompt: item.prompt,
    model: item.model,
    aspectRatio: item.aspectRatio,
    createdAt: item.createdAt,
    status: item.status,
    progress: item.progress,
    scope,
    boardId,
    operationName: item.operationName,
    errorMessage: item.errorMessage,
    generationRequest: item.generationRequest,
    maskOriginalId: item.maskOriginalId,
    sourceBoardNodeId: item.sourceBoardNodeId,
    sourceBoardResultStackKey: item.sourceBoardResultStackKey,
    libraryItemId: normalizeOptionalString(item.libraryItemId),
    url: blob ? undefined : url || undefined,
    hasBlob: Boolean(blob),
  });
  return { meta, blob };
}

function bufferToHex(buffer: ArrayBuffer): string {
  let hex = "";
  for (const byte of new Uint8Array(buffer)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function computeAssetContentHash(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return `sha256:${bufferToHex(digest)}`;
}

function legacyToMeta(raw: LegacyStorageItem): { meta: StorageItemMeta; blob: string | null } {
  const scope: AssetScope = raw.scope === "board" || raw.boardId?.trim() ? "board" : "workspace";
  const boardId = normalizeBoardId(raw.boardId, scope);
  const blob = shouldStoreInBlob(raw.url) ? raw.url : null;
  const meta: StorageItemMeta = normalizeMeta({
    id: raw.id,
    type: raw.type,
    prompt: raw.prompt,
    model: raw.model,
    aspectRatio: raw.aspectRatio,
    createdAt: raw.createdAt,
    status: raw.status,
    progress: raw.progress,
    scope,
    boardId,
    operationName: raw.operationName,
    errorMessage: raw.errorMessage,
    generationRequest: raw.generationRequest,
    maskOriginalId: raw.maskOriginalId,
    sourceBoardNodeId: raw.sourceBoardNodeId,
    sourceBoardResultStackKey: raw.sourceBoardResultStackKey,
    libraryItemId: normalizeOptionalString(raw.libraryItemId),
    url: blob ? undefined : raw.url || undefined,
    hasBlob: Boolean(blob),
  });
  return { meta, blob };
}

function ensureMetaIndexes(meta: IDBObjectStore): void {
  if (!meta.indexNames.contains("by_boardId")) {
    meta.createIndex("by_boardId", "boardId", { unique: false });
  }
  if (!meta.indexNames.contains("by_status")) {
    meta.createIndex("by_status", "status", { unique: false });
  }
  if (!meta.indexNames.contains("by_createdAt")) {
    meta.createIndex("by_createdAt", "createdAt", { unique: false });
  }
  if (!meta.indexNames.contains("by_createdAt_id")) {
    meta.createIndex("by_createdAt_id", ["createdAt", "id"], { unique: false });
  }
  if (!meta.indexNames.contains("by_contentHash")) {
    meta.createIndex("by_contentHash", "contentHash", { unique: false });
  }
}

function ensureGenerationTaskIndexes(tasks: IDBObjectStore): void {
  if (!tasks.indexNames.contains("by_boardId")) {
    tasks.createIndex("by_boardId", "source.boardId", { unique: false });
  }
  if (!tasks.indexNames.contains("by_status")) {
    tasks.createIndex("by_status", "status", { unique: false });
  }
  if (!tasks.indexNames.contains("by_createdAt")) {
    tasks.createIndex("by_createdAt", "createdAt", { unique: false });
  }
}

function ensureLibraryIndexes(library: IDBObjectStore): void {
  if (!library.indexNames.contains("by_assetId")) {
    library.createIndex("by_assetId", "assetId", { unique: false });
  }
  ensureLibrarySourceAssetIndex(library);
  if (!library.indexNames.contains("by_mediaType")) {
    library.createIndex("by_mediaType", "mediaType", { unique: false });
  }
  if (!library.indexNames.contains("by_category")) {
    library.createIndex("by_category", "category", { unique: false });
  }
  if (!library.indexNames.contains("by_updatedAt")) {
    library.createIndex("by_updatedAt", "updatedAt", { unique: false });
  }
}

function ensureLibrarySourceAssetIndex(library: IDBObjectStore): void {
  if (library.indexNames.contains("by_sourceAssetId") && library.index("by_sourceAssetId").unique) return;

  const seenSourceIds = new Set<string>();
  const request = library.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      if (library.indexNames.contains("by_sourceAssetId")) {
        library.deleteIndex("by_sourceAssetId");
      }
      library.createIndex("by_sourceAssetId", "sourceAssetId", { unique: true });
      return;
    }

    const record = cursor.value as LibraryAssetRecord;
    const sourceAssetId = normalizeOptionalString(record.sourceAssetId);
    if (sourceAssetId && seenSourceIds.has(sourceAssetId)) {
      cursor.update({ ...record, sourceAssetId: undefined });
    } else if (sourceAssetId) {
      seenSourceIds.add(sourceAssetId);
    }
    cursor.continue();
  };
  request.onerror = () => {
    library.transaction.abort();
  };
}

function migrateLegacyStore(db: IDBDatabase, transaction: IDBTransaction): void {
  if (!db.objectStoreNames.contains(LEGACY_STORE)) return;
  const legacy = transaction.objectStore(LEGACY_STORE);
  const metaStore = transaction.objectStore(META_STORE);
  const blobStore = transaction.objectStore(BLOB_STORE);
  const request = legacy.openCursor();

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      if (db.objectStoreNames.contains(LEGACY_STORE)) {
        db.deleteObjectStore(LEGACY_STORE);
      }
      return;
    }
    const { meta, blob } = legacyToMeta(cursor.value as LegacyStorageItem);
    metaStore.put(meta);
    if (blob) {
      blobStore.put({ id: meta.id, data: blob } satisfies AssetBlobRecord);
    }
    cursor.continue();
  };
}

function readLegacyBlobRecord(db: IDBDatabase, id: string): Promise<AssetBlobRecord | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE, "readonly");
    const request = transaction.objectStore(BLOB_STORE).get(id);
    request.onsuccess = () => resolve((request.result as AssetBlobRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB legacy blob ${id} read failed`));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error(`IndexedDB legacy blob ${id} transaction failed`));
  });
}

function readHashBlobPayload(db: IDBDatabase, hash: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HASH_BLOB_STORE, "readonly");
    const request = transaction.objectStore(HASH_BLOB_STORE).get(hash);
    request.onsuccess = () => {
      const record = request.result as AssetBlobPayloadRecord | undefined;
      resolve(record?.data ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB blob ${hash} read failed`));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error(`IndexedDB blob ${hash} transaction failed`));
  });
}

function hasHashBlobPayload(db: IDBDatabase, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HASH_BLOB_STORE, "readonly");
    const request = transaction.objectStore(HASH_BLOB_STORE).getKey(hash);
    request.onsuccess = () => resolve(request.result !== undefined);
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB blob ${hash} existence check failed`));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error(`IndexedDB blob ${hash} existence transaction failed`));
  });
}

function countStoreRecords(db: IDBDatabase, storeName: string): Promise<number> {
  if (!db.objectStoreNames.contains(storeName)) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB ${storeName} count failed`));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error(`IndexedDB ${storeName} count transaction failed`));
  });
}

function writeMigratedBlobRecord(
  db: IDBDatabase,
  meta: StorageItemMeta,
  payload: AssetBlobPayloadRecord,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([META_STORE, BLOB_STORE, HASH_BLOB_STORE], "readwrite");
    const metaStore = transaction.objectStore(META_STORE);
    const blobStore = transaction.objectStore(BLOB_STORE);
    const hashBlobStore = transaction.objectStore(HASH_BLOB_STORE);
    const request = metaStore.get(meta.id);
    request.onsuccess = () => {
      const current = request.result as StorageItemMeta | undefined;
      const currentMeta = current ? normalizeMeta(current) : null;
      if (!currentMeta?.hasBlob) {
        blobStore.delete(meta.id);
        return;
      }
      if (currentMeta.contentHash && currentMeta.contentHash !== payload.hash) {
        blobStore.delete(meta.id);
        return;
      }
      hashBlobStore.put(payload);
      if (!currentMeta.contentHash) {
        metaStore.put(normalizeMeta({ ...currentMeta, contentHash: payload.hash }));
      }
      blobStore.delete(meta.id);
    };
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB asset ${meta.id} metadata read failed`));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error(`IndexedDB blob ${meta.id} migration failed`));
    transaction.onabort = () => reject(transaction.error ?? new Error(`IndexedDB blob ${meta.id} migration aborted`));
  });
}

async function migrateLegacyBlobRecord(
  db: IDBDatabase,
  meta: StorageItemMeta,
  record: AssetBlobRecord,
): Promise<void> {
  const hash = await computeAssetContentHash(record.data);
  await writeMigratedBlobRecord(
    db,
    normalizeMeta({ ...meta, hasBlob: true, contentHash: hash }),
    { hash, data: record.data },
  );
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in the browser"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!transaction) return;

      if (!db.objectStoreNames.contains(META_STORE)) {
        const meta = db.createObjectStore(META_STORE, { keyPath: "id" });
        ensureMetaIndexes(meta);
      } else {
        ensureMetaIndexes(transaction.objectStore(META_STORE));
      }

      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(HASH_BLOB_STORE)) {
        db.createObjectStore(HASH_BLOB_STORE, { keyPath: "hash" });
      }

      if (!db.objectStoreNames.contains(PREVIEW_STORE)) {
        db.createObjectStore(PREVIEW_STORE, { keyPath: "assetId" });
      }

      if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
        const library = db.createObjectStore(LIBRARY_STORE, { keyPath: "id" });
        ensureLibraryIndexes(library);
      } else {
        ensureLibraryIndexes(transaction.objectStore(LIBRARY_STORE));
      }

      if (!db.objectStoreNames.contains(GENERATION_TASK_STORE)) {
        const tasks = db.createObjectStore(GENERATION_TASK_STORE, { keyPath: "id" });
        ensureGenerationTaskIndexes(tasks);
      } else {
        ensureGenerationTaskIndexes(transaction.objectStore(GENERATION_TASK_STORE));
      }

      if (event.oldVersion > 0 && event.oldVersion < DB_VERSION) {
        migrateLegacyStore(db, transaction);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

export async function getAssetMeta(id: string): Promise<StorageItemMeta | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readonly");
    const request = transaction.objectStore(META_STORE).get(id);
    request.onsuccess = () => {
      const value = request.result as StorageItemMeta | undefined;
      resolve(value ? normalizeMeta(value) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAssetMetasByIds(ids: string[]): Promise<StorageItemMeta[]> {
  if (ids.length === 0) return [];
  const uniqueIds = Array.from(new Set(ids));
  const metas = await Promise.all(uniqueIds.map(id => getAssetMeta(id)));
  return sortMetas(metas.filter((meta): meta is StorageItemMeta => meta !== null));
}

export async function listLibraryAssetRecords(): Promise<LibraryAssetRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LIBRARY_STORE, "readonly");
    const request = transaction.objectStore(LIBRARY_STORE).index("by_updatedAt").openCursor(null, "prev");
    const records: LibraryAssetRecord[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(records);
        return;
      }
      records.push(normalizeLibraryRecord(cursor.value as LibraryAssetRecord));
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB library read failed"));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB library transaction failed"));
  });
}

export async function getLibraryAssetRecord(id: string): Promise<LibraryAssetRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LIBRARY_STORE, "readonly");
    const request = transaction.objectStore(LIBRARY_STORE).get(id);
    request.onsuccess = () => {
      const value = request.result as LibraryAssetRecord | undefined;
      resolve(value ? normalizeLibraryRecord(value) : null);
    };
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB library ${id} read failed`));
  });
}

export async function getLibraryAssetRecordBySourceAssetId(sourceAssetId: string): Promise<LibraryAssetRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LIBRARY_STORE, "readonly");
    const request = transaction.objectStore(LIBRARY_STORE).index("by_sourceAssetId").get(sourceAssetId);
    request.onsuccess = () => {
      const value = request.result as LibraryAssetRecord | undefined;
      resolve(value ? normalizeLibraryRecord(value) : null);
    };
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB library source ${sourceAssetId} read failed`));
  });
}

export async function saveLibraryAssetRecord(record: LibraryAssetRecord): Promise<void> {
  const db = await openDatabase();
  const normalized = normalizeLibraryRecord(record);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LIBRARY_STORE, "readwrite");
    transaction.objectStore(LIBRARY_STORE).put(normalized);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB library save failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB library save aborted"));
  });
}

export async function deleteLibraryAssetRecord(id: string): Promise<void> {
  const record = await getLibraryAssetRecord(id);
  if (!record) return;
  const db = await openDatabase();
  let contentHash: string | undefined;
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([LIBRARY_STORE, META_STORE, BLOB_STORE, PREVIEW_STORE], "readwrite");
    const metaStore = transaction.objectStore(META_STORE);
    const metaRequest = metaStore.get(record.assetId);
    metaRequest.onsuccess = () => {
      const meta = metaRequest.result as StorageItemMeta | undefined;
      contentHash = meta ? normalizeMeta(meta).contentHash : undefined;
      metaStore.delete(record.assetId);
      transaction.objectStore(BLOB_STORE).delete(record.assetId);
      transaction.objectStore(PREVIEW_STORE).delete(record.assetId);
      transaction.objectStore(LIBRARY_STORE).delete(id);
    };
    metaRequest.onerror = () => reject(metaRequest.error ?? new Error("IndexedDB library asset metadata read failed"));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB library asset delete failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB library asset delete aborted"));
  });
  if (contentHash) {
    await deleteUnreferencedHashBlobPayload(contentHash);
  }
}

async function getAssetBlobPayloadForMeta(meta: StorageItemMeta): Promise<string | null> {
  const db = await openDatabase();
  if (meta.contentHash) {
    const payload = await readHashBlobPayload(db, meta.contentHash);
    if (payload !== null) return payload;
  }
  const legacyRecord = await readLegacyBlobRecord(db, meta.id);
  if (!legacyRecord) return null;
  await migrateLegacyBlobRecord(db, meta, legacyRecord);
  return legacyRecord.data;
}

export async function getAssetBlobPayload(id: string): Promise<string | null> {
  const meta = await getAssetMeta(id);
  if (!meta?.hasBlob) return null;
  return getAssetBlobPayloadForMeta(meta);
}

export async function hasAssetBlobPayload(meta: StorageItemMeta): Promise<boolean> {
  const normalized = normalizeMeta(meta);
  if (!normalized.hasBlob) return false;
  const db = await openDatabase();
  if (normalized.contentHash && await hasHashBlobPayload(db, normalized.contentHash)) return true;
  return (await readLegacyBlobRecord(db, normalized.id)) !== null;
}

export async function getAssetPreviewRecord(id: string): Promise<AssetPreviewRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PREVIEW_STORE, "readonly");
    const request = transaction.objectStore(PREVIEW_STORE).get(id);
    request.onsuccess = () => {
      resolve((request.result as AssetPreviewRecord | undefined) ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getAssetDatabaseDiagnostics(): Promise<AssetDatabaseDiagnostics> {
  const db = await openDatabase();
  const [
    metaRecords,
    legacyBlobRecords,
    sharedBlobRecords,
    previewRecords,
    libraryRecords,
    legacyAssetRecords,
  ] = await Promise.all([
    countStoreRecords(db, META_STORE),
    countStoreRecords(db, BLOB_STORE),
    countStoreRecords(db, HASH_BLOB_STORE),
    countStoreRecords(db, PREVIEW_STORE),
    countStoreRecords(db, LIBRARY_STORE),
    countStoreRecords(db, LEGACY_STORE),
  ]);
  return {
    version: DB_VERSION,
    metaRecords,
    libraryRecords,
    legacyBlobRecords,
    sharedBlobRecords,
    previewRecords,
    legacyAssetRecords,
  };
}

export async function saveAssetPreviewRecord(record: AssetPreviewRecord): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PREVIEW_STORE, "readwrite");
    transaction.objectStore(PREVIEW_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB preview save failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB preview save aborted"));
  });
}

export async function updateAssetPreviewMetadata(
  id: string,
  preview: { status: AssetPreviewStatus; updatedAt: string },
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readwrite");
    const store = transaction.objectStore(META_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as StorageItemMeta | undefined;
      if (!current) {
        reject(new Error(`Missing asset metadata for preview ${id}`));
        return;
      }
      store.put(normalizeMeta({
        ...current,
        previewStatus: preview.status,
        previewUpdatedAt: preview.updatedAt,
      }));
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB preview metadata update failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB preview metadata update aborted"));
  });
}

export async function hydrateAsset(meta: StorageItemMeta): Promise<StorageItem> {
  const normalized = normalizeMeta(meta);
  let url = normalized.url ?? "";
  if (!url && normalized.hasBlob) {
    url = (await getAssetBlobPayloadForMeta(normalized)) ?? "";
  }
  return { ...normalized, url };
}

export async function hydrateAssets(metas: StorageItemMeta[]): Promise<StorageItem[]> {
  const batchSize = 24;
  const hydrated: StorageItem[] = [];
  for (let offset = 0; offset < metas.length; offset += batchSize) {
    const slice = metas.slice(offset, offset + batchSize);
    const chunk = await Promise.all(slice.map(meta => hydrateAsset(meta)));
    hydrated.push(...chunk);
  }
  return hydrated;
}

export async function listAllAssetMetas(): Promise<StorageItemMeta[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readonly");
    const request = transaction.objectStore(META_STORE).index("by_createdAt").openCursor(null, "prev");
    const metas: StorageItemMeta[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(metas);
        return;
      }
      metas.push(normalizeMeta(cursor.value as StorageItemMeta));
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function listAssetMetasByBoardId(boardId: string): Promise<StorageItemMeta[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readonly");
    const request = transaction.objectStore(META_STORE).index("by_boardId").getAll(boardId);
    request.onsuccess = () => {
      resolve(sortMetas((request.result as StorageItemMeta[]).map(normalizeMeta)));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function listAssetMetas(options: ListAssetMetasOptions = {}): Promise<StorageItemMeta[]> {
  let metas: StorageItemMeta[];

  if (options.ids && options.ids.length > 0) {
    metas = await getAssetMetasByIds(options.ids);
  } else if (options.boardId !== undefined) {
    metas = await listAssetMetasByBoardId(options.boardId);
  } else {
    metas = await listAllAssetMetas();
  }

  if (options.statuses && options.statuses.length > 0) {
    const allowed = new Set(options.statuses);
    metas = metas.filter(meta => allowed.has(meta.status));
  }

  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit;
  if (limit !== undefined && limit >= 0) {
    metas = metas.slice(offset, offset + limit);
  } else if (offset > 0) {
    metas = metas.slice(offset);
  }

  return metas;
}

export async function listAssetMetaPage(options: ListAssetMetaPageOptions): Promise<AssetMetaPage> {
  const limit = Math.max(0, options.limit);
  if (limit === 0) return { items: [] };

  const allowedStatuses = options.statuses && options.statuses.length > 0 ? new Set(options.statuses) : null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readonly");
    const range = options.cursor
      ? IDBKeyRange.upperBound([options.cursor.createdAt, options.cursor.id], true)
      : null;
    const request = transaction.objectStore(META_STORE).index("by_createdAt_id").openCursor(range, "prev");
    const items: StorageItemMeta[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve({ items });
        return;
      }

      const meta = normalizeMeta(cursor.value as StorageItemMeta);
      const matchesBoard = options.boardId === undefined || meta.boardId === options.boardId;
      const matchesStatus = !allowedStatuses || allowedStatuses.has(meta.status);
      if (matchesBoard && matchesStatus) {
        if (items.length < limit) {
          items.push(meta);
        } else {
          const last = items[items.length - 1];
          resolve({ items, nextCursor: { createdAt: last.createdAt, id: last.id } });
          return;
        }
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("IndexedDB asset page read failed"));
  });
}

async function listAssetMetasByStatus(status: StorageItemMeta["status"]): Promise<StorageItemMeta[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META_STORE, "readonly");
    const request = transaction.objectStore(META_STORE).index("by_status").getAll(status);
    request.onsuccess = () => resolve((request.result as StorageItemMeta[]).map(normalizeMeta));
    request.onerror = () => reject(request.error);
  });
}

export async function listProcessingAssetMetas(boardId?: string): Promise<StorageItemMeta[]> {
  const [processing, pending] = await Promise.all([
    listAssetMetasByStatus("processing"),
    listAssetMetasByStatus("pending"),
  ]);
  let metas = [...processing, ...pending];
  if (boardId !== undefined) {
    metas = metas.filter(meta => meta.boardId === boardId);
  }
  return sortMetas(metas);
}

export async function listBoardScopedAssetMetas(
  boardId: string,
  referencedIds: string[],
  boardNodeIds?: Iterable<string>,
): Promise<StorageItemMeta[]> {
  const nodeIdSet = boardNodeIds ? new Set(boardNodeIds) : null;
  const [byBoard, byReference, activeTasks] = await Promise.all([
    listAssetMetasByBoardId(boardId),
    getAssetMetasByIds(referencedIds),
    nodeIdSet ? listProcessingAssetMetas() : Promise.resolve([]),
  ]);
  const merged = new Map<string, StorageItemMeta>();
  for (const meta of [...byBoard, ...byReference]) {
    merged.set(meta.id, meta);
  }
  if (nodeIdSet) {
    for (const meta of activeTasks) {
      if (meta.sourceBoardNodeId && nodeIdSet.has(meta.sourceBoardNodeId)) {
        merged.set(meta.id, meta);
      }
    }
  }
  return sortMetas(Array.from(merged.values()));
}

export async function saveToDB(item: StorageItem): Promise<void> {
  const { meta, blob } = splitIncomingItem(item);
  const previousMeta = await getAssetMeta(meta.id);
  const contentHash = blob ? await computeAssetContentHash(blob) : undefined;
  const nextMeta = normalizeMeta({ ...meta, contentHash, hasBlob: Boolean(blob) });
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([META_STORE, BLOB_STORE, HASH_BLOB_STORE], "readwrite");
    const metaStore = transaction.objectStore(META_STORE);
    const blobStore = transaction.objectStore(BLOB_STORE);
    const hashBlobStore = transaction.objectStore(HASH_BLOB_STORE);

    metaStore.put(nextMeta);
    blobStore.delete(nextMeta.id);
    if (blob && contentHash) {
      hashBlobStore.put({ hash: contentHash, data: blob } satisfies AssetBlobPayloadRecord);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB save failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB save aborted"));
  });
  if (previousMeta?.contentHash && previousMeta.contentHash !== nextMeta.contentHash) {
    await deleteUnreferencedHashBlobPayload(previousMeta.contentHash);
  }
}

async function deleteAssetRecordOnly(id: string): Promise<StorageItemMeta | null> {
  const db = await openDatabase();
  let deletedMeta: StorageItemMeta | null = null;
  let deletedContentHash: string | undefined;
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([META_STORE, BLOB_STORE, PREVIEW_STORE, LIBRARY_STORE], "readwrite");
    const metaStore = transaction.objectStore(META_STORE);
    const metaRequest = metaStore.get(id);
    metaRequest.onsuccess = () => {
      const meta = metaRequest.result as StorageItemMeta | undefined;
      deletedMeta = meta ? normalizeMeta(meta) : null;
      deletedContentHash = deletedMeta?.contentHash;
      metaStore.delete(id);
      transaction.objectStore(BLOB_STORE).delete(id);
      transaction.objectStore(PREVIEW_STORE).delete(id);
      if (deletedMeta?.libraryItemId) {
        transaction.objectStore(LIBRARY_STORE).delete(deletedMeta.libraryItemId);
      }
    };
    metaRequest.onerror = () => reject(metaRequest.error ?? new Error("IndexedDB delete metadata read failed"));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB delete aborted"));
  });
  if (deletedContentHash) {
    await deleteUnreferencedHashBlobPayload(deletedContentHash);
  }
  return deletedMeta;
}

export async function deleteFromDB(id: string): Promise<void> {
  await deleteAssetRecordOnly(id);
}

export async function clearAllDB(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const stores = [META_STORE, BLOB_STORE, HASH_BLOB_STORE, PREVIEW_STORE, LIBRARY_STORE, GENERATION_TASK_STORE];
    if (db.objectStoreNames.contains(LEGACY_STORE)) stores.push(LEGACY_STORE);
    const transaction = db.transaction(stores, "readwrite");
    for (const storeName of stores) {
      transaction.objectStore(storeName).clear();
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
  });
}

async function deleteUnreferencedHashBlobPayload(hash: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([META_STORE, HASH_BLOB_STORE], "readwrite");
    const metaStore = transaction.objectStore(META_STORE);
    const request = metaStore.index("by_contentHash").getKey(hash);
    request.onsuccess = () => {
      if (request.result === undefined) {
        transaction.objectStore(HASH_BLOB_STORE).delete(hash);
      }
    };
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB blob ${hash} reference check failed`));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error(`IndexedDB blob ${hash} cleanup failed`));
    transaction.onabort = () => reject(transaction.error ?? new Error(`IndexedDB blob ${hash} cleanup aborted`));
  });
}

/** Workspace gallery: metadata only, excluding hidden library backing assets; offset/limit apply after that workspace filter. */
export async function listWorkspaceGalleryMetas(options?: {
  limit?: number;
  offset?: number;
}): Promise<StorageItemMeta[]> {
  const metas = (await listAssetMetasByBoardId("")).filter(meta => !meta.libraryItemId);
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = options?.limit;
  if (limit !== undefined && limit >= 0) return metas.slice(offset, offset + limit);
  return offset > 0 ? metas.slice(offset) : metas;
}

/** Full hydration — avoid on board route; prefer scoped loaders. */
export async function getAllFromDB(): Promise<StorageItem[]> {
  const metas = await listAllAssetMetas();
  return hydrateAssets(metas);
}

export function buildStorageItem(
  partial: Omit<StorageItem, "scope" | "boardId" | "hasBlob"> &
    Partial<Pick<StorageItem, "scope" | "boardId" | "hasBlob">>,
  options?: { boardId?: string },
): StorageItem {
  const scope: AssetScope =
    partial.scope ?? (options?.boardId?.trim() || partial.boardId?.trim() ? "board" : "workspace");
  const boardId = normalizeBoardId(options?.boardId ?? partial.boardId, scope);
  const url = partial.url ?? "";
  const hasBlob = partial.hasBlob ?? shouldStoreInBlob(url);
  const meta = normalizeMeta({
    ...partial,
    scope,
    boardId,
    url: hasBlob ? undefined : url || undefined,
    hasBlob,
  });
  return { ...meta, url };
}

export function metaToPlaceholderItem(meta: StorageItemMeta): StorageItem {
  const normalized = normalizeMeta(meta);
  return {
    ...normalized,
    url: normalized.url ?? "",
  };
}

export function mergeStorageItems(
  current: StorageItem[],
  updates: StorageItem[],
): StorageItem[] {
  if (updates.length === 0) return current;
  const next = new Map(current.map(item => [item.id, item]));
  for (const item of updates) {
    next.set(item.id, item);
  }
  return Array.from(next.values()).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
