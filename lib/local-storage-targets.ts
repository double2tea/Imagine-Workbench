export type WorkspaceStorageTargetKind = "indexeddb" | "postgres";
export type WorkspaceStorageTargetStatus = "active" | "planned";
export type WorkspaceTeamDatabaseEngine = "postgres";

export interface WorkspacePostgresStorageConfig {
  engine: WorkspaceTeamDatabaseEngine;
  maxMediaPayloadBytesEnv: "IMAGINE_MAX_MEDIA_PAYLOAD_BYTES";
  mediaDirectoryEnv: "IMAGINE_MEDIA_DIR";
  previewDirectoryName: string;
  payloadDirectoryName: string;
  requiredDatabaseUrlEnv: "DATABASE_URL";
}

export interface WorkspaceStorageCapabilities {
  canReadWorkspace: boolean;
  canWriteWorkspace: boolean;
  supportsRealtimeSync: boolean;
  userVisiblePath: boolean;
}

export interface WorkspaceStorageAdapterContract {
  capabilities: WorkspaceStorageCapabilities;
  kind: WorkspaceStorageTargetKind;
  label: string;
  postgres?: WorkspacePostgresStorageConfig;
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

export const POSTGRES_STORAGE_ADAPTER: WorkspaceStorageAdapterContract = {
  capabilities: {
    canReadWorkspace: true,
    canWriteWorkspace: true,
    supportsRealtimeSync: true,
    userVisiblePath: true,
  },
  kind: "postgres",
  label: "PostgreSQL 团队工作区",
  postgres: {
    engine: "postgres",
    maxMediaPayloadBytesEnv: "IMAGINE_MAX_MEDIA_PAYLOAD_BYTES",
    mediaDirectoryEnv: "IMAGINE_MEDIA_DIR",
    previewDirectoryName: "previews",
    payloadDirectoryName: "originals",
    requiredDatabaseUrlEnv: "DATABASE_URL",
  },
  status: "planned",
};

export const WORKSPACE_STORAGE_ADAPTERS = [
  INDEXED_DB_STORAGE_ADAPTER,
  POSTGRES_STORAGE_ADAPTER,
] as const;

export function listWorkspaceStorageAdapters(): readonly WorkspaceStorageAdapterContract[] {
  return WORKSPACE_STORAGE_ADAPTERS;
}
