import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import type { WorkspaceSafetySnapshotRecord } from "../lib/storage/schema";
import {
  fetchTeamSafetySnapshot,
} from "../lib/storage/team-client";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import {
  getLatestTeamSafetySnapshot,
  saveTeamSafetySnapshot,
} from "../lib/storage/team-safety-snapshots";

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

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("getLatestTeamSafetySnapshot returns a workspace-scoped public summary", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await getLatestTeamSafetySnapshot(
    createTeamSafetySnapshotsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(result.snapshot?.id, "latest");
  assert.equal(result.snapshot?.reason, "clear-assets");
  assert.equal("payload" in (result.snapshot ?? {}), false);
  assert.deepEqual(
    queries.find(query => query.text.includes("from safety_snapshots"))?.values,
    [WORKSPACE_ID],
  );
});

test("saveTeamSafetySnapshot stores an editor-scoped snapshot and audit event", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await saveTeamSafetySnapshot(
    createTeamSafetySnapshotsQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { snapshot: SNAPSHOT },
  );

  const insert = queries.find(query => query.text.includes("insert into safety_snapshots"));
  const audit = queries.find(query => query.text.includes("insert into audit_events"));

  assert.equal(result.snapshot?.id, "latest");
  assert.equal("payload" in (result.snapshot ?? {}), false);
  assert.deepEqual(insert?.values, [SNAPSHOT.id, WORKSPACE_ID, SNAPSHOT, SNAPSHOT.createdAt]);
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  assert.deepEqual(audit?.values, [
    WORKSPACE_ID,
    "user_1",
    "safety_snapshot.save",
    JSON.stringify({
      assetCount: SNAPSHOT.assetCount,
      boardCount: SNAPSHOT.boardCount,
      id: SNAPSHOT.id,
      reason: SNAPSHOT.reason,
      sizeBytes: SNAPSHOT.sizeBytes,
    }),
  ]);
});

test("team safety snapshot client parses public summaries and rejects payload leaks", async () => {
  let requestedUrl = "";
  const result = await fetchTeamSafetySnapshot(async input => {
    requestedUrl = String(input);
    return jsonResponse({
      snapshot: PUBLIC_SNAPSHOT,
      targetKind: "postgres",
      workspaceId: WORKSPACE_ID,
    });
  });

  assert.equal(requestedUrl, "/api/storage/team/safety-snapshot");
  assert.equal(result.snapshot?.id, "latest");

  await assert.rejects(
    fetchTeamSafetySnapshot(async () => jsonResponse({
      snapshot: { ...PUBLIC_SNAPSHOT, payload: SNAPSHOT.payload },
      targetKind: "postgres",
      workspaceId: WORKSPACE_ID,
    })),
    /Team safety snapshot response is invalid/,
  );
});

const SNAPSHOT: WorkspaceSafetySnapshotRecord = {
  assetCount: 3,
  boardCount: 2,
  createdAt: "2026-06-27T00:00:00.000Z",
  fileName: "Imagine_Workbench_Safety_clear-assets.zip",
  generationTaskCount: 1,
  id: "latest",
  libraryAssetCount: 1,
  origin: "local-browser",
  payload: {
    contentHash: "sha256:abc",
    kind: "local-file",
    mimeType: "application/zip",
    sizeBytes: 2048,
    uri: "originals/backup/safety.zip",
  },
  reason: "clear-assets",
  settingsKeyCount: 4,
  sizeBytes: 2048,
  voiceProfileCount: 1,
};

const PUBLIC_SNAPSHOT = {
  assetCount: SNAPSHOT.assetCount,
  boardCount: SNAPSHOT.boardCount,
  createdAt: SNAPSHOT.createdAt,
  fileName: SNAPSHOT.fileName,
  generationTaskCount: SNAPSHOT.generationTaskCount,
  id: SNAPSHOT.id,
  libraryAssetCount: SNAPSHOT.libraryAssetCount,
  origin: SNAPSHOT.origin,
  reason: SNAPSHOT.reason,
  settingsKeyCount: SNAPSHOT.settingsKeyCount,
  sizeBytes: SNAPSHOT.sizeBytes,
  voiceProfileCount: SNAPSHOT.voiceProfileCount,
};

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/safety-snapshot", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamSafetySnapshotsQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: { role?: "owner" | "admin" | "editor" | "viewer" } = {},
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "editor@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: options.role ?? "viewer",
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.includes("insert into safety_snapshots")) {
        return typedQueryResult<T>([{ id: SNAPSHOT.id }]);
      }
      if (text.includes("from safety_snapshots")) {
        return typedQueryResult<T>([{
          asset_count: SNAPSHOT.assetCount,
          board_count: SNAPSHOT.boardCount,
          created_at: SNAPSHOT.createdAt,
          file_name: SNAPSHOT.fileName,
          generation_task_count: SNAPSHOT.generationTaskCount,
          id: SNAPSHOT.id,
          library_asset_count: SNAPSHOT.libraryAssetCount,
          origin: SNAPSHOT.origin,
          payload: SNAPSHOT.payload,
          reason: SNAPSHOT.reason,
          settings_key_count: SNAPSHOT.settingsKeyCount,
          size_bytes: SNAPSHOT.sizeBytes,
          voice_profile_count: SNAPSHOT.voiceProfileCount,
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };
}
