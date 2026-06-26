import { POSTGRES_STORAGE_ADAPTER } from "../local-storage-targets";
import {
  DATABASE_URL_ENV,
  IMAGINE_MEDIA_DIR_ENV,
  isHostedDeploymentEnvironment,
  parseWorkspaceStorageMode,
  storageModeToTargetKind,
  type LocalStorageDisabledReason,
  type LocalStorageEnabledReason,
  type LocalStorageEnvironment,
  type WorkspaceStorageMode,
} from "./local-config";

export interface LocalWorkspaceCleanupPolicy {
  automaticStartupCleanup: false;
  deleteAssetMovesToTrash: true;
  explicitCleanupTargets: readonly ["orphan-assets", "stale-previews", "expired-trash"];
  retainedSafetySnapshots: 1;
}

export interface LocalWorkspaceSyncPolicy {
  bidirectionalSync: false;
  migrationDirection: "explicit-import-export";
  mode: "single-active-store";
}

export interface PublicLocalWorkspacePathPlan {
  databaseUrlConfigured: boolean;
  exportDirectoryName: string;
  mediaDirectoryConfigured: boolean;
  payloadDirectoryName: string;
  previewDirectoryName: string;
  trashDirectoryName: string;
}

export interface PublicLocalStorageRuntimeStatus {
  cleanupPolicy: LocalWorkspaceCleanupPolicy;
  enabled: boolean;
  mode: WorkspaceStorageMode;
  pathPlan?: PublicLocalWorkspacePathPlan;
  reason: LocalStorageDisabledReason | LocalStorageEnabledReason;
  syncPolicy: LocalWorkspaceSyncPolicy;
  targetKind: "indexeddb" | "postgres";
}

export const LOCAL_WORKSPACE_CLEANUP_POLICY: LocalWorkspaceCleanupPolicy = {
  automaticStartupCleanup: false,
  deleteAssetMovesToTrash: true,
  explicitCleanupTargets: ["orphan-assets", "stale-previews", "expired-trash"],
  retainedSafetySnapshots: 1,
};

export const LOCAL_WORKSPACE_SYNC_POLICY: LocalWorkspaceSyncPolicy = {
  bidirectionalSync: false,
  migrationDirection: "explicit-import-export",
  mode: "single-active-store",
};

export function getPublicLocalWorkspacePathPlan(
  env: LocalStorageEnvironment = {},
): PublicLocalWorkspacePathPlan {
  const postgres = POSTGRES_STORAGE_ADAPTER.postgres;
  if (!postgres) throw new Error("PostgreSQL storage adapter is missing PostgreSQL config");
  return {
    databaseUrlConfigured: Boolean(env[DATABASE_URL_ENV]?.trim()),
    exportDirectoryName: "exports",
    mediaDirectoryConfigured: Boolean(env[IMAGINE_MEDIA_DIR_ENV]?.trim()),
    payloadDirectoryName: postgres.payloadDirectoryName,
    previewDirectoryName: postgres.previewDirectoryName,
    trashDirectoryName: "trash",
  };
}

export function resolvePublicLocalStorageRuntimeStatus(
  env: LocalStorageEnvironment,
): PublicLocalStorageRuntimeStatus {
  const mode = parseWorkspaceStorageMode(env.IMAGINE_STORAGE_TARGET);
  const hosted = isHostedDeploymentEnvironment(env);
  if (mode === "postgres" && hosted) {
    throw new Error("PostgreSQL storage requires a Node server deployment; hosted edge/static deployments are not supported");
  }
  const enabled = mode === "postgres";
  const reason =
    mode === "browser"
      ? "browser-storage-selected"
      : "postgres-selected";

  return {
    cleanupPolicy: LOCAL_WORKSPACE_CLEANUP_POLICY,
    enabled,
    mode,
    pathPlan: mode === "postgres" ? getPublicLocalWorkspacePathPlan(env) : undefined,
    reason,
    syncPolicy: LOCAL_WORKSPACE_SYNC_POLICY,
    targetKind: storageModeToTargetKind(mode),
  };
}
