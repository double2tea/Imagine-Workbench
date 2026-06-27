import assert from "node:assert/strict";
import test from "node:test";
import type { BoardDocument, BoardSummary } from "../lib/board/types";

import {
  bootstrapTeamOwner,
  createTeamMember,
  deleteTeamAsset,
  deleteTeamMember,
  createTeamBoardDocument,
  deleteTeamBoardDocument,
  fetchTeamBoardDocument,
  fetchTeamMembers,
  fetchTeamAssets,
  fetchTeamBoardSummaries,
  fetchTeamStorageHealth,
  fetchTeamSession,
  fetchTeamWorkspaceGalleryItems,
  loginTeamSession,
  logoutTeamSession,
  readTeamCsrfToken,
  saveTeamBoardDocument,
  teamAssetRecordToStorageItem,
  teamAssetMediaUrl,
  updateTeamMemberRole,
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

test("fetchTeamAssets sends list filters and rejects payload storage keys", async () => {
  let requestedUrl = "";
  const result = await fetchTeamAssets({
    boardId: "board_1",
    ids: ["asset_1", "asset with spaces"],
    limit: 20,
    offset: 5,
    statuses: ["complete", "failed"],
  }, async input => {
    requestedUrl = String(input);
    return jsonResponse({
      assets: [{
        downloadUrl: "/api/storage/team/assets/asset_1/media?download=1",
        mediaUrl: "/api/storage/team/assets/asset_1/media",
        meta: {
          hasBlob: true,
          id: "asset_1",
          status: "complete",
          type: "image",
        },
        payload: {
          contentHash: "sha256:abc",
          kind: "local-file",
          mimeType: "image/png",
          sizeBytes: 12,
        },
      }],
      limit: 20,
      offset: 5,
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(
    requestedUrl,
    "/api/storage/team/assets?boardId=board_1&id=asset_1&id=asset+with+spaces&limit=20&offset=5&status=complete&status=failed",
  );
  const firstAsset = result.assets[0];
  assert.ok(firstAsset);
  assert.equal(firstAsset.payload?.kind, "local-file");
  assert.equal(teamAssetRecordToStorageItem(firstAsset).url, "/api/storage/team/assets/asset_1/media");

  await assert.rejects(
    fetchTeamAssets(undefined, async () => jsonResponse({
      assets: [{
        meta: {
          hasBlob: true,
          id: "asset_1",
          status: "complete",
          type: "image",
        },
        payload: {
          kind: "local-file",
          uri: "originals/image/secret.png",
        },
      }],
      limit: 100,
      offset: 0,
      targetKind: "postgres",
      workspaceId: "workspace_1",
    })),
    /Team asset list response is invalid/,
  );
});

test("fetchTeamWorkspaceGalleryItems reads workspace-global team assets", async () => {
  let requestedUrl = "";
  const result = await fetchTeamWorkspaceGalleryItems(async input => {
    requestedUrl = String(input);
    return jsonResponse({
      assets: [
        {
          mediaUrl: "/api/storage/team/assets/workspace_asset/media",
          meta: {
            aspectRatio: "1:1",
            boardId: "",
            createdAt: "2026-06-27T00:00:00.000Z",
            hasBlob: true,
            id: "workspace_asset",
            model: "model",
            progress: 100,
            prompt: "prompt",
            scope: "workspace",
            status: "complete",
            type: "image",
          },
        },
        {
          mediaUrl: "/api/storage/team/assets/library_backing/media",
          meta: {
            aspectRatio: "1:1",
            boardId: "",
            createdAt: "2026-06-27T00:00:00.000Z",
            hasBlob: true,
            id: "library_backing",
            libraryItemId: "library_1",
            model: "model",
            progress: 100,
            prompt: "prompt",
            scope: "workspace",
            status: "complete",
            type: "image",
          },
        },
      ],
      limit: 200,
      offset: 0,
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(requestedUrl, "/api/storage/team/assets?boardId=&limit=200");
  assert.deepEqual(result.map(item => item.id), ["workspace_asset"]);
  assert.equal(result[0]?.url, "/api/storage/team/assets/workspace_asset/media");
});

test("deleteTeamAsset sends CSRF header to encoded asset route", async () => {
  let requestedUrl = "";
  let deleteCsrfHeader: string | null = null;
  await deleteTeamAsset("asset/with spaces", "csrf-token", async (input, init) => {
    requestedUrl = String(input);
    assert.equal(init?.method, "DELETE");
    deleteCsrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    return jsonResponse({ ok: true });
  });

  assert.equal(requestedUrl, "/api/storage/team/assets/asset%2Fwith%20spaces");
  assert.equal(deleteCsrfHeader, "csrf-token");
  await assert.rejects(
    deleteTeamAsset("asset_1", " "),
    /CSRF token is required/,
  );
});

test("fetchTeamBoardSummaries sends list filters and validates summaries", async () => {
  let requestedUrl = "";
  const result = await fetchTeamBoardSummaries({
    ids: ["board_1", "board with spaces"],
    limit: 10,
    offset: 2,
  }, async input => {
    requestedUrl = String(input);
    return jsonResponse({
      boards: [{
        createdAt: "2026-06-26T00:00:00.000Z",
        id: "board_1",
        nodeCount: 3,
        title: "Shared Board",
        updatedAt: "2026-06-26T01:00:00.000Z",
      }],
      limit: 10,
      offset: 2,
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(
    requestedUrl,
    "/api/storage/team/boards?id=board_1&id=board+with+spaces&limit=10&offset=2",
  );
  assert.equal(result.boards[0]?.title, "Shared Board");

  await assert.rejects(
    fetchTeamBoardSummaries(undefined, async () => jsonResponse({
      boards: [{
        id: "board_1",
        title: "Shared Board",
      }],
      limit: 100,
      offset: 0,
      targetKind: "postgres",
      workspaceId: "workspace_1",
    })),
    /Team board list response is invalid/,
  );
});

test("team board document client creates, reads, saves, and deletes boards", async () => {
  const board = createBoardDocument();
  let createCsrfHeader: string | null = null;
  const createResult = await createTeamBoardDocument(board, "csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/boards");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    createCsrfHeader = headers.get("x-imagine-csrf-token");
    assert.deepEqual(JSON.parse(String(init?.body ?? "")), board);
    return jsonResponse({
      board,
      summary: createBoardSummary(),
      targetKind: "postgres",
      version: 1,
      workspaceId: "workspace_1",
    }, { status: 201 });
  });

  assert.equal(createResult.version, 1);
  assert.equal(createCsrfHeader, "csrf-token");

  const readResult = await fetchTeamBoardDocument("board_1", async input => {
    assert.equal(String(input), "/api/storage/team/boards/board_1");
    return jsonResponse({
      board,
      summary: createBoardSummary(),
      targetKind: "postgres",
      version: 7,
      workspaceId: "workspace_1",
    });
  });

  assert.equal(readResult.version, 7);
  assert.equal(readResult.board.title, "Shared Board");

  let requestBody = "";
  let ifMatchHeader: string | null = null;
  let csrfHeader: string | null = null;
  const saveResult = await saveTeamBoardDocument(board, 7, "csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/boards/board_1");
    assert.equal(init?.method, "PUT");
    requestBody = String(init?.body ?? "");
    const headers = new Headers(init?.headers);
    ifMatchHeader = headers.get("if-match");
    csrfHeader = headers.get("x-imagine-csrf-token");
    return jsonResponse({
      board,
      summary: createBoardSummary(),
      targetKind: "postgres",
      version: 8,
      workspaceId: "workspace_1",
    });
  });

  assert.equal(saveResult.version, 8);
  assert.equal(ifMatchHeader, "7");
  assert.equal(csrfHeader, "csrf-token");
  assert.deepEqual(JSON.parse(requestBody), board);

  let deleteCsrfHeader: string | null = null;
  await deleteTeamBoardDocument("board_1", "csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/boards/board_1");
    assert.equal(init?.method, "DELETE");
    const headers = new Headers(init?.headers);
    deleteCsrfHeader = headers.get("x-imagine-csrf-token");
    return jsonResponse({ ok: true });
  });
  assert.equal(deleteCsrfHeader, "csrf-token");

  await assert.rejects(
    createTeamBoardDocument(board, " "),
    /CSRF token is required/,
  );
  await assert.rejects(
    saveTeamBoardDocument(board, 7, " "),
    /CSRF token is required/,
  );
  await assert.rejects(
    deleteTeamBoardDocument("board_1", " "),
    /CSRF token is required/,
  );
});

test("team board document client rejects secret-bearing board responses", async () => {
  await assert.rejects(
    fetchTeamBoardDocument("board_1", async () => jsonResponse({
      board: createBoardDocument({ includeSecret: true }),
      summary: createBoardSummary(),
      targetKind: "postgres",
      version: 7,
      workspaceId: "workspace_1",
    })),
    /Team board response is invalid/,
  );
});

test("team member client lists and mutates members with CSRF headers", async () => {
  let listUrl = "";
  const memberList = await fetchTeamMembers(async input => {
    listUrl = String(input);
    return jsonResponse({
      members: [createTeamMemberRecord()],
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });
  assert.equal(listUrl, "/api/storage/team/members");
  assert.equal(memberList.members[0]?.email, "editor@example.com");

  let createCsrfHeader: string | null = null;
  let createBody = "";
  const created = await createTeamMember({
    email: "editor@example.com",
    password: "a long member password",
    role: "editor",
  }, "csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/members");
    assert.equal(init?.method, "POST");
    createBody = String(init?.body ?? "");
    createCsrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    return jsonResponse({
      member: createTeamMemberRecord(),
      targetKind: "postgres",
      workspaceId: "workspace_1",
    }, { status: 201 });
  });
  assert.equal(created.member.role, "editor");
  assert.equal(createCsrfHeader, "csrf-token");
  assert.deepEqual(JSON.parse(createBody), {
    email: "editor@example.com",
    password: "a long member password",
    role: "editor",
  });

  let updateCsrfHeader: string | null = null;
  let updateBody = "";
  const updated = await updateTeamMemberRole("user_2", "viewer", "csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/members/user_2");
    assert.equal(init?.method, "PATCH");
    updateBody = String(init?.body ?? "");
    updateCsrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    return jsonResponse({
      member: createTeamMemberRecord({ role: "viewer" }),
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });
  assert.equal(updated.member.role, "viewer");
  assert.equal(updateCsrfHeader, "csrf-token");
  assert.deepEqual(JSON.parse(updateBody), { role: "viewer" });

  let deleteCsrfHeader: string | null = null;
  await deleteTeamMember("user_2", "csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/members/user_2");
    assert.equal(init?.method, "DELETE");
    deleteCsrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    return jsonResponse({ ok: true });
  });
  assert.equal(deleteCsrfHeader, "csrf-token");

  await assert.rejects(
    createTeamMember({ email: "editor@example.com", password: "a long member password", role: "editor" }, " "),
    /CSRF token is required/,
  );
  await assert.rejects(
    updateTeamMemberRole("user_2", "viewer", " "),
    /CSRF token is required/,
  );
  await assert.rejects(
    deleteTeamMember("user_2", " "),
    /CSRF token is required/,
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

function createBoardSummary(): BoardSummary {
  return {
    createdAt: "2026-06-26T00:00:00.000Z",
    id: "board_1",
    nodeCount: 1,
    title: "Shared Board",
    updatedAt: "2026-06-26T01:00:00.000Z",
  };
}

function createBoardDocument(options: { includeSecret?: boolean } = {}): BoardDocument {
  return {
    config: { showGrid: true, showMiniMap: true, snapToGrid: true },
    createdAt: "2026-06-26T00:00:00.000Z",
    edges: [],
    id: "board_1",
    nodes: [{
      ...(options.includeSecret ? { accessPassword: "secret-password" } : {}),
      createdAt: "2026-06-26T00:00:00.000Z",
      bindings: [],
      id: "runninghub_1",
      kind: "runninghub-app",
      outputType: "image",
      position: { x: 0, y: 0 },
      prompt: "prompt",
      status: "idle",
      size: { height: 120, width: 240 },
      targetId: "app_1",
      targetType: "ai-app",
      title: "RunningHub",
      updatedAt: "2026-06-26T01:00:00.000Z",
    }],
    title: "Shared Board",
    updatedAt: "2026-06-26T01:00:00.000Z",
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createTeamMemberRecord(options: { role?: "owner" | "admin" | "editor" | "viewer" } = {}) {
  return {
    createdAt: "2026-06-27T00:00:00.000Z",
    email: "editor@example.com",
    role: options.role ?? "editor",
    userId: "user_2",
  };
}

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
