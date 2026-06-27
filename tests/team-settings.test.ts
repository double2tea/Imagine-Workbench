import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import {
  deleteTeamSetting,
  listTeamSettings,
  saveTeamSetting,
} from "../lib/storage/team-settings";
import {
  deleteTeamSetting as deleteTeamSettingClient,
  fetchTeamSettings,
  saveTeamSetting as saveTeamSettingClient,
} from "../lib/storage/team-client";
import { POST as postTeamSetting } from "../app/api/storage/team/settings/route";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const SETTING_KEY = "provider:demo:baseUrl";

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

test("listTeamSettings returns admin-scoped non-secret settings", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await listTeamSettings(
    createTeamSettingsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { groups: ["provider"], keys: [SETTING_KEY] },
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.deepEqual(result.settings, [{
    group: "provider",
    key: SETTING_KEY,
    updatedAt: "2026-06-27T00:00:00.000Z",
    value: "https://provider.example.test",
  }]);
  assert.deepEqual(
    queries.find(query => query.text.includes("from settings") && query.text.includes("order by key"))?.values,
    [WORKSPACE_ID, [SETTING_KEY], ["provider"]],
  );
});

test("saveTeamSetting writes a non-secret setting and audit event", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await saveTeamSetting(
    createTeamSettingsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { group: "provider", key: ` ${SETTING_KEY} `, value: "https://provider.example.test" },
  );

  const write = queries.find(query => query.text.includes("insert into settings"));
  assert.equal(result.setting.key, SETTING_KEY);
  assert.deepEqual(write?.values, [WORKSPACE_ID, SETTING_KEY, "provider", "https://provider.example.test", false]);
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, "user_1", "team_setting.save"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    group: "provider",
    key: SETTING_KEY,
  });
});

test("deleteTeamSetting removes a non-secret setting with audit", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamSetting(
    createTeamSettingsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    ` ${SETTING_KEY} `,
  );

  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from settings"))?.values,
    [WORKSPACE_ID, SETTING_KEY],
  );
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, "user_1", "team_setting.delete"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, { key: SETTING_KEY });
});

test("deleteTeamSetting refuses to delete secret settings", async () => {
  await assert.rejects(
    () => deleteTeamSetting(
      createTeamSettingsQueryable([], { existingSecret: true }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      SETTING_KEY,
    ),
    (error: unknown) => error instanceof ApiError && error.status === 400 && error.code === "team_setting_secret_unsupported",
  );
});

test("team setting save route rejects missing CSRF before opening a database client", async () => {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES = "1048576";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";

    const response = await postTeamSetting(new Request("http://localhost:3000/api/storage/team/settings", {
      body: JSON.stringify({ group: "provider", key: SETTING_KEY, value: "https://provider.example.test" }),
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
    restoreEnv("IMAGINE_MAX_MEDIA_PAYLOAD_BYTES", originalEnv.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

test("team setting client sends filters and rejects secret-shaped responses", async () => {
  let listUrl = "";
  const listResult = await fetchTeamSettings({
    groups: ["provider"],
    keys: [SETTING_KEY, "key with spaces"],
  }, async input => {
    listUrl = String(input);
    return Response.json({
      settings: [{
        group: "provider",
        key: SETTING_KEY,
        updatedAt: "2026-06-27T00:00:00.000Z",
        value: "https://provider.example.test",
      }],
      targetKind: "postgres",
      workspaceId: WORKSPACE_ID,
    });
  });

  assert.equal(
    listUrl,
    "/api/storage/team/settings?group=provider&key=provider%3Ademo%3AbaseUrl&key=key+with+spaces",
  );
  assert.equal(listResult.settings[0]?.value, "https://provider.example.test");

  await assert.rejects(
    fetchTeamSettings(undefined, async () => Response.json({
      settings: [{
        group: "provider",
        isSecret: true,
        key: SETTING_KEY,
        updatedAt: "2026-06-27T00:00:00.000Z",
        value: "leaked-secret",
      }],
      targetKind: "postgres",
      workspaceId: WORKSPACE_ID,
    })),
    /Team setting list response is invalid/,
  );

  let saveCsrfHeader: string | null = null;
  let saveBody = "";
  const saveResult = await saveTeamSettingClient({
    group: "provider",
    key: SETTING_KEY,
    value: "https://provider.example.test",
  }, "csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/settings");
    assert.equal(init?.method, "POST");
    saveCsrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    saveBody = String(init?.body);
    return Response.json({
      setting: {
        group: "provider",
        key: SETTING_KEY,
        updatedAt: "2026-06-27T00:00:00.000Z",
        value: "https://provider.example.test",
      },
      targetKind: "postgres",
      workspaceId: WORKSPACE_ID,
    });
  });
  assert.equal(saveCsrfHeader, "csrf-token");
  assert.equal(saveBody, JSON.stringify({
    group: "provider",
    key: SETTING_KEY,
    value: "https://provider.example.test",
  }));
  assert.equal(saveResult.setting.key, SETTING_KEY);

  let deleteUrl = "";
  await deleteTeamSettingClient("provider/base url", "csrf-token", async (input, init) => {
    deleteUrl = String(input);
    assert.equal(init?.method, "DELETE");
    assert.equal(new Headers(init?.headers).get("x-imagine-csrf-token"), "csrf-token");
    return Response.json({ ok: true });
  });
  assert.equal(deleteUrl, "/api/storage/team/settings/provider%2Fbase%20url");
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/settings", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamSettingsQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: { existingSecret?: boolean; role?: "owner" | "admin" | "editor" | "viewer" } = {},
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
      if (text.includes("from settings")) {
        return typedQueryResult<T>([{
          group_name: "provider",
          is_secret: options.existingSecret ?? false,
          key: SETTING_KEY,
          updated_at: "2026-06-27T00:00:00.000Z",
          value_text: options.existingSecret ? "encrypted:v1:secret" : "https://provider.example.test",
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
