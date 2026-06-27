import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { BoardAssetNode, BoardDocument } from "../lib/board/types";
import type { LibraryAssetRecord, StorageItemMeta } from "../lib/db";
import type { GenerationTask } from "../lib/generation-tasks";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { getTeamWorkspaceDataSummary } from "../lib/storage/team-data-summary";
import type { WorkspaceSafetySnapshotRecord } from "../lib/storage/schema";
import type { VoiceProfile } from "../lib/voice-profiles";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const CREATED_AT = "2026-06-27T00:00:00.000Z";
const PAYLOAD_STORAGE_KEY = "originals/image/ok.png";

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

test("getTeamWorkspaceDataSummary returns PostgreSQL workspace data health stats", async () => {
  await withTempMediaDir(async mediaDir => {
    await writeMediaFile(mediaDir, PAYLOAD_STORAGE_KEY);
    await writeMediaFile(mediaDir, "originals/image/orphan.png");
    await writeMediaFile(mediaDir, "previews/image/orphan.webp");
    await writeMediaFile(mediaDir, "backups/latest.zip");
    await writeMediaFile(mediaDir, "tmp/staged.part");
    await writeMediaFile(mediaDir, "trash/old.png");

    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    const result = await getTeamWorkspaceDataSummary(
      createTeamDataSummaryQueryable(queries),
      { databaseUrl: "postgres://localhost/imagine", mediaDir, mediaUsageWarningBytes: 25 },
      requestWithSession(),
    );

    assert.equal(result.targetKind, "postgres");
    assert.equal(result.workspaceId, WORKSPACE_ID);
    assert.equal(result.summary.assets.total, 5);
    assert.equal(result.summary.assets.referencedByBoards, 2);
    assert.equal(result.summary.assets.missingBoardReferences, 1);
    assert.equal(result.summary.assets.brokenComplete, 1);
    assert.equal(result.summary.assets.failed, 1);
    assert.equal(result.summary.assets.staleProcessing, 1);
    assert.equal(result.summary.assets.orphaned, 2);
    assert.equal(result.summary.integrity.status, "critical");
    assert.equal(result.summary.integrity.issueCount, 10);
    assert.deepEqual(result.summary.integrity.brokenCompleteAssetIds, ["asset_missing_payload"]);
    assert.deepEqual(result.summary.integrity.missingBoardReferences.map(reference => reference.assetId), ["asset_missing"]);
    assert.equal(result.summary.teamStorage?.payloadRefs, 1);
    assert.equal(result.summary.teamStorage?.payloadBytes, 1024);
    assert.equal(result.summary.teamStorage?.generationTasks, 2);
    assert.equal(result.summary.teamStorage?.failedGenerationTasks, 1);
    assert.equal(result.summary.teamStorage?.mediaBytes, 30);
    assert.equal(result.summary.teamStorage?.mediaUsageWarning, true);
    assert.equal(result.summary.teamStorage?.mediaUsageWarningBytes, 25);
    assert.deepEqual(result.summary.teamStorage?.mediaConsistency, {
      missingPayloadFiles: 0,
      missingPreviewFiles: 1,
      orphanedPayloadFiles: 1,
      orphanedPreviewFiles: 1,
      tmpFiles: 1,
      trashFiles: 1,
    });
    assert.equal(result.summary.teamStorage?.settings, 2);
    assert.equal(result.summary.teamStorage?.secretSettings, 1);
    assert.equal(result.summary.safety.latestSnapshot?.id, "latest");
    assert.equal("payload" in (result.summary.safety.latestSnapshot ?? {}), false);
    assert.deepEqual(
      queries.find(query => query.text.includes("select meta from assets"))?.values,
      [WORKSPACE_ID],
    );
  });
});

async function withTempMediaDir<T>(run: (mediaDir: string) => Promise<T>): Promise<T> {
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), "imagine-team-summary-media-"));
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

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/data-summary", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamDataSummaryQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) return typedQueryResult<T>([SESSION_ROW]);
      if (text.includes("select meta from assets")) {
        return typedQueryResult<T>(ASSETS.map(meta => ({ meta })));
      }
      if (text.includes("select board from boards")) return typedQueryResult<T>([{ board: BOARD }]);
      if (text.includes("asset_payloads.asset_id")) {
        return typedQueryResult<T>([{
          asset_id: "asset_ok",
          size_bytes: "1024",
          storage_key: PAYLOAD_STORAGE_KEY,
          storage_kind: "local-file",
        }]);
      }
      if (text.includes("from asset_previews")) {
        return typedQueryResult<T>([{ storage_key: "previews/image/missing.webp", storage_kind: "local-file" }]);
      }
      if (text.includes("(select count(*)::int from asset_library")) {
        return typedQueryResult<T>([{
          asset_library_records: 1,
          failed_generation_tasks: 1,
          generation_tasks: 2,
          prompt_templates: 1,
          provider_targets: 1,
          secret_settings: 1,
          settings: 2,
          voice_profiles: 1,
        }]);
      }
      if (text.includes("from safety_snapshots")) return typedQueryResult<T>([SNAPSHOT_ROW]);
      if (text.includes("select record from asset_library")) return typedQueryResult<T>([{ record: LIBRARY_RECORD }]);
      if (text.includes("select task from generation_tasks")) {
        return typedQueryResult<T>([{ task: GENERATION_TASK }, { task: FAILED_GENERATION_TASK }]);
      }
      if (text.includes("select profile from voice_profiles")) return typedQueryResult<T>([{ profile: VOICE_PROFILE }]);
      return typedQueryResult<T>([]);
    },
  };
}

