import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { encryptWorkspaceSecret } from "../lib/storage/team-secret-crypto";
import { readTeamProviderApiKey } from "../lib/providers/team-config";

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

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/media/generate-image", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamProviderConfigQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }>,
  options: {
    ciphertext: string;
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
        return typedQueryResult<T>([{
          group_name: "provider",
          is_secret: options.isSecret ?? true,
          key: "provider:runninghub:apiKey",
          updated_at: "2026-06-27T00:00:00.000Z",
          value_text: options.ciphertext,
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };
}
