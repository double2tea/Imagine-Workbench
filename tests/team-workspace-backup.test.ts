import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import {
  decryptWorkspaceSecret,
  encryptWorkspaceSecret,
  isEncryptedWorkspaceSecret,
} from "../lib/storage/team-secret-crypto";
import {
  exportTeamWorkspaceBackup,
  restoreTeamWorkspaceBackup,
} from "../lib/storage/team-workspace-backup";
import {
  ASSET_INDEX_FILE,
  BACKUP_APP_NAME,
  BOARD_INDEX_FILE,
  GENERATION_TASK_INDEX_FILE,
  LIBRARY_INDEX_FILE,
  MANIFEST_FILE,
  SETTINGS_FILE,
  VOICE_PROFILE_INDEX_FILE,
  WORKSPACE_BACKUP_SCHEMA_VERSION,
} from "../lib/workspace-backup-format";
import type { VoiceProfile } from "../lib/voice-profiles";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const CREATED_AT = "2026-06-27T00:00:00.000Z";
const ENCRYPTION_KEY = "team-backup-encryption-key";

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
    assert.deepEqual(JSON.parse(await readZipText(zip, "settings/local-storage.json")), {
      localStorage: {},
      teamSettings: [],
    });
    assert.deepEqual(
      queries.find(query => query.text.startsWith("insert into audit_events"))?.values?.slice(0, 3),
      [WORKSPACE_ID, "user_1", "team_backup.export"],
    );
  });
});

test("exportTeamWorkspaceBackup includes team settings and opt-in secrets", async () => {
  await withTempMediaDir(async mediaDir => {
    await writeMediaFile(mediaDir, "originals/image/asset.png", "image-bytes");
    await withTeamEncryptionKey(async () => {
      const result = await exportTeamWorkspaceBackup(
        createTeamBackupQueryable([], {
          settingsRows: [
            settingRow("provider:runninghub:baseUrl", "provider", "https://runninghub.example.test", false),
            settingRow("provider:runninghub:apiKey", "provider", encryptedSecret("runninghub-secret"), true),
          ],
        }),
        { databaseUrl: "postgres://localhost/imagine", mediaDir },
        requestWithSession(),
        true,
      );

      assert.equal(result.settingsKeyCount, 2);
      const zip = await JSZip.loadAsync(result.body);
      const settings = JSON.parse(await readZipText(zip, SETTINGS_FILE)) as {
        localStorage: Record<string, string>;
        teamSecrets: Array<{ group: string; key: string; value: string }>;
        teamSettings: Array<{ group: string; key: string; value: string }>;
      };
      assert.deepEqual(settings.localStorage, {});
      assert.deepEqual(settings.teamSettings, [{
        group: "provider",
        key: "provider:runninghub:baseUrl",
        value: "https://runninghub.example.test",
      }]);
      assert.deepEqual(settings.teamSecrets, [{
        group: "provider",
        key: "provider:runninghub:apiKey",
        value: "runninghub-secret",
      }]);
    });
  });
});

test("restoreTeamWorkspaceBackup replaces team workspace records and stores a safety snapshot", async () => {
  await withTempMediaDir(async mediaDir => {
    const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
    const backup = await createPortableTeamBackup();
    const result = await restoreTeamWorkspaceBackup(
      createTeamBackupQueryable(queries, { existingRecords: false }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir },
      requestWithSession(),
      new Blob([backup], { type: "application/zip" }),
      false,
    );

    assert.equal(result.targetKind, "postgres");
    assert.equal(result.workspaceId, WORKSPACE_ID);
    assert.equal(result.assetCount, 1);
    assert.equal(result.boardCount, 1);
    assert.equal(result.generationTaskCount, 1);
    assert.equal(result.libraryAssetCount, 1);
    assert.equal(result.settingsKeyCount, 0);
    assert.equal(result.voiceProfileCount, 1);
    assert.equal(typeof result.safetySnapshotId, "string");
    assert.ok(queries.some(query => query.text === "begin"));
    assert.ok(queries.some(query => query.text === "commit"));
    assert.equal(queries.some(query => query.text === "rollback"), false);
    assert.ok(queries.some(query => query.text.startsWith("insert into safety_snapshots")));
    assert.ok(queries.some(query => query.values?.[2] === "team_backup.restore"));
    const payloadInsert = queries.find(query => query.text.includes("insert into asset_payloads") && query.values?.[0] === "asset_1");
    assert.ok(payloadInsert);
    assert.equal(payloadInsert.values?.[2], "image/png");
    assert.equal(await readFile(path.join(mediaDir, ...String(payloadInsert.values?.[5]).split("/")), "utf8"), "image-bytes");
  });
});

