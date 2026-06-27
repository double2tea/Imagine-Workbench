import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken, verifyTeamPassword } from "../lib/storage/team-auth";
import {
  createTeamMember,
  deleteTeamMember,
  listTeamMembers,
  updateTeamMemberRole,
} from "../lib/storage/team-members";
import type { PublicTeamMember } from "../lib/storage/team-member-types";
import { DELETE as deleteMember, PATCH as patchMember } from "../app/api/storage/team/members/[userId]/route";
import { POST as postMember } from "../app/api/storage/team/members/route";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const TEAM_ID = "team_1";
const CURRENT_USER_ID = "user_admin";
const TARGET_USER_ID = "user_2";

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

test("listTeamMembers returns admin-scoped public members", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await listTeamMembers(
    createTeamMembersQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.deepEqual(result.members.map(member => member.email), ["owner@example.com", "editor@example.com"]);
  assert.deepEqual(
    queries.find(query => query.values?.length === 1 && query.values[0] === TEAM_ID)?.values,
    [TEAM_ID],
  );
});

test("createTeamMember hashes the password and creates a manageable role membership", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await createTeamMember(
    createTeamMembersQueryable(queries, { insertedUserId: TARGET_USER_ID }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { email: " EDITOR@Example.COM ", password: "a long member password", role: "editor" },
  );

  assert.equal(result.member.email, "editor@example.com");
  assert.equal(result.member.role, "editor");
  const userInsert = queries.find(query => query.text.startsWith("insert into users"));
  assert.deepEqual(userInsert?.values?.slice(0, 1), ["editor@example.com"]);
  assert.equal(await verifyTeamPassword("a long member password", String(userInsert?.values?.[1])), true);
  const membershipInsert = queries.find(query => query.text.startsWith("insert into team_memberships"));
  assert.deepEqual(membershipInsert?.values, [TEAM_ID, TARGET_USER_ID, "editor", "editor@example.com"]);
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, CURRENT_USER_ID, "team_member.create"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    email: "editor@example.com",
    role: "editor",
    targetUserId: TARGET_USER_ID,
  });
  assert.equal(queries.at(-1)?.text, "commit");
});

test("createTeamMember rejects duplicate emails with rollback", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];

  await assert.rejects(
    () => createTeamMember(
      createTeamMembersQueryable(queries, { existingEmailUserId: TARGET_USER_ID }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      { email: "editor@example.com", password: "a long member password", role: "editor" },
    ),
    (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "team_member_email_exists",
  );
  assert.equal(queries.at(-1)?.text, "rollback");
});

test("updateTeamMemberRole updates non-owner members and rejects self or owner changes", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await updateTeamMemberRole(
    createTeamMembersQueryable(queries, { targetRole: "editor", updatedRole: "viewer" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    TARGET_USER_ID,
    { role: "viewer" },
  );

  assert.equal(result.member.role, "viewer");
  assert.deepEqual(
    queries.find(query => query.text.startsWith("update team_memberships"))?.values,
    [TEAM_ID, TARGET_USER_ID, "viewer"],
  );
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, CURRENT_USER_ID, "team_member.update_role"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    previousRole: "editor",
    role: "viewer",
    targetUserId: TARGET_USER_ID,
  });
  assert.equal(queries.at(-1)?.text, "commit");

  await assert.rejects(
    () => updateTeamMemberRole(
      createTeamMembersQueryable([], { targetRole: "owner" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      TARGET_USER_ID,
      { role: "viewer" },
    ),
    (error: unknown) => error instanceof ApiError && error.status === 400 && error.code === "team_owner_role_immutable",
  );
  await assert.rejects(
    () => updateTeamMemberRole(
      createTeamMembersQueryable([]),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      CURRENT_USER_ID,
      { role: "viewer" },
    ),
    (error: unknown) => error instanceof ApiError && error.status === 400 && error.code === "team_member_self_update_unsupported",
  );
});

test("deleteTeamMember removes membership and sessions for non-owner members", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamMember(
    createTeamMembersQueryable(queries, { targetRole: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    TARGET_USER_ID,
  );

  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from team_memberships"))?.values,
    [TEAM_ID, TARGET_USER_ID],
  );
  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from sessions"))?.values,
    [TARGET_USER_ID],
  );
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, CURRENT_USER_ID, "team_member.delete"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    previousRole: "editor",
    targetUserId: TARGET_USER_ID,
  });
  assert.equal(queries.at(-1)?.text, "commit");
});

