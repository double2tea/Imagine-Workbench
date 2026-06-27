import { badRequest } from "@/lib/api/errors";
import type {
  BoardAssetType,
  BoardRunningHubBindingDelivery,
  BoardRunningHubBindingOption,
  BoardRunningHubBindingSource,
  BoardRunningHubBindingValueType,
  BoardRunningHubNodeInfoBinding,
  BoardRunningHubOutputType,
  BoardRunningHubTargetType,
} from "@/lib/board/types";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import {
  decryptWorkspaceSecret,
  encryptWorkspaceSecret,
  isEncryptedWorkspaceSecret,
} from "@/lib/storage/team-secret-crypto";
import type { TeamRole } from "@/lib/storage/team-auth";
import type {
  PublicTeamProviderTarget,
  TeamProviderTargetListResult,
  TeamProviderTargetMutationResult,
  TeamProviderTargetSaveInput,
} from "@/lib/storage/team-provider-target-types";

interface TeamProviderTargetRow {
  id: string;
  provider: string;
  target: unknown;
  updated_at: Date | string;
}

interface StoredTeamProviderTarget {
  accessPasswordEncrypted?: string;
  bindings: BoardRunningHubNodeInfoBinding[];
  label: string;
  outputType: BoardRunningHubOutputType;
  provider: "runninghub";
  targetId: string;
  targetType: BoardRunningHubTargetType;
}

export async function listTeamProviderTargets(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
): Promise<TeamProviderTargetListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const result = await context.queryable.query<TeamProviderTargetRow>(
    `select id, provider, target, updated_at
     from saved_provider_targets
     where workspace_id = $1 and provider = $2
     order by updated_at desc`,
    [context.session.workspaceId, "runninghub"],
  );
  return {
    targetKind: "postgres",
    targets: result.rows.map(row => publicTargetFromRow(row)),
    workspaceId: context.session.workspaceId,
  };
}

export async function saveTeamProviderTarget(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: TeamProviderTargetSaveInput,
  encryptionKey: string,
): Promise<TeamProviderTargetMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const normalized = normalizeProviderTarget(input);
  const publicId = teamProviderTargetId(normalized.targetType, normalized.targetId);
  const storageId = storageProviderTargetId(context.session.workspaceId, publicId);
  const existing = await readExistingTarget(context.queryable, context.session.workspaceId, storageId);
  const password = input.accessPassword;
  const accessPasswordEncrypted = password === undefined
    ? existing?.accessPasswordEncrypted
    : password.trim()
      ? encryptWorkspaceSecret(password, encryptionKey)
      : undefined;
  const target: StoredTeamProviderTarget = {
    ...normalized,
    ...(accessPasswordEncrypted ? { accessPasswordEncrypted } : {}),
  };
  const result = await context.queryable.query<TeamProviderTargetRow>(
    `insert into saved_provider_targets (id, workspace_id, provider, target, is_secret, updated_at)
     values ($1, $2, $3, $4::jsonb, true, now())
     on conflict (id) do update set
       provider = excluded.provider,
       target = excluded.target,
       is_secret = true,
       updated_at = now()
     returning id, provider, target, updated_at`,
    [storageId, context.session.workspaceId, "runninghub", JSON.stringify(target)],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Team provider target save failed");
  await recordTeamAuditEvent(context.queryable, {
    eventType: "team_provider_target.save",
    metadata: {
      provider: "runninghub",
      targetId: normalized.targetId,
      targetType: normalized.targetType,
    },
    userId: context.session.userId,
    workspaceId: context.session.workspaceId,
  });
  return {
    target: publicTargetFromRow(row),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function readTeamProviderTargetAccessPassword(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  targetId: string,
  encryptionKey: string,
  minimumRole: TeamRole,
): Promise<string | null> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole });
  const publicId = normalizeText(targetId, "Team provider target id is required", "invalid_team_provider_target_id");
  const storageId = storageProviderTargetId(context.session.workspaceId, publicId);
  const target = await readExistingTarget(context.queryable, context.session.workspaceId, storageId);
  if (!target?.accessPasswordEncrypted) return null;
  if (!isEncryptedWorkspaceSecret(target.accessPasswordEncrypted)) {
    throw new Error("Team provider target access password must be stored as an encrypted secret");
  }
  return decryptWorkspaceSecret(target.accessPasswordEncrypted, encryptionKey);
}

export async function deleteTeamProviderTarget(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  targetId: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const publicId = normalizeText(targetId, "Team provider target id is required", "invalid_team_provider_target_id");
  const storageId = storageProviderTargetId(context.session.workspaceId, publicId);
  await context.queryable.query(
    "delete from saved_provider_targets where workspace_id = $1 and id = $2",
    [context.session.workspaceId, storageId],
  );
  await recordTeamAuditEvent(context.queryable, {
    eventType: "team_provider_target.delete",
    metadata: { provider: "runninghub", targetId: publicId },
    userId: context.session.userId,
    workspaceId: context.session.workspaceId,
  });
}

function publicTargetFromRow(row: TeamProviderTargetRow): PublicTeamProviderTarget {
  if (row.provider !== "runninghub") throw badRequest("Invalid team provider target", "invalid_team_provider_target");
  const target = readStoredTeamProviderTarget(row.target);
  return {
    accessPasswordConfigured: Boolean(target.accessPasswordEncrypted),
    bindings: target.bindings,
    id: teamProviderTargetId(target.targetType, target.targetId),
    label: target.label,
    outputType: target.outputType,
    provider: target.provider,
    targetId: target.targetId,
    targetType: target.targetType,
    updatedAt: readUpdatedAt(row.updated_at),
  };
}

