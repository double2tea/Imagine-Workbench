import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { StorageItemMeta } from "../lib/db";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { listTeamAssets } from "../lib/storage/team-assets";
import { GET as getTeamAssets } from "../app/api/storage/team/assets/route";

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

test("team assets route rejects invalid query params before opening a database client", async () => {
  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
  };
  try {
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
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
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "viewer@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: "viewer",
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.startsWith("select meta from assets")) {
        return typedQueryResult<T>([{ meta: createAssetMeta() }]);
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

function createAssetMeta(): StorageItemMeta {
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
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
