import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { decryptWorkspaceSecret, isEncryptedWorkspaceSecret } from "../lib/storage/team-secret-crypto";
import {
  deleteTeamSecret,
  listTeamSecrets,
  saveTeamSecret,
} from "../lib/storage/team-secrets";
import { POST as postTeamSecret } from "../app/api/storage/team/secrets/route";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const ENCRYPTION_KEY = "workspace-secret-encryption-key";

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

test("listTeamSecrets returns admin-scoped statuses without secret values", async () => {
  const result = await listTeamSecrets(
    createTeamSecretsQueryable(),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { groups: ["provider"], keys: ["provider:demo:apiKey"] },
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.deepEqual(result.secrets, [{
    configured: true,
    group: "provider",
    key: "provider:demo:apiKey",
    updatedAt: "2026-06-27T00:00:00.000Z",
  }]);
  assert.equal("value" in result.secrets[0], false);
});

test("saveTeamSecret encrypts the value before writing settings", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await saveTeamSecret(
    createTeamSecretsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { group: "provider", key: " provider:demo:apiKey ", value: "provider-api-key" },
    ENCRYPTION_KEY,
  );

  const write = queries.find(query => query.text.includes("insert into settings"));
  const encryptedValue = String(write?.values?.[3]);
  assert.equal(result.secret.configured, true);
  assert.equal(result.secret.key, "provider:demo:apiKey");
  assert.equal(isEncryptedWorkspaceSecret(encryptedValue), true);
  assert.equal(decryptWorkspaceSecret(encryptedValue, ENCRYPTION_KEY), "provider-api-key");
  assert.deepEqual(write?.values?.slice(0, 3), [WORKSPACE_ID, "provider:demo:apiKey", "provider"]);
  assert.equal(write?.values?.[4], true);
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, "user_1", "team_secret.save"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    group: "provider",
    key: "provider:demo:apiKey",
  });
});

test("deleteTeamSecret removes an admin-scoped setting key", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamSecret(
    createTeamSecretsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    " provider:demo:apiKey ",
  );

  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from settings"))?.values,
    [WORKSPACE_ID, "provider:demo:apiKey"],
  );
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, "user_1", "team_secret.delete"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    key: "provider:demo:apiKey",
  });
});

test("team secret service requires admin access", async () => {
  await assert.rejects(
    () => listTeamSecrets(
      createTeamSecretsQueryable([], { role: "editor" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
    ),
    (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === "forbidden",
  );
});

test("team secret save route rejects missing CSRF before opening a database client", async () => {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
    IMAGINE_TEAM_SECRET_ENCRYPTION_KEY: process.env.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";
    process.env.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY = ENCRYPTION_KEY;

    const response = await postTeamSecret(new Request("http://localhost:3000/api/storage/team/secrets", {
      body: JSON.stringify({ group: "provider", key: "provider:demo:apiKey", value: "provider-api-key" }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      method: "POST",
    }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "invalid_csrf",
      error: "Valid CSRF token is required",
    });
  } finally {
    restoreEnv("APP_URL", originalEnv.APP_URL);
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
    restoreEnv("IMAGINE_TEAM_SECRET_ENCRYPTION_KEY", originalEnv.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY);
  }
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/secrets", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamSecretsQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: { role?: "owner" | "admin" | "editor" | "viewer" } = {},
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "admin@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: options.role ?? "admin",
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.startsWith("select key")) {
        return typedQueryResult<T>([
          settingRow("provider:demo:apiKey", "provider", true),
          settingRow("ui:theme", "ui", false),
        ]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function settingRow(key: string, group: string, isSecret: boolean): QueryResultRow {
  return {
    group_name: group,
    is_secret: isSecret,
    key,
    updated_at: "2026-06-27T00:00:00.000Z",
    value_text: isSecret ? "encrypted-value" : "plain-value",
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
