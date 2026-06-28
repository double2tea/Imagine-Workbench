import type { QueryResultRow } from "pg";
import type { BoardDocument, BoardSummary } from "@/lib/board/types";
import type { GenerationTask } from "@/lib/generation-tasks";
import { LocalFilePayloadStore } from "@/lib/storage/local-file-payload-store";
import type {
  WorkspaceAssetListOptions,
  WorkspaceAssetLibraryRepository,
  WorkspaceAssetPayloadRepository,
  WorkspaceAssetPreviewRepository,
  WorkspaceAssetRepository,
  WorkspaceBoardListOptions,
  WorkspaceBoardRepository,
  WorkspaceGenerationTaskListOptions,
  WorkspaceGenerationTaskRepository,
  WorkspaceSafetySnapshotRepository,
  WorkspaceSettingListOptions,
  WorkspaceSettingsRepository,
  WorkspaceStorageRepository,
  WorkspaceStoragePageOptions,
  WorkspaceVoiceProfileRepository,
} from "@/lib/storage/repository";
import {
  WORKSPACE_STORAGE_SCHEMA_VERSION,
  type WorkspaceAssetPayloadRef,
  type WorkspaceAssetLibraryRecord,
  type WorkspaceAssetPreviewRecord,
  type WorkspaceAssetRecord,
  type WorkspaceBoardRecord,
  type WorkspaceGenerationTaskRecord,
  type WorkspaceSafetySnapshotRecord,
  type WorkspaceSettingRecord,
  type WorkspaceVoiceProfileRecord,
} from "@/lib/storage/schema";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { isEncryptedWorkspaceSecret } from "@/lib/storage/team-secret-crypto";

interface AssetRow extends QueryResultRow {
  meta: WorkspaceAssetRecord["meta"];
}

interface PayloadRow extends QueryResultRow {
  content_hash: string | null;
  mime_type: string | null;
  size_bytes: string | number | null;
  storage_key: string;
  storage_kind: WorkspaceAssetPayloadRef["kind"];
}

interface PreviewRow extends QueryResultRow {
  preview: WorkspaceAssetPreviewRecord["preview"];
  storage_key: string | null;
  storage_kind: WorkspaceAssetPayloadRef["kind"] | null;
}

interface AssetLibraryRow extends QueryResultRow {
  record: WorkspaceAssetLibraryRecord["record"];
}

interface BoardRow extends QueryResultRow {
  board: BoardDocument;
  summary: BoardSummary;
}

interface GenerationTaskRow extends QueryResultRow {
  task: GenerationTask;
}

interface SettingRow extends QueryResultRow {
  group_name: WorkspaceSettingRecord["group"];
  is_secret: boolean;
  key: string;
  updated_at: Date | string;
  value_text: string;
}

interface SafetySnapshotRow extends QueryResultRow {
  asset_count: number;
  board_count: number;
  created_at: Date | string;
  file_name: string;
  generation_task_count: number;
  id: string;
  library_asset_count: number;
  origin: string;
  payload: WorkspaceAssetPayloadRef;
  reason: WorkspaceSafetySnapshotRecord["reason"];
  settings_key_count: number;
  size_bytes: string | number;
  voice_profile_count: number;
}

interface VoiceProfileRow extends QueryResultRow {
  profile: WorkspaceVoiceProfileRecord["profile"];
}

export function createPostgresWorkspaceStorageRepository(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  workspaceId: string,
): WorkspaceStorageRepository {
  return {
    assetLibrary: new PostgresAssetLibraryRepository(queryable, workspaceId),
    assets: new PostgresAssetRepository(queryable, workspaceId),
    boards: new PostgresBoardRepository(queryable, workspaceId),
    generationTasks: new PostgresGenerationTaskRepository(queryable, workspaceId),
    payloads: new PostgresAssetPayloadRepository(
      queryable,
      new LocalFilePayloadStore(config.mediaDir, { maxPayloadBytes: config.maxMediaPayloadBytes }),
    ),
    previews: new PostgresAssetPreviewRepository(queryable, workspaceId),
    safetySnapshots: new PostgresSafetySnapshotRepository(queryable, workspaceId),
    schemaVersion: WORKSPACE_STORAGE_SCHEMA_VERSION,
    settings: new PostgresSettingsRepository(queryable, workspaceId),
    targetKind: "postgres",
    voiceProfiles: new PostgresVoiceProfileRepository(queryable, workspaceId),
  };
}

