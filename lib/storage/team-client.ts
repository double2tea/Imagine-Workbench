import { API_ROUTES } from "@/lib/api/routes";
import type { BoardDocument, BoardSummary } from "@/lib/board/types";
import { readFetchError } from "@/lib/client-fetch-error";
import type { StorageItemMeta } from "@/lib/db";
import type { PublicLocalStorageRuntimeStatus } from "@/lib/storage/local-public-runtime";
import type { WORKSPACE_STORAGE_SCHEMA_VERSION } from "@/lib/storage/schema";
import type { PublicTeamAssetPayload, PublicTeamAssetRecord, TeamAssetListResult } from "@/lib/storage/team-asset-types";
import type { TeamBoardDocumentResult, TeamBoardSummaryListResult } from "@/lib/storage/team-board-types";

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

export interface TeamBootstrapOwnerInput {
  email: string;
  password: string;
  setupToken: string;
}

export interface TeamAssetListOptions {
  boardId?: string;
  ids?: string[];
  limit?: number;
  offset?: number;
  statuses?: StorageItemMeta["status"][];
}

export interface TeamBoardSummaryListOptions {
  ids?: string[];
  limit?: number;
  offset?: number;
}

type Fetcher = typeof fetch;

export function teamAssetMediaUrl(assetId: string, options: { download?: boolean } = {}): string {
  return API_ROUTES.storage.teamAssetMedia(assetId, options);
}

export function readTeamCsrfToken(cookieHeader = typeof document === "undefined" ? "" : document.cookie): string | null {
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.split("=");
    if (rawKey?.trim() === "imagine_team_csrf") {
      const value = decodeURIComponent(rawValue.join("=").trim());
      return value || null;
    }
  }
  return null;
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

