import assert from "node:assert/strict";
import test from "node:test";
import type { BoardDocument, BoardSummary } from "../lib/board/types";
import type { LibraryAssetRecord } from "../lib/db";
import type { GenerationTask } from "../lib/generation-tasks";

import {
  bootstrapTeamOwner,
  cancelTeamGenerationTask,
  clearTeamAssets,
  cleanupTeamMediaMaintenance,
  createTeamMember,
  deleteTeamAsset,
  deleteTeamAssetLibraryRecord,
  deleteTeamGenerationTask,
  deleteTeamMember,
  deleteTeamSecret,
  downloadTeamWorkspaceBackup,
  restoreTeamWorkspaceBackup,
  createTeamBoardDocument,
  deleteTeamBoardDocument,
  fetchTeamBoardDocument,
  fetchTeamMembers,
  fetchTeamAssets,
  fetchTeamAssetLibrary,
  fetchTeamBoardSummaries,
  fetchTeamGenerationTasks,
  fetchTeamSecrets,
  fetchTeamStorageHealth,
  fetchTeamSession,
  fetchTeamWorkspaceGalleryItems,
  fetchTeamWorkspaceDataSummary,
  loginTeamSession,
  logoutTeamSession,
  readTeamCsrfToken,
  repairTeamAssetSourceLinks,
  resetTeamBoards,
  saveTeamBoardDocument,
  saveTeamAsset,
  saveTeamAssetLibraryRecord,
  saveTeamGenerationTask,
  saveTeamSecret,
  teamAssetRecordToStorageItem,
  teamAssetMediaUrl,
  updateTeamGenerationTask,
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

const downloadState: { clicked: boolean; fileName: string } = {
  clicked: false,
  fileName: "",
};

function installDownloadDom(): () => void {
  const originalDocument = globalThis.document;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const anchor = {
    click: () => {
      downloadState.clicked = true;
      downloadState.fileName = anchor.download;
    },
    download: "",
    href: "",
  };
  const documentStub = {
    body: {
      appendChild: () => undefined,
      removeChild: () => undefined,
    },
    createElement: () => anchor,
  };
  downloadState.clicked = false;
  downloadState.fileName = "";
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:team-backup",
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined,
  });
  return () => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
  };
}

function createStorageItem() {
  return {
    aspectRatio: "1:1",
    boardId: "",
    createdAt: "2026-06-27T00:00:00.000Z",
    hasBlob: true,
    id: "asset_1",
    model: "model",
    progress: 100,
    prompt: "prompt",
    scope: "workspace" as const,
    status: "complete" as const,
    type: "image" as const,
    url: "data:image/png;base64,aW1hZ2U=",
  };
}

