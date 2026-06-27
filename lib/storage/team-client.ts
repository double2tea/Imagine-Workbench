import { API_ROUTES } from "@/lib/api/routes";
import type { BoardDocument, BoardSummary } from "@/lib/board/types";
import { readFetchError } from "@/lib/client-fetch-error";
import type { StorageItem, StorageItemMeta } from "@/lib/db";
import type {
  GenerationTask,
  GenerationTaskStatus,
  GenerationTaskUpdate,
  ListGenerationTasksOptions,
} from "@/lib/generation-tasks";
import type { PublicLocalStorageRuntimeStatus } from "@/lib/storage/local-public-runtime";
import type { WORKSPACE_STORAGE_SCHEMA_VERSION } from "@/lib/storage/schema";
import type {
  PublicTeamAssetPayload,
  PublicTeamAssetRecord,
  TeamAssetListResult,
  TeamAssetMutationResult,
} from "@/lib/storage/team-asset-types";
import type { TeamBoardDocumentResult, TeamBoardSummaryListResult } from "@/lib/storage/team-board-types";
import type {
  TeamGenerationTaskListResult,
  TeamGenerationTaskMutationResult,
} from "@/lib/storage/team-generation-task-types";
import type {
  ManageableTeamRole,
  PublicTeamMember,
  TeamMemberListResult,
  TeamMemberMutationResult,
} from "@/lib/storage/team-member-types";
import type {
  PublicTeamProviderTarget,
  TeamProviderTargetListResult,
  TeamProviderTargetMutationResult,
  TeamProviderTargetSaveInput,
} from "@/lib/storage/team-provider-target-types";
import type {
  PublicTeamSecretStatus,
  TeamSecretListResult,
  TeamSecretMutationResult,
  TeamSecretSaveInput,
} from "@/lib/storage/team-secret-types";
import type { WorkspaceSettingGroup } from "@/lib/storage/schema";

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

export interface CreateTeamMemberInput {
  email: string;
  password: string;
  role: ManageableTeamRole;
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

export type TeamGenerationTaskListOptions = ListGenerationTasksOptions;

export interface TeamSecretListOptions {
  groups?: WorkspaceSettingGroup[];
  keys?: string[];
}

type Fetcher = typeof fetch;

export class TeamStorageClientError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TeamStorageClientError";
  }
}

export function teamAssetMediaUrl(assetId: string, options: { download?: boolean } = {}): string {
  return API_ROUTES.storage.teamAssetMedia(assetId, options);
}

export function teamAssetRecordToStorageItem(record: PublicTeamAssetRecord): StorageItem {
  return {
    ...record.meta,
    url: record.mediaUrl ?? record.meta.url ?? "",
  };
}

