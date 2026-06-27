import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { encryptWorkspaceSecret } from "../lib/storage/team-secret-crypto";
import { readTeamProviderApiKey, readTeamProviderConfigOverrides } from "../lib/providers/team-config";

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

test("readTeamProviderApiKey decrypts the workspace provider secret", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await readTeamProviderApiKey(
    createTeamProviderConfigQueryable(queries, {
      ciphertext: encryptWorkspaceSecret("runninghub-team-key", ENCRYPTION_KEY),
      role: "editor",
    }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    "runninghub",
    ENCRYPTION_KEY,
    "editor",
  );

  assert.equal(result, "runninghub-team-key");
  assert.deepEqual(
    queries.find(query => query.text.includes("from settings where workspace_id"))?.values,
    [WORKSPACE_ID, "provider:runninghub:apiKey"],
  );
});

test("readTeamProviderConfigOverrides reads encrypted key and non-secret base URL", async () => {
  const result = await readTeamProviderConfigOverrides(
    createTeamProviderConfigQueryable([], {
      baseUrl: "https://runninghub.example.test",
      ciphertext: encryptWorkspaceSecret("runninghub-team-key", ENCRYPTION_KEY),
      role: "editor",
    }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    "runninghub",
    ENCRYPTION_KEY,
    "editor",
  );

  assert.deepEqual(result, {
    apiKey: "runninghub-team-key",
    baseUrl: "https://runninghub.example.test",
    providerLabel: undefined,
  });
});

test("readTeamProviderConfigOverrides reads custom provider definition fallback", async () => {
  const result = await readTeamProviderConfigOverrides(
    createTeamProviderConfigQueryable([], {
      ciphertext: encryptWorkspaceSecret("custom-provider-key", ENCRYPTION_KEY),
      customProviders: JSON.stringify([
        { key: "custom-openai", label: "Custom OpenAI", baseUrl: "https://custom.example.test/v1" },
      ]),
      role: "editor",
    }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    "custom-openai",
    ENCRYPTION_KEY,
    "editor",
  );

  assert.deepEqual(result, {
    apiKey: "custom-provider-key",
    baseUrl: "https://custom.example.test/v1",
    providerLabel: "Custom OpenAI",
  });
});

test("readTeamProviderApiKey requires the requested team role", async () => {
  await assert.rejects(
    () => readTeamProviderApiKey(
      createTeamProviderConfigQueryable([], {
        ciphertext: encryptWorkspaceSecret("runninghub-team-key", ENCRYPTION_KEY),
        role: "viewer",
      }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      "runninghub",
      ENCRYPTION_KEY,
      "editor",
    ),
    (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === "forbidden",
  );
});

test("readTeamProviderApiKey rejects non-secret provider settings", async () => {
  await assert.rejects(
    () => readTeamProviderApiKey(
      createTeamProviderConfigQueryable([], {
        ciphertext: "plain-provider-key",
        isSecret: false,
        role: "editor",
      }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      "runninghub",
      ENCRYPTION_KEY,
      "editor",
    ),
    /Team runninghub API key must be stored as an encrypted secret/,
  );
});

test("readTeamProviderConfigOverrides rejects secret base URL settings", async () => {
  await assert.rejects(
    () => readTeamProviderConfigOverrides(
      createTeamProviderConfigQueryable([], {
        baseUrl: "https://runninghub.example.test",
        baseUrlIsSecret: true,
        ciphertext: encryptWorkspaceSecret("runninghub-team-key", ENCRYPTION_KEY),
        role: "editor",
      }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      "runninghub",
      ENCRYPTION_KEY,
      "editor",
    ),
    /Team runninghub Base URL must be stored as a non-secret setting/,
  );
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/media/generate-image", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamProviderConfigQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }>,
  options: {
    baseUrl?: string;
    baseUrlIsSecret?: boolean;
    ciphertext: string;
    customProviders?: string;
    isSecret?: boolean;
    role: "owner" | "admin" | "editor" | "viewer";
  },
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "member@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: options.role,
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.includes("from settings")) {
        const key = String(values?.[1] ?? "");
        if (key === "provider:runninghub:baseUrl" && options.baseUrl !== undefined) {
          return typedQueryResult<T>([settingRow(key, options.baseUrl, options.baseUrlIsSecret ?? false)]);
        }
        if (key === "provider:custom-openai:baseUrl" && options.baseUrl !== undefined) {
          return typedQueryResult<T>([settingRow(key, options.baseUrl, options.baseUrlIsSecret ?? false)]);
        }
        if (key === "provider:customProviders" && options.customProviders !== undefined) {
          return typedQueryResult<T>([settingRow(key, options.customProviders, false)]);
        }
        if (!key.endsWith(":apiKey")) return typedQueryResult<T>([]);
        return typedQueryResult<T>([{
          group_name: "provider",
          is_secret: options.isSecret ?? true,
          key,
          updated_at: "2026-06-27T00:00:00.000Z",
          value_text: options.ciphertext,
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function settingRow(key: string, value: string, isSecret: boolean): QueryResultRow {
  return {
    group_name: "provider",
    is_secret: isSecret,
    key,
    updated_at: "2026-06-27T00:00:00.000Z",
    value_text: value,
  };
}
