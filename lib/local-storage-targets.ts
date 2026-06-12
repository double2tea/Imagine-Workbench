const TARGET_DB_NAME = "ImagineWorkbenchLocalTargetDB";
const TARGET_DB_VERSION = 1;
const TARGET_STORE = "local_storage_targets";
const LOCAL_FOLDER_TARGET_ID = "local-folder";
const LOCAL_FOLDER_MANIFEST_FILE = "imagine-workbench-local-manifest.json";

export type WorkspaceStorageTargetKind = "indexeddb" | "local-folder" | "remote-api";

export interface WorkspaceStorageCapabilities {
  canPersist: boolean;
  canRead: boolean;
  canWrite: boolean;
  userVisiblePath: boolean;
}

export interface WorkspaceStorageAdapterContract {
  capabilities: WorkspaceStorageCapabilities;
  kind: WorkspaceStorageTargetKind;
  label: string;
}

export interface LocalStorageTargetSummary {
  activeKind: WorkspaceStorageTargetKind;
  localFolderAvailable: boolean;
  localFolderConnected: boolean;
  localFolderName?: string;
  localFolderSelectedAt?: string;
  lastExportedAt?: string;
  lastExportFileName?: string;
}

export interface LocalFolderWorkspaceManifest {
  app: "Imagine Workbench";
  assetCount: number;
  backupFileName: string;
  boardCount: number;
  exportedAt: string;
  includeCredentials: boolean;
  kind: "local-folder";
  schemaVersion: 1;
  settingsKeyCount: number;
}

export interface LocalFolderWorkspaceExportInput {
  assetCount: number;
  blob: Blob;
  boardCount: number;
  exportedAt: string;
  fileName: string;
  includeCredentials: boolean;
  settingsKeyCount: number;
}

export interface LocalFolderWorkspaceExportResult {
  assetCount: number;
  boardCount: number;
  directoryName: string;
  fileName: string;
  manifestFileName: typeof LOCAL_FOLDER_MANIFEST_FILE;
  settingsKeyCount: number;
}

interface LocalDirectoryPermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface LocalWritableFileStream {
  close(): Promise<void>;
  write(data: Blob | string | BufferSource): Promise<void>;
}

interface LocalFileHandle {
  createWritable(): Promise<LocalWritableFileStream>;
}

interface LocalDirectoryHandle {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<LocalFileHandle>;
  kind: "directory";
  name: string;
  queryPermission?(descriptor?: LocalDirectoryPermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: LocalDirectoryPermissionDescriptor): Promise<PermissionState>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<LocalDirectoryHandle>;
}

interface LocalFolderTargetRecord {
  directoryHandle: LocalDirectoryHandle;
  directoryName: string;
  id: typeof LOCAL_FOLDER_TARGET_ID;
  kind: "local-folder";
  lastExportedAt?: string;
  lastExportFileName?: string;
  selectedAt: string;
}

export const INDEXED_DB_STORAGE_ADAPTER: WorkspaceStorageAdapterContract = {
  capabilities: {
    canPersist: true,
    canRead: true,
    canWrite: true,
    userVisiblePath: false,
  },
  kind: "indexeddb",
  label: "浏览器本地 IndexedDB",
};

export const LOCAL_FOLDER_STORAGE_ADAPTER: WorkspaceStorageAdapterContract = {
  capabilities: {
    canPersist: true,
    canRead: false,
    canWrite: true,
    userVisiblePath: true,
  },
  kind: "local-folder",
  label: "本地文件夹",
};

export const REMOTE_API_STORAGE_ADAPTER: WorkspaceStorageAdapterContract = {
  capabilities: {
    canPersist: true,
    canRead: true,
    canWrite: true,
    userVisiblePath: false,
  },
  kind: "remote-api",
  label: "远程数据库 API",
};

