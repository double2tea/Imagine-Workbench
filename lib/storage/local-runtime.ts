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
import {
  getLocalWorkspacePathPlan,
  resolveLocalWorkspacePaths,
  type LocalWorkspacePathPlan,
  type LocalWorkspacePaths,
} from "./local-paths";

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

export interface LocalStorageRuntimeStatus {
  cleanupPolicy: LocalWorkspaceCleanupPolicy;
  enabled: boolean;
  mode: WorkspaceStorageMode;
  paths?: LocalWorkspacePaths;
  reason: LocalStorageDisabledReason | LocalStorageEnabledReason;
  syncPolicy: LocalWorkspaceSyncPolicy;
  targetKind: "indexeddb" | "local-database";
}

export interface PublicLocalWorkspacePathPlan extends LocalWorkspacePathPlan {
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

export function resolveLocalStorageRuntimeStatus(
  env: LocalStorageEnvironment,
  options: { homeDir?: string } = {},
): LocalStorageRuntimeStatus {
  const mode = parseWorkspaceStorageMode(env.IMAGINE_STORAGE_TARGET);
  const targetKind = storageModeToTargetKind(mode);
  if (mode === "browser") {
    return {
      cleanupPolicy: LOCAL_WORKSPACE_CLEANUP_POLICY,
      enabled: false,
      mode,
      reason: "browser-storage-selected",
      syncPolicy: LOCAL_WORKSPACE_SYNC_POLICY,
      targetKind,
    };
  }
  if (isHostedDeploymentEnvironment(env)) {
    return {
      cleanupPolicy: LOCAL_WORKSPACE_CLEANUP_POLICY,
      enabled: false,
      mode,
      reason: "hosted-deployment",
      syncPolicy: LOCAL_WORKSPACE_SYNC_POLICY,
      targetKind,
    };
  }
  return {
    cleanupPolicy: LOCAL_WORKSPACE_CLEANUP_POLICY,
    enabled: true,
    mode,
    paths: resolveLocalWorkspacePaths({
      homeDir: options.homeDir,
      workspaceDir: env[IMAGINE_LOCAL_WORKSPACE_DIR_ENV],
    }),
    reason: "local-database-selected",
    syncPolicy: LOCAL_WORKSPACE_SYNC_POLICY,
    targetKind,
  };
}

export function toPublicLocalStorageRuntimeStatus(
  status: LocalStorageRuntimeStatus,
  env: LocalStorageEnvironment = {},
): PublicLocalStorageRuntimeStatus {
  const pathPlan: PublicLocalWorkspacePathPlan | undefined =
    status.mode === "local-database"
      ? {
          ...getLocalWorkspacePathPlan(),
          workspaceRootConfigured: Boolean(env[IMAGINE_LOCAL_WORKSPACE_DIR_ENV]?.trim()),
        }
      : undefined;

  return {
    cleanupPolicy: status.cleanupPolicy,
    enabled: status.enabled,
    mode: status.mode,
    pathPlan,
    reason: status.reason,
    syncPolicy: status.syncPolicy,
    targetKind: status.targetKind,
  };
}

export function resolvePublicLocalStorageRuntimeStatus(
  env: LocalStorageEnvironment,
): PublicLocalStorageRuntimeStatus {
  return toPublicLocalStorageRuntimeStatus(resolveLocalStorageRuntimeStatus(env), env);
}
