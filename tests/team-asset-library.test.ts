import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { LibraryAssetRecord, StorageItemMeta } from "../lib/db";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import {
  deleteTeamAssetLibraryRecord,
  listTeamAssetLibrary,
  saveTeamAssetLibraryRecord,
} from "../lib/storage/team-asset-library";
import { DELETE as deleteTeamAssetLibraryRoute } from "../app/api/storage/team/asset-library/[itemId]/route";
import { GET as getTeamAssetLibrary, POST as postTeamAssetLibrary } from "../app/api/storage/team/asset-library/route";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const LIBRARY_ITEM_ID = "library_1";
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

test("listTeamAssetLibrary returns safe library entries scoped to the session workspace", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await listTeamAssetLibrary(
    createTeamAssetLibraryQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { limit: 20, offset: 2 },
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(result.limit, 20);
  assert.equal(result.offset, 2);
  assert.equal(result.entries[0]?.record.id, LIBRARY_ITEM_ID);
  assert.equal(result.entries[0]?.asset?.mediaUrl, "/api/storage/team/assets/asset_1/media");
  assert.equal(result.entries[0]?.asset?.payload?.kind, "local-file");
  assert.equal(Object.hasOwn(result.entries[0]?.asset?.payload ?? {}, "uri"), false);
  assert.deepEqual(
    queries.find(query => query.text.startsWith("select record from asset_library"))?.values,
    [WORKSPACE_ID, 20, 2],
  );
});

test("saveTeamAssetLibraryRecord writes an editor-scoped library record with audit", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const record = createLibraryAssetRecord({ title: "Updated character" });
  const result = await saveTeamAssetLibraryRecord(
    createTeamAssetLibraryQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { record },
  );

  const insert = queries.find(query => query.text.includes("insert into asset_library"));
  assert.equal(result.entry.record.title, "Updated character");
  assert.equal(result.entry.asset?.mediaUrl, "/api/storage/team/assets/asset_1/media");
  assert.equal(result.entry.asset?.payload?.kind, "local-file");
  assert.equal(insert?.values?.[0], LIBRARY_ITEM_ID);
  assert.equal(insert?.values?.[1], WORKSPACE_ID);
  assert.equal(insert?.values?.[2], ASSET_ID);
  assert.deepEqual(insert?.values?.[3], record);
  assert.equal(Object.hasOwn(insert?.values?.[3] as object, "mediaFile"), false);
  assert.equal(Object.hasOwn(insert?.values?.[3] as object, "storageKey"), false);
  assert.equal(queries.some(query => query.text.includes("insert into asset_payloads")), false);
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  const audit = queries.find(query => query.text.startsWith("insert into audit_events"));
  assert.deepEqual(audit?.values, [
    WORKSPACE_ID,
    "user_1",
    "team_asset_library.save",
    JSON.stringify({ assetId: ASSET_ID, itemId: LIBRARY_ITEM_ID, mediaType: "image" }),
  ]);
});

