import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import {
  hashTeamCsrfToken,
  hashTeamPassword,
  hashTeamSessionToken,
} from "../lib/storage/team-auth";
import { createTeamSession, deleteTeamSession } from "../lib/storage/team-session";
import { DELETE as deleteSession, POST as postSession } from "../app/api/storage/team/session/route";

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

test("createTeamSession verifies credentials and stores hashed session and CSRF tokens", async () => {
  const passwordHash = await hashTeamPassword("a long login password");
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from users")) {
        return typedQueryResult<T>([{
          email: "owner@example.com",
          password_hash: passwordHash,
          role: "owner",
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: "workspace_1",
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };

  const result = await createTeamSession(
    queryable,
    { email: " OWNER@Example.COM ", password: "a long login password" },
    new Date("2026-06-26T00:00:00.000Z"),
  );

  assert.equal(result.email, "owner@example.com");
  assert.equal(result.role, "owner");
  assert.equal(result.sessionTokenExpiresAt.toISOString(), "2026-07-03T00:00:00.000Z");
  assert.deepEqual(queries[0].values, ["owner@example.com"]);
  assert.equal(queries[1].text, "begin");
  assert.equal(queries.at(-1)?.text, "commit");
  const sessionInsert = queries.find(query => query.text.startsWith("insert into sessions"));
  assert.equal(sessionInsert?.values?.[0], hashTeamSessionToken(result.sessionToken));
  const csrfInsert = queries.find(query => query.text.startsWith("insert into csrf_tokens"));
  assert.equal(csrfInsert?.values?.[0], hashTeamCsrfToken(result.csrfToken));
  assert.equal(csrfInsert?.values?.[1], hashTeamSessionToken(result.sessionToken));
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), ["workspace_1", "user_1", "team_session.login"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    email: "owner@example.com",
    role: "owner",
  });
});

test("createTeamSession rejects invalid credentials before inserting session rows", async () => {
  const passwordHash = await hashTeamPassword("a long login password");
  const queries: string[] = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string) => {
      queries.push(text);
      if (text.includes("from users")) {
        return typedQueryResult<T>([{
          email: "owner@example.com",
          password_hash: passwordHash,
          role: "owner",
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: "workspace_1",
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };

  await assert.rejects(
    () => createTeamSession(queryable, { email: "owner@example.com", password: "wrong password" }),
    (error: unknown) => error instanceof ApiError && error.status === 401 && error.code === "invalid_credentials",
  );
  assert.equal(queries.filter(text => text.startsWith("insert into sessions")).length, 0);
});

test("deleteTeamSession removes the hashed current session token", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "owner@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: "owner",
          session_id: hashTeamSessionToken("raw-session-token"),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: "workspace_1",
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };

  await deleteTeamSession(queryable, new Request("http://localhost:3000/api/storage/team/session", {
    headers: { cookie: "imagine_team_session=raw-session-token" },
  }));

  const deleteQuery = queries.find(query => query.text.startsWith("delete from sessions"));
  assert.deepEqual(deleteQuery, {
    text: "delete from sessions where id = $1",
    values: [hashTeamSessionToken("raw-session-token")],
  });
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), ["workspace_1", "user_1", "team_session.logout"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    email: "owner@example.com",
    role: "owner",
  });
  assert.equal(queries.at(-1)?.text, "commit");
  await assert.rejects(
    () => deleteTeamSession(queryable, new Request("http://localhost:3000/api/storage/team/session")),
    (error: unknown) => error instanceof ApiError && error.status === 401 && error.code === "unauthorized",
  );
});

test("team session route rejects malformed login JSON and invalid logout CSRF before database access", async () => {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";

    const loginResponse = await postSession(new Request("http://localhost:3000/api/storage/team/session", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: "{",
    }));
    assert.equal(loginResponse.status, 400);
    assert.deepEqual(await loginResponse.json(), {
      code: "invalid_team_session_request",
      error: "Invalid team session request",
    });

    const logoutResponse = await deleteSession(new Request("http://localhost:3000/api/storage/team/session", {
      method: "DELETE",
      headers: {
        cookie: "imagine_team_csrf=token",
        origin: "http://localhost:3000",
        "x-imagine-csrf-token": "other",
      },
    }));
    assert.equal(logoutResponse.status, 403);
    assert.deepEqual(await logoutResponse.json(), {
      code: "invalid_csrf",
      error: "Valid CSRF token is required",
    });
  } finally {
    restoreEnv("APP_URL", originalEnv.APP_URL);
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
