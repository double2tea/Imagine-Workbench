import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { cleanupTeamMediaMaintenance } from "../lib/storage/team-media-maintenance";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";

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

test("cleanupTeamMediaMaintenance requires admin and removes only maintenance files", async () => {
  await withTempMediaDir(async mediaDir => {
    await writeMediaFile(mediaDir, "originals/image/kept.png");
    await writeMediaFile(mediaDir, "previews/image/kept.webp");
    await writeMediaFile(mediaDir, "originals/image/orphan.png");
    await writeMediaFile(mediaDir, "previews/image/orphan.webp");
    await writeMediaFile(mediaDir, "tmp/staged.part");
    await writeMediaFile(mediaDir, "trash/old.png");

    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    const result = await cleanupTeamMediaMaintenance(
      createTeamMediaMaintenanceQueryable(queries),
      { databaseUrl: "postgres://localhost/imagine", mediaDir },
      requestWithSession(),
      "maintenance-files",
    );

    assert.deepEqual(result, {
      deletedFiles: 4,
      deletedMissingPayloadAssets: 0,
      deletedOrphanedPayloadFiles: 1,
      deletedOrphanedPreviewFiles: 1,
      deletedTmpFiles: 1,
      deletedTrashFiles: 1,
      target: "maintenance-files",
      targetKind: "postgres",
      workspaceId: WORKSPACE_ID,
    });
    assert.equal(await fileExists(mediaDir, "originals/image/kept.png"), true);
    assert.equal(await fileExists(mediaDir, "previews/image/kept.webp"), true);
    assert.equal(await fileExists(mediaDir, "originals/image/orphan.png"), false);
    assert.equal(await fileExists(mediaDir, "previews/image/orphan.webp"), false);
    assert.deepEqual(
      queries.find(query => query.text.startsWith("insert into audit_events"))?.values?.slice(0, 3),
      [WORKSPACE_ID, "user_1", "team_media.cleanup"],
    );
  });
});

test("cleanupTeamMediaMaintenance deletes asset rows with missing payload files", async () => {
  await withTempMediaDir(async mediaDir => {
    await writeMediaFile(mediaDir, "originals/image/kept.png");

    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    const result = await cleanupTeamMediaMaintenance(
      createTeamMediaMaintenanceQueryable(
        queries,
        "admin",
        [
          { asset_id: "asset_kept", storage_key: "originals/image/kept.png", storage_kind: "local-file" },
          { asset_id: "asset_missing", storage_key: "originals/image/missing.png", storage_kind: "local-file" },
          { asset_id: "asset_remote", storage_key: "https://example.com/media.png", storage_kind: "remote-url" },
        ],
      ),
      { databaseUrl: "postgres://localhost/imagine", mediaDir },
      requestWithSession(),
      "missing-payload-assets",
    );

    assert.deepEqual(result, {
      deletedFiles: 0,
      deletedMissingPayloadAssets: 1,
      deletedOrphanedPayloadFiles: 0,
      deletedOrphanedPreviewFiles: 0,
      deletedTmpFiles: 0,
      deletedTrashFiles: 0,
      target: "missing-payload-assets",
      targetKind: "postgres",
      workspaceId: WORKSPACE_ID,
    });
    assert.ok(queries.some(query => query.text === "begin"));
    assert.ok(queries.some(query => query.text === "commit"));
    assert.equal(queries.some(query => query.text === "rollback"), false);
    assert.deepEqual(
      queries.filter(query => query.text.startsWith("delete from assets")).map(query => query.values),
      [[WORKSPACE_ID, "asset_missing"]],
    );
    assert.deepEqual(
      queries.find(query => query.text.startsWith("insert into audit_events"))?.values?.slice(0, 3),
      [WORKSPACE_ID, "user_1", "team_media.cleanup"],
    );
  });
});

test("cleanupTeamMediaMaintenance rejects viewers before deleting media", async () => {
  await withTempMediaDir(async mediaDir => {
    await writeMediaFile(mediaDir, "originals/image/orphan.png");
    await assert.rejects(
      cleanupTeamMediaMaintenance(
        createTeamMediaMaintenanceQueryable([], "viewer"),
        { databaseUrl: "postgres://localhost/imagine", mediaDir },
        requestWithSession(),
        "maintenance-files",
      ),
      /admin role is required/,
    );
    assert.equal(await fileExists(mediaDir, "originals/image/orphan.png"), true);
  });
});

async function withTempMediaDir<T>(run: (mediaDir: string) => Promise<T>): Promise<T> {
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), "imagine-team-media-maintenance-"));
  try {
    return await run(mediaDir);
  } finally {
    await rm(mediaDir, { force: true, recursive: true });
  }
}

async function writeMediaFile(mediaDir: string, storageKey: string): Promise<void> {
  const filePath = path.join(mediaDir, ...storageKey.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "media");
}

async function fileExists(mediaDir: string, storageKey: string): Promise<boolean> {
  try {
    const stats = await stat(path.join(mediaDir, ...storageKey.split("/")));
    return stats.isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/media-maintenance", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamMediaMaintenanceQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  role: "admin" | "viewer" = "admin",
  payloadRows: QueryResultRow[] = [{
    asset_id: "asset_kept",
    storage_key: "originals/image/kept.png",
    storage_kind: "local-file",
  }],
  previewRows: QueryResultRow[] = [{
    storage_key: "previews/image/kept.webp",
    storage_kind: "local-file",
  }],
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text === "begin" || text === "commit" || text === "rollback") return typedQueryResult<T>([]);
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "admin@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role,
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.includes("from asset_payloads")) {
        return typedQueryResult<T>(payloadRows);
      }
      if (text.includes("from asset_previews")) {
        return typedQueryResult<T>(previewRows);
      }
      return typedQueryResult<T>([]);
    },
  };
}
