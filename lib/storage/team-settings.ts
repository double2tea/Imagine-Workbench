import type { QueryResultRow } from "pg";
import { ApiError, badRequest } from "@/lib/api/errors";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceSettingGroup, WorkspaceSettingRecord } from "@/lib/storage/schema";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import type {
  PublicTeamSetting,
  TeamSettingListResult,
  TeamSettingMutationResult,
  TeamSettingSaveInput,
} from "@/lib/storage/team-setting-types";

export interface TeamSettingListOptions {
  groups?: WorkspaceSettingGroup[];
  keys?: string[];
}

interface TeamSettingRow extends QueryResultRow {
  group_name: WorkspaceSettingGroup;
  is_secret: boolean;
  key: string;
  updated_at: Date | string;
  value_text: string;
}

export async function listTeamSettings(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  options: TeamSettingListOptions = {},
): Promise<TeamSettingListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const settings = await context.repository.settings.list({
    groups: options.groups,
    includeSecrets: false,
    keys: options.keys,
  });
  return {
    settings: settings.map(toPublicTeamSetting),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function saveTeamSetting(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: TeamSettingSaveInput,
): Promise<TeamSettingMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const key = normalizeTeamSettingKey(input.key);
  const group = normalizeTeamSettingGroup(input.group);
  const expectedUpdatedAt = normalizeOptionalTeamSettingVersion(input.expectedUpdatedAt);
  await context.queryable.query("begin");
  try {
    const saved = expectedUpdatedAt
      ? await updateExistingTeamSetting(context.queryable, context.session.workspaceId, {
        expectedUpdatedAt,
        group,
        key,
        value: input.value,
      })
      : await insertNewTeamSetting(context.queryable, context.session.workspaceId, {
        group,
        key,
        value: input.value,
      });
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_setting.save",
      metadata: { group, key },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await context.queryable.query("commit");
    return {
      setting: toPublicTeamSetting(saved),
      targetKind: "postgres",
      workspaceId: context.session.workspaceId,
    };
  } catch (error) {
    await context.queryable.query("rollback");
    throw error;
  }
}

