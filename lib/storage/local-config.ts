export const IMAGINE_STORAGE_TARGET_ENV = "IMAGINE_STORAGE_TARGET";
export const DATABASE_URL_ENV = "DATABASE_URL";
export const IMAGINE_MEDIA_DIR_ENV = "IMAGINE_MEDIA_DIR";

export type WorkspaceStorageMode = "browser" | "postgres";
export type WorkspaceRuntimeStorageTargetKind = "indexeddb" | "postgres";
export type LocalStorageDisabledReason = "browser-storage-selected";
export type LocalStorageEnabledReason = "postgres-selected";

export interface LocalStorageEnvironment {
  [key: string]: string | undefined;
  CF_PAGES?: string;
  DATABASE_URL?: string;
  IMAGINE_MEDIA_DIR?: string;
  IMAGINE_STORAGE_TARGET?: string;
  NETLIFY?: string;
  NEXT_RUNTIME?: string;
  VERCEL?: string;
}

export function parseWorkspaceStorageMode(value: string | undefined): WorkspaceStorageMode {
  const mode = value?.trim();
  if (mode === undefined || mode === "") return "browser";
  if (mode === "browser" || mode === "postgres") return mode;
  throw new Error(`${IMAGINE_STORAGE_TARGET_ENV} must be "browser" or "postgres"`);
}

export function isHostedDeploymentEnvironment(env: LocalStorageEnvironment): boolean {
  return env.VERCEL === "1" || env.CF_PAGES === "1" || env.NETLIFY === "true" || env.NEXT_RUNTIME === "edge";
}

export function storageModeToTargetKind(mode: WorkspaceStorageMode): WorkspaceRuntimeStorageTargetKind {
  if (mode === "browser") return "indexeddb";
  return "postgres";
}
