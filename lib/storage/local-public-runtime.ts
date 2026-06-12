import { LOCAL_DATABASE_STORAGE_ADAPTER } from "../local-storage-targets";
import {
  IMAGINE_LOCAL_WORKSPACE_DIR_ENV,
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
  assetDirectoryName: string;
  databaseFileName: string;
  exportDirectoryName: string;
  previewDirectoryName: string;
  trashDirectoryName: string;
  workspaceRootConfigured: boolean;
}

export interface PublicLocalStorageRuntimeStatus {
  cleanupPolicy: LocalWorkspaceCleanupPolicy;
  enabled: boolean;
  mode: WorkspaceStorageMode;
  pathPlan?: PublicLocalWorkspacePathPlan;
  reason: LocalStorageDisabledReason | LocalStorageEnabledReason;
  syncPolicy: LocalWorkspaceSyncPolicy;
  targetKind: "indexeddb" | "local-database";
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
  const localDatabase = LOCAL_DATABASE_STORAGE_ADAPTER.localDatabase;
  if (!localDatabase) throw new Error("Local database storage adapter is missing local database config");
  return {
    assetDirectoryName: localDatabase.assetDirectoryName,
    databaseFileName: localDatabase.databaseFileName,
    exportDirectoryName: "exports",
    previewDirectoryName: localDatabase.previewDirectoryName,
    trashDirectoryName: "trash",
    workspaceRootConfigured: Boolean(env[IMAGINE_LOCAL_WORKSPACE_DIR_ENV]?.trim()),
  };
}

export function resolvePublicLocalStorageRuntimeStatus(
  env: LocalStorageEnvironment,
): PublicLocalStorageRuntimeStatus {
  const mode = parseWorkspaceStorageMode(env.IMAGINE_STORAGE_TARGET);
  const hosted = isHostedDeploymentEnvironment(env);
  const enabled = mode === "local-database" && !hosted;
  const reason =
    mode === "browser"
      ? "browser-storage-selected"
      : hosted
        ? "hosted-deployment"
        : "local-database-selected";

  return {
    cleanupPolicy: LOCAL_WORKSPACE_CLEANUP_POLICY,
    enabled,
    mode,
    pathPlan: mode === "local-database" ? getPublicLocalWorkspacePathPlan(env) : undefined,
    reason,
    syncPolicy: LOCAL_WORKSPACE_SYNC_POLICY,
    targetKind: storageModeToTargetKind(mode),
  };
}