class PostgresAssetLibraryRepository implements WorkspaceAssetLibraryRepository {
  constructor(
    private readonly queryable: PostgresQueryable,
    private readonly workspaceId: string,
  ) {}

  async delete(id: string): Promise<void> {
    await this.queryable.query("delete from asset_library where workspace_id = $1 and id = $2", [this.workspaceId, id]);
  }

  async get(id: string): Promise<WorkspaceAssetLibraryRecord | null> {
    const result = await this.queryable.query<AssetLibraryRow>(
      "select record from asset_library where workspace_id = $1 and id = $2",
      [this.workspaceId, id],
    );
    const record = result.rows[0]?.record;
    return record ? { record } : null;
  }

  async list(options: WorkspaceStoragePageOptions = {}): Promise<WorkspaceAssetLibraryRecord[]> {
    const result = await this.queryable.query<AssetLibraryRow>(
      "select record from asset_library where workspace_id = $1 order by updated_at desc limit $2 offset $3",
      [this.workspaceId, options.limit ?? 200, options.offset ?? 0],
    );
    return result.rows.map(row => ({ record: row.record }));
  }

  async put(record: WorkspaceAssetLibraryRecord): Promise<void> {
    await this.queryable.query(
      `insert into asset_library (id, workspace_id, asset_id, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (workspace_id, id) do update
         set asset_id = excluded.asset_id, record = excluded.record, updated_at = excluded.updated_at
       returning id`,
      [
        record.record.id,
        this.workspaceId,
        record.record.assetId,
        record.record,
        record.record.createdAt,
        record.record.updatedAt,
      ],
    );
  }
}

class PostgresAssetRepository implements WorkspaceAssetRepository {
  constructor(
    private readonly queryable: PostgresQueryable,
    private readonly workspaceId: string,
  ) {}

  async delete(id: string): Promise<void> {
    await this.queryable.query("delete from assets where workspace_id = $1 and id = $2", [this.workspaceId, id]);
  }

  async get(id: string): Promise<WorkspaceAssetRecord | null> {
    const result = await this.queryable.query<AssetRow>(
      "select meta from assets where workspace_id = $1 and id = $2",
      [this.workspaceId, id],
    );
    const meta = result.rows[0]?.meta;
    if (!meta) return null;
    return {
      meta,
      payload: await readAssetPayloadRef(this.queryable, this.workspaceId, id),
    };
  }

