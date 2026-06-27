import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { BoardDocument } from "../lib/board/types";
import type { StorageItem, StorageItemMeta } from "../lib/db";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import {
  clearTeamAssets,
  deleteTeamAsset,
  listTeamAssets,
  repairTeamAssetSourceLinks,
  saveTeamAsset,
} from "../lib/storage/team-assets";
import {
  DELETE as clearTeamAssetsRoute,
  GET as getTeamAssets,
  PATCH as patchTeamAssets,
  POST as postTeamAsset,
} from "../app/api/storage/team/assets/route";
import { DELETE as deleteTeamAssetRoute } from "../app/api/storage/team/assets/[assetId]/route";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const ASSET_ID = "asset_1";

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

test("listTeamAssets returns safe metadata records scoped to the session workspace", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await listTeamAssets(
    createTeamAssetsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    {
      boardId: "board_1",
      ids: [ASSET_ID],
      limit: 20,
      offset: 2,
      statuses: ["complete"],
    },
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(result.limit, 20);
  assert.equal(result.offset, 2);
  assert.equal(result.assets[0]?.mediaUrl, "/api/storage/team/assets/asset_1/media");
  assert.equal(result.assets[0]?.downloadUrl, "/api/storage/team/assets/asset_1/media?download=1");
  assert.deepEqual(result.assets[0]?.payload, {
    contentHash: "sha256:abc",
    kind: "local-file",
    mimeType: "image/png",
    sizeBytes: 12,
  });
  assert.equal(Object.hasOwn(result.assets[0]?.payload ?? {}, "uri"), false);
  assert.deepEqual(
    queries.find(query => query.text.startsWith("select meta from assets"))?.values,
    [WORKSPACE_ID, "board_1", [ASSET_ID], ["complete"], 20, 2],
  );
});

test("listTeamAssets preserves empty board id for workspace gallery queries", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await listTeamAssets(
    createTeamAssetsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    {
      boardId: "",
      limit: 5,
      offset: 0,
    },
  );

  assert.equal(result.limit, 5);
  assert.deepEqual(
    queries.find(query => query.text.startsWith("select meta from assets"))?.values,
    [WORKSPACE_ID, "", 5, 0],
  );
});

test("deleteTeamAsset removes an editor-scoped asset record with audit", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamAsset(
    createTeamAssetsQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    ASSET_ID,
  );

  assert.deepEqual(
    queries.find(query => query.text.startsWith("select meta from assets"))?.values,
    [WORKSPACE_ID, ASSET_ID],
  );
  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from assets"))?.values,
    [WORKSPACE_ID, ASSET_ID],
  );
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  const audit = queries.find(query => query.text.startsWith("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, "user_1", "team_asset.delete"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, { assetId: ASSET_ID });
});

