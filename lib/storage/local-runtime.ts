import {
  DATABASE_URL_ENV,
  IMAGINE_MEDIA_DIR_ENV,
  IMAGINE_STORAGE_TARGET_ENV,
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

export interface LocalStorageRuntimeStatus {
  cleanupPolicy: LocalWorkspaceCleanupPolicy;
  enabled: boolean;
  mode: WorkspaceStorageMode;
  paths?: { mediaDir: string };
  reason: LocalStorageDisabledReason | LocalStorageEnabledReason;
  syncPolicy: LocalWorkspaceSyncPolicy;
  targetKind: "indexeddb" | "postgres";
}

export function resolveLocalStorageRuntimeStatus(
  env: LocalStorageEnvironment,
  _options: { homeDir?: string } = {},
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
    throw new Error("PostgreSQL storage requires a Node server deployment; hosted edge/static deployments are not supported");
  }
  if (!env[DATABASE_URL_ENV]?.trim()) throw new Error(`${DATABASE_URL_ENV} is required when ${IMAGINE_STORAGE_TARGET_ENV}=postgres`);
  if (!env[IMAGINE_MEDIA_DIR_ENV]?.trim()) throw new Error(`${IMAGINE_MEDIA_DIR_ENV} is required when ${IMAGINE_STORAGE_TARGET_ENV}=postgres`);
  return {
    cleanupPolicy: LOCAL_WORKSPACE_CLEANUP_POLICY,
    enabled: true,
    mode,
    paths: { mediaDir: env[IMAGINE_MEDIA_DIR_ENV] },
    reason: "postgres-selected",
    syncPolicy: LOCAL_WORKSPACE_SYNC_POLICY,
    targetKind,
  };
}

export function toPublicLocalStorageRuntimeStatus(
  status: LocalStorageRuntimeStatus,
  env: LocalStorageEnvironment = {},
): PublicLocalStorageRuntimeStatus {
  const pathPlan: PublicLocalWorkspacePathPlan | undefined =
    status.mode === "postgres" ? getPublicLocalWorkspacePathPlan(env) : undefined;

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
