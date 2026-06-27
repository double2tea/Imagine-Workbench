import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { BoardRunningHubNodeInfoBinding } from "../lib/board/types";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import {
  deleteTeamProviderTarget,
  listTeamProviderTargets,
  readTeamProviderTargetAccessPassword,
  saveTeamProviderTarget,
} from "../lib/storage/team-provider-targets";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { decryptWorkspaceSecret, encryptWorkspaceSecret, isEncryptedWorkspaceSecret } from "../lib/storage/team-secret-crypto";
import { fetchTeamProviderTargets } from "../lib/storage/team-client";
import { POST as postTeamProviderTarget } from "../app/api/storage/team/provider-targets/route";

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

test("listTeamProviderTargets returns admin-scoped public targets without passwords", async () => {
  const result = await listTeamProviderTargets(
    createTeamProviderTargetsQueryable(),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  const target = result.targets[0];
  assert.ok(target);
  assert.equal(target.accessPasswordConfigured, true);
  assert.equal(target.id, "ai-app:1937084622758465538");
  assert.equal(target.label, "Upscale app");
  assert.equal(target.outputType, "image");
  assert.equal(target.provider, "runninghub");
  assert.equal(target.targetId, "1937084622758465538");
  assert.equal(target.targetType, "ai-app");
  assert.equal(target.updatedAt, "2026-06-27T00:00:00.000Z");
  assert.deepEqual(target.bindings.map(binding => ({
    deliveryMode: binding.deliveryMode,
    fieldName: binding.fieldName,
    id: binding.id,
    nodeId: binding.nodeId,
    source: binding.source,
    value: binding.value,
    valueType: binding.valueType,
  })), [runningHubBinding()]);
  assert.equal("accessPassword" in target, false);
  assert.equal("accessPasswordEncrypted" in target, false);
});

test("saveTeamProviderTarget encrypts access passwords before writing", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await saveTeamProviderTarget(
    createTeamProviderTargetsQueryable(queries, { emptyTargets: true }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    {
      accessPassword: "app-password",
      bindings: [runningHubBinding()],
      label: " Upscale app ",
      outputType: "image",
      provider: "runninghub",
      targetId: " 1937084622758465538 ",
      targetType: "ai-app",
    },
    ENCRYPTION_KEY,
  );

  const write = queries.find(query => query.text.includes("insert into saved_provider_targets"));
  const storedTarget = JSON.parse(String(write?.values?.[3])) as { accessPasswordEncrypted?: string; accessPassword?: string };
  assert.equal(result.target.accessPasswordConfigured, true);
  assert.equal(result.target.id, "ai-app:1937084622758465538");
  assert.equal(storedTarget.accessPassword, undefined);
  assert.equal(typeof storedTarget.accessPasswordEncrypted, "string");
  assert.equal(isEncryptedWorkspaceSecret(storedTarget.accessPasswordEncrypted ?? ""), true);
  assert.equal(decryptWorkspaceSecret(storedTarget.accessPasswordEncrypted ?? "", ENCRYPTION_KEY), "app-password");
  assert.deepEqual(write?.values?.slice(0, 3), [`${WORKSPACE_ID}:runninghub:${result.target.id}`, WORKSPACE_ID, "runninghub"]);
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, "user_1", "team_provider_target.save"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    provider: "runninghub",
    targetId: "1937084622758465538",
    targetType: "ai-app",
  });
});

