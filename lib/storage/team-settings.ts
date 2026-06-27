import { badRequest } from "@/lib/api/errors";
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
  const record: WorkspaceSettingRecord = {
    group,
    isSecret: false,
    key,
    updatedAt: new Date().toISOString(),
    value: input.value,
  };
  await context.queryable.query("begin");
  try {
    await context.repository.settings.put(record);
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_setting.save",
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
    setting: toPublicTeamSetting(record),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function deleteTeamSetting(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  key: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const normalizedKey = normalizeTeamSettingKey(key);
  const existing = await context.repository.settings.get(normalizedKey);
  if (existing?.isSecret) throw badRequest("Team setting is secret", "team_setting_secret_unsupported");
  if (!existing) return;
  await context.queryable.query("begin");
  try {
    await context.repository.settings.delete(normalizedKey);
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

function normalizeTeamSettingKey(value: string): string {
  const key = value.trim();
  if (!key) throw badRequest("Team setting key is required", "invalid_team_setting_key");
  return key;
}

function normalizeTeamSettingGroup(value: WorkspaceSettingGroup): WorkspaceSettingGroup {
  if (value === "agent" || value === "model-cache" || value === "provider" || value === "ui" || value === "other") {
    return value;
  }
  throw badRequest("Invalid team setting group", "invalid_team_setting_group");
}