test("restoreTeamWorkspaceBackup restores team settings and opt-in secrets", async () => {
  await withTempMediaDir(async mediaDir => {
    await withTeamEncryptionKey(async () => {
      const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
      const backup = await createPortableTeamBackup({
        teamSecrets: [{ group: "provider", key: "provider:runninghub:apiKey", value: "restored-secret" }],
        teamSettings: [{ group: "provider", key: "provider:runninghub:baseUrl", value: "https://restored.example.test" }],
      });
      const result = await restoreTeamWorkspaceBackup(
        createTeamBackupQueryable(queries, {
          existingRecords: false,
          settingsRows: [
            settingRow("provider:oldBaseUrl", "provider", "https://old.example.test", false),
            settingRow("provider:oldApiKey", "provider", encryptedSecret("old-secret"), true),
          ],
        }),
        { databaseUrl: "postgres://localhost/imagine", mediaDir },
        requestWithSession(),
        new Blob([backup], { type: "application/zip" }),
        true,
      );

      assert.equal(result.settingsKeyCount, 2);
      assert.ok(queries.some(query => query.text === "delete from settings where workspace_id = $1 and key = $2" && query.values?.[1] === "provider:oldBaseUrl"));
      assert.ok(queries.some(query => query.text === "delete from settings where workspace_id = $1 and key = $2" && query.values?.[1] === "provider:oldApiKey"));
      const settingWrites = queries.filter(query => query.text.startsWith("insert into settings"));
      const baseUrlWrite = settingWrites.find(query => query.values?.[1] === "provider:runninghub:baseUrl");
      const secretWrite = settingWrites.find(query => query.values?.[1] === "provider:runninghub:apiKey");
      assert.equal(baseUrlWrite?.values?.[3], "https://restored.example.test");
      assert.equal(baseUrlWrite?.values?.[4], false);
      const secretValue = String(secretWrite?.values?.[3] ?? "");
      assert.equal(secretWrite?.values?.[4], true);
      assert.equal(isEncryptedWorkspaceSecret(secretValue), true);
      assert.equal(decryptWorkspaceSecret(secretValue, ENCRYPTION_KEY), "restored-secret");
    });
  });
});

test("restoreTeamWorkspaceBackup rejects credential settings without opt-in", async () => {
  await withTempMediaDir(async mediaDir => {
    const backup = await createPortableTeamBackup({
      teamSecrets: [{ group: "provider", key: "provider:runninghub:apiKey", value: "restored-secret" }],
    });
    await assert.rejects(
      restoreTeamWorkspaceBackup(
        createTeamBackupQueryable([], { existingRecords: false }),
        { databaseUrl: "postgres://localhost/imagine", mediaDir },
        requestWithSession(),
        new Blob([backup], { type: "application/zip" }),
        false,
      ),
      /credential restore requires the credentials option/,
    );
  });
});

