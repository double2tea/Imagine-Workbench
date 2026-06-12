export const IMAGINE_STORAGE_TARGET_ENV = "IMAGINE_STORAGE_TARGET";
export const IMAGINE_LOCAL_WORKSPACE_DIR_ENV = "IMAGINE_LOCAL_WORKSPACE_DIR";

export type WorkspaceStorageMode = "browser" | "local-database";
export type WorkspaceRuntimeStorageTargetKind = "indexeddb" | "local-database";
export type LocalStorageDisabledReason = "browser-storage-selected" | "hosted-deployment";
export type LocalStorageEnabledReason = "local-database-selected";

export interface LocalStorageEnvironment {
  [key: string]: string | undefined;
  CF_PAGES?: string;
  IMAGINE_LOCAL_WORKSPACE_DIR?: string;
  IMAGINE_STORAGE_TARGET?: string;
  NETLIFY?: string;
  NEXT_RUNTIME?: string;
  VERCEL?: string;
}

export function parseWorkspaceStorageMode(value: string | undefined): WorkspaceStorageMode {
  const mode = value?.trim();
  if (mode === undefined || mode === "") return "browser";
  if (mode === "browser" || mode === "local-database") return mode;
  throw new Error(`${IMAGINE_STORAGE_TARGET_ENV} must be "browser" or "local-database"`);
}

export function isHostedDeploymentEnvironment(env: LocalStorageEnvironment): boolean {
  return env.VERCEL === "1" || env.CF_PAGES === "1" || env.NETLIFY === "true" || env.NEXT_RUNTIME === "edge";
}

export function storageModeToTargetKind(mode: WorkspaceStorageMode): WorkspaceRuntimeStorageTargetKind {
  if (mode === "browser") return "indexeddb";
  return "local-database";
}