export async function fetchTeamAssets(
  options: TeamAssetListOptions = {},
  fetcher: Fetcher = fetch,
): Promise<TeamAssetListResult> {
  const response = await fetcher(teamAssetsUrl(options), { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team asset list failed";
    throw new Error(error);
  }
  return parseTeamAssetListResult(body);
}

export async function fetchTeamBoardSummaries(
  options: TeamBoardSummaryListOptions = {},
  fetcher: Fetcher = fetch,
): Promise<TeamBoardSummaryListResult> {
  const response = await fetcher(teamBoardsUrl(options), { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team board list failed";
    throw new Error(error);
  }
  return parseTeamBoardSummaryListResult(body);
}

export async function fetchTeamBoardDocument(
  boardId: string,
  fetcher: Fetcher = fetch,
): Promise<TeamBoardDocumentResult> {
  const response = await fetcher(API_ROUTES.storage.teamBoard(boardId), { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team board read failed";
    throw new Error(error);
  }
  return parseTeamBoardDocumentResult(body);
}

export async function saveTeamBoardDocument(
  board: BoardDocument,
  version: number,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<TeamBoardDocumentResult> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamBoard(board.id), {
    cache: "no-store",
    body: JSON.stringify(board),
    headers: {
      "content-type": "application/json",
      "if-match": String(version),
      "x-imagine-csrf-token": token,
    },
    method: "PUT",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team board save failed";
    throw new Error(error);
  }
  return parseTeamBoardDocumentResult(body);
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

export async function bootstrapTeamOwner(
  input: TeamBootstrapOwnerInput,
  fetcher: Fetcher = fetch,
): Promise<TeamSessionContext> {
  const setupToken = input.setupToken.trim();
  if (!setupToken) throw new Error("Setup token is required");
  const response = await fetcher(API_ROUTES.storage.teamBootstrap, {
    cache: "no-store",
    body: JSON.stringify({ email: input.email, password: input.password }),
    headers: {
      "content-type": "application/json",
      "x-imagine-setup-token": setupToken,
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team bootstrap failed";
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

function parseTeamAssetListResult(value: unknown): TeamAssetListResult {
  if (!isTeamAssetListResult(value)) throw new Error("Team asset list response is invalid");
  return value;
}

function parseTeamBoardSummaryListResult(value: unknown): TeamBoardSummaryListResult {
  if (!isTeamBoardSummaryListResult(value)) throw new Error("Team board list response is invalid");
  return value;
}

function parseTeamBoardDocumentResult(value: unknown): TeamBoardDocumentResult {
  if (!isTeamBoardDocumentResult(value)) throw new Error("Team board response is invalid");
  return value;
}

function teamAssetsUrl(options: TeamAssetListOptions): string {
  const searchParams = new URLSearchParams();
  if (options.boardId) searchParams.set("boardId", options.boardId);
  for (const id of options.ids ?? []) searchParams.append("id", id);
  if (options.limit !== undefined) searchParams.set("limit", String(options.limit));
  if (options.offset !== undefined) searchParams.set("offset", String(options.offset));
  for (const status of options.statuses ?? []) searchParams.append("status", status);
  const query = searchParams.toString();
  return query ? `${API_ROUTES.storage.teamAssets}?${query}` : API_ROUTES.storage.teamAssets;
}

function teamBoardsUrl(options: TeamBoardSummaryListOptions): string {
  const searchParams = new URLSearchParams();
  for (const id of options.ids ?? []) searchParams.append("id", id);
  if (options.limit !== undefined) searchParams.set("limit", String(options.limit));
  if (options.offset !== undefined) searchParams.set("offset", String(options.offset));
  const query = searchParams.toString();
  return query ? `${API_ROUTES.storage.teamBoards}?${query}` : API_ROUTES.storage.teamBoards;
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

function isTeamAssetListResult(value: unknown): value is TeamAssetListResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    Number.isInteger(value.limit) &&
    Number.isInteger(value.offset) &&
    Array.isArray(value.assets) &&
    value.assets.every(isPublicTeamAssetRecord)
  );
}

function isTeamBoardSummaryListResult(value: unknown): value is TeamBoardSummaryListResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    Number.isInteger(value.limit) &&
    Number.isInteger(value.offset) &&
    Array.isArray(value.boards) &&
    value.boards.every(isBoardSummary)
  );
}

function isTeamBoardDocumentResult(value: unknown): value is TeamBoardDocumentResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    Number.isInteger(value.version) &&
    isBoardDocument(value.board) &&
    isBoardSummary(value.summary)
  );
}

function isPublicTeamAssetRecord(value: unknown): value is PublicTeamAssetRecord {
  if (!isRecord(value)) return false;
  const payload = value.payload;
  const preview = value.preview;
  return (
    isStorageItemMeta(value.meta) &&
    optionalString(value.mediaUrl) &&
    optionalString(value.downloadUrl) &&
    (payload === undefined || isPublicTeamAssetPayload(payload)) &&
    (preview === undefined || isPublicTeamAssetPayload(preview))
  );
}

function isPublicTeamAssetPayload(value: unknown): value is PublicTeamAssetPayload {
  if (!isRecord(value)) return false;
  return (
    !("uri" in value) &&
    isPayloadKind(value.kind) &&
    optionalString(value.contentHash) &&
    optionalString(value.mimeType) &&
    (value.sizeBytes === undefined || typeof value.sizeBytes === "number")
  );
}

function isStorageItemMeta(value: unknown): value is StorageItemMeta {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    isStorageItemStatus(value.status) &&
    typeof value.hasBlob === "boolean"
  );
}

function isBoardSummary(value: unknown): value is BoardSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.nodeCount === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isBoardDocument(value: unknown): value is BoardDocument {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    isRecord(value.config) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isPublicTeamBoardNode) &&
    Array.isArray(value.edges) &&
    isRecord(value.viewport) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isPublicTeamBoardNode(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.kind !== "runninghub-app" || !("accessPassword" in value);
}

function isStorageItemStatus(value: unknown): value is StorageItemMeta["status"] {
  return value === "complete" || value === "processing" || value === "pending" || value === "failed";
}

function isPayloadKind(value: unknown): value is PublicTeamAssetPayload["kind"] {
  return value === "indexeddb" || value === "inline" || value === "local-file" || value === "object-storage";
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}