const SESSION_ROW = {
  email: "viewer@example.com",
  expires_at: "2026-07-03T00:00:00.000Z",
  role: "viewer",
  session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
  team_id: "team_1",
  user_id: "user_1",
  workspace_id: WORKSPACE_ID,
};

function createAssetMeta(overrides: Partial<StorageItemMeta>): StorageItemMeta {
  return {
    aspectRatio: "1:1",
    boardId: "",
    createdAt: CREATED_AT,
    hasBlob: true,
    id: "asset",
    model: "model",
    progress: 100,
    prompt: "prompt",
    scope: "workspace",
    status: "complete",
    type: "image",
    ...overrides,
  };
}

const ASSETS: StorageItemMeta[] = [
  createAssetMeta({ id: "asset_ok" }),
  createAssetMeta({ id: "asset_missing_payload" }),
  createAssetMeta({ hasBlob: false, id: "asset_failed", status: "failed", url: "" }),
  createAssetMeta({ createdAt: "2020-01-01T00:00:00.000Z", id: "asset_stale", status: "pending" }),
  createAssetMeta({ hasBlob: false, id: "asset_orphan", url: "https://cdn.example.com/orphan.png" }),
];

const ASSET_NODE: BoardAssetNode = {
  asset: {
    assetId: "asset_ok",
    model: "model",
    prompt: "prompt",
    type: "image",
    url: "/api/storage/team/assets/asset_ok/media",
  },
  createdAt: CREATED_AT,
  id: "node_asset",
  kind: "asset",
  position: { x: 0, y: 0 },
  size: { height: 160, width: 240 },
  title: "Asset",
  updatedAt: CREATED_AT,
};

const MISSING_NODE: BoardAssetNode = {
  ...ASSET_NODE,
  asset: { ...ASSET_NODE.asset, assetId: "asset_missing" },
  id: "node_missing",
};

const BOARD: BoardDocument = {
  config: { showGrid: true, showMiniMap: true, snapToGrid: false },
  createdAt: CREATED_AT,
  edges: [],
  id: "board_1",
  nodes: [ASSET_NODE, MISSING_NODE],
  title: "Board",
  updatedAt: CREATED_AT,
  viewport: { x: 0, y: 0, zoom: 1 },
};

const LIBRARY_RECORD: LibraryAssetRecord = {
  assetId: "asset_ok",
  category: "character",
  createdAt: CREATED_AT,
  favorite: false,
  id: "library_1",
  mediaType: "image",
  notes: "",
  origin: "promoted",
  tags: [],
  title: "Hero",
  updatedAt: CREATED_AT,
};

const GENERATION_TASK: GenerationTask = {
  canCancelRemote: true,
  createdAt: CREATED_AT,
  id: "task_1",
  mediaType: "image",
  model: "model",
  progress: 100,
  prompt: "prompt",
  resultAssetIds: ["asset_ok"],
  source: { surface: "workspace" },
  status: "complete",
  updatedAt: CREATED_AT,
};

const FAILED_GENERATION_TASK: GenerationTask = {
  ...GENERATION_TASK,
  canCancelRemote: false,
  errorMessage: "Provider failed",
  id: "task_failed",
  progress: 0,
  resultAssetIds: [],
  status: "failed",
};

const VOICE_PROFILE: VoiceProfile = {
  createdAt: CREATED_AT,
  id: "voice_1",
  name: "Narrator",
  provider: "runninghub",
  referenceAudioAssetIds: [],
  source: "imported",
  tags: [],
  updatedAt: CREATED_AT,
};

const SNAPSHOT: WorkspaceSafetySnapshotRecord = {
  assetCount: 5,
  boardCount: 1,
  createdAt: CREATED_AT,
  fileName: "Imagine_Workbench_Safety_cleanup-assets.zip",
  generationTaskCount: 1,
  id: "latest",
  libraryAssetCount: 1,
  origin: "postgres-team",
  payload: {
    kind: "local-file",
    mimeType: "application/zip",
    sizeBytes: 2048,
    uri: "backups/latest.zip",
  },
  reason: "cleanup-assets",
  settingsKeyCount: 3,
  sizeBytes: 2048,
  voiceProfileCount: 1,
};

const SNAPSHOT_ROW = {
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
};
