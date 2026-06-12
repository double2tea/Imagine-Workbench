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
  getPublicLocalWorkspacePathPlan,
  LOCAL_WORKSPACE_CLEANUP_POLICY,
  LOCAL_WORKSPACE_SYNC_POLICY,
  resolvePublicLocalStorageRuntimeStatus,
  type LocalWorkspaceCleanupPolicy,
  type LocalWorkspaceSyncPolicy,
  type PublicLocalStorageRuntimeStatus,
  type PublicLocalWorkspacePathPlan,
} from "./local-public-runtime";
import {
  resolveLocalWorkspacePaths,
  type LocalWorkspacePaths,
} from "./local-paths";

export interface LocalStorageRuntimeStatus {
  cleanupPolicy: LocalWorkspaceCleanupPolicy;
  enabled: boolean;
  mode: WorkspaceStorageMode;
  paths?: LocalWorkspacePaths;
  reason: LocalStorageDisabledReason | LocalStorageEnabledReason;
  syncPolicy: LocalWorkspaceSyncPolicy;
  targetKind: "indexeddb" | "local-database";
}

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
    status.mode === "local-database" ? getPublicLocalWorkspacePathPlan(env) : undefined;

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

export {
  LOCAL_WORKSPACE_CLEANUP_POLICY,
  LOCAL_WORKSPACE_SYNC_POLICY,
  resolvePublicLocalStorageRuntimeStatus,
  type LocalWorkspaceCleanupPolicy,
  type LocalWorkspaceSyncPolicy,
  type PublicLocalStorageRuntimeStatus,
  type PublicLocalWorkspacePathPlan,
};
