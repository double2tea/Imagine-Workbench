export type WorkspaceStorageTargetKind = "indexeddb" | "local-folder" | "local-database" | "remote-api";
export type WorkspaceStorageTargetStatus = "active" | "planned";
export type WorkspaceLocalDatabaseEngine = "sqlite";

export interface WorkspaceLocalDatabaseConfig {
  assetDirectoryName: string;
  databaseFileName: string;
  engine: WorkspaceLocalDatabaseEngine;
  previewDirectoryName: string;
}

export interface WorkspaceStorageCapabilities {
  canReadWorkspace: boolean;
  canWriteWorkspace: boolean;
  supportsRealtimeSync: boolean;
  userVisiblePath: boolean;
}

export interface WorkspaceStorageAdapterContract {
  capabilities: WorkspaceStorageCapabilities;
  localDatabase?: WorkspaceLocalDatabaseConfig;
  kind: WorkspaceStorageTargetKind;
  label: string;
  status: WorkspaceStorageTargetStatus;
}

export const INDEXED_DB_STORAGE_ADAPTER: WorkspaceStorageAdapterContract = {
  capabilities: {
    canReadWorkspace: true,
    canWriteWorkspace: true,
    supportsRealtimeSync: true,
    userVisiblePath: false,
  },
  kind: "indexeddb",
  label: "浏览器本地 IndexedDB",
  status: "active",
};

export const LOCAL_FOLDER_STORAGE_ADAPTER: WorkspaceStorageAdapterContract = {
  capabilities: {
    canReadWorkspace: true,
    canWriteWorkspace: true,
    supportsRealtimeSync: true,
    userVisiblePath: true,
  },
  kind: "local-folder",
  label: "本地工作区文件夹",
  status: "planned",
};

export const LOCAL_DATABASE_STORAGE_ADAPTER: WorkspaceStorageAdapterContract = {
  capabilities: {
    canReadWorkspace: true,
    canWriteWorkspace: true,
    supportsRealtimeSync: true,
    userVisiblePath: true,
  },
  kind: "local-database",
  label: "本地 SQLite 数据库",
  localDatabase: {
    assetDirectoryName: "assets",
    databaseFileName: "imagine-workbench.sqlite",
    engine: "sqlite",
    previewDirectoryName: "previews",
  },
  status: "planned",
};

export const REMOTE_API_STORAGE_ADAPTER: WorkspaceStorageAdapterContract = {
  capabilities: {
    canReadWorkspace: true,
    canWriteWorkspace: true,
    supportsRealtimeSync: true,
    userVisiblePath: false,
  },
  kind: "remote-api",
  label: "远程数据库 API",
  status: "planned",
};

export const WORKSPACE_STORAGE_ADAPTERS = [
  INDEXED_DB_STORAGE_ADAPTER,
  LOCAL_FOLDER_STORAGE_ADAPTER,
  LOCAL_DATABASE_STORAGE_ADAPTER,
  REMOTE_API_STORAGE_ADAPTER,
] as const;

export function listWorkspaceStorageAdapters(): readonly WorkspaceStorageAdapterContract[] {
  return WORKSPACE_STORAGE_ADAPTERS;
}
