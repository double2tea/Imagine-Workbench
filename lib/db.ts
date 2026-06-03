// IndexedDB: asset metadata (light) + blob payloads (heavy data URLs)

const DB_NAME = "ImagineWorkbenchDB";
const DB_VERSION = 2;
const META_STORE = "assets_meta";
const BLOB_STORE = "assets_blob";
const LEGACY_STORE = "assets";

export type AssetScope = "workspace" | "board";

export interface GenerationRequestSnapshot {
  prompt: string;
  model: string;
  aspectRatio: string;
  imageResolution?: string;
  imageQuality?: string;
  thinkingLevel?: string;
  videoDurationSeconds?: string;
  videoPreset?: string;
  videoResolution?: string;
  referenceImages?: string[];
}

export interface StorageItemMeta {
  id: string;
  type: "image" | "video";
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
  /** Remote http(s) URL only when hasBlob is false. */
  url?: string;
  hasBlob: boolean;
}

/** Hydrated asset record used across UI and generation flows. */
export interface StorageItem extends StorageItemMeta {
  url: string;
}

interface AssetBlobRecord {
  id: string;
  data: string;
}

interface LegacyStorageItem {
  id: string;
  type: "image" | "video";
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

function normalizeMeta(meta: StorageItemMeta): StorageItemMeta {
  const scope: AssetScope = meta.scope === "board" ? "board" : "workspace";
  return {
    ...meta,
    scope,
    boardId: normalizeBoardId(meta.boardId, scope),
    hasBlob: Boolean(meta.hasBlob),
    url: meta.url && isRemoteUrl(meta.url) ? meta.url : undefined,
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
    url: blob ? undefined : url || undefined,
    hasBlob: Boolean(blob),
  });
  return { meta, blob };
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
    url: blob ? undefined : raw.url || undefined,
    hasBlob: Boolean(blob),
  });
  return { meta, blob };
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
        meta.createIndex("by_boardId", "boardId", { unique: false });
        meta.createIndex("by_status", "status", { unique: false });
        meta.createIndex("by_createdAt", "createdAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
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

export async function getAssetBlobPayload(id: string): Promise<string | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE, "readonly");
    const request = transaction.objectStore(BLOB_STORE).get(id);
    request.onsuccess = () => {
      const record = request.result as AssetBlobRecord | undefined;
      resolve(record?.data ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function hydrateAsset(meta: StorageItemMeta): Promise<StorageItem> {
  const normalized = normalizeMeta(meta);
  let url = normalized.url ?? "";
  if (!url && normalized.hasBlob) {
    url = (await getAssetBlobPayload(normalized.id)) ?? "";
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
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([META_STORE, BLOB_STORE], "readwrite");
    const metaStore = transaction.objectStore(META_STORE);
    const blobStore = transaction.objectStore(BLOB_STORE);

    metaStore.put(meta);
    if (blob) {
      blobStore.put({ id: meta.id, data: blob } satisfies AssetBlobRecord);
    } else if (!meta.hasBlob) {
      blobStore.delete(meta.id);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB save failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB save aborted"));
  });
}

export async function deleteFromDB(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([META_STORE, BLOB_STORE], "readwrite");
    transaction.objectStore(META_STORE).delete(id);
    transaction.objectStore(BLOB_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB delete failed"));
  });
}

export async function clearAllDB(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const stores = [META_STORE, BLOB_STORE];
    if (db.objectStoreNames.contains(LEGACY_STORE)) stores.push(LEGACY_STORE);
    const transaction = db.transaction(stores, "readwrite");
    for (const storeName of stores) {
      transaction.objectStore(storeName).clear();
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB clear failed"));
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