import type { QueryResultRow } from "pg";
import { WORKSPACE_STORAGE_SCHEMA_VERSION } from "@/lib/storage/schema";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";

const INITIAL_TEAM_STORAGE_SQL = `
create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  migration_id text primary key,
  checksum text not null,
  app_schema_version integer not null,
  applied_at timestamptz not null default now(),
  app_version text
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists team_memberships (
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists csrf_tokens (
  token_hash text primary key,
  session_id text not null references sessions(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  owner_user_id uuid references users(id) on delete set null,
  meta jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists asset_payloads (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references assets(id) on delete cascade,
  content_hash text,
  mime_type text,
  size_bytes bigint,
  storage_kind text not null,
  storage_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists asset_previews (
  asset_id text primary key references assets(id) on delete cascade,
  preview jsonb not null,
  storage_kind text,
  storage_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists asset_library (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  asset_id text not null references assets(id) on delete cascade,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists boards (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  board jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists board_summaries (
  board_id text primary key references boards(id) on delete cascade,
  workspace_id uuid references workspaces(id) on delete cascade,
  summary jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists generation_tasks (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  task jsonb not null,
  status text not null,
  board_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  workspace_id uuid references workspaces(id) on delete cascade,
  key text not null,
  group_name text not null default 'other',
  value jsonb not null,
  is_secret boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, key)
);

create table if not exists user_preferences (
  user_id uuid references users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists prompt_templates (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  template jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_chats (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  board_id text,
  chat jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists saved_provider_targets (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  provider text not null,
  target jsonb not null,
  is_secret boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists safety_snapshots (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists voice_profiles (
  id text primary key,
  workspace_id uuid references workspaces(id) on delete cascade,
  profile jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assets_workspace_updated_idx on assets(workspace_id, updated_at desc);
create index if not exists generation_tasks_workspace_status_idx on generation_tasks(workspace_id, status, updated_at desc);
create index if not exists boards_workspace_updated_idx on boards(workspace_id, updated_at desc);
create index if not exists audit_events_workspace_created_idx on audit_events(workspace_id, created_at desc);
`;

export const POSTGRES_SCHEMA_MIGRATIONS = [
  {
    appSchemaVersion: WORKSPACE_STORAGE_SCHEMA_VERSION,
    checksum: "2026-06-26-initial-team-storage",
    id: "0001_initial_team_storage",
    sql: INITIAL_TEAM_STORAGE_SQL,
  },
] as const;

interface SchemaMigrationRow extends QueryResultRow {
  app_schema_version: number;
  migration_id: string;
}

interface RegclassRow extends QueryResultRow {
  regclass: string | null;
}

export interface PostgresMigrationStatus {
  appliedMigrationIds: string[];
  currentSchemaVersion: number | null;
  pendingMigrationIds: string[];
  requiredSchemaVersion: typeof WORKSPACE_STORAGE_SCHEMA_VERSION;
  schemaTableExists: boolean;
  unsupportedNewerSchema: boolean;
}

export async function getPostgresMigrationStatus(queryable: PostgresQueryable): Promise<PostgresMigrationStatus> {
  const tableResult = await queryable.query<RegclassRow>("select to_regclass('public.schema_migrations') as regclass");
  const schemaTableExists = tableResult.rows[0]?.regclass === "schema_migrations";
  if (!schemaTableExists) {
    return {
      appliedMigrationIds: [],
      currentSchemaVersion: null,
      pendingMigrationIds: POSTGRES_SCHEMA_MIGRATIONS.map(migration => migration.id),
      requiredSchemaVersion: WORKSPACE_STORAGE_SCHEMA_VERSION,
      schemaTableExists: false,
      unsupportedNewerSchema: false,
    };
  }

  const appliedResult = await queryable.query<SchemaMigrationRow>(
    "select migration_id, app_schema_version from schema_migrations order by migration_id",
  );
  const appliedMigrationIds = appliedResult.rows.map(row => row.migration_id);
  const currentSchemaVersion = appliedResult.rows.reduce<number | null>(
    (maxVersion, row) => maxVersion === null ? row.app_schema_version : Math.max(maxVersion, row.app_schema_version),
    null,
  );
  const appliedSet = new Set(appliedMigrationIds);

  return {
    appliedMigrationIds,
    currentSchemaVersion,
    pendingMigrationIds: POSTGRES_SCHEMA_MIGRATIONS
      .filter(migration => !appliedSet.has(migration.id))
      .map(migration => migration.id),
    requiredSchemaVersion: WORKSPACE_STORAGE_SCHEMA_VERSION,
    schemaTableExists: true,
    unsupportedNewerSchema: currentSchemaVersion !== null && currentSchemaVersion > WORKSPACE_STORAGE_SCHEMA_VERSION,
  };
}

export async function applyPostgresMigrations(queryable: PostgresQueryable, appVersion: string): Promise<PostgresMigrationStatus> {
  await queryable.query("begin");
  try {
    const before = await getPostgresMigrationStatus(queryable);
    if (before.unsupportedNewerSchema) {
      throw new Error(`Database schema version ${before.currentSchemaVersion} is newer than supported version ${WORKSPACE_STORAGE_SCHEMA_VERSION}`);
    }
    const appliedSet = new Set(before.appliedMigrationIds);
    const appliedNow: string[] = [];
    for (const migration of POSTGRES_SCHEMA_MIGRATIONS) {
      if (appliedSet.has(migration.id)) continue;
      await queryable.query(migration.sql);
      await queryable.query(
        "insert into schema_migrations (migration_id, checksum, app_schema_version, app_version) values ($1, $2, $3, $4)",
        [migration.id, migration.checksum, migration.appSchemaVersion, appVersion],
      );
      appliedNow.push(migration.id);
    }
    if (appliedNow.length > 0) {
      await recordTeamAuditEvent(queryable, {
        eventType: "team_migrations.apply",
        metadata: {
          appVersion,
          appliedCount: appliedNow.length,
          appliedMigrationIds: appliedNow,
        },
        userId: null,
        workspaceId: null,
      });
    }
    await queryable.query("commit");
  } catch (error) {
    await queryable.query("rollback");
    throw error;
  }
  return getPostgresMigrationStatus(queryable);
}