  async list(options: WorkspaceAssetListOptions = {}): Promise<WorkspaceAssetRecord[]> {
    const clauses: string[] = ["workspace_id = $1"];
    const values: unknown[] = [this.workspaceId];
    if (options.boardId !== undefined) {
      values.push(options.boardId);
      clauses.push(`meta->>'boardId' = $${values.length}`);
    }
    if (options.ids?.length) {
      values.push(options.ids);
      clauses.push(`id = any($${values.length})`);
    }
    if (options.statuses?.length) {
      values.push(options.statuses);
      clauses.push(`meta->>'status' = any($${values.length})`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    values.push(options.limit ?? 200);
    const limitIndex = values.length;
    values.push(options.offset ?? 0);
    const offsetIndex = values.length;
    const result = await this.queryable.query<AssetRow>(
      `select meta from assets ${where} order by updated_at desc limit $${limitIndex} offset $${offsetIndex}`,
      values,
    );
    return Promise.all(result.rows.map(async row => ({
      meta: row.meta,
      payload: await readAssetPayloadRef(this.queryable, this.workspaceId, row.meta.id),
    })));
  }

  async put(record: WorkspaceAssetRecord): Promise<void> {
    await this.queryable.query(
      `insert into assets (id, workspace_id, meta, updated_at)
       values ($1, $2, $3, now())
       on conflict (workspace_id, id) do update
         set meta = excluded.meta, version = assets.version + 1, updated_at = now()
      returning id`,
      [record.meta.id, this.workspaceId, record.meta],
    );
    if (record.payload) {
      await upsertAssetPayloadRef(this.queryable, this.workspaceId, record.meta.id, record.payload);
    }
  }
}

class PostgresAssetPayloadRepository implements WorkspaceAssetPayloadRepository {
  constructor(
    private readonly queryable: PostgresQueryable,
    private readonly payloadStore: LocalFilePayloadStore,
  ) {}

  async delete(ref: WorkspaceAssetPayloadRef): Promise<void> {
    await this.payloadStore.delete(ref);
  }

  async read(ref: WorkspaceAssetPayloadRef): Promise<Blob> {
    return this.payloadStore.read(ref);
  }

  async write(input: {
    assetId: string;
    blob: Blob;
    contentHash?: string;
    mimeType: string;
  }): Promise<WorkspaceAssetPayloadRef> {
    return this.payloadStore.write(input);
  }
}

class PostgresAssetPreviewRepository implements WorkspaceAssetPreviewRepository {
  constructor(
    private readonly queryable: PostgresQueryable,
    private readonly workspaceId: string,
  ) {}

  async delete(assetId: string): Promise<void> {
    await this.queryable.query("delete from asset_previews where workspace_id = $1 and asset_id = $2", [this.workspaceId, assetId]);
  }

  async get(assetId: string): Promise<WorkspaceAssetPreviewRecord | null> {
    const result = await this.queryable.query<PreviewRow>(
      "select preview, storage_kind, storage_key from asset_previews where workspace_id = $1 and asset_id = $2",
      [this.workspaceId, assetId],
    );
    return previewRecordFromRow(result.rows[0]);
  }

  async put(record: WorkspaceAssetPreviewRecord): Promise<void> {
    await this.queryable.query(
      `insert into asset_previews (workspace_id, asset_id, preview, storage_kind, storage_key, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (workspace_id, asset_id) do update
         set preview = excluded.preview,
           storage_kind = excluded.storage_kind,
           storage_key = excluded.storage_key,
           updated_at = now()`,
      [
        this.workspaceId,
        record.preview.assetId,
        previewMetadataForStorage(record.preview),
        record.ref?.kind ?? null,
        record.ref?.uri ?? null,
        record.preview.createdAt,
      ],
    );
  }
}

class PostgresBoardRepository implements WorkspaceBoardRepository {
  constructor(
    private readonly queryable: PostgresQueryable,
    private readonly workspaceId: string,
  ) {}

  async delete(id: string): Promise<void> {
    await this.queryable.query("delete from boards where workspace_id = $1 and id = $2", [this.workspaceId, id]);
  }

  async get(id: string): Promise<WorkspaceBoardRecord | null> {
    const result = await this.queryable.query<BoardRow>(
      `select boards.board, board_summaries.summary
       from boards
       left join board_summaries on board_summaries.workspace_id = boards.workspace_id and board_summaries.board_id = boards.id
       where boards.workspace_id = $1 and boards.id = $2`,
      [this.workspaceId, id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { board: row.board, summary: row.summary ?? toBoardSummary(row.board) };
  }

  async list(options: WorkspaceBoardListOptions = {}): Promise<WorkspaceBoardRecord[]> {
    const values: unknown[] = [this.workspaceId];
    const where = options.ids?.length ? "where boards.workspace_id = $1 and boards.id = any($2)" : "where boards.workspace_id = $1";
    if (options.ids?.length) values.push(options.ids);
    values.push(options.limit ?? 100);
    const limitIndex = values.length;
    values.push(options.offset ?? 0);
    const offsetIndex = values.length;
    const result = await this.queryable.query<BoardRow>(
      `select boards.board, board_summaries.summary
       from boards
       left join board_summaries on board_summaries.workspace_id = boards.workspace_id and board_summaries.board_id = boards.id
       ${where}
       order by boards.updated_at desc limit $${limitIndex} offset $${offsetIndex}`,
      values,
    );
    return result.rows.map(row => ({ board: row.board, summary: row.summary ?? toBoardSummary(row.board) }));
  }

  async put(board: BoardDocument): Promise<void> {
    const summary = toBoardSummary(board);
    await this.queryable.query(
      `insert into boards (id, workspace_id, board, updated_at)
       values ($1, $2, $3, now())
       on conflict (workspace_id, id) do update
         set board = excluded.board, version = boards.version + 1, updated_at = now()
       returning id`,
      [board.id, this.workspaceId, board],
    );
    await this.queryable.query(
      `insert into board_summaries (board_id, workspace_id, summary, updated_at)
       values ($1, $2, $3, now())
       on conflict (workspace_id, board_id) do update
         set summary = excluded.summary, updated_at = now()
       returning board_id`,
      [board.id, this.workspaceId, summary],
    );
  }
}

class PostgresGenerationTaskRepository implements WorkspaceGenerationTaskRepository {
  constructor(
    private readonly queryable: PostgresQueryable,
    private readonly workspaceId: string,
  ) {}

  async delete(id: string): Promise<void> {
    await this.queryable.query("delete from generation_tasks where workspace_id = $1 and id = $2", [this.workspaceId, id]);
  }

  async get(id: string): Promise<WorkspaceGenerationTaskRecord | null> {
    const result = await this.queryable.query<GenerationTaskRow>(
      "select task from generation_tasks where workspace_id = $1 and id = $2",
      [this.workspaceId, id],
    );
    const task = result.rows[0]?.task;
    return task ? { task } : null;
  }

  async list(options: WorkspaceGenerationTaskListOptions = {}): Promise<WorkspaceGenerationTaskRecord[]> {
    const clauses: string[] = ["workspace_id = $1"];
    const values: unknown[] = [this.workspaceId];
    if (options.boardId !== undefined) {
      values.push(options.boardId);
      clauses.push(`board_id = $${values.length}`);
    }
    if (options.sourceBoardNodeIds?.length) {
      values.push(options.sourceBoardNodeIds);
      clauses.push(`task->'source'->>'boardNodeId' = any($${values.length})`);
    }
    if (options.statuses?.length) {
      values.push(options.statuses);
      clauses.push(`status = any($${values.length})`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    values.push(options.limit ?? 200);
    const limitIndex = values.length;
    values.push(options.offset ?? 0);
    const offsetIndex = values.length;
    const result = await this.queryable.query<GenerationTaskRow>(
      `select task from generation_tasks ${where} order by updated_at desc limit $${limitIndex} offset $${offsetIndex}`,
      values,
    );
    return result.rows.map(row => ({ task: row.task }));
  }

  async put(task: GenerationTask): Promise<void> {
    await this.queryable.query(
      `insert into generation_tasks (id, workspace_id, task, status, board_id, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (workspace_id, id) do update
         set task = excluded.task, status = excluded.status, board_id = excluded.board_id, updated_at = now()
       returning id`,
      [task.id, this.workspaceId, task, task.status, task.source.boardId ?? null],
    );
  }
}

class PostgresSettingsRepository implements WorkspaceSettingsRepository {
  constructor(
    private readonly queryable: PostgresQueryable,
    private readonly workspaceId: string,
  ) {}

  async delete(key: string): Promise<void> {
    await this.queryable.query("delete from settings where workspace_id = $1 and key = $2", [this.workspaceId, key]);
  }

  async get(key: string): Promise<WorkspaceSettingRecord | null> {
    const result = await this.queryable.query<SettingRow>(
      `select key, value #>> '{}' as value_text, is_secret, group_name,
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
       from settings where workspace_id = $1 and key = $2`,
      [this.workspaceId, key],
    );
    return settingRecordFromRow(result.rows[0]);
  }

  async list(options: WorkspaceSettingListOptions): Promise<WorkspaceSettingRecord[]> {
    const clauses: string[] = ["workspace_id = $1"];
    const values: unknown[] = [this.workspaceId];
    if (options.keys?.length) {
      values.push(options.keys);
      clauses.push(`key = any($${values.length})`);
    }
    if (options.groups?.length) {
      values.push(options.groups);
      clauses.push(`group_name = any($${values.length})`);
    }
    if (!options.includeSecrets) clauses.push("is_secret = false");
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const result = await this.queryable.query<SettingRow>(
      `select key, value #>> '{}' as value_text, is_secret, group_name,
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at
       from settings ${where} order by key`,
      values,
    );
    return result.rows.map(row => settingRecordFromRow(row)).filter(record => record !== null);
  }

  async put(record: WorkspaceSettingRecord): Promise<void> {
    if (record.isSecret && !isEncryptedWorkspaceSecret(record.value)) {
      throw new Error("PostgreSQL workspace secrets must be encrypted before storage");
    }
    await this.queryable.query(
      `insert into settings (workspace_id, key, group_name, value, is_secret, updated_at)
       values ($1, $2, $3, to_jsonb($4::text), $5, now())
       on conflict (workspace_id, key) do update set group_name = excluded.group_name, value = excluded.value, is_secret = excluded.is_secret, updated_at = now()`,
      [this.workspaceId, record.key, record.group, record.value, record.isSecret],
    );
  }
}

class PostgresSafetySnapshotRepository implements WorkspaceSafetySnapshotRepository {
  constructor(
    private readonly queryable: PostgresQueryable,
    private readonly workspaceId: string,
  ) {}

  async clear(): Promise<void> {
    await this.queryable.query("delete from safety_snapshots where workspace_id = $1", [this.workspaceId]);
  }

  async getLatest(): Promise<WorkspaceSafetySnapshotRecord | null> {
    const result = await this.queryable.query<SafetySnapshotRow>(
      `select id, snapshot->>'fileName' as file_name, snapshot->>'origin' as origin,
        (snapshot->>'assetCount')::integer as asset_count,
        (snapshot->>'boardCount')::integer as board_count,
        (snapshot->>'generationTaskCount')::integer as generation_task_count,
        (snapshot->>'libraryAssetCount')::integer as library_asset_count,
        snapshot->>'reason' as reason,
        (snapshot->>'settingsKeyCount')::integer as settings_key_count,
        (snapshot->>'sizeBytes')::bigint as size_bytes,
        (snapshot->>'voiceProfileCount')::integer as voice_profile_count,
        snapshot->'payload' as payload,
        created_at
       from safety_snapshots where workspace_id = $1 order by created_at desc limit 1`,
      [this.workspaceId],
    );
    return safetySnapshotFromRow(result.rows[0]);
  }

  async put(record: WorkspaceSafetySnapshotRecord): Promise<void> {
    await this.queryable.query(
      `insert into safety_snapshots (id, workspace_id, snapshot, created_at)
       values ($1, $2, $3, $4)
       on conflict (workspace_id, id) do update
         set snapshot = excluded.snapshot, created_at = excluded.created_at
       returning id`,
      [record.id, this.workspaceId, record, record.createdAt],
    );
  }
}

class PostgresVoiceProfileRepository implements WorkspaceVoiceProfileRepository {
  constructor(
    private readonly queryable: PostgresQueryable,
    private readonly workspaceId: string,
  ) {}

  async delete(id: string): Promise<void> {
    await this.queryable.query("delete from voice_profiles where workspace_id = $1 and id = $2", [this.workspaceId, id]);
  }

  async get(id: string): Promise<WorkspaceVoiceProfileRecord | null> {
    const result = await this.queryable.query<VoiceProfileRow>(
      "select profile from voice_profiles where workspace_id = $1 and id = $2",
      [this.workspaceId, id],
    );
    const profile = result.rows[0]?.profile;
    return profile ? { profile } : null;
  }

  async list(options: WorkspaceStoragePageOptions = {}): Promise<WorkspaceVoiceProfileRecord[]> {
    const result = await this.queryable.query<VoiceProfileRow>(
      "select profile from voice_profiles where workspace_id = $1 order by updated_at desc limit $2 offset $3",
      [this.workspaceId, options.limit ?? 100, options.offset ?? 0],
    );
    return result.rows.map(row => ({ profile: row.profile }));
  }

  async put(record: WorkspaceVoiceProfileRecord): Promise<void> {
    await this.queryable.query(
      `insert into voice_profiles (id, workspace_id, profile, created_at, updated_at)
       values ($1, $2, $3, $4, $5)
       on conflict (workspace_id, id) do update
         set profile = excluded.profile, updated_at = excluded.updated_at
       returning id`,
      [
        record.profile.id,
        this.workspaceId,
        record.profile,
        record.profile.createdAt,
        record.profile.updatedAt,
      ],
    );
  }
}

async function readAssetPayloadRef(
  queryable: PostgresQueryable,
  workspaceId: string,
  assetId: string,
): Promise<WorkspaceAssetPayloadRef | undefined> {
  const result = await queryable.query<PayloadRow>(
    `select content_hash, mime_type, size_bytes, storage_kind, storage_key
     from asset_payloads where workspace_id = $1 and asset_id = $2 order by created_at desc limit 1`,
    [workspaceId, assetId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return payloadRefFromRow(row);
}

async function upsertAssetPayloadRef(
  queryable: PostgresQueryable,
  workspaceId: string,
  assetId: string,
  ref: WorkspaceAssetPayloadRef,
): Promise<void> {
  await queryable.query("delete from asset_payloads where workspace_id = $1 and asset_id = $2", [workspaceId, assetId]);
  await queryable.query(
    `insert into asset_payloads (workspace_id, asset_id, content_hash, mime_type, size_bytes, storage_kind, storage_key)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [workspaceId, assetId, ref.contentHash ?? null, ref.mimeType ?? null, ref.sizeBytes ?? null, ref.kind, ref.uri],
  );
}

function payloadRefFromRow(row: PayloadRow): WorkspaceAssetPayloadRef {
  return {
    contentHash: row.content_hash ?? undefined,
    kind: row.storage_kind,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes === null ? undefined : Number(row.size_bytes),
    uri: row.storage_key,
  };
}

function previewRecordFromRow(row: PreviewRow | undefined): WorkspaceAssetPreviewRecord | null {
  if (!row) return null;
  return {
    preview: row.preview,
    ref: row.storage_kind && row.storage_key
      ? {
          kind: row.storage_kind,
          mimeType: row.preview.mimeType,
          uri: row.storage_key,
        }
      : undefined,
  };
}

function previewMetadataForStorage(
  preview: WorkspaceAssetPreviewRecord["preview"],
): Omit<WorkspaceAssetPreviewRecord["preview"], "dataUrl"> {
  const { dataUrl: _dataUrl, ...metadata } = preview;
  return metadata;
}

function toBoardSummary(board: BoardDocument): BoardSummary {
  return {
    createdAt: board.createdAt,
    id: board.id,
    nodeCount: board.nodes.length,
    title: board.title,
    updatedAt: board.updatedAt,
  };
}

function settingRecordFromRow(row: SettingRow | undefined): WorkspaceSettingRecord | null {
  if (!row) return null;
  return {
    group: row.group_name,
    isSecret: row.is_secret,
    key: row.key,
    updatedAt: timestampTokenFromRow(row.updated_at),
    value: row.value_text,
  };
}

function timestampTokenFromRow(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function safetySnapshotFromRow(row: SafetySnapshotRow | undefined): WorkspaceSafetySnapshotRecord | null {
  if (!row) return null;
  return {
    assetCount: row.asset_count,
    boardCount: row.board_count,
    createdAt: new Date(row.created_at).toISOString(),
    fileName: row.file_name,
    generationTaskCount: row.generation_task_count,
    id: row.id,
    libraryAssetCount: row.library_asset_count,
    origin: row.origin,
    payload: row.payload,
    reason: row.reason,
    settingsKeyCount: row.settings_key_count,
    sizeBytes: Number(row.size_bytes),
    voiceProfileCount: row.voice_profile_count,
  };
}
