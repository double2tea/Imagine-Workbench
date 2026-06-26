import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { createTeamWorkspaceStorageContext } from "../lib/storage/team-context";
import { hashTeamSessionToken } from "../lib/storage/team-auth";

const RAW_SESSION_TOKEN = "raw-session-token";

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

test("createTeamWorkspaceStorageContext scopes repository to the session workspace", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const queryable = createSessionQueryable("workspace_1", "editor", queries);

  const context = await createTeamWorkspaceStorageContext(
    queryable,
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { minimumRole: "editor" },
  );

  assert.equal(context.targetKind, "postgres");
  assert.equal(context.session.workspaceId, "workspace_1");
  assert.equal(context.repository.targetKind, "postgres");
  await context.repository.assets.get("asset_1");
  assert.deepEqual(
    queries.find(query => query.text.startsWith("select meta from assets"))?.values,
    ["workspace_1", "asset_1"],
  );
});

test("createTeamWorkspaceStorageContext enforces the requested minimum role", async () => {
  await assert.rejects(
    () => createTeamWorkspaceStorageContext(
      createSessionQueryable("workspace_1", "viewer"),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      { minimumRole: "editor" },
    ),
    (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === "forbidden",
  );
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createSessionQueryable(
  workspaceId: string,
  role: "owner" | "admin" | "editor" | "viewer",
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "member@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role,
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: workspaceId,
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };
}