test("team member routes reject invalid CSRF before opening a database client", async () => {
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

    const createResponse = await postMember(new Request("http://localhost:3000/api/storage/team/members", {
      body: JSON.stringify({ email: "editor@example.com", password: "a long member password", role: "editor" }),
      headers: {
        cookie: "imagine_team_csrf=token",
        origin: "http://localhost:3000",
      },
      method: "POST",
    }));
    assert.equal(createResponse.status, 403);
    assert.deepEqual(await createResponse.json(), {
      code: "invalid_csrf",
      error: "Valid CSRF token is required",
    });

    const context = routeContext(TARGET_USER_ID);
    const updateResponse = await patchMember(new Request("http://localhost:3000/api/storage/team/members/user_2", {
      body: JSON.stringify({ role: "viewer" }),
      headers: {
        cookie: "imagine_team_csrf=token",
        origin: "http://localhost:3000",
      },
      method: "PATCH",
    }), context);
    assert.equal(updateResponse.status, 403);

    const deleteResponse = await deleteMember(new Request("http://localhost:3000/api/storage/team/members/user_2", {
      headers: {
        cookie: "imagine_team_csrf=token",
        origin: "http://localhost:3000",
      },
      method: "DELETE",
    }), context);
    assert.equal(deleteResponse.status, 403);
  } finally {
    restoreEnv("APP_URL", originalEnv.APP_URL);
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/members", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function routeContext(userId: string): { params: Promise<{ userId: string }> } {
  return { params: Promise.resolve({ userId }) };
}

function createTeamMembersQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }>,
  options: {
    existingEmailUserId?: string;
    insertedUserId?: string;
    targetRole?: PublicTeamMember["role"];
    updatedRole?: PublicTeamMember["role"];
  } = {},
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text === "begin" || text === "commit" || text === "rollback") return typedQueryResult<T>([]);
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "admin@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: "admin",
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: TEAM_ID,
          user_id: CURRENT_USER_ID,
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.includes("order by team_memberships.created_at")) {
        return typedQueryResult<T>([
          memberRow("user_owner", "owner@example.com", "owner"),
          memberRow(TARGET_USER_ID, "editor@example.com", "editor"),
        ]);
      }
      if (text === "select id from users where email = $1") {
        return typedQueryResult<T>(options.existingEmailUserId ? [{ id: options.existingEmailUserId }] : []);
      }
      if (text.startsWith("insert into users")) {
        return typedQueryResult<T>([{ id: options.insertedUserId ?? TARGET_USER_ID }]);
      }
      if (text.startsWith("insert into team_memberships")) {
        return typedQueryResult<T>([memberRow(TARGET_USER_ID, String(values?.[3]), String(values?.[2]))]);
      }
      if (text.includes("where team_memberships.team_id = $1 and team_memberships.user_id = $2")) {
        return typedQueryResult<T>([memberRow(TARGET_USER_ID, "editor@example.com", options.targetRole ?? "editor")]);
      }
      if (text.startsWith("update team_memberships")) {
        return typedQueryResult<T>([memberRow(TARGET_USER_ID, "editor@example.com", options.updatedRole ?? "viewer")]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function memberRow(userId: string, email: string, role: string): QueryResultRow {
  return {
    created_at: "2026-06-27T00:00:00.000Z",
    email,
    role,
    user_id: userId,
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
