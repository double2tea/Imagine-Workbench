// IndexedDB: asset metadata (light) + blob payloads (heavy data URLs)
import {
  mediaReferenceTypeFromDataUri,
  type MediaReferenceRole,
  type MediaReferenceType,
} from "./media-references";
import type { AudioOperationMode } from "./providers/model-catalog";
import type { RunningHubTaskNodeBinding } from "./providers/types";

const DB_NAME = "ImagineWorkbenchDB";
const DB_VERSION = 5;
const META_STORE = "assets_meta";
const BLOB_STORE = "assets_blob";
const HASH_BLOB_STORE = "asset_blob_payloads";
const PREVIEW_STORE = "asset_previews";
const LEGACY_STORE = "assets";
export const GENERATION_TASK_STORE = "generation_tasks";

export type AssetScope = "workspace" | "board";
export type AssetPreviewStatus = "ready" | "missing" | "failed";
export type StorageItemType = "image" | "video" | "audio" | "transcript";

export interface GenerationReferenceMediaSnapshot {
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
  /** Remote http(s) URL only when hasBlob is false. */
  url?: string;
  hasBlob: boolean;
  /** SHA-256 hash for shared local media payloads. */
  contentHash?: string;
  previewStatus?: AssetPreviewStatus;
  previewUpdatedAt?: string;
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
  if (!meta.indexNames.contains("by_contentHash")) {
    meta.createIndex("by_contentHash", "contentHash", { unique: false });
  }
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

      if (!db.objectStoreNames.contains(GENERATION_TASK_STORE)) {
        const tasks = db.createObjectStore(GENERATION_TASK_STORE, { keyPath: "id" });
        tasks.createIndex("by_boardId", "source.boardId", { unique: false });
        tasks.createIndex("by_status", "status", { unique: false });
        tasks.createIndex("by_createdAt", "createdAt", { unique: false });
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
    legacyAssetRecords,
  ] = await Promise.all([
    countStoreRecords(db, META_STORE),
    countStoreRecords(db, BLOB_STORE),
    countStoreRecords(db, HASH_BLOB_STORE),
    countStoreRecords(db, PREVIEW_STORE),
    countStoreRecords(db, LEGACY_STORE),
  ]);
  return {
    version: DB_VERSION,
    metaRecords,
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
    const request = transaction.objectStore(META_STORE).getAll();
    request.onsuccess = () => {
      const metas = (request.result as StorageItemMeta[]).map(normalizeMeta);
      resolve(sortMetas(metas));
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

export async function deleteFromDB(id: string): Promise<void> {
  const meta = await getAssetMeta(id);
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([META_STORE, BLOB_STORE, PREVIEW_STORE], "readwrite");
    transaction.objectStore(META_STORE).delete(id);
    transaction.objectStore(BLOB_STORE).delete(id);
    transaction.objectStore(PREVIEW_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
  });
  if (meta?.contentHash) {
    await deleteUnreferencedHashBlobPayload(meta.contentHash);
  }
}

export async function clearAllDB(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const stores = [META_STORE, BLOB_STORE, HASH_BLOB_STORE, PREVIEW_STORE, GENERATION_TASK_STORE];
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

/** Workspace gallery: metadata only (no blob hydration). */
export async function listWorkspaceGalleryMetas(options?: {
  limit?: number;
  offset?: number;
}): Promise<StorageItemMeta[]> {
  return listAssetMetas({ boardId: "", ...options });
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
