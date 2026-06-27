export type WorkspaceStorageTargetKind = "indexeddb" | "postgres";
export type WorkspaceStorageTargetStatus = "active" | "planned";
export type WorkspaceTeamDatabaseEngine = "postgres";

export interface WorkspacePostgresStorageConfig {
  connectionTimeoutMillisEnv: "IMAGINE_POSTGRES_CONNECTION_TIMEOUT_MS";
  engine: WorkspaceTeamDatabaseEngine;
  idleTimeoutMillisEnv: "IMAGINE_POSTGRES_IDLE_TIMEOUT_MS";
  maxMediaPayloadBytesEnv: "IMAGINE_MAX_MEDIA_PAYLOAD_BYTES";
  mediaDirectoryEnv: "IMAGINE_MEDIA_DIR";
  previewDirectoryName: string;
  payloadDirectoryName: string;
  poolMaxEnv: "IMAGINE_POSTGRES_POOL_MAX";
  queryTimeoutMillisEnv: "IMAGINE_POSTGRES_QUERY_TIMEOUT_MS";
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
    connectionTimeoutMillisEnv: "IMAGINE_POSTGRES_CONNECTION_TIMEOUT_MS",
    engine: "postgres",
    idleTimeoutMillisEnv: "IMAGINE_POSTGRES_IDLE_TIMEOUT_MS",
    maxMediaPayloadBytesEnv: "IMAGINE_MAX_MEDIA_PAYLOAD_BYTES",
    mediaDirectoryEnv: "IMAGINE_MEDIA_DIR",
    previewDirectoryName: "previews",
    payloadDirectoryName: "originals",
    poolMaxEnv: "IMAGINE_POSTGRES_POOL_MAX",
    queryTimeoutMillisEnv: "IMAGINE_POSTGRES_QUERY_TIMEOUT_MS",
    requiredDatabaseUrlEnv: "DATABASE_URL",
  },
  status: "active",
};

export const WORKSPACE_STORAGE_ADAPTERS = [
  INDEXED_DB_STORAGE_ADAPTER,
  POSTGRES_STORAGE_ADAPTER,
] as const;

export function listWorkspaceStorageAdapters(): readonly WorkspaceStorageAdapterContract[] {
  return WORKSPACE_STORAGE_ADAPTERS;
}