function createLibraryAssetRecord(overrides: Partial<LibraryAssetRecord> = {}): LibraryAssetRecord {
  return {
    assetId: "asset_1",
    category: "character",
    createdAt: "2026-06-27T00:00:00.000Z",
    favorite: false,
    id: "library_1",
    mediaType: "image",
    notes: "",
    origin: "promoted",
    sourceAssetId: "asset_1",
    tags: ["hero"],
    title: "Hero character",
    updatedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

function createGenerationTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    canCancelRemote: true,
    createdAt: "2026-06-27T00:00:00.000Z",
    id: "task_1",
    mediaType: "image",
    model: "model",
    progress: 40,
    prompt: "prompt",
    resultAssetIds: [],
    source: {
      boardId: "board_1",
      boardNodeId: "node_1",
      surface: "board",
    },
    status: "processing",
    updatedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
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

test("fetchTeamWorkspaceDataSummary parses PostgreSQL data summary", async () => {
  const summary = await fetchTeamWorkspaceDataSummary(async input => {
    assert.equal(String(input), "/api/storage/team/data-summary");
    return jsonResponse({
      summary: createWorkspaceDataSummary(),
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(summary.assets.total, 2);
  assert.equal(summary.teamStorage?.payloadBytes, 2048);

  await assert.rejects(
    fetchTeamWorkspaceDataSummary(async () => jsonResponse({
      summary: { ...createWorkspaceDataSummary(), assets: { total: 2 } },
      targetKind: "postgres",
      workspaceId: "workspace_1",
    })),
    /Team data summary response is invalid/,
  );
});

test("cleanupTeamMediaMaintenance posts target and CSRF token", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const result = await cleanupTeamMediaMaintenance("maintenance-files", " csrf-token ", async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return jsonResponse({
      deletedFiles: 4,
      deletedMissingPayloadAssets: 0,
      deletedMissingPreviewRefs: 0,
      deletedOrphanedPayloadFiles: 1,
      deletedOrphanedPreviewFiles: 1,
      deletedTmpFiles: 1,
      deletedTrashFiles: 1,
      target: "maintenance-files",
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(requestedUrl, "/api/storage/team/media-maintenance");
  assert.ok(requestedInit);
  assert.equal(requestedInit.method, "POST");
  assert.equal((requestedInit.headers as Record<string, string>)["x-imagine-csrf-token"], "csrf-token");
  assert.deepEqual(JSON.parse(String(requestedInit.body)), { target: "maintenance-files" });
  assert.equal(result.deletedFiles, 4);

  const previewResult = await cleanupTeamMediaMaintenance("missing-preview-refs", "csrf-token", async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return jsonResponse({
      deletedFiles: 0,
      deletedMissingPayloadAssets: 0,
      deletedMissingPreviewRefs: 2,
      deletedOrphanedPayloadFiles: 0,
      deletedOrphanedPreviewFiles: 0,
      deletedTmpFiles: 0,
      deletedTrashFiles: 0,
      target: "missing-preview-refs",
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });
  assert.equal(requestedUrl, "/api/storage/team/media-maintenance");
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), { target: "missing-preview-refs" });
  assert.equal(previewResult.deletedMissingPreviewRefs, 2);

  await assert.rejects(
    cleanupTeamMediaMaintenance("maintenance-files", "", async () => jsonResponse({})),
    /CSRF token is required/,
  );
  await assert.rejects(
    cleanupTeamMediaMaintenance("maintenance-files", "csrf-token", async () => jsonResponse({ error: "nope" }, { status: 500 })),
    /nope/,
  );
});

test("downloadTeamWorkspaceBackup downloads zip responses and parses counts", async () => {
  const restoreDom = installDownloadDom();
  try {
    let requestedUrl = "";
    const result = await downloadTeamWorkspaceBackup(false, async input => {
      requestedUrl = String(input);
      return new Response(new Blob(["zip"]), {
        headers: {
          "x-imagine-asset-count": "1",
          "x-imagine-backup-file-name": "Imagine_Team_Backup.zip",
          "x-imagine-board-count": "2",
          "x-imagine-generation-task-count": "3",
          "x-imagine-library-asset-count": "4",
          "x-imagine-settings-key-count": "0",
          "x-imagine-voice-profile-count": "5",
        },
      });
    });

    assert.equal(requestedUrl, "/api/storage/team/backup");
    assert.deepEqual(result, {
      assetCount: 1,
      boardCount: 2,
      fileName: "Imagine_Team_Backup.zip",
      generationTaskCount: 3,
      libraryAssetCount: 4,
      settingsKeyCount: 0,
      voiceProfileCount: 5,
    });
    assert.equal(downloadState.fileName, "Imagine_Team_Backup.zip");
    assert.equal(downloadState.clicked, true);

    await assert.rejects(
      downloadTeamWorkspaceBackup(false, async () => jsonResponse({ error: "no backup" }, { status: 500 })),
      /no backup/,
    );
  } finally {
    restoreDom();
  }
});

test("restoreTeamWorkspaceBackup uploads zip backups with CSRF and parses restore results", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const result = await restoreTeamWorkspaceBackup(
    new File(["zip"], "backup.zip", { type: "application/zip" }),
    false,
    "csrf-token",
    async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return jsonResponse({
        assetCount: 1,
        boardCount: 2,
        fileName: "Team workspace restore",
        generationTaskCount: 3,
        libraryAssetCount: 4,
        safetySnapshotId: "snapshot_1",
        settingsKeyCount: 0,
        targetKind: "postgres",
        voiceProfileCount: 5,
        workspaceId: "workspace_1",
      });
    },
  );

  assert.equal(requestedUrl, "/api/storage/team/backup");
  assert.ok(requestedInit);
  assert.equal(requestedInit.method, "POST");
  assert.equal((requestedInit.headers as Record<string, string>)["x-imagine-csrf-token"], "csrf-token");
  assert.ok(requestedInit.body instanceof FormData);
  assert.deepEqual(result, {
    assetCount: 1,
    boardCount: 2,
    fileName: "Team workspace restore",
    generationTaskCount: 3,
    libraryAssetCount: 4,
    safetySnapshotId: "snapshot_1",
    settingsKeyCount: 0,
    targetKind: "postgres",
    voiceProfileCount: 5,
    workspaceId: "workspace_1",
  });

  await assert.rejects(
    restoreTeamWorkspaceBackup(new File(["zip"], "backup.zip"), true, "", async () => jsonResponse({})),
    /CSRF token is required/,
  );
  await assert.rejects(
    restoreTeamWorkspaceBackup(new File(["zip"], "backup.zip"), true, "csrf-token", async () =>
      jsonResponse({ error: "restore denied" }, { status: 400 }),
    ),
    /restore denied/,
  );
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

test("team asset library client sends filters and rejects payload storage keys", async () => {
  let listUrl = "";
  const record = createLibraryAssetRecord();
  const listResult = await fetchTeamAssetLibrary({ limit: 20, offset: 5 }, async input => {
    listUrl = String(input);
    return jsonResponse({
      entries: [{
        asset: {
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
        },
        record,
      }],
      limit: 20,
      offset: 5,
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(listUrl, "/api/storage/team/asset-library?limit=20&offset=5");
  assert.equal(listResult.entries[0]?.record.id, "library_1");
  const firstLibraryAsset = listResult.entries[0]?.asset;
  assert.ok(firstLibraryAsset);
  assert.equal(teamAssetRecordToStorageItem(firstLibraryAsset).url, "/api/storage/team/assets/asset_1/media");

  await assert.rejects(
    fetchTeamAssetLibrary(undefined, async () => jsonResponse({
      entries: [{
        asset: {
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
        },
        record,
      }],
      limit: 100,
      offset: 0,
      targetKind: "postgres",
      workspaceId: "workspace_1",
    })),
    /Team asset library list response is invalid/,
  );

  let saveCsrfHeader: string | null = null;
  let saveBody: string | null = null;
  const saved = await saveTeamAssetLibraryRecord(record, "csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/asset-library");
    assert.equal(init?.method, "POST");
    saveCsrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    saveBody = String(init?.body);
    return jsonResponse({
      entry: {
        asset: null,
        record,
      },
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });
  assert.equal(saveCsrfHeader, "csrf-token");
  assert.equal(saveBody, JSON.stringify({ record }));
  assert.equal(saved.record.id, "library_1");

  let deleteUrl = "";
  let deleteCsrfHeader: string | null = null;
  await deleteTeamAssetLibraryRecord("library/with spaces", "csrf-token", async (input, init) => {
    deleteUrl = String(input);
    assert.equal(init?.method, "DELETE");
    deleteCsrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    return jsonResponse({ ok: true });
  });
  assert.equal(deleteUrl, "/api/storage/team/asset-library/library%2Fwith%20spaces");
  assert.equal(deleteCsrfHeader, "csrf-token");

  await assert.rejects(
    saveTeamAssetLibraryRecord(record, " "),
    /CSRF token is required/,
  );
  await assert.rejects(
    deleteTeamAssetLibraryRecord("library_1", " "),
    /CSRF token is required/,
  );
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

test("clearTeamAssets sends CSRF header to team asset collection route", async () => {
  let requestedUrl = "";
  let csrfHeader: string | null = null;
  const result = await clearTeamAssets("csrf-token", async (input, init) => {
    requestedUrl = String(input);
    assert.equal(init?.method, "DELETE");
    csrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    return jsonResponse({
      deletedAssetCount: 3,
      deletedGenerationTaskCount: 2,
      deletedLibraryAssetCount: 1,
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(requestedUrl, "/api/storage/team/assets");
  assert.equal(csrfHeader, "csrf-token");
  assert.equal(result.deletedAssetCount, 3);
  assert.equal(result.deletedGenerationTaskCount, 2);
  assert.equal(result.deletedLibraryAssetCount, 1);
  await assert.rejects(
    clearTeamAssets(" "),
    /CSRF token is required/,
  );
});

test("repairTeamAssetSourceLinks sends PATCH request to team asset collection route", async () => {
  let requestedUrl = "";
  let csrfHeader: string | null = null;
  let requestBody: unknown = null;
  const result = await repairTeamAssetSourceLinks("csrf-token", async (input, init) => {
    requestedUrl = String(input);
    assert.equal(init?.method, "PATCH");
    csrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({
      repairedIds: ["asset_1"],
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(requestedUrl, "/api/storage/team/assets");
  assert.equal(csrfHeader, "csrf-token");
  assert.deepEqual(requestBody, { action: "repair-stale-source-links" });
  assert.deepEqual(result.repairedIds, ["asset_1"]);
  await assert.rejects(
    repairTeamAssetSourceLinks(" "),
    /CSRF token is required/,
  );
});

test("team secret client methods send filters and never accept secret values", async () => {
  let listUrl = "";
  const listResult = await fetchTeamSecrets({
    groups: ["provider"],
    keys: ["provider:demo:apiKey", "provider with spaces"],
  }, async input => {
    listUrl = String(input);
    return jsonResponse({
      secrets: [{
        configured: true,
        group: "provider",
        key: "provider:demo:apiKey",
        updatedAt: "2026-06-27T00:00:00.000Z",
      }],
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(
    listUrl,
    "/api/storage/team/secrets?group=provider&key=provider%3Ademo%3AapiKey&key=provider+with+spaces",
  );
  assert.equal(listResult.secrets[0]?.configured, true);

  await assert.rejects(
    fetchTeamSecrets(undefined, async () => jsonResponse({
      secrets: [{
        configured: true,
        group: "provider",
        key: "provider:demo:apiKey",
        updatedAt: "2026-06-27T00:00:00.000Z",
        value: "leaked-secret",
      }],
      targetKind: "postgres",
      workspaceId: "workspace_1",
    })),
    /Team secret list response is invalid/,
  );

  let saveCsrfHeader: string | null = null;
  let saveBody: string | null = null;
  const saveResult = await saveTeamSecret({
    group: "provider",
    key: "provider:demo:apiKey",
    value: "provider-api-key",
  }, "csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/secrets");
    assert.equal(init?.method, "POST");
    saveCsrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    saveBody = String(init?.body);
    return jsonResponse({
      secret: {
        configured: true,
        group: "provider",
        key: "provider:demo:apiKey",
        updatedAt: "2026-06-27T00:00:00.000Z",
      },
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });
  assert.equal(saveCsrfHeader, "csrf-token");
  assert.equal(saveBody, JSON.stringify({
    group: "provider",
    key: "provider:demo:apiKey",
    value: "provider-api-key",
  }));
  assert.equal(saveResult.secret.key, "provider:demo:apiKey");

  let deleteUrl = "";
  let deleteCsrfHeader: string | null = null;
  await deleteTeamSecret("provider/demo key", "csrf-token", async (input, init) => {
    deleteUrl = String(input);
    deleteCsrfHeader = new Headers(init?.headers).get("x-imagine-csrf-token");
    assert.equal(init?.method, "DELETE");
    return jsonResponse({ ok: true });
  });
  assert.equal(deleteUrl, "/api/storage/team/secrets/provider%2Fdemo%20key");
  assert.equal(deleteCsrfHeader, "csrf-token");
});

test("saveTeamAsset posts asset data with CSRF and maps media URL", async () => {
  let requestedUrl = "";
  let saveCsrfHeader: string | null = null;
  let contentTypeHeader: string | null = null;
  let requestBody: unknown = null;
  const result = await saveTeamAsset(createStorageItem(), "csrf-token", async (input, init) => {
    requestedUrl = String(input);
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    saveCsrfHeader = headers.get("x-imagine-csrf-token");
    contentTypeHeader = headers.get("content-type");
    requestBody = JSON.parse(String(init?.body ?? ""));
    return jsonResponse({
      asset: {
        mediaUrl: "/api/storage/team/assets/asset_1/media",
        meta: {
          ...createStorageItem(),
          url: undefined,
        },
      },
      targetKind: "postgres",
      workspaceId: "workspace_1",
    });
  });

  assert.equal(requestedUrl, "/api/storage/team/assets");
  assert.equal(saveCsrfHeader, "csrf-token");
  assert.equal(contentTypeHeader, "application/json");
  assert.deepEqual(requestBody, { asset: createStorageItem() });
  assert.equal(result.url, "/api/storage/team/assets/asset_1/media");
  await assert.rejects(
    saveTeamAsset(createStorageItem(), " "),
    /CSRF token is required/,
  );
});

test("fetchTeamGenerationTasks sends list filters", async () => {
  let requestedUrl = "";
  const result = await fetchTeamGenerationTasks({
    boardId: "board_1",
    limit: 20,
    offset: 5,
    sourceBoardNodeIds: ["node_1", "node with spaces"],
    statuses: ["processing", "failed"],
  }, async input => {
    requestedUrl = String(input);
    return jsonResponse({
      limit: 20,
      offset: 5,
      targetKind: "postgres",
      tasks: [createGenerationTask()],
      workspaceId: "workspace_1",
    });
  });

  assert.equal(
    requestedUrl,
    "/api/storage/team/generation-tasks?boardId=board_1&limit=20&offset=5&sourceBoardNodeId=node_1&sourceBoardNodeId=node+with+spaces&status=processing&status=failed",
  );
  assert.deepEqual(result.tasks.map(task => task.id), ["task_1"]);
});

test("team generation task mutations send CSRF headers and parse tasks", async () => {
  const task = createGenerationTask({ status: "pending" });
  const requested: Array<{ body: unknown; csrf: string | null; method: string | undefined; url: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requested.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      csrf: new Headers(init?.headers).get("x-imagine-csrf-token"),
      method: init?.method,
      url: String(input),
    });
    if (init?.method === "DELETE") return jsonResponse({ ok: true });
    return jsonResponse({
      targetKind: "postgres",
      task,
      workspaceId: "workspace_1",
    });
  };

  await saveTeamGenerationTask(task, "csrf-token", fetcher);
  await updateTeamGenerationTask("task/1", { progress: 50 }, "csrf-token", fetcher);
  await cancelTeamGenerationTask("task/1", "csrf-token", fetcher);
  await deleteTeamGenerationTask("task/1", "csrf-token", fetcher);

  assert.deepEqual(requested, [
    {
      body: { task },
      csrf: "csrf-token",
      method: "POST",
      url: "/api/storage/team/generation-tasks",
    },
    {
      body: { update: { progress: 50 } },
      csrf: "csrf-token",
      method: "PATCH",
      url: "/api/storage/team/generation-tasks/task%2F1",
    },
    {
      body: { update: { progress: 100, status: "canceled" } },
      csrf: "csrf-token",
      method: "PATCH",
      url: "/api/storage/team/generation-tasks/task%2F1",
    },
    {
      body: null,
      csrf: "csrf-token",
      method: "DELETE",
      url: "/api/storage/team/generation-tasks/task%2F1",
    },
  ]);
  await assert.rejects(
    saveTeamGenerationTask(task, " "),
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

  let resetCsrfHeader: string | null = null;
  const resetResult = await resetTeamBoards("csrf-token", async (input, init) => {
    assert.equal(String(input), "/api/storage/team/boards");
    assert.equal(init?.method, "DELETE");
    const headers = new Headers(init?.headers);
    resetCsrfHeader = headers.get("x-imagine-csrf-token");
    return jsonResponse({
      board,
      deletedBoardCount: 2,
      summary: createBoardSummary(),
      targetKind: "postgres",
      version: 1,
      workspaceId: "workspace_1",
    });
  });
  assert.equal(resetCsrfHeader, "csrf-token");
  assert.equal(resetResult.deletedBoardCount, 2);

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
  await assert.rejects(
    resetTeamBoards(" "),
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

function createWorkspaceDataSummary() {
  return {
    assets: {
      audio: 0,
      brokenComplete: 0,
      estimatedBytes: 512,
      failed: 0,
      image: 2,
      largest: [],
      missingBoardReferences: 0,
      orphaned: 0,
      pending: 0,
      processing: 0,
      referencedByBoards: 1,
      staleProcessing: 0,
      stores: {
        legacyAssetRecords: 0,
        legacyBlobRecords: 0,
        libraryRecords: 1,
        metaRecords: 2,
        previewRecords: 0,
        sharedBlobRecords: 2,
        version: 1,
      },
      total: 2,
      transcript: 0,
      video: 0,
    },
    boards: {
      estimatedBytes: 128,
      nodes: 1,
      total: 1,
    },
    integrity: {
      brokenCompleteAssetIds: [],
      failedAssetIds: [],
      issueCount: 0,
      missingBoardReferences: [],
      orphanedAssetIds: [],
      staleAssetSourceLinks: [],
      staleProcessingAssetIds: [],
      status: "healthy",
    },
    localStorage: {
      agentKeys: 0,
      credentialKeys: 1,
      estimatedBytes: 0,
      inventory: [],
      modelCacheKeys: 0,
      providerSettingKeys: 2,
      uiPreferenceKeys: 0,
    },
    safety: {
      latestSnapshot: null,
      origin: "postgres-team",
    },
    teamStorage: {
      assetLibraryRecords: 1,
      generationTasks: 1,
      mediaConsistency: {
        missingPayloadFiles: 0,
        missingPreviewFiles: 0,
        orphanedPayloadFiles: 0,
        orphanedPreviewFiles: 0,
        tmpFiles: 0,
        trashFiles: 0,
      },
      payloadBytes: 2048,
      payloadRefs: 2,
      promptTemplates: 1,
      providerTargets: 1,
      secretSettings: 1,
      settings: 2,
      voiceProfiles: 1,
    },
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