test("saveTeamProviderTarget preserves existing encrypted passwords when omitted", async () => {
  const existingCiphertext = "enc:v1:aes-256-gcm:YmFk:YmFk:YmFk:YmFk";
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await saveTeamProviderTarget(
    createTeamProviderTargetsQueryable(queries, { existingCiphertext }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    {
      bindings: [runningHubBinding({ value: "new prompt" })],
      label: "Upscale app",
      outputType: "image",
      provider: "runninghub",
      targetId: "1937084622758465538",
      targetType: "ai-app",
    },
    ENCRYPTION_KEY,
  );

  const write = queries.find(query => query.text.includes("insert into saved_provider_targets"));
  const storedTarget = JSON.parse(String(write?.values?.[3])) as { accessPasswordEncrypted?: string };
  assert.equal(storedTarget.accessPasswordEncrypted, existingCiphertext);
});

test("readTeamProviderTargetAccessPassword decrypts saved target passwords", async () => {
  const result = await readTeamProviderTargetAccessPassword(
    createTeamProviderTargetsQueryable([], {
      existingCiphertext: encryptTargetPassword("app-password"),
      role: "editor",
    }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    "ai-app:1937084622758465538",
    ENCRYPTION_KEY,
    "editor",
  );

  assert.equal(result, "app-password");
});

test("readTeamProviderTargetAccessPassword rejects malformed saved target passwords", async () => {
  await assert.rejects(
    () => readTeamProviderTargetAccessPassword(
      createTeamProviderTargetsQueryable([], {
        existingCiphertext: "plain-password",
        role: "editor",
      }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      "ai-app:1937084622758465538",
      ENCRYPTION_KEY,
      "editor",
    ),
    /Team provider target access password must be stored as an encrypted secret/,
  );
});

test("deleteTeamProviderTarget removes an admin-scoped saved target", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamProviderTarget(
    createTeamProviderTargetsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    " ai-app:1937084622758465538 ",
  );

  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from saved_provider_targets"))?.values,
    [WORKSPACE_ID, `${WORKSPACE_ID}:runninghub:ai-app:1937084622758465538`],
  );
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  const audit = queries.find(query => query.text.includes("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, "user_1", "team_provider_target.delete"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    provider: "runninghub",
    targetId: "ai-app:1937084622758465538",
  });
});

test("team provider target service requires admin access", async () => {
  await assert.rejects(
    () => listTeamProviderTargets(
      createTeamProviderTargetsQueryable([], { role: "editor" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
    ),
    (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === "forbidden",
  );
});

test("team provider target save route rejects missing CSRF before opening a database client", async () => {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
    IMAGINE_TEAM_SECRET_ENCRYPTION_KEY: process.env.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES = "1048576";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";
    process.env.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY = ENCRYPTION_KEY;

    const response = await postTeamProviderTarget(new Request("http://localhost:3000/api/storage/team/provider-targets", {
      body: JSON.stringify({
        accessPassword: "app-password",
        bindings: [runningHubBinding()],
        label: "Upscale app",
        outputType: "image",
        provider: "runninghub",
        targetId: "1937084622758465538",
        targetType: "ai-app",
      }),
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
    restoreEnv("IMAGINE_TEAM_SECRET_ENCRYPTION_KEY", originalEnv.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY);
  }
});

test("fetchTeamProviderTargets rejects leaked password fields", async () => {
  await assert.rejects(
    fetchTeamProviderTargets(async () => jsonResponse({
      targetKind: "postgres",
      targets: [{
        accessPasswordConfigured: true,
        accessPasswordEncrypted: "ciphertext",
        bindings: [runningHubBinding()],
        id: "ai-app:1937084622758465538",
        label: "Upscale app",
        outputType: "image",
        provider: "runninghub",
        targetId: "1937084622758465538",
        targetType: "ai-app",
        updatedAt: "2026-06-27T00:00:00.000Z",
      }],
      workspaceId: WORKSPACE_ID,
    })),
    /Team provider target list response is invalid/,
  );
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/provider-targets", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamProviderTargetsQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: {
    emptyTargets?: boolean;
    existingCiphertext?: string;
    role?: "owner" | "admin" | "editor" | "viewer";
  } = {},
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
      if (text.includes("insert into saved_provider_targets")) {
        return typedQueryResult<T>([{
          id: values?.[0],
          provider: values?.[2],
          target: JSON.parse(String(values?.[3])) as unknown,
          updated_at: "2026-06-27T00:00:00.000Z",
        }]);
      }
      if (text.includes("from saved_provider_targets")) {
        if (options.emptyTargets) return typedQueryResult<T>([]);
        return typedQueryResult<T>([savedTargetRow(options.existingCiphertext)]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function savedTargetRow(existingCiphertext = "encrypted-password"): QueryResultRow {
  return {
    id: "workspace_1:runninghub:ai-app:1937084622758465538",
    provider: "runninghub",
    target: {
      accessPasswordEncrypted: existingCiphertext,
      bindings: [runningHubBinding()],
      label: "Upscale app",
      outputType: "image",
      provider: "runninghub",
      targetId: "1937084622758465538",
      targetType: "ai-app",
    },
    updated_at: "2026-06-27T00:00:00.000Z",
  };
}

function encryptTargetPassword(value: string): string {
  return encryptWorkspaceSecret(value, ENCRYPTION_KEY);
}

function runningHubBinding(overrides: Partial<BoardRunningHubNodeInfoBinding> = {}): BoardRunningHubNodeInfoBinding {
  return {
    deliveryMode: "raw",
    fieldName: "prompt",
    id: "binding_1",
    nodeId: "3",
    source: "prompt",
    value: "",
    valueType: "text",
    ...overrides,
  };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
