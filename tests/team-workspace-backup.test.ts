import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
import type { QueryResult, QueryResultRow } from "pg";

import type { BoardDocument } from "../lib/board/types";
import type { StorageItemMeta } from "../lib/db";
import type { GenerationTask } from "../lib/generation-tasks";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { exportTeamWorkspaceBackup } from "../lib/storage/team-workspace-backup";
import type { VoiceProfile } from "../lib/voice-profiles";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const CREATED_AT = "2026-06-27T00:00:00.000Z";

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

test("exportTeamWorkspaceBackup writes a redacted portable workspace zip and audit event", async () => {
  await withTempMediaDir(async mediaDir => {
    await writeMediaFile(mediaDir, "originals/image/asset.png", "image-bytes");
    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    const result = await exportTeamWorkspaceBackup(
      createTeamBackupQueryable(queries),
      { databaseUrl: "postgres://localhost/imagine", mediaDir },
      requestWithSession(),
      false,
    );

    assert.equal(result.targetKind, "postgres");
    assert.equal(result.workspaceId, WORKSPACE_ID);
    assert.equal(result.assetCount, 1);
    assert.equal(result.boardCount, 1);
    assert.equal(result.generationTaskCount, 1);
    assert.equal(result.libraryAssetCount, 1);
    assert.equal(result.voiceProfileCount, 1);
    assert.match(result.fileName, /^Imagine_Team_Backup_/);

    const zip = await JSZip.loadAsync(result.body);
    const manifest = JSON.parse(await readZipText(zip, "manifest.json")) as {
      counts: { assets: number; boards: number; generationTasks: number; libraryAssets: number; settingsKeys: number; voiceProfiles: number };
    };
    assert.deepEqual(manifest.counts, {
      assets: 1,
      boards: 1,
      generationTasks: 1,
      libraryAssets: 1,
      settingsKeys: 0,
      voiceProfiles: 1,
    });
    const assets = JSON.parse(await readZipText(zip, "assets/index.json")) as Array<Record<string, unknown>>;
    assert.equal(assets[0]?.mediaFile, "assets/media/asset_1.png");
    assert.equal(assets[0]?.mediaMimeType, "image/png");
    assert.equal(JSON.stringify(assets).includes("secret-password"), false);
    assert.equal(await zip.file("assets/media/asset_1.png")?.async("text"), "image-bytes");

    const boards = JSON.parse(await readZipText(zip, "boards/index.json")) as Array<Record<string, unknown>>;
    assert.equal(JSON.stringify(boards).includes("board-secret"), false);
    assert.deepEqual(JSON.parse(await readZipText(zip, "generation-tasks/index.json")), [GENERATION_TASK]);
    assert.deepEqual(JSON.parse(await readZipText(zip, "settings/local-storage.json")), { localStorage: {} });
    assert.deepEqual(
      queries.find(query => query.text.startsWith("insert into audit_events"))?.values?.slice(0, 3),
      [WORKSPACE_ID, "user_1", "team_backup.export"],
    );
  });
});

test("exportTeamWorkspaceBackup rejects credential-inclusive exports explicitly", async () => {
  await withTempMediaDir(async mediaDir => {
    await assert.rejects(
      exportTeamWorkspaceBackup(
        createTeamBackupQueryable(),
        { databaseUrl: "postgres://localhost/imagine", mediaDir },
        requestWithSession(),
        true,
      ),
      /credential-inclusive backup export is not available yet/,
    );
  });
});

async function withTempMediaDir<T>(run: (mediaDir: string) => Promise<T>): Promise<T> {
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), "imagine-team-backup-"));
  try {
    return await run(mediaDir);
  } finally {
    await rm(mediaDir, { force: true, recursive: true });
  }
}

