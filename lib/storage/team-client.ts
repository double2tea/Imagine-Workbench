import { API_ROUTES } from "@/lib/api/routes";
import { readFetchError } from "@/lib/client-fetch-error";
import type { PublicLocalStorageRuntimeStatus } from "@/lib/storage/local-public-runtime";
import type { WORKSPACE_STORAGE_SCHEMA_VERSION } from "@/lib/storage/schema";

export interface TeamStorageMigrationStatus {
  appliedMigrationIds: string[];
  currentSchemaVersion: number | null;
  pendingMigrationIds: string[];
  requiredSchemaVersion: typeof WORKSPACE_STORAGE_SCHEMA_VERSION;
  schemaTableExists: boolean;
  unsupportedNewerSchema: boolean;
}

export interface TeamStorageHealth {
  appVersion?: string;
  databaseConfigured?: boolean;
  error?: string;
  mediaDirectoryConfigured?: boolean;
  migrationStatus?: TeamStorageMigrationStatus;
  mode: "postgres";
  reachable: boolean;
  targetKind: "postgres";
}

export interface TeamStorageMigrationResult {
  appVersion: string;
  migrationStatus: TeamStorageMigrationStatus;
  mode: "postgres";
  targetKind: "postgres";
}

export interface TeamSessionContext {
  email: string;
  expiresAt?: string;
  role: "owner" | "admin" | "editor" | "viewer";
  sessionId?: string;
  teamId: string;
  userId: string;
  workspaceId: string;
}

type Fetcher = typeof fetch;

export function teamAssetMediaUrl(assetId: string, options: { download?: boolean } = {}): string {
  return API_ROUTES.storage.teamAssetMedia(assetId, options);
}

export async function fetchWorkspaceStorageRuntimeStatus(fetcher: Fetcher = fetch): Promise<PublicLocalStorageRuntimeStatus> {
  const response = await fetcher(API_ROUTES.storage.localStatus, { cache: "no-store" });
  if (!response.ok) throw new Error(await readFetchError(response, "Storage status failed"));
  return parseStorageRuntimeStatus(await response.json());
}

export async function fetchTeamStorageHealth(fetcher: Fetcher = fetch): Promise<TeamStorageHealth> {
  const response = await fetcher(API_ROUTES.storage.teamHealth, { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "PostgreSQL health check failed";
    throw new Error(error);
  }
  return parseTeamStorageHealth(body);
}

export async function fetchTeamSession(fetcher: Fetcher = fetch): Promise<TeamSessionContext> {
  const response = await fetcher(API_ROUTES.storage.teamSession, { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team session lookup failed";
    throw new Error(error);
  }
  return parseTeamSessionContext(body);
}

export async function loginTeamSession(
  input: { email: string; password: string },
  fetcher: Fetcher = fetch,
): Promise<TeamSessionContext> {
  const response = await fetcher(API_ROUTES.storage.teamSession, {
    cache: "no-store",
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team session login failed";
    throw new Error(error);
  }
  return parseTeamSessionContext(body);
}

export async function logoutTeamSession(csrfToken: string, fetcher: Fetcher = fetch): Promise<void> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamSession, {
    cache: "no-store",
    headers: { "x-imagine-csrf-token": token },
    method: "DELETE",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team session logout failed";
    throw new Error(error);
  }
}

export async function runTeamStorageMigrations(
  setupToken: string,
  fetcher: Fetcher = fetch,
): Promise<TeamStorageMigrationResult> {
  const token = setupToken.trim();
  if (!token) throw new Error("Setup token is required");

  const response = await fetcher(API_ROUTES.storage.teamMigrations, {
    cache: "no-store",
    headers: { "x-imagine-setup-token": token },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "PostgreSQL migration failed";
    throw new Error(error);
  }
  return parseTeamStorageMigrationResult(body);
}

function parseStorageRuntimeStatus(value: unknown): PublicLocalStorageRuntimeStatus {
  if (!isPublicLocalStorageRuntimeStatus(value)) throw new Error("Storage status response is invalid");
  return value;
}

function parseTeamStorageHealth(value: unknown): TeamStorageHealth {
  if (!isRecord(value)) throw new Error("PostgreSQL health response is invalid");
  if (value.mode !== "postgres" || value.targetKind !== "postgres") throw new Error("PostgreSQL health target is invalid");
  if (typeof value.reachable !== "boolean") throw new Error("PostgreSQL health reachability is invalid");
  return value as unknown as TeamStorageHealth;
}

function parseTeamStorageMigrationResult(value: unknown): TeamStorageMigrationResult {
  if (!isRecord(value)) throw new Error("PostgreSQL migration response is invalid");
  if (value.mode !== "postgres" || value.targetKind !== "postgres") throw new Error("PostgreSQL migration target is invalid");
  if (!isRecord(value.migrationStatus)) throw new Error("PostgreSQL migration status is invalid");
  return value as unknown as TeamStorageMigrationResult;
}

function parseTeamSessionContext(value: unknown): TeamSessionContext {
  if (!isRecord(value)) throw new Error("Team session response is invalid");
  if (typeof value.email !== "string") throw new Error("Team session email is invalid");
  if (value.role !== "owner" && value.role !== "admin" && value.role !== "editor" && value.role !== "viewer") {
    throw new Error("Team session role is invalid");
  }
  if (typeof value.teamId !== "string" || typeof value.userId !== "string" || typeof value.workspaceId !== "string") {
    throw new Error("Team session ids are invalid");
  }
  return value as unknown as TeamSessionContext;
}

function readStringField(value: unknown, field: string): string | null {
  if (!isRecord(value)) return null;
  const fieldValue = value[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPublicLocalStorageRuntimeStatus(value: unknown): value is PublicLocalStorageRuntimeStatus {
  if (!isRecord(value)) return false;
  const mode = value.mode;
  const targetKind = value.targetKind;
  const reason = value.reason;
  return (
    (mode === "browser" || mode === "postgres") &&
    (targetKind === "indexeddb" || targetKind === "postgres") &&
    (reason === "browser-storage-selected" || reason === "postgres-selected") &&
    typeof value.enabled === "boolean" &&
    isRecord(value.cleanupPolicy) &&
    isRecord(value.syncPolicy)
  );
}