export async function deleteTeamSetting(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  key: string,
  expectedUpdatedAt?: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const normalizedKey = normalizeTeamSettingKey(key);
  const expectedVersion = normalizeOptionalTeamSettingVersion(expectedUpdatedAt);
  await context.queryable.query("begin");
  try {
    const deleted = expectedVersion
      ? await deleteExistingTeamSetting(context.queryable, context.session.workspaceId, normalizedKey, expectedVersion)
      : await requireMissingTeamSetting(context.queryable, context.session.workspaceId, normalizedKey);
    if (!deleted) {
      await context.queryable.query("commit");
      return;
    }
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_setting.delete",
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

function toPublicTeamSetting(record: WorkspaceSettingRecord): PublicTeamSetting {
  if (record.isSecret) throw new Error("Team setting response cannot include secrets");
  return {
    group: record.group,
    key: record.key,
    updatedAt: record.updatedAt,
    value: record.value,
  };
}

async function insertNewTeamSetting(
  queryable: PostgresQueryable,
  workspaceId: string,
  input: { group: WorkspaceSettingGroup; key: string; value: string },
): Promise<WorkspaceSettingRecord> {
  const result = await queryable.query<TeamSettingRow>(
    `insert into settings (workspace_id, key, group_name, value, is_secret, updated_at)
     values ($1, $2, $3, to_jsonb($4::text), false, now())
     on conflict (workspace_id, key) do nothing
     returning key, value #>> '{}' as value_text, is_secret, group_name,
       to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at`,
    [workspaceId, input.key, input.group, input.value],
  );
  const saved = teamSettingRecordFromRow(result.rows[0]);
  if (saved) return saved;
  throw new ApiError(409, "team_setting_version_required", "Team setting version is required");
}

async function updateExistingTeamSetting(
  queryable: PostgresQueryable,
  workspaceId: string,
  input: { expectedUpdatedAt: string; group: WorkspaceSettingGroup; key: string; value: string },
): Promise<WorkspaceSettingRecord> {
  const result = await queryable.query<TeamSettingRow>(
    `update settings
     set group_name = $3, value = to_jsonb($4::text), is_secret = false, updated_at = now()
     where workspace_id = $1 and key = $2 and is_secret = false and updated_at = $5::timestamptz
     returning key, value #>> '{}' as value_text, is_secret, group_name,
       to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at`,
    [workspaceId, input.key, input.group, input.value, input.expectedUpdatedAt],
  );
  const saved = teamSettingRecordFromRow(result.rows[0]);
  if (saved) return saved;
  return await assertTeamSettingUpdateConflict(queryable, workspaceId, input.key);
}

async function deleteExistingTeamSetting(
  queryable: PostgresQueryable,
  workspaceId: string,
  key: string,
  expectedUpdatedAt: string,
): Promise<boolean> {
  const result = await queryable.query<TeamSettingRow>(
    `delete from settings
     where workspace_id = $1 and key = $2 and is_secret = false and updated_at = $3::timestamptz
     returning key, value #>> '{}' as value_text, is_secret, group_name,
       to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at`,
    [workspaceId, key, expectedUpdatedAt],
  );
  if (teamSettingRecordFromRow(result.rows[0])) return true;
  return await assertTeamSettingDeleteConflict(queryable, workspaceId, key);
}

async function requireMissingTeamSetting(
  queryable: PostgresQueryable,
  workspaceId: string,
  key: string,
): Promise<false> {
  const existing = await getTeamSettingRecord(queryable, workspaceId, key);
  if (!existing) return false;
  if (existing.isSecret) throw badRequest("Team setting is secret", "team_setting_secret_unsupported");
  throw new ApiError(409, "team_setting_version_required", "Team setting version is required");
}

async function assertTeamSettingUpdateConflict(
  queryable: PostgresQueryable,
  workspaceId: string,
  key: string,
): Promise<never> {
  const existing = await getTeamSettingRecord(queryable, workspaceId, key);
  if (existing?.isSecret) throw badRequest("Team setting is secret", "team_setting_secret_unsupported");
  throw new ApiError(409, "team_setting_version_conflict", "Team setting version conflict");
}

async function assertTeamSettingDeleteConflict(
  queryable: PostgresQueryable,
  workspaceId: string,
  key: string,
): Promise<never> {
  const existing = await getTeamSettingRecord(queryable, workspaceId, key);
  if (!existing) throw new ApiError(409, "team_setting_version_conflict", "Team setting version conflict");
  if (existing.isSecret) throw badRequest("Team setting is secret", "team_setting_secret_unsupported");
  throw new ApiError(409, "team_setting_version_conflict", "Team setting version conflict");
}

async function getTeamSettingRecord(
  queryable: PostgresQueryable,
  workspaceId: string,
  key: string,
): Promise<WorkspaceSettingRecord | null> {
  const result = await queryable.query<TeamSettingRow>(
    `select key, value #>> '{}' as value_text, is_secret, group_name,
       to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
     from settings where workspace_id = $1 and key = $2`,
    [workspaceId, key],
  );
  return teamSettingRecordFromRow(result.rows[0]);
}

function teamSettingRecordFromRow(row: TeamSettingRow | undefined): WorkspaceSettingRecord | null {
  if (!row) return null;
  return {
    group: row.group_name,
    isSecret: row.is_secret,
    key: row.key,
    updatedAt: timestampTokenFromRow(row.updated_at),
    value: row.value_text,
  };
}

function timestampTokenFromRow(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeTeamSettingKey(value: string): string {
  const key = value.trim();
  if (!key) throw badRequest("Team setting key is required", "invalid_team_setting_key");
  return key;
}

function normalizeOptionalTeamSettingVersion(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) throw badRequest("Team setting version is invalid", "invalid_team_setting_version");
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) throw badRequest("Team setting version is invalid", "invalid_team_setting_version");
  return trimmed;
}

function normalizeTeamSettingGroup(value: WorkspaceSettingGroup): WorkspaceSettingGroup {
  if (value === "agent" || value === "model-cache" || value === "provider" || value === "ui" || value === "other") {
    return value;
  }
  throw badRequest("Invalid team setting group", "invalid_team_setting_group");
}