export function isLocalFolderTargetAvailable(): boolean {
  return typeof window !== "undefined" && typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export async function getLocalStorageTargetSummary(): Promise<LocalStorageTargetSummary> {
  const record = await readLocalFolderTargetRecord();
  return {
    activeKind: "indexeddb",
    localFolderAvailable: isLocalFolderTargetAvailable(),
    localFolderConnected: record !== null,
    localFolderName: record?.directoryName,
    localFolderSelectedAt: record?.selectedAt,
    lastExportedAt: record?.lastExportedAt,
    lastExportFileName: record?.lastExportFileName,
  };
}

export async function selectLocalFolderTarget(): Promise<LocalStorageTargetSummary> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("当前浏览器不支持选择本地文件夹");
  const directoryHandle = await picker({ id: "imagine-workbench-local-folder", mode: "readwrite" });
  await ensureDirectoryWritePermission(directoryHandle);
  const record: LocalFolderTargetRecord = {
    directoryHandle,
    directoryName: directoryHandle.name,
    id: LOCAL_FOLDER_TARGET_ID,
    kind: "local-folder",
    selectedAt: new Date().toISOString(),
  };
  await saveLocalFolderTargetRecord(record);
  return getLocalStorageTargetSummary();
}

export async function disconnectLocalFolderTarget(): Promise<void> {
  const db = await openLocalTargetDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(TARGET_STORE, "readwrite");
    transaction.objectStore(TARGET_STORE).delete(LOCAL_FOLDER_TARGET_ID);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本地文件夹目标断开失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地文件夹目标断开中止"));
  });
}

export async function writeWorkspaceBackupToLocalFolder(
  input: LocalFolderWorkspaceExportInput,
): Promise<LocalFolderWorkspaceExportResult> {
  const record = await readLocalFolderTargetRecord();
  if (!record) throw new Error("请先选择本地文件夹");
  await ensureDirectoryWritePermission(record.directoryHandle);
  await writeBlobFile(record.directoryHandle, input.fileName, input.blob);
  const manifest = buildLocalFolderWorkspaceManifest(input);
  await writeTextFile(record.directoryHandle, LOCAL_FOLDER_MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  await saveLocalFolderTargetRecord({
    ...record,
    lastExportedAt: input.exportedAt,
    lastExportFileName: input.fileName,
  });
  return {
    assetCount: input.assetCount,
    boardCount: input.boardCount,
    directoryName: record.directoryName,
    fileName: input.fileName,
    manifestFileName: LOCAL_FOLDER_MANIFEST_FILE,
    settingsKeyCount: input.settingsKeyCount,
  };
}

export function buildLocalFolderWorkspaceManifest(input: LocalFolderWorkspaceExportInput): LocalFolderWorkspaceManifest {
  return {
    app: "Imagine Workbench",
    assetCount: input.assetCount,
    backupFileName: input.fileName,
    boardCount: input.boardCount,
    exportedAt: input.exportedAt,
    includeCredentials: input.includeCredentials,
    kind: "local-folder",
    schemaVersion: 1,
    settingsKeyCount: input.settingsKeyCount,
  };
}

async function ensureDirectoryWritePermission(directoryHandle: LocalDirectoryHandle): Promise<void> {
  const descriptor = { mode: "readwrite" } satisfies LocalDirectoryPermissionDescriptor;
  const existingPermission = directoryHandle.queryPermission ? await directoryHandle.queryPermission(descriptor) : "granted";
  if (existingPermission === "granted") return;
  const nextPermission = directoryHandle.requestPermission ? await directoryHandle.requestPermission(descriptor) : existingPermission;
  if (nextPermission !== "granted") throw new Error("未获得本地文件夹写入权限");
}

async function writeBlobFile(directoryHandle: LocalDirectoryHandle, fileName: string, blob: Blob): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function writeTextFile(directoryHandle: LocalDirectoryHandle, fileName: string, text: string): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function readLocalFolderTargetRecord(): Promise<LocalFolderTargetRecord | null> {
  const db = await openLocalTargetDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TARGET_STORE, "readonly");
    const request = transaction.objectStore(TARGET_STORE).get(LOCAL_FOLDER_TARGET_ID);
    request.onsuccess = () => resolve((request.result as LocalFolderTargetRecord | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("本地文件夹目标读取失败"));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error("本地文件夹目标读取事务失败"));
  });
}

async function saveLocalFolderTargetRecord(record: LocalFolderTargetRecord): Promise<void> {
  const db = await openLocalTargetDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(TARGET_STORE, "readwrite");
    transaction.objectStore(TARGET_STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本地文件夹目标保存失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地文件夹目标保存中止"));
  });
}

function openLocalTargetDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("本地文件夹目标仅在浏览器中可用"));
      return;
    }
    const request = indexedDB.open(TARGET_DB_NAME, TARGET_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TARGET_STORE)) {
        db.createObjectStore(TARGET_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本地文件夹目标数据库打开失败"));
  });
}