test("restoreTeamWorkspaceBackup rejects duplicate team setting keys", async () => {
  await withTempMediaDir(async mediaDir => {
    const backup = await createPortableTeamBackup({
      teamSecrets: [{ group: "provider", key: "provider:runninghub:apiKey", value: "restored-secret" }],
      teamSettings: [{ group: "provider", key: "provider:runninghub:apiKey", value: "plain-value" }],
    });
    await assert.rejects(
      restoreTeamWorkspaceBackup(
        createTeamBackupQueryable([], { existingRecords: false }),
        { databaseUrl: "postgres://localhost/imagine", mediaDir },
        requestWithSession(),
        new Blob([backup], { type: "application/zip" }),
        true,
      ),
      /Duplicate team setting provider:runninghub:apiKey/,
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
  options: { existingRecords?: boolean; settingsRows?: QueryResultRow[] } = {},
): PostgresQueryable {
  const existingRecords = options.existingRecords ?? true;
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text === "begin" || text === "commit" || text === "rollback") return typedQueryResult<T>([]);
      if (text.includes("from sessions")) return typedQueryResult<T>([SESSION_ROW]);
      if (text.includes("select meta from assets")) return typedQueryResult<T>(existingRecords ? [{ meta: ASSET_META }] : []);
      if (text.includes("from asset_payloads where asset_id")) {
        return typedQueryResult<T>(existingRecords ? [{
          content_hash: "hash",
          mime_type: "image/png",
          size_bytes: "11",
          storage_key: "originals/image/asset.png",
          storage_kind: "local-file",
        }] : []);
      }
      if (text.includes("select record from asset_library")) return typedQueryResult<T>(existingRecords ? [{ record: LIBRARY_RECORD }] : []);
      if (text.includes("select boards.board")) return typedQueryResult<T>(existingRecords ? [{ board: BOARD, summary: null }] : []);
      if (text.includes("select task from generation_tasks")) return typedQueryResult<T>(existingRecords ? [{ task: GENERATION_TASK }] : []);
      if (text.includes("select profile from voice_profiles")) return typedQueryResult<T>(existingRecords ? [{ profile: VOICE_PROFILE }] : []);
      if (text.startsWith("select key") && text.includes("from settings")) {
        const rows = options.settingsRows ?? [];
        return typedQueryResult<T>(text.includes("is_secret = false") ? rows.filter(row => row.is_secret === false) : rows);
      }
      return typedQueryResult<T>([]);
    },
  };
}

async function createPortableTeamBackup(settings: {
  teamSecrets?: Array<{ group: string; key: string; value: string }>;
  teamSettings?: Array<{ group: string; key: string; value: string }>;
} = {}): Promise<ArrayBuffer> {
  const settingsKeyCount = (settings.teamSecrets?.length ?? 0) + (settings.teamSettings?.length ?? 0);
  const zip = new JSZip();
  zip.file(MANIFEST_FILE, JSON.stringify({
    app: BACKUP_APP_NAME,
    assetsFile: ASSET_INDEX_FILE,
    boardsFile: BOARD_INDEX_FILE,
    counts: {
      assets: 1,
      boards: 1,
      generationTasks: 1,
      libraryAssets: 1,
      settingsKeys: settingsKeyCount,
      voiceProfiles: 1,
    },
    exportedAt: CREATED_AT,
    generationTasksFile: GENERATION_TASK_INDEX_FILE,
    libraryFile: LIBRARY_INDEX_FILE,
    schemaVersion: WORKSPACE_BACKUP_SCHEMA_VERSION,
    settingsFile: SETTINGS_FILE,
    voiceProfilesFile: VOICE_PROFILE_INDEX_FILE,
  }));
  zip.file(ASSET_INDEX_FILE, JSON.stringify([{
    ...ASSET_META,
    mediaFile: "assets/media/asset_1.png",
    mediaMimeType: "image/png",
  }]));
  zip.file("assets/media/asset_1.png", "image-bytes");
  zip.file(LIBRARY_INDEX_FILE, JSON.stringify([LIBRARY_RECORD]));
  zip.file(BOARD_INDEX_FILE, JSON.stringify([BOARD]));
  zip.file(GENERATION_TASK_INDEX_FILE, JSON.stringify([GENERATION_TASK]));
  zip.file(VOICE_PROFILE_INDEX_FILE, JSON.stringify([VOICE_PROFILE]));
  zip.file(SETTINGS_FILE, JSON.stringify({ localStorage: {}, ...settings }));
  return zip.generateAsync({ type: "arraybuffer" });
}

async function withTeamEncryptionKey<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY;
  process.env.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY = ENCRYPTION_KEY;
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY;
    } else {
      process.env.IMAGINE_TEAM_SECRET_ENCRYPTION_KEY = previous;
    }
  }
}

function encryptedSecret(value: string): string {
  return encryptWorkspaceSecret(value, ENCRYPTION_KEY);
}

function settingRow(key: string, group: string, value: string, isSecret: boolean): QueryResultRow {
  return {
    group_name: group,
    is_secret: isSecret,
    key,
    updated_at: CREATED_AT,
    value_text: value,
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
