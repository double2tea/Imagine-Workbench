import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { bootstrapFirstTeamOwner } from "../lib/storage/team-bootstrap";
import { hashTeamCsrfToken, hashTeamSessionToken, verifyTeamPassword } from "../lib/storage/team-auth";
import { resetTeamRateLimitsForTests } from "../lib/storage/team-rate-limit";
import { POST as bootstrapPost } from "../app/api/storage/team/bootstrap/route";

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

test("bootstrapFirstTeamOwner creates the first workspace team owner session and CSRF token", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.startsWith("select exists")) return typedQueryResult<T>([{ owner_exists: false }]);
      if (text.startsWith("insert into workspaces")) return typedQueryResult<T>([{ id: "workspace_1" }]);
      if (text.startsWith("insert into users")) return typedQueryResult<T>([{ id: "user_1" }]);
      if (text.startsWith("insert into teams")) return typedQueryResult<T>([{ id: "team_1" }]);
      return typedQueryResult<T>([]);
    },
  };

  const result = await bootstrapFirstTeamOwner(queryable, {
    appUrl: "http://localhost:3000",
    email: " OWNER@Example.COM ",
    password: "a long bootstrap password",
  }, new Date("2026-06-26T00:00:00.000Z"));

  assert.equal(result.email, "owner@example.com");
  assert.equal(result.role, "owner");
  assert.equal(result.workspaceId, "workspace_1");
  assert.equal(result.userId, "user_1");
  assert.equal(result.teamId, "team_1");
  assert.equal(result.sessionTokenExpiresAt.toISOString(), "2026-07-03T00:00:00.000Z");
  assert.equal(queries[0].text, "begin");
  assert.equal(queries.at(-1)?.text, "commit");

  const userInsert = queries.find(query => query.text.startsWith("insert into users"));
  assert.equal(userInsert?.values?.[0], "owner@example.com");
  assert.equal(await verifyTeamPassword("a long bootstrap password", String(userInsert?.values?.[1])), true);

  const sessionInsert = queries.find(query => query.text.startsWith("insert into sessions"));
  assert.equal(sessionInsert?.values?.[0], hashTeamSessionToken(result.sessionToken));
  const csrfInsert = queries.find(query => query.text.startsWith("insert into csrf_tokens"));
  assert.equal(csrfInsert?.values?.[0], hashTeamCsrfToken(result.csrfToken));
  assert.equal(csrfInsert?.values?.[1], hashTeamSessionToken(result.sessionToken));
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), ["workspace_1", "user_1", "team_bootstrap.owner"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    email: "owner@example.com",
    teamId: "team_1",
    workspaceId: "workspace_1",
  });
});

test("bootstrapFirstTeamOwner fails closed when an owner already exists", async () => {
  const queries: string[] = [];
  const queryable: PostgresQueryable = {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string) => {
      queries.push(text);
      if (text.startsWith("select exists")) return typedQueryResult<T>([{ owner_exists: true }]);
      return typedQueryResult<T>([]);
    },
  };

  await assert.rejects(
    () => bootstrapFirstTeamOwner(queryable, {
      appUrl: "http://localhost:3000",
      email: "owner@example.com",
      password: "a long bootstrap password",
    }),
    /already exists/,
  );
  assert.deepEqual(queries, [
    "begin",
    "select exists (select 1 from team_memberships where role = 'owner') as owner_exists",
    "rollback",
  ]);
});

test("team bootstrap route fails before database access without setup token", async () => {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
    IMAGINE_TEAM_SETUP_TOKEN: process.env.IMAGINE_TEAM_SETUP_TOKEN,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";
    delete process.env.IMAGINE_TEAM_SETUP_TOKEN;

    const response = await bootstrapPost(new Request("http://localhost:3000/api/storage/team/bootstrap", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "owner@example.com", password: "a long bootstrap password" }),
    }));

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "internal_error",
      error: "IMAGINE_TEAM_SETUP_TOKEN is required for team storage migrations",
    });
  } finally {
    restoreEnv("APP_URL", originalEnv.APP_URL);
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
    restoreEnv("IMAGINE_TEAM_SETUP_TOKEN", originalEnv.IMAGINE_TEAM_SETUP_TOKEN);
  }
});

test("team bootstrap route rejects malformed request JSON", async () => {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
    IMAGINE_TEAM_SETUP_TOKEN: process.env.IMAGINE_TEAM_SETUP_TOKEN,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";
    process.env.IMAGINE_TEAM_SETUP_TOKEN = "setup-token";

    const response = await bootstrapPost(new Request("http://localhost:3000/api/storage/team/bootstrap", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "x-imagine-setup-token": "setup-token",
      },
      body: "{",
    }));

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "invalid_bootstrap_request",
      error: "Invalid team bootstrap request",
    });
  } finally {
    restoreEnv("APP_URL", originalEnv.APP_URL);
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
    restoreEnv("IMAGINE_TEAM_SETUP_TOKEN", originalEnv.IMAGINE_TEAM_SETUP_TOKEN);
  }
});

test("team bootstrap route rate-limits invalid setup token attempts with generic errors", async () => {
  resetTeamRateLimitsForTests();
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
    IMAGINE_TEAM_SETUP_TOKEN: process.env.IMAGINE_TEAM_SETUP_TOKEN,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";
    process.env.IMAGINE_TEAM_SETUP_TOKEN = "setup-token";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await bootstrapPost(invalidSetupTokenRequest());
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        code: "team_bootstrap_failed",
        error: "Team bootstrap failed",
      });
    }

    const limitedResponse = await bootstrapPost(invalidSetupTokenRequest());
    assert.equal(limitedResponse.status, 429);
    assert.deepEqual(await limitedResponse.json(), {
      code: "team_rate_limited",
      error: "Too many attempts. Try again later.",
    });
  } finally {
    resetTeamRateLimitsForTests();
    restoreEnv("APP_URL", originalEnv.APP_URL);
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
    restoreEnv("IMAGINE_TEAM_SETUP_TOKEN", originalEnv.IMAGINE_TEAM_SETUP_TOKEN);
  }
});

function invalidSetupTokenRequest(): Request {
  return new Request("http://localhost:3000/api/storage/team/bootstrap", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "x-forwarded-for": "192.168.1.20",
      "x-imagine-setup-token": "wrong-token",
    },
    body: JSON.stringify({ email: "owner@example.com", password: "a long bootstrap password" }),
  });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
