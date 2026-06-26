import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { resolvePostgresStorageConfig, requireTeamSetupToken } from "../lib/storage/postgres/config";
import { createPostgresWorkspaceStorageRepository } from "../lib/storage/postgres/repository";
import {
  POSTGRES_SCHEMA_MIGRATIONS,
  getPostgresMigrationStatus,
} from "../lib/storage/postgres/migrations";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: "SELECT",
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows,
  };
}

function typedQueryResult<T extends QueryResultRow>(rows: QueryResultRow[]): QueryResult<T> {
  return queryResult(rows) as QueryResult<T>;
}

test("resolvePostgresStorageConfig requires explicit PostgreSQL mode and private config", () => {
  assert.throws(
    () => resolvePostgresStorageConfig({}),
    /IMAGINE_STORAGE_TARGET=postgres is required/,
  );
  assert.throws(
    () => resolvePostgresStorageConfig({ IMAGINE_STORAGE_TARGET: "postgres" }),
    /DATABASE_URL is required/,
  );
  assert.throws(
    () => resolvePostgresStorageConfig({
      DATABASE_URL: "postgres://localhost/imagine",
      IMAGINE_STORAGE_TARGET: "postgres",
    }),
    /IMAGINE_MEDIA_DIR is required/,
  );

  assert.deepEqual(
    resolvePostgresStorageConfig({
      DATABASE_URL: "postgres://localhost/imagine",
      IMAGINE_MEDIA_DIR: "/srv/imagine/media",
      IMAGINE_STORAGE_TARGET: "postgres",
    }),
    {
      databaseUrl: "postgres://localhost/imagine",
      mediaDir: "/srv/imagine/media",
    },
  );
});

test("requireTeamSetupToken fails closed for migration routes", () => {
  assert.throws(
    () => requireTeamSetupToken({}, "token"),
    /IMAGINE_TEAM_SETUP_TOKEN is required/,
  );
  assert.throws(
    () => requireTeamSetupToken({ IMAGINE_TEAM_SETUP_TOKEN: "expected" }, "actual"),
    /Invalid team setup token/,
  );

  assert.doesNotThrow(() => requireTeamSetupToken({ IMAGINE_TEAM_SETUP_TOKEN: "expected" }, "expected"));
});

test("getPostgresMigrationStatus reports pending migrations when schema table is absent", async () => {
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>() => typedQueryResult<T>([{ regclass: null }]),
  };

  const status = await getPostgresMigrationStatus(queryable);

  assert.equal(status.schemaTableExists, false);
  assert.equal(status.currentSchemaVersion, null);
  assert.deepEqual(status.appliedMigrationIds, []);
  assert.deepEqual(status.pendingMigrationIds, ["0001_initial_team_storage"]);
  assert.equal(status.unsupportedNewerSchema, false);
});

test("getPostgresMigrationStatus rejects newer schemas through status flag", async () => {
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string) => {
      if (text.includes("to_regclass")) return typedQueryResult<T>([{ regclass: "schema_migrations" }]);
      return typedQueryResult<T>([{ migration_id: "9999_future", app_schema_version: 999 }]);
    },
  };

  const status = await getPostgresMigrationStatus(queryable);

  assert.equal(status.schemaTableExists, true);
  assert.equal(status.currentSchemaVersion, 999);
  assert.equal(status.unsupportedNewerSchema, true);
});

test("initial PostgreSQL migration contains the team storage foundation tables", () => {
  const sql = POSTGRES_SCHEMA_MIGRATIONS[0].sql;

  for (const tableName of [
    "schema_migrations",
    "workspaces",
    "users",
    "teams",
    "team_memberships",
    "sessions",
    "assets",
    "asset_payloads",
    "asset_previews",
    "asset_library",
    "boards",
    "board_summaries",
    "generation_tasks",
    "settings",
    "user_preferences",
    "prompt_templates",
    "agent_chats",
    "saved_provider_targets",
    "safety_snapshots",
    "voice_profiles",
    "audit_events",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists ${tableName}`));
  }
});

test("PostgreSQL payload repository stores local files and records asset payload refs", async () => {
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), "imagine-postgres-payload-"));
  const writes: unknown[][] = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => {
      if (text.includes("delete from asset_payloads") || text.includes("insert into asset_payloads")) {
        writes.push(values ?? []);
      }
      return typedQueryResult<T>([]);
    },
  };

  try {
    const repository = createPostgresWorkspaceStorageRepository(
      queryable,
      { databaseUrl: "postgres://localhost/imagine", mediaDir },
      "workspace_1",
    );

    const ref = await repository.payloads.write({
      assetId: "asset_1",
      blob: new Blob(["image bytes"], { type: "image/png" }),
      mimeType: "image/png",
    });

    assert.match(ref.uri, /^originals\/image\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.png$/);
    assert.equal(await readFile(path.join(mediaDir, ref.uri), "utf8"), "image bytes");
    assert.deepEqual(writes[0], ["asset_1"]);
    assert.deepEqual(writes[1], ["asset_1", ref.contentHash, "image/png", 11, "local-file", ref.uri]);
  } finally {
    await rm(mediaDir, { force: true, recursive: true });
  }
});