export async function fetchTeamWorkspaceGalleryItems(fetcher: Fetcher = fetch): Promise<StorageItem[]> {
  const result = await fetchTeamAssets({ boardId: "", limit: 200 }, fetcher);
  return result.assets
    .filter(record => !record.meta.libraryItemId)
    .map(teamAssetRecordToStorageItem);
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

export async function fetchTeamMembers(fetcher: Fetcher = fetch): Promise<TeamMemberListResult> {
  const response = await fetcher(API_ROUTES.storage.teamMembers, { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team member list failed";
    throw new Error(error);
  }
  return parseTeamMemberListResult(body);
}

export async function createTeamMember(
  input: CreateTeamMemberInput,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<TeamMemberMutationResult> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamMembers, {
    cache: "no-store",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
      "x-imagine-csrf-token": token,
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team member create failed";
    throw new Error(error);
  }
  return parseTeamMemberMutationResult(body);
}

export async function updateTeamMemberRole(
  userId: string,
  role: ManageableTeamRole,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<TeamMemberMutationResult> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamMember(userId), {
    cache: "no-store",
    body: JSON.stringify({ role }),
    headers: {
      "content-type": "application/json",
      "x-imagine-csrf-token": token,
    },
    method: "PATCH",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team member update failed";
    throw new Error(error);
  }
  return parseTeamMemberMutationResult(body);
}

export async function deleteTeamMember(
  userId: string,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamMember(userId), {
    cache: "no-store",
    headers: { "x-imagine-csrf-token": token },
    method: "DELETE",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team member delete failed";
    throw new Error(error);
  }
}

export async function fetchTeamSecrets(
  options: TeamSecretListOptions = {},
  fetcher: Fetcher = fetch,
): Promise<TeamSecretListResult> {
  const response = await fetcher(teamSecretsUrl(options), { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team secret list failed";
    throw new Error(error);
  }
  return parseTeamSecretListResult(body);
}

export async function fetchTeamProviderTargets(fetcher: Fetcher = fetch): Promise<TeamProviderTargetListResult> {
  const response = await fetcher(API_ROUTES.storage.teamProviderTargets, { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team provider target list failed";
    throw new Error(error);
  }
  return parseTeamProviderTargetListResult(body);
}

export async function saveTeamProviderTarget(
  input: TeamProviderTargetSaveInput,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<TeamProviderTargetMutationResult> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamProviderTargets, {
    cache: "no-store",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
      "x-imagine-csrf-token": token,
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team provider target save failed";
    throw new Error(error);
  }
  return parseTeamProviderTargetMutationResult(body);
}

export async function deleteTeamProviderTarget(
  targetId: string,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamProviderTarget(targetId), {
    cache: "no-store",
    headers: { "x-imagine-csrf-token": token },
    method: "DELETE",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team provider target delete failed";
    throw new Error(error);
  }
}

export async function saveTeamSecret(
  input: TeamSecretSaveInput,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<TeamSecretMutationResult> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamSecrets, {
    cache: "no-store",
    body: JSON.stringify(input),
    headers: {
      "content-type": "application/json",
      "x-imagine-csrf-token": token,
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team secret save failed";
    throw new Error(error);
  }
  return parseTeamSecretMutationResult(body);
}

export async function deleteTeamSecret(
  key: string,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamSecret(key), {
    cache: "no-store",
    headers: { "x-imagine-csrf-token": token },
    method: "DELETE",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team secret delete failed";
    throw new Error(error);
  }
}

export async function deleteTeamAsset(
  assetId: string,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamAsset(assetId), {
    cache: "no-store",
    headers: { "x-imagine-csrf-token": token },
    method: "DELETE",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team asset delete failed";
    throw new Error(error);
  }
}

export async function saveTeamAsset(
  item: StorageItem,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<StorageItem> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamAssets, {
    cache: "no-store",
    body: JSON.stringify({ asset: item }),
    headers: {
      "content-type": "application/json",
      "x-imagine-csrf-token": token,
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team asset save failed";
    throw new Error(error);
  }
  return teamAssetRecordToStorageItem(parseTeamAssetMutationResult(body).asset);
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

export async function fetchTeamGenerationTasks(
  options: TeamGenerationTaskListOptions = {},
  fetcher: Fetcher = fetch,
): Promise<TeamGenerationTaskListResult> {
  const response = await fetcher(teamGenerationTasksUrl(options), { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team generation task list failed";
    throw new Error(error);
  }
  return parseTeamGenerationTaskListResult(body);
}

export async function saveTeamGenerationTask(
  task: GenerationTask,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<GenerationTask> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamGenerationTasks, {
    cache: "no-store",
    body: JSON.stringify({ task }),
    headers: {
      "content-type": "application/json",
      "x-imagine-csrf-token": token,
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team generation task save failed";
    throw new Error(error);
  }
  return parseTeamGenerationTaskMutationResult(body).task;
}

export async function updateTeamGenerationTask(
  taskId: string,
  update: GenerationTaskUpdate,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<GenerationTask> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamGenerationTask(taskId), {
    cache: "no-store",
    body: JSON.stringify({ update }),
    headers: {
      "content-type": "application/json",
      "x-imagine-csrf-token": token,
    },
    method: "PATCH",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team generation task update failed";
    throw new Error(error);
  }
  return parseTeamGenerationTaskMutationResult(body).task;
}

export async function cancelTeamGenerationTask(
  taskId: string,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<GenerationTask> {
  return updateTeamGenerationTask(taskId, { progress: 100, status: "canceled" }, csrfToken, fetcher);
}

export async function deleteTeamGenerationTask(
  taskId: string,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamGenerationTask(taskId), {
    cache: "no-store",
    headers: { "x-imagine-csrf-token": token },
    method: "DELETE",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = readStringField(body, "error") ?? "Team generation task delete failed";
    throw new Error(error);
  }
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
    throw readTeamStorageClientError(body, "Team board read failed");
  }
  return parseTeamBoardDocumentResult(body);
}

export async function createTeamBoardDocument(
  board: BoardDocument,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<TeamBoardDocumentResult> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamBoards, {
    cache: "no-store",
    body: JSON.stringify(board),
    headers: {
      "content-type": "application/json",
      "x-imagine-csrf-token": token,
    },
    method: "POST",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw readTeamStorageClientError(body, "Team board create failed");
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
    throw readTeamStorageClientError(body, "Team board save failed");
  }
  return parseTeamBoardDocumentResult(body);
}

export async function deleteTeamBoardDocument(
  boardId: string,
  csrfToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const token = csrfToken.trim();
  if (!token) throw new Error("CSRF token is required");
  const response = await fetcher(API_ROUTES.storage.teamBoard(boardId), {
    cache: "no-store",
    headers: { "x-imagine-csrf-token": token },
    method: "DELETE",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw readTeamStorageClientError(body, "Team board delete failed");
  }
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

function parseTeamMemberListResult(value: unknown): TeamMemberListResult {
  if (!isTeamMemberListResult(value)) throw new Error("Team member list response is invalid");
  return value;
}

function parseTeamMemberMutationResult(value: unknown): TeamMemberMutationResult {
  if (!isTeamMemberMutationResult(value)) throw new Error("Team member response is invalid");
  return value;
}

function parseTeamSecretListResult(value: unknown): TeamSecretListResult {
  if (!isTeamSecretListResult(value)) throw new Error("Team secret list response is invalid");
  return value;
}

function parseTeamSecretMutationResult(value: unknown): TeamSecretMutationResult {
  if (!isTeamSecretMutationResult(value)) throw new Error("Team secret response is invalid");
  return value;
}

function parseTeamProviderTargetListResult(value: unknown): TeamProviderTargetListResult {
  if (!isTeamProviderTargetListResult(value)) throw new Error("Team provider target list response is invalid");
  return value;
}

function parseTeamProviderTargetMutationResult(value: unknown): TeamProviderTargetMutationResult {
  if (!isTeamProviderTargetMutationResult(value)) throw new Error("Team provider target response is invalid");
  return value;
}

function parseTeamAssetListResult(value: unknown): TeamAssetListResult {
  if (!isTeamAssetListResult(value)) throw new Error("Team asset list response is invalid");
  return value;
}

function parseTeamAssetMutationResult(value: unknown): TeamAssetMutationResult {
  if (!isTeamAssetMutationResult(value)) throw new Error("Team asset response is invalid");
  return value;
}

function parseTeamGenerationTaskListResult(value: unknown): TeamGenerationTaskListResult {
  if (!isTeamGenerationTaskListResult(value)) throw new Error("Team generation task list response is invalid");
  return value;
}

function parseTeamGenerationTaskMutationResult(value: unknown): TeamGenerationTaskMutationResult {
  if (!isTeamGenerationTaskMutationResult(value)) throw new Error("Team generation task response is invalid");
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

function readTeamStorageClientError(value: unknown, fallback: string): TeamStorageClientError {
  return new TeamStorageClientError(readStringField(value, "error") ?? fallback, readStringField(value, "code") ?? undefined);
}

function teamAssetsUrl(options: TeamAssetListOptions): string {
  const searchParams = new URLSearchParams();
  if (options.boardId !== undefined) searchParams.set("boardId", options.boardId);
  for (const id of options.ids ?? []) searchParams.append("id", id);
  if (options.limit !== undefined) searchParams.set("limit", String(options.limit));
  if (options.offset !== undefined) searchParams.set("offset", String(options.offset));
  for (const status of options.statuses ?? []) searchParams.append("status", status);
  const query = searchParams.toString();
  return query ? `${API_ROUTES.storage.teamAssets}?${query}` : API_ROUTES.storage.teamAssets;
}

function teamGenerationTasksUrl(options: TeamGenerationTaskListOptions): string {
  const searchParams = new URLSearchParams();
  if (options.boardId !== undefined) searchParams.set("boardId", options.boardId);
  if (options.limit !== undefined) searchParams.set("limit", String(options.limit));
  if (options.offset !== undefined) searchParams.set("offset", String(options.offset));
  for (const nodeId of options.sourceBoardNodeIds ?? []) searchParams.append("sourceBoardNodeId", nodeId);
  for (const status of options.statuses ?? []) searchParams.append("status", status);
  const query = searchParams.toString();
  return query ? `${API_ROUTES.storage.teamGenerationTasks}?${query}` : API_ROUTES.storage.teamGenerationTasks;
}

function teamBoardsUrl(options: TeamBoardSummaryListOptions): string {
  const searchParams = new URLSearchParams();
  for (const id of options.ids ?? []) searchParams.append("id", id);
  if (options.limit !== undefined) searchParams.set("limit", String(options.limit));
  if (options.offset !== undefined) searchParams.set("offset", String(options.offset));
  const query = searchParams.toString();
  return query ? `${API_ROUTES.storage.teamBoards}?${query}` : API_ROUTES.storage.teamBoards;
}

function teamSecretsUrl(options: TeamSecretListOptions): string {
  const searchParams = new URLSearchParams();
  for (const group of options.groups ?? []) searchParams.append("group", group);
  for (const key of options.keys ?? []) searchParams.append("key", key);
  const query = searchParams.toString();
  return query ? `${API_ROUTES.storage.teamSecrets}?${query}` : API_ROUTES.storage.teamSecrets;
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

function isTeamAssetMutationResult(value: unknown): value is TeamAssetMutationResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    isPublicTeamAssetRecord(value.asset)
  );
}

function isTeamGenerationTaskListResult(value: unknown): value is TeamGenerationTaskListResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    Number.isInteger(value.limit) &&
    Number.isInteger(value.offset) &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isGenerationTask)
  );
}

function isTeamGenerationTaskMutationResult(value: unknown): value is TeamGenerationTaskMutationResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    isGenerationTask(value.task)
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

function isTeamMemberListResult(value: unknown): value is TeamMemberListResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    Array.isArray(value.members) &&
    value.members.every(isPublicTeamMember)
  );
}

function isTeamMemberMutationResult(value: unknown): value is TeamMemberMutationResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    isPublicTeamMember(value.member)
  );
}

function isTeamSecretListResult(value: unknown): value is TeamSecretListResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    Array.isArray(value.secrets) &&
    value.secrets.every(isPublicTeamSecretStatus)
  );
}

function isTeamSecretMutationResult(value: unknown): value is TeamSecretMutationResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    isPublicTeamSecretStatus(value.secret)
  );
}

