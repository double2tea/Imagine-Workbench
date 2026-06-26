import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapTeamOwner,
  fetchTeamStorageHealth,
  fetchTeamSession,
  loginTeamSession,
  logoutTeamSession,
  readTeamCsrfToken,
  teamAssetMediaUrl,
  fetchWorkspaceStorageRuntimeStatus,
  runTeamStorageMigrations,
} from "../lib/storage/team-client";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("fetchWorkspaceStorageRuntimeStatus parses browser storage status", async () => {
  const status = await fetchWorkspaceStorageRuntimeStatus(async () => jsonResponse({
    cleanupPolicy: {
      automaticStartupCleanup: false,
      deleteAssetMovesToTrash: true,
      explicitCleanupTargets: ["orphan-assets", "stale-previews", "expired-trash"],
      retainedSafetySnapshots: 1,
    },
    enabled: false,
    mode: "browser",
    reason: "browser-storage-selected",
    syncPolicy: {
      bidirectionalSync: false,
      migrationDirection: "explicit-import-export",
      mode: "single-active-store",
    },
    targetKind: "indexeddb",
  }));

  assert.equal(status.mode, "browser");
  assert.equal(status.targetKind, "indexeddb");
});

test("teamAssetMediaUrl encodes asset ids and download intent", () => {
  assert.equal(
    teamAssetMediaUrl("asset with spaces"),
    "/api/storage/team/assets/asset%20with%20spaces/media",
  );
  assert.equal(
    teamAssetMediaUrl("asset/with/slash", { download: true }),
    "/api/storage/team/assets/asset%2Fwith%2Fslash/media?download=1",
  );
});

test("fetchTeamStorageHealth surfaces server errors without exposing config values", async () => {
  await assert.rejects(
    fetchTeamStorageHealth(async () => jsonResponse({
      error: "DATABASE_URL is required when IMAGINE_STORAGE_TARGET=postgres",
      mode: "postgres",
      reachable: false,
      targetKind: "postgres",
    }, { status: 400 })),
    /DATABASE_URL is required/,
  );
});

test("team session client parses session context and login requests", async () => {
  const session = await fetchTeamSession(async () => jsonResponse({
    email: "owner@example.com",
    expiresAt: "2026-07-03T00:00:00.000Z",
    role: "owner",
    sessionId: "session_1",
    teamId: "team_1",
    userId: "user_1",
    workspaceId: "workspace_1",
  }));

  assert.equal(session.email, "owner@example.com");
  assert.equal(session.role, "owner");

  let requestBody = "";
  const login = await loginTeamSession({ email: "owner@example.com", password: "password" }, async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return jsonResponse({
      email: "owner@example.com",
      role: "owner",
      teamId: "team_1",
      userId: "user_1",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(login.workspaceId, "workspace_1");
  assert.deepEqual(JSON.parse(requestBody), { email: "owner@example.com", password: "password" });
});

test("team bootstrap client requires setup token and creates an owner session", async () => {
  await assert.rejects(
    bootstrapTeamOwner({ email: "owner@example.com", password: "long password", setupToken: " " }),
    /Setup token is required/,
  );

  let setupTokenHeader: string | null = null;
  let requestBody = "";
  const session = await bootstrapTeamOwner({
    email: "owner@example.com",
    password: "a long bootstrap password",
    setupToken: "setup-token",
  }, async (_input, init) => {
    setupTokenHeader = new Headers(init?.headers).get("x-imagine-setup-token");
    requestBody = String(init?.body ?? "");
    return jsonResponse({
      email: "owner@example.com",
      role: "owner",
      teamId: "team_1",
      userId: "user_1",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(setupTokenHeader, "setup-token");
  assert.deepEqual(JSON.parse(requestBody), {
    email: "owner@example.com",
    password: "a long bootstrap password",
  });
  assert.equal(session.role, "owner");
});

test("team session client requires CSRF token for logout and forwards it as a header", async () => {
  assert.equal(readTeamCsrfToken("other=1; imagine_team_csrf=csrf%20token"), "csrf token");
  assert.equal(readTeamCsrfToken("other=1"), null);

  await assert.rejects(
    logoutTeamSession(" "),
    /CSRF token is required/,
  );

  let csrfHeader: string | null = null;
  await logoutTeamSession("csrf-token", async (_input, init) => {
    csrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    return jsonResponse({ ok: true });
  });

  assert.equal(csrfHeader, "csrf-token");
});

test("runTeamStorageMigrations requires a setup token and sends it as a header", async () => {
  await assert.rejects(
    runTeamStorageMigrations(" "),
    /Setup token is required/,
  );

  let tokenHeader: string | null = null;
  const result = await runTeamStorageMigrations("setup-token", async (_input, init) => {
    tokenHeader = new Headers(init?.headers).get("x-imagine-setup-token");
    return jsonResponse({
      appVersion: "0.1.0",
      migrationStatus: {
        appliedMigrationIds: ["0001_initial_team_storage"],
        currentSchemaVersion: 1,
        pendingMigrationIds: [],
        requiredSchemaVersion: 1,
        schemaTableExists: true,
        unsupportedNewerSchema: false,
      },
      mode: "postgres",
      targetKind: "postgres",
    });
  });

  assert.equal(tokenHeader, "setup-token");
  assert.deepEqual(result.migrationStatus.pendingMigrationIds, []);
});