test("clearTeamAssets removes workspace assets and generation tasks with audit", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await clearTeamAssets(
    createTeamAssetsQueryable(queries, { role: "admin" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
  );

  assert.deepEqual(result, {
    deletedAssetCount: 3,
    deletedGenerationTaskCount: 2,
    deletedLibraryAssetCount: 1,
    targetKind: "postgres",
    workspaceId: WORKSPACE_ID,
  });
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  assert.deepEqual(
    queries.filter(query => query.text.startsWith("delete from")).map(query => [query.text, query.values]),
    [
      ["delete from generation_tasks where workspace_id = $1", [WORKSPACE_ID]],
      ["delete from assets where workspace_id = $1", [WORKSPACE_ID]],
    ],
  );
  const audit = queries.find(query => query.text.startsWith("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, "user_1", "team_assets.clear"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    deletedAssetCount: 3,
    deletedGenerationTaskCount: 2,
    deletedLibraryAssetCount: 1,
  });
});

test("clearTeamAssets rejects viewers before deleting workspace data", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await assert.rejects(
    clearTeamAssets(
      createTeamAssetsQueryable(queries, { role: "viewer" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
    ),
    /admin role is required/,
  );
  assert.equal(queries.some(query => query.text.startsWith("delete from")), false);
});

test("repairTeamAssetSourceLinks clears stale source links with audit", async () => {
  const staleMeta = createAssetMeta({ id: "asset_stale", sourceBoardNodeId: "missing_node" });
  const linkedMeta = createAssetMeta({ id: "asset_linked", sourceBoardNodeId: "node_1" });
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await repairTeamAssetSourceLinks(
    createTeamAssetsQueryable(queries, {
      assetMetas: [staleMeta, linkedMeta],
      boards: [createBoardDocument(["node_1"])],
      role: "admin",
    }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
  );

  const assetWrites = queries.filter(query => query.text.includes("insert into assets"));
  const savedMeta = assetWrites[0]?.values?.[2] as StorageItemMeta | undefined;

  assert.deepEqual(result, {
    repairedIds: ["asset_stale"],
    targetKind: "postgres",
    workspaceId: WORKSPACE_ID,
  });
  assert.equal(assetWrites.length, 1);
  assert.equal(savedMeta?.id, "asset_stale");
  assert.equal(savedMeta?.sourceBoardNodeId, undefined);
  const audit = queries.find(query => query.text.startsWith("insert into audit_events"));
  assert.deepEqual(audit?.values?.slice(0, 3), [WORKSPACE_ID, "user_1", "team_assets.repair_source_links"]);
  assert.deepEqual(JSON.parse(String(audit?.values?.[3])) as unknown, {
    repairedCount: 1,
  });
});

test("repairTeamAssetSourceLinks rejects viewers before updating metadata", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await assert.rejects(
    repairTeamAssetSourceLinks(
      createTeamAssetsQueryable(queries, { role: "viewer" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
    ),
    /admin role is required/,
  );
  assert.equal(queries.some(query => query.text.includes("insert into assets")), false);
});

test("saveTeamAsset writes an editor-scoped asset payload and metadata", async () => {
  const mediaDir = await mkdtemp(path.join(tmpdir(), "imagine-team-assets-"));
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  try {
    const result = await saveTeamAsset(
      createTeamAssetsQueryable(queries, { role: "editor" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir },
      requestWithSession(),
      { item: createStorageItem({ url: "data:image/png;base64,aW1hZ2U=" }) },
    );

    const assetInsert = queries.find(query => query.text.includes("insert into assets"));
    const payloadInsert = queries.find(query => query.text.includes("insert into asset_payloads"));
    const savedMeta = assetInsert?.values?.[2] as StorageItemMeta | undefined;

    assert.equal(result.targetKind, "postgres");
    assert.equal(result.workspaceId, WORKSPACE_ID);
    assert.equal(result.asset.mediaUrl, "/api/storage/team/assets/asset_1/media");
    assert.equal(result.asset.payload?.mimeType, "image/png");
    assert.equal(savedMeta?.id, ASSET_ID);
    assert.equal(savedMeta?.url, undefined);
    assert.equal(savedMeta?.hasBlob, true);
    assert.equal(savedMeta?.contentHash?.startsWith("sha256:"), true);
    assert.equal(payloadInsert?.values?.[0], ASSET_ID);
    assert.equal(payloadInsert?.values?.[2], "image/png");
  } finally {
    await rm(mediaDir, { force: true, recursive: true });
  }
});

test("saveTeamAsset preserves an existing payload for metadata-only updates", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await saveTeamAsset(
    createTeamAssetsQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { item: createStorageItem({ status: "failed", url: "/api/storage/team/assets/asset_1/media" }) },
  );

  const assetInsert = queries.find(query => query.text.includes("insert into assets"));
  const savedMeta = assetInsert?.values?.[2] as StorageItemMeta | undefined;
  assert.equal(result.asset.payload?.contentHash, "sha256:abc");
  assert.equal(savedMeta?.status, "failed");
  assert.equal(savedMeta?.contentHash, "sha256:abc");
});

test("team assets route rejects invalid query params before opening a database client", async () => {
  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
  };
  try {
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES = "1048576";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";

    const response = await getTeamAssets(new Request("http://localhost:3000/api/storage/team/assets?status=bad"));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "invalid_team_asset_query",
      error: "Invalid status",
    });
  } finally {
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_MAX_MEDIA_PAYLOAD_BYTES", originalEnv.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

test("team asset save route rejects missing CSRF before opening a database client", async () => {
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

    const response = await postTeamAsset(new Request("http://localhost:3000/api/storage/team/assets", {
      body: JSON.stringify({ asset: createStorageItem({ url: "data:image/png;base64,aW1hZ2U=" }) }),
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

test("team asset delete route rejects missing CSRF before opening a database client", async () => {
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

    const response = await deleteTeamAssetRoute(new Request("http://localhost:3000/api/storage/team/assets/asset_1", {
      headers: { origin: "http://localhost:3000" },
      method: "DELETE",
    }), assetRouteContext());
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

test("team assets clear route rejects missing CSRF before opening a database client", async () => {
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

    const response = await clearTeamAssetsRoute(new Request("http://localhost:3000/api/storage/team/assets", {
      headers: { origin: "http://localhost:3000" },
      method: "DELETE",
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

test("team asset patch route rejects missing CSRF before opening a database client", async () => {
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

    const response = await patchTeamAssets(new Request("http://localhost:3000/api/storage/team/assets", {
      body: JSON.stringify({ action: "repair-stale-source-links" }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      method: "PATCH",
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

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/assets", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamAssetsQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: {
    assetMetas?: StorageItemMeta[];
    boards?: BoardDocument[];
    role?: "owner" | "admin" | "editor" | "viewer";
  } = {},
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "viewer@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: options.role ?? "viewer",
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.includes("select count(*) from assets")) {
        return typedQueryResult<T>([{
          asset_count: 3,
          generation_task_count: 2,
          library_asset_count: 1,
        }]);
      }
      if (text.startsWith("select meta from assets")) {
        return typedQueryResult<T>((options.assetMetas ?? [createAssetMeta()]).map(meta => ({ meta })));
      }
      if (text.startsWith("select boards.board")) {
        return typedQueryResult<T>((options.boards ?? []).map(board => ({ board, summary: null })));
      }
      if (text.includes("from asset_payloads")) {
        return typedQueryResult<T>([{
          content_hash: "sha256:abc",
          mime_type: "image/png",
          size_bytes: 12,
          storage_key: "originals/image/asset_1.png",
          storage_kind: "local-file",
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function assetRouteContext(assetId = ASSET_ID): { params: Promise<{ assetId: string }> } {
  return { params: Promise.resolve({ assetId }) };
}

function createBoardDocument(nodeIds: string[]): BoardDocument {
  const now = "2026-06-26T00:00:00.000Z";
  return {
    config: { showGrid: true, showMiniMap: false, snapToGrid: true },
    createdAt: now,
    edges: [],
    id: "board_1",
    nodes: nodeIds.map(id => ({
      createdAt: now,
      id,
      kind: "prompt",
      position: { x: 0, y: 0 },
      prompt: "",
      size: { height: 100, width: 160 },
      title: id,
      updatedAt: now,
    })),
    title: "Board 1",
    updatedAt: now,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function createAssetMeta(overrides: Partial<StorageItemMeta> = {}): StorageItemMeta {
  return {
    aspectRatio: "1:1",
    boardId: "board_1",
    createdAt: "2026-06-26T00:00:00.000Z",
    hasBlob: true,
    id: ASSET_ID,
    model: "test-model",
    progress: 100,
    prompt: "test prompt",
    scope: "workspace",
    status: "complete",
    type: "image",
    ...overrides,
  };
}

function createStorageItem(overrides: Partial<StorageItem> = {}): StorageItem {
  return {
    ...createAssetMeta(),
    url: "data:image/png;base64,aW1hZ2U=",
    ...overrides,
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
