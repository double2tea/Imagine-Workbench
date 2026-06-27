import { badRequest } from "@/lib/api/errors";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceSettingGroup, WorkspaceSettingRecord } from "@/lib/storage/schema";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import { encryptWorkspaceSecret } from "@/lib/storage/team-secret-crypto";
import type {
  PublicTeamSecretStatus,
  TeamSecretListResult,
  TeamSecretMutationResult,
  TeamSecretSaveInput,
} from "@/lib/storage/team-secret-types";

export interface TeamSecretListOptions {
  groups?: WorkspaceSettingGroup[];
  keys?: string[];
}

export async function listTeamSecrets(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  options: TeamSecretListOptions = {},
): Promise<TeamSecretListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const settings = await context.repository.settings.list({
    groups: options.groups,
    includeSecrets: true,
    keys: options.keys,
  });
  return {
    secrets: settings.filter(record => record.isSecret).map(toPublicTeamSecretStatus),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function saveTeamSecret(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: TeamSecretSaveInput,
  encryptionKey: string,
): Promise<TeamSecretMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const key = normalizeTeamSecretKey(input.key);
  const group = normalizeTeamSecretGroup(input.group);
  const encryptedValue = encryptWorkspaceSecret(input.value, encryptionKey);
  const record: WorkspaceSettingRecord = {
    group,
    isSecret: true,
    key,
    updatedAt: new Date().toISOString(),
    value: encryptedValue,
  };
  await context.queryable.query("begin");
  try {
    await context.repository.settings.put(record);
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_secret.save",
      metadata: { group, key },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await context.queryable.query("commit");
  } catch (error) {
    await context.queryable.query("rollback");
    throw error;
  }
  return {
    secret: toPublicTeamSecretStatus(record),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function deleteTeamSecret(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  key: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const normalizedKey = normalizeTeamSecretKey(key);
  await context.queryable.query("begin");
  try {
    await context.repository.settings.delete(normalizedKey);
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_secret.delete",
      metadata: { key: normalizedKey },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await context.queryable.query("commit");
  } catch (error) {
    await context.queryable.query("rollback");
    throw error;
  }
}

function toPublicTeamSecretStatus(record: WorkspaceSettingRecord): PublicTeamSecretStatus {
  return {
    configured: true,
    group: record.group,
    key: record.key,
    updatedAt: record.updatedAt,
  };
}

function normalizeTeamSecretKey(value: string): string {
  const key = value.trim();
  if (!key) throw badRequest("Team secret key is required", "invalid_team_secret_key");
  return key;
}

function normalizeTeamSecretGroup(value: WorkspaceSettingGroup): WorkspaceSettingGroup {
  if (value === "agent" || value === "model-cache" || value === "provider" || value === "ui" || value === "other") {
    return value;
  }
  throw badRequest("Invalid team secret group", "invalid_team_secret_group");
}
