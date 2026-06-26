import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTeamRole,
  assertTrustedTeamRequestOrigin,
  hashTeamPassword,
  hashTeamSessionToken,
  requireTeamSession,
  serializeTeamCsrfCookie,
  serializeTeamSessionCookie,
  verifyTeamPassword,
} from "../lib/storage/team-auth";

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

test("team password hashes verify matching passwords only", async () => {
  const passwordHash = await hashTeamPassword("a long team password");

  assert.match(passwordHash, /^scrypt:v1:/);
  assert.equal(await verifyTeamPassword("a long team password", passwordHash), true);
  assert.equal(await verifyTeamPassword("a different team password", passwordHash), false);
  await assert.rejects(() => hashTeamPassword("short"), /at least 12 characters/);
});

test("team cookies are http-only for sessions and secure on https app URLs", () => {
  const expiresAt = new Date("2026-06-26T00:00:00.000Z");

  assert.equal(
    serializeTeamSessionCookie("session token", expiresAt, "https://team.example.com"),
    "imagine_team_session=session%20token; Path=/; Expires=Fri, 26 Jun 2026 00:00:00 GMT; SameSite=Lax; HttpOnly; Secure",
  );
  assert.equal(
    serializeTeamCsrfCookie("csrf token", expiresAt, "http://localhost:3000"),
    "imagine_team_csrf=csrf%20token; Path=/; Expires=Fri, 26 Jun 2026 00:00:00 GMT; SameSite=Lax",
  );
});

test("team origin and CSRF checks reject untrusted mutating requests", () => {
  assert.doesNotThrow(() => assertTrustedTeamRequestOrigin(
    new Request("http://localhost:3000/api/storage/team", { headers: { origin: "http://localhost:3000" } }),
    { APP_URL: "http://localhost:3000" },
  ));
  assert.doesNotThrow(() => assertTrustedTeamRequestOrigin(
    new Request("http://localhost:3000/api/storage/team", { headers: { origin: "https://admin.example.com" } }),
    { APP_URL: "http://localhost:3000", IMAGINE_TRUSTED_ORIGINS: "https://admin.example.com" },
  ));
  assert.throws(
    () => assertTrustedTeamRequestOrigin(
      new Request("http://localhost:3000/api/storage/team", { headers: { origin: "https://evil.example.com" } }),
      { APP_URL: "http://localhost:3000" },
    ),
    (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === "untrusted_origin",
  );
  assert.doesNotThrow(() => assertTeamCsrf(new Request("http://localhost:3000/api/storage/team", {
    headers: {
      cookie: "imagine_team_csrf=token",
      "x-imagine-csrf-token": "token",
    },
  })));
  assert.throws(
    () => assertTeamCsrf(new Request("http://localhost:3000/api/storage/team", {
      headers: {
        cookie: "imagine_team_csrf=token",
        "x-imagine-csrf-token": "other",
      },
    })),
    (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === "invalid_csrf",
  );
});

test("requireTeamSession resolves a hashed session token and workspace role", async () => {
  const rawToken = "raw-session-token";
  const queries: unknown[][] = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(_text: string, values?: unknown[]) => {
      queries.push(values ?? []);
      return typedQueryResult<T>([{
        email: "owner@example.com",
        expires_at: "2026-06-26T00:00:00.000Z",
        role: "owner",
        session_id: hashTeamSessionToken(rawToken),
        team_id: "team_1",
        user_id: "user_1",
        workspace_id: "workspace_1",
      }]);
    },
  };

  const context = await requireTeamSession(
    queryable,
    new Request("http://localhost:3000/api/storage/team", { headers: { cookie: `imagine_team_session=${rawToken}` } }),
    "workspace_1",
  );

  assert.equal(context.email, "owner@example.com");
  assert.equal(context.role, "owner");
  assert.deepEqual(queries[0], [hashTeamSessionToken(rawToken), "workspace_1"]);
});

test("requireTeamSession and role checks fail closed", async () => {
  const emptyQueryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>() => typedQueryResult<T>([]),
  };

  await assert.rejects(
    () => requireTeamSession(emptyQueryable, new Request("http://localhost:3000/api/storage/team")),
    (error: unknown) => error instanceof ApiError && error.status === 401 && error.code === "unauthorized",
  );
  assert.throws(
    () => assertTeamRole({
      email: "viewer@example.com",
      expiresAt: "2026-06-26T00:00:00.000Z",
      role: "viewer",
      sessionId: "session_1",
      teamId: "team_1",
      userId: "user_1",
      workspaceId: "workspace_1",
    }, "editor"),
    (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === "forbidden",
  );
});