function isTeamProviderTargetListResult(value: unknown): value is TeamProviderTargetListResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    Array.isArray(value.targets) &&
    value.targets.every(isPublicTeamProviderTarget)
  );
}

function isTeamProviderTargetMutationResult(value: unknown): value is TeamProviderTargetMutationResult {
  if (!isRecord(value)) return false;
  return (
    value.targetKind === "postgres" &&
    typeof value.workspaceId === "string" &&
    isPublicTeamProviderTarget(value.target)
  );
}

function isPublicTeamMember(value: unknown): value is PublicTeamMember {
  if (!isRecord(value)) return false;
  return (
    typeof value.createdAt === "string" &&
    typeof value.email === "string" &&
    isTeamRole(value.role) &&
    typeof value.userId === "string"
  );
}

function isPublicTeamSecretStatus(value: unknown): value is PublicTeamSecretStatus {
  if (!isRecord(value)) return false;
  return (
    value.configured === true &&
    isWorkspaceSettingGroup(value.group) &&
    typeof value.key === "string" &&
    typeof value.updatedAt === "string" &&
    !("value" in value)
  );
}

function isPublicTeamProviderTarget(value: unknown): value is PublicTeamProviderTarget {
  if (!isRecord(value)) return false;
  return (
    value.provider === "runninghub" &&
    typeof value.accessPasswordConfigured === "boolean" &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    isRunningHubOutputType(value.outputType) &&
    typeof value.targetId === "string" &&
    isRunningHubTargetType(value.targetType) &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.bindings) &&
    value.bindings.every(isRunningHubBinding) &&
    !("accessPassword" in value) &&
    !("accessPasswordEncrypted" in value)
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

function isTeamRole(value: unknown): value is TeamSessionContext["role"] {
  return value === "owner" || value === "admin" || value === "editor" || value === "viewer";
}

function isWorkspaceSettingGroup(value: unknown): value is WorkspaceSettingGroup {
  return value === "agent" || value === "model-cache" || value === "provider" || value === "ui" || value === "other";
}

function isStorageItemStatus(value: unknown): value is StorageItemMeta["status"] {
  return value === "complete" || value === "processing" || value === "pending" || value === "failed";
}

function isGenerationTask(value: unknown): value is GenerationTask {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isGenerationTaskMediaType(value.mediaType) &&
    typeof value.prompt === "string" &&
    typeof value.model === "string" &&
    isGenerationTaskStatus(value.status) &&
    typeof value.progress === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isGenerationTaskSource(value.source) &&
    Array.isArray(value.resultAssetIds) &&
    value.resultAssetIds.every(item => typeof item === "string") &&
    optionalString(value.activeResultAssetId) &&
    optionalString(value.operationName) &&
    optionalString(value.errorMessage) &&
    optionalString(value.legacyAssetId) &&
    (value.request === undefined || isRecord(value.request)) &&
    typeof value.canCancelRemote === "boolean"
  );
}