async function readExistingTarget(
  queryable: PostgresQueryable,
  workspaceId: string,
  id: string,
): Promise<StoredTeamProviderTarget | null> {
  const result = await queryable.query<TeamProviderTargetRow>(
    "select id, provider, target, updated_at from saved_provider_targets where workspace_id = $1 and id = $2",
    [workspaceId, id],
  );
  const row = result.rows[0];
  return row ? readStoredTeamProviderTarget(row.target) : null;
}

function normalizeProviderTarget(input: TeamProviderTargetSaveInput): StoredTeamProviderTarget {
  if (input.provider !== "runninghub") throw badRequest("Invalid provider target provider", "invalid_team_provider_target");
  return {
    bindings: input.bindings.map(readBinding).filter((binding): binding is BoardRunningHubNodeInfoBinding => binding !== null),
    label: normalizeText(input.label, "Team provider target label is required", "invalid_team_provider_target"),
    outputType: normalizeOutputType(input.outputType),
    provider: "runninghub",
    targetId: normalizeText(input.targetId, "Team provider target id is required", "invalid_team_provider_target"),
    targetType: normalizeTargetType(input.targetType),
  };
}

function readStoredTeamProviderTarget(value: unknown): StoredTeamProviderTarget {
  if (!isRecord(value)) throw badRequest("Invalid team provider target", "invalid_team_provider_target");
  const provider = value.provider;
  if (provider !== "runninghub") throw badRequest("Invalid team provider target provider", "invalid_team_provider_target");
  const bindings = Array.isArray(value.bindings)
    ? value.bindings.map(readBinding).filter((binding): binding is BoardRunningHubNodeInfoBinding => binding !== null)
    : [];
  return {
    accessPasswordEncrypted: optionalString(value.accessPasswordEncrypted),
    bindings,
    label: normalizeText(optionalString(value.label), "Team provider target label is required", "invalid_team_provider_target"),
    outputType: normalizeOutputType(value.outputType),
    provider,
    targetId: normalizeText(optionalString(value.targetId), "Team provider target id is required", "invalid_team_provider_target"),
    targetType: normalizeTargetType(value.targetType),
  };
}

function readBinding(value: unknown): BoardRunningHubNodeInfoBinding | null {
  if (!isRecord(value)) return null;
  const id = optionalString(value.id);
  const nodeId = optionalString(value.nodeId);
  const fieldName = optionalString(value.fieldName);
  if (!id || !nodeId || !fieldName) return null;
  const options = Array.isArray(value.options)
    ? value.options.map(readBindingOption).filter((option): option is BoardRunningHubBindingOption => option !== null)
    : undefined;
  return {
    id,
    nodeId,
    fieldName,
    fieldData: optionalString(value.fieldData),
    description: optionalString(value.description),
    descriptionEn: optionalString(value.descriptionEn),
    label: optionalString(value.label),
    source: normalizeBindingSource(value.source),
    value: optionalString(value.value) ?? "",
    valueType: optionalBindingValueType(value.valueType),
    options,
    enabled: optionalBoolean(value.enabled),
    required: optionalBoolean(value.required),
    referenceIndex: optionalNumber(value.referenceIndex),
    referenceType: optionalReferenceType(value.referenceType),
    deliveryMode: normalizeBindingDelivery(value.deliveryMode),
  };
}

function readBindingOption(value: unknown): BoardRunningHubBindingOption | null {
  if (!isRecord(value)) return null;
  const label = optionalString(value.label);
  const optionValue = optionalString(value.value);
  if (!label || optionValue === undefined) return null;
  const description = optionalString(value.description);
  return description ? { description, label, value: optionValue } : { label, value: optionValue };
}

function teamProviderTargetId(targetType: BoardRunningHubTargetType, targetId: string): string {
  return `${targetType}:${targetId.trim()}`;
}

function storageProviderTargetId(workspaceId: string, publicId: string): string {
  return `${workspaceId}:runninghub:${publicId}`;
}

function normalizeText(value: string | undefined, message: string, code: string): string {
  const text = value?.trim();
  if (!text) throw badRequest(message, code);
  return text;
}

function normalizeTargetType(value: unknown): BoardRunningHubTargetType {
  if (value === "ai-app" || value === "workflow") return value;
  throw badRequest("Invalid team provider target type", "invalid_team_provider_target");
}

function normalizeOutputType(value: unknown): BoardRunningHubOutputType {
  if (value === "image" || value === "video" || value === "audio") return value;
  throw badRequest("Invalid team provider target output type", "invalid_team_provider_target");
}

function normalizeBindingSource(value: unknown): BoardRunningHubBindingSource {
  if (value === "literal" || value === "prompt" || value === "reference" || value === "randomSeed") return value;
  return "literal";
}

function normalizeBindingDelivery(value: unknown): BoardRunningHubBindingDelivery {
  if (value === "url" || value === "fileName" || value === "raw") return value;
  return "raw";
}

function optionalBindingValueType(value: unknown): BoardRunningHubBindingValueType | undefined {
  if (value === "text" || value === "number" || value === "boolean" || value === "image" || value === "video" || value === "audio" || value === "raw") {
    return value;
  }
  return undefined;
}

function optionalReferenceType(value: unknown): BoardAssetType | undefined {
  if (value === "image" || value === "video" || value === "audio") return value;
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readUpdatedAt(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