test("deleteTeamAssetLibraryRecord deletes dedicated backing assets with audit", async () => {
  const dedicatedQueries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamAssetLibraryRecord(
    createTeamAssetLibraryQueryable(dedicatedQueries, { role: "editor", dedicatedLibraryAsset: true }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    LIBRARY_ITEM_ID,
  );
  assert.deepEqual(
    dedicatedQueries.find(query => query.text.startsWith("delete from assets"))?.values,
    [WORKSPACE_ID, ASSET_ID],
  );
  assert.ok(dedicatedQueries.some(query => query.text === "begin"));
  assert.ok(dedicatedQueries.some(query => query.text === "commit"));
  assert.equal(dedicatedQueries.some(query => query.text === "rollback"), false);
  const dedicatedAudit = dedicatedQueries.find(query => query.text.startsWith("insert into audit_events"));
  assert.deepEqual(dedicatedAudit?.values, [
    WORKSPACE_ID,
    "user_1",
    "team_asset_library.delete",
    JSON.stringify({ assetId: ASSET_ID, deletedBackingAsset: true, itemId: LIBRARY_ITEM_ID }),
  ]);

  const promotedQueries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamAssetLibraryRecord(
    createTeamAssetLibraryQueryable(promotedQueries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    LIBRARY_ITEM_ID,
  );
  assert.equal(promotedQueries.some(query => query.text.startsWith("delete from assets")), false);
  assert.deepEqual(
    promotedQueries.find(query => query.text.startsWith("delete from asset_library"))?.values,
    [WORKSPACE_ID, LIBRARY_ITEM_ID],
  );
  const promotedAudit = promotedQueries.find(query => query.text.startsWith("insert into audit_events"));
  assert.deepEqual(promotedAudit?.values, [
    WORKSPACE_ID,
    "user_1",
    "team_asset_library.delete",
    JSON.stringify({ assetId: ASSET_ID, deletedBackingAsset: false, itemId: LIBRARY_ITEM_ID }),
  ]);
});

test("team asset library routes reject invalid inputs before opening a database client", async () => {
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

    const invalidList = await getTeamAssetLibrary(new Request("http://localhost:3000/api/storage/team/asset-library?limit=0"));
    assert.equal(invalidList.status, 400);
    assert.deepEqual(await invalidList.json(), {
      code: "invalid_team_asset_library_query",
      error: "Invalid limit",
    });

    const missingPostCsrf = await postTeamAssetLibrary(new Request("http://localhost:3000/api/storage/team/asset-library", {
      body: JSON.stringify({ record: createLibraryAssetRecord() }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      method: "POST",
    }));
    assert.equal(missingPostCsrf.status, 403);
    assert.deepEqual(await missingPostCsrf.json(), {
      code: "invalid_csrf",
      error: "Valid CSRF token is required",
    });

    const missingDeleteCsrf = await deleteTeamAssetLibraryRoute(new Request("http://localhost:3000/api/storage/team/asset-library/library_1", {
      headers: { origin: "http://localhost:3000" },
      method: "DELETE",
    }), assetLibraryRouteContext());
    assert.equal(missingDeleteCsrf.status, 403);
    assert.deepEqual(await missingDeleteCsrf.json(), {
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
  return new Request("http://localhost:3000/api/storage/team/asset-library", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamAssetLibraryQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: {
    dedicatedLibraryAsset?: boolean;
    role?: "owner" | "admin" | "editor" | "viewer";
  } = {},
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text === "begin" || text === "commit" || text === "rollback") {
        return typedQueryResult<T>([]);
      }
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
      if (text.startsWith("select record from asset_library")) {
        return typedQueryResult<T>([{ record: createLibraryAssetRecord() }]);
      }
      if (text.startsWith("select meta from assets")) {
        return typedQueryResult<T>([{ meta: createAssetMeta(options.dedicatedLibraryAsset) }]);
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
      if (text.startsWith("insert into audit_events")) {
        return typedQueryResult<T>([]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function assetLibraryRouteContext(itemId = LIBRARY_ITEM_ID): { params: Promise<{ itemId: string }> } {
  return { params: Promise.resolve({ itemId }) };
}

function createLibraryAssetRecord(overrides: Partial<LibraryAssetRecord> = {}): LibraryAssetRecord {
  return {
    assetId: ASSET_ID,
    category: "character",
    createdAt: "2026-06-27T00:00:00.000Z",
    favorite: false,
    id: LIBRARY_ITEM_ID,
    mediaType: "image",
    notes: "",
    origin: "promoted",
    sourceAssetId: ASSET_ID,
    tags: ["hero"],
    title: "Hero character",
    updatedAt: "2026-06-27T00:00:00.000Z",
    ...overrides,
  };
}

function createAssetMeta(dedicatedLibraryAsset = false): StorageItemMeta {
  return {
    aspectRatio: "1:1",
    boardId: "",
    createdAt: "2026-06-26T00:00:00.000Z",
    hasBlob: true,
    id: ASSET_ID,
    libraryItemId: dedicatedLibraryAsset ? LIBRARY_ITEM_ID : undefined,
    model: "test-model",
    progress: 100,
    prompt: "test prompt",
    scope: "workspace",
    status: "complete",
    type: "image",
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
