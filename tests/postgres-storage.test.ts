import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import {
  resolvePostgresStorageConfig,
  requireTeamSecretEncryptionKey,
  requireTeamSetupToken,
} from "../lib/storage/postgres/config";
import { createPostgresWorkspaceStorageRepository } from "../lib/storage/postgres/repository";
import {
  POSTGRES_SCHEMA_MIGRATIONS,
  applyPostgresMigrations,
  getPostgresMigrationStatus,
} from "../lib/storage/postgres/migrations";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import {
  decryptWorkspaceSecret,
  encryptWorkspaceSecret,
  isEncryptedWorkspaceSecret,
} from "../lib/storage/team-secret-crypto";

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
  assert.throws(
    () => resolvePostgresStorageConfig({
      DATABASE_URL: "postgres://localhost/imagine",
      IMAGINE_MEDIA_DIR: "/srv/imagine/media",
      IMAGINE_STORAGE_TARGET: "postgres",
    }),
    /IMAGINE_MAX_MEDIA_PAYLOAD_BYTES is required/,
  );
  assert.throws(
    () => resolvePostgresStorageConfig({
      DATABASE_URL: "postgres://localhost/imagine",
      IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: "0",
      IMAGINE_MEDIA_DIR: "/srv/imagine/media",
      IMAGINE_STORAGE_TARGET: "postgres",
    }),
    /IMAGINE_MAX_MEDIA_PAYLOAD_BYTES must be a positive integer byte count/,
  );

  assert.deepEqual(
    resolvePostgresStorageConfig({
      DATABASE_URL: "postgres://localhost/imagine",
      IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: "1048576",
      IMAGINE_MEDIA_DIR: "/srv/imagine/media",
      IMAGINE_STORAGE_TARGET: "postgres",
    }),
    {
      databaseUrl: "postgres://localhost/imagine",
      maxMediaPayloadBytes: 1048576,
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

test("requireTeamSecretEncryptionKey fails closed for team workspace secrets", () => {
  assert.throws(
    () => requireTeamSecretEncryptionKey({}),
    /IMAGINE_TEAM_SECRET_ENCRYPTION_KEY is required/,
  );
  assert.equal(
    requireTeamSecretEncryptionKey({ IMAGINE_TEAM_SECRET_ENCRYPTION_KEY: " encryption-key " }),
    "encryption-key",
  );
});

test("workspace secret encryption round-trips without exposing plaintext format", () => {
  const ciphertext = encryptWorkspaceSecret("provider-api-key", "workspace-encryption-key");

  assert.equal(isEncryptedWorkspaceSecret(ciphertext), true);
  assert.notEqual(ciphertext.includes("provider-api-key"), true);
  assert.equal(decryptWorkspaceSecret(ciphertext, "workspace-encryption-key"), "provider-api-key");
  assert.throws(
    () => decryptWorkspaceSecret(ciphertext, "wrong-key"),
    /Unsupported state|unable to authenticate data/,
  );
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

test("applyPostgresMigrations records a non-secret system audit event", async () => {
  let schemaTableExists = false;
  const appliedRows: Array<{ app_schema_version: number; migration_id: string }> = [];
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => {
      queries.push({ text, values });
      if (text.includes("to_regclass")) {
        return typedQueryResult<T>([{ regclass: schemaTableExists ? "schema_migrations" : null }]);
      }
      if (text.includes("select migration_id")) {
        return typedQueryResult<T>(appliedRows);
      }
      if (text.includes("create table if not exists schema_migrations")) {
        schemaTableExists = true;
      }
      if (text.startsWith("insert into schema_migrations")) {
        appliedRows.push({
          app_schema_version: Number(values?.[2]),
          migration_id: String(values?.[0]),
        });
      }
      return typedQueryResult<T>([]);
    },
  };

  const status = await applyPostgresMigrations(queryable, "0.1.0");
  const audit = queries.find(query => query.text.includes("insert into audit_events"));

  assert.deepEqual(status.appliedMigrationIds, ["0001_initial_team_storage"]);
  assert.deepEqual(audit?.values?.slice(0, 3), [null, null, "team_migrations.apply"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    appVersion: "0.1.0",
    appliedCount: 1,
    appliedMigrationIds: ["0001_initial_team_storage"],
  });
  assert.equal(queries[0]?.text, "begin");
  assert.equal(queries.some(query => query.text === "commit"), true);
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

test("PostgreSQL settings repository rejects plaintext secret records", async () => {
  const writes: unknown[][] = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => {
      if (text.includes("insert into settings")) writes.push(values ?? []);
      return typedQueryResult<T>([]);
    },
  };
  const repository = createPostgresWorkspaceStorageRepository(
    queryable,
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    "workspace_1",
  );

  await assert.rejects(
    () => repository.settings.put({
      group: "provider",
      isSecret: true,
      key: "provider:demo:apiKey",
      updatedAt: "2026-06-27T00:00:00.000Z",
      value: "plaintext-api-key",
    }),
    /must be encrypted/,
  );

  const encryptedValue = encryptWorkspaceSecret("provider-api-key", "workspace-encryption-key");
  await repository.settings.put({
    group: "provider",
    isSecret: true,
    key: "provider:demo:apiKey",
    updatedAt: "2026-06-27T00:00:00.000Z",
    value: encryptedValue,
  });

  assert.deepEqual(writes[0], ["workspace_1", "provider:demo:apiKey", "provider", encryptedValue, true]);
});

test("PostgreSQL voice profile repository scopes profile rows", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => {
      queries.push({ text, values });
      if (text.startsWith("select profile from voice_profiles")) {
        return typedQueryResult<T>([{ profile: {
          createdAt: "2026-06-27T00:00:00.000Z",
          id: "voice_profile_1",
          name: "Narration Voice",
          provider: "mimo",
          referenceAudioAssetIds: ["asset_audio_1"],
          source: "cloned",
          tags: [],
          updatedAt: "2026-06-27T00:00:00.000Z",
        } }]);
      }
      return typedQueryResult<T>([]);
    },
  };
  const repository = createPostgresWorkspaceStorageRepository(
    queryable,
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    "workspace_1",
  );

  const records = await repository.voiceProfiles.list({ limit: 20, offset: 5 });
  await repository.voiceProfiles.delete("voice_profile_1");

  assert.deepEqual(records.map(record => record.profile.id), ["voice_profile_1"]);
  assert.deepEqual(
    queries.find(query => query.text.startsWith("select profile from voice_profiles"))?.values,
    ["workspace_1", 20, 5],
  );
  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from voice_profiles"))?.values,
    ["workspace_1", "voice_profile_1"],
  );
});