async function writeMediaFile(mediaDir: string, storageKey: string, content: string): Promise<void> {
  const filePath = path.join(mediaDir, ...storageKey.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

async function readZipText(zip: JSZip, filePath: string): Promise<string> {
  const file = zip.file(filePath);
  if (!file) throw new Error(`Missing zip file ${filePath}`);
  return file.async("text");
}

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/backup", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamBackupQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) return typedQueryResult<T>([SESSION_ROW]);
      if (text.includes("select meta from assets")) return typedQueryResult<T>([{ meta: ASSET_META }]);
      if (text.includes("from asset_payloads where asset_id")) {
        return typedQueryResult<T>([{
          content_hash: "hash",
          mime_type: "image/png",
          size_bytes: "11",
          storage_key: "originals/image/asset.png",
          storage_kind: "local-file",
        }]);
      }
      if (text.includes("select record from asset_library")) return typedQueryResult<T>([{ record: LIBRARY_RECORD }]);
      if (text.includes("select boards.board")) return typedQueryResult<T>([{ board: BOARD, summary: null }]);
      if (text.includes("select task from generation_tasks")) return typedQueryResult<T>([{ task: GENERATION_TASK }]);
      if (text.includes("select profile from voice_profiles")) return typedQueryResult<T>([{ profile: VOICE_PROFILE }]);
      return typedQueryResult<T>([]);
    },
  };
}

const SESSION_ROW = {
  email: "admin@example.com",
  expires_at: "2026-07-03T00:00:00.000Z",
  role: "admin",
  session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
  team_id: "team_1",
  user_id: "user_1",
  workspace_id: WORKSPACE_ID,
};

const ASSET_META: StorageItemMeta = {
  aspectRatio: "1:1",
  boardId: "",
  createdAt: CREATED_AT,
  generationRequest: {
    aspectRatio: "1:1",
    model: "model",
    prompt: "prompt",
    runningHubAccessPassword: "secret-password",
  },
  hasBlob: true,
  id: "asset_1",
  model: "model",
  progress: 100,
  prompt: "prompt",
  scope: "workspace",
  status: "complete",
  type: "image",
};

const BOARD: BoardDocument = {
  config: { showGrid: true, showMiniMap: true, snapToGrid: false },
  createdAt: CREATED_AT,
  edges: [],
  id: "board_1",
  nodes: [{
    bindings: [],
    createdAt: CREATED_AT,
    id: "node_1",
    kind: "runninghub-app",
    outputType: "image",
    position: { x: 0, y: 0 },
    prompt: "prompt",
    size: { height: 200, width: 240 },
    status: "idle",
    targetId: "target_1",
    targetType: "ai-app",
    title: "RunningHub",
    updatedAt: CREATED_AT,
    accessPassword: "board-secret",
  }],
  title: "Board",
  updatedAt: CREATED_AT,
  viewport: { x: 0, y: 0, zoom: 1 },
};

const LIBRARY_RECORD = {
  assetId: "asset_1",
  category: "character",
  createdAt: CREATED_AT,
  favorite: false,
  id: "library_1",
  mediaType: "image",
  notes: "",
  origin: "promoted",
  sourceAssetId: "asset_1",
  tags: [],
  title: "Hero",
  updatedAt: CREATED_AT,
};

const GENERATION_TASK: GenerationTask = {
  canCancelRemote: false,
  createdAt: CREATED_AT,
  id: "task_1",
  mediaType: "image",
  model: "model",
  progress: 100,
  prompt: "prompt",
  request: {
    aspectRatio: "1:1",
    model: "model",
    prompt: "prompt",
  },
  resultAssetIds: ["asset_1"],
  source: { surface: "workspace" },
  status: "complete",
  updatedAt: CREATED_AT,
};

const VOICE_PROFILE: VoiceProfile = {
  createdAt: CREATED_AT,
  id: "voice_1",
  name: "Voice",
  provider: "mimo",
  referenceAudioAssetIds: [],
  source: "designed",
  tags: [],
  updatedAt: CREATED_AT,
};