function isGenerationTaskSource(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.surface === "workspace" || value.surface === "board" || value.surface === "agent") &&
    optionalString(value.boardId) &&
    optionalString(value.boardNodeId) &&
    optionalString(value.resultStackKey)
  );
}

function isGenerationTaskMediaType(value: unknown): boolean {
  return value === "image" || value === "video" || value === "audio" || value === "transcript";
}

function isGenerationTaskStatus(value: unknown): value is GenerationTaskStatus {
  return value === "pending" || value === "processing" || value === "complete" || value === "failed" || value === "canceled";
}

function isRunningHubBinding(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.nodeId === "string" &&
    typeof value.fieldName === "string" &&
    isRunningHubBindingSource(value.source) &&
    typeof value.value === "string" &&
    isRunningHubBindingDelivery(value.deliveryMode)
  );
}

function isRunningHubTargetType(value: unknown): boolean {
  return value === "ai-app" || value === "workflow";
}

function isRunningHubOutputType(value: unknown): boolean {
  return value === "image" || value === "video" || value === "audio";
}

function isRunningHubBindingSource(value: unknown): boolean {
  return value === "literal" || value === "prompt" || value === "reference" || value === "randomSeed";
}

function isRunningHubBindingDelivery(value: unknown): boolean {
  return value === "raw" || value === "url" || value === "fileName";
}

function isPayloadKind(value: unknown): value is PublicTeamAssetPayload["kind"] {
  return value === "indexeddb" || value === "inline" || value === "local-file" || value === "object-storage";
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}
