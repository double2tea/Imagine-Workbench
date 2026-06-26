import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import type { StorageItemMeta } from "../lib/db";
import { LocalFilePayloadStore } from "../lib/storage/local-file-payload-store";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import type { WorkspaceAssetPayloadRef } from "../lib/storage/schema";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { readTeamAssetMedia } from "../lib/storage/team-media";

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

async function withTempMediaDir<T>(run: (mediaDir: string) => Promise<T>): Promise<T> {
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), "imagine-team-media-"));
  try {
    return await run(mediaDir);
  } finally {
    await rm(mediaDir, { force: true, recursive: true });
  }
}

test("readTeamAssetMedia serves a workspace-scoped asset payload for authenticated viewers", async () => {
  await withTempMediaDir(async mediaDir => {
    const ref = await new LocalFilePayloadStore(mediaDir).write({
      blob: new Blob(["image bytes"], { type: "image/png" }),
      mimeType: "image/png",
    });
    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    const queryable = createTeamMediaQueryable(ref, queries);

    const result = await readTeamAssetMedia(
      queryable,
      { databaseUrl: "postgres://localhost/imagine", mediaDir },
      requestWithSession(),
      ASSET_ID,
    );

    assert.equal(result.headers.get("Content-Type"), "image/png");
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.equal(result.headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(result.headers.get("Content-Disposition"), null);
    assert.equal(await result.body.text(), "image bytes");
    assert.deepEqual(
      queries.find(query => query.text.startsWith("select meta from assets"))?.values,
      [WORKSPACE_ID, ASSET_ID],
    );
  });
});

test("readTeamAssetMedia marks authenticated downloads as attachments", async () => {
  await withTempMediaDir(async mediaDir => {
    const ref = await new LocalFilePayloadStore(mediaDir).write({
      blob: new Blob(["image bytes"], { type: "image/png" }),
      mimeType: "image/png",
    });

    const result = await readTeamAssetMedia(
      createTeamMediaQueryable(ref),
      { databaseUrl: "postgres://localhost/imagine", mediaDir },
      requestWithSession(),
      "asset with spaces",
      { download: true },
    );

    assert.equal(result.headers.get("Content-Disposition"), "attachment; filename=\"asset_with_spaces.png\"");
  });
});

test("readTeamAssetMedia rejects missing sessions and missing assets", async () => {
  await withTempMediaDir(async mediaDir => {
    const ref = await new LocalFilePayloadStore(mediaDir).write({
      blob: new Blob(["image bytes"], { type: "image/png" }),
      mimeType: "image/png",
    });

    await assert.rejects(
      () => readTeamAssetMedia(
        createTeamMediaQueryable(ref),
        { databaseUrl: "postgres://localhost/imagine", mediaDir },
        new Request("http://localhost:3000/api/storage/team/assets/asset_1/media"),
        ASSET_ID,
      ),
      (error: unknown) => error instanceof ApiError && error.status === 401 && error.code === "unauthorized",
    );

    await assert.rejects(
      () => readTeamAssetMedia(
        createTeamMediaQueryable(ref, undefined, { assetExists: false }),
        { databaseUrl: "postgres://localhost/imagine", mediaDir },
        requestWithSession(),
        ASSET_ID,
      ),
      (error: unknown) => error instanceof ApiError && error.status === 404 && error.code === "asset_not_found",
    );
  });
});

test("readTeamAssetMedia fails explicitly when the payload MIME type is missing", async () => {
  await withTempMediaDir(async mediaDir => {
    const ref = await new LocalFilePayloadStore(mediaDir).write({
      blob: new Blob(["image bytes"], { type: "image/png" }),
      mimeType: "image/png",
    });

    await assert.rejects(
      () => readTeamAssetMedia(
        createTeamMediaQueryable({ ...ref, mimeType: undefined }),
        { databaseUrl: "postgres://localhost/imagine", mediaDir },
        requestWithSession(),
        ASSET_ID,
      ),
      (error: unknown) => error instanceof ApiError && error.status === 500 && error.code === "asset_payload_mime_missing",
    );
  });
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/assets/asset_1/media", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamMediaQueryable(
  ref: WorkspaceAssetPayloadRef,
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: { assetExists?: boolean } = {},
): PostgresQueryable {
  const assetExists = options.assetExists ?? true;
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
        const requestedAssetId = typeof values?.[1] === "string" ? values[1] : ASSET_ID;
        return typedQueryResult<T>(
          assetExists && values?.[0] === WORKSPACE_ID
            ? [{ meta: createAssetMeta(requestedAssetId) }]
            : [],
        );
      }
      if (text.includes("from asset_payloads")) {
        return typedQueryResult<T>(typeof values?.[0] === "string"
          ? [{
            content_hash: ref.contentHash ?? null,
            mime_type: ref.mimeType ?? null,
            size_bytes: ref.sizeBytes ?? null,
            storage_key: ref.uri,
            storage_kind: ref.kind,
          }]
          : []);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function createAssetMeta(assetId = ASSET_ID): StorageItemMeta {
  return {
    aspectRatio: "1:1",
    boardId: "",
    createdAt: "2026-06-26T00:00:00.000Z",
    hasBlob: true,
    id: assetId,
    model: "test-model",
    progress: 100,
    prompt: "test prompt",
    scope: "workspace",
    status: "complete",
    type: "image",
  };
}
