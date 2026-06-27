import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { QueryResultRow } from "pg";
import type { BoardDocument, BoardNode } from "@/lib/board/types";
import { collectBoardAssetIdsFromNodes } from "@/lib/assets/board-scope";
import type {
  AssetDatabaseDiagnostics,
  LibraryAssetRecord,
  StorageItemMeta,
} from "@/lib/db";
import type { GenerationTask } from "@/lib/generation-tasks";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import type { TeamWorkspaceDataSummaryResult } from "@/lib/storage/team-data-summary-types";
import type { VoiceProfile } from "@/lib/voice-profiles";
import type {
  WorkspaceBoardAssetReference,
  WorkspaceIntegrityDiagnostics,
  WorkspaceSafetySnapshotSummary,
  WorkspaceStaleAssetSourceLink,
} from "@/lib/data-management";
import type { WorkspaceSafetySnapshotRecord } from "@/lib/storage/schema";

const STALE_PROCESSING_MS = 2 * 60 * 60 * 1000;

interface AssetRow extends QueryResultRow {
  meta: StorageItemMeta;
}

interface BoardRow extends QueryResultRow {
  board: BoardDocument;
}

interface PayloadRow extends QueryResultRow {
  asset_id: string;
  size_bytes: string | number | null;
  storage_key: string;
  storage_kind: string;
}

interface TeamSummaryCountRow extends QueryResultRow {
  asset_library_records: number;
  generation_tasks: number;
  prompt_templates: number;
  provider_targets: number;
  secret_settings: number;
  settings: number;
  voice_profiles: number;
}

interface PreviewRow extends QueryResultRow {
  storage_key: string | null;
  storage_kind: string | null;
}

interface TeamMediaConsistencySummary {
  missingPayloadFiles: number;
  missingPreviewFiles: number;
  orphanedPayloadFiles: number;
  orphanedPreviewFiles: number;
  tmpFiles: number;
  trashFiles: number;
}

export async function getTeamWorkspaceDataSummary(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
): Promise<TeamWorkspaceDataSummaryResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "viewer" });
  const workspaceId = context.session.workspaceId;
  const [
    assetsResult,
    boardsResult,
    payloadsResult,
    countsResult,
    previewsResult,
    latestSnapshot,
    libraryRecords,
    generationTasks,
    voiceProfiles,
  ] = await Promise.all([
    context.queryable.query<AssetRow>(
      "select meta from assets where workspace_id = $1 order by updated_at desc",
      [workspaceId],
    ),
    context.queryable.query<BoardRow>(
      "select board from boards where workspace_id = $1 order by updated_at desc",
      [workspaceId],
    ),
    context.queryable.query<PayloadRow>(
      `select asset_payloads.asset_id, asset_payloads.size_bytes, asset_payloads.storage_kind, asset_payloads.storage_key
       from asset_payloads
       inner join assets on assets.id = asset_payloads.asset_id
       where assets.workspace_id = $1`,
      [workspaceId],
    ),
    context.queryable.query<TeamSummaryCountRow>(
      `select
        (select count(*)::int from asset_library where workspace_id = $1) as asset_library_records,
        (select count(*)::int from generation_tasks where workspace_id = $1) as generation_tasks,
        (select count(*)::int from settings where workspace_id = $1 and is_secret = false) as settings,
        (select count(*)::int from settings where workspace_id = $1 and is_secret = true) as secret_settings,
        (select count(*)::int from prompt_templates where workspace_id = $1) as prompt_templates,
        (select count(*)::int from saved_provider_targets where workspace_id = $1) as provider_targets,
        (select count(*)::int from voice_profiles where workspace_id = $1) as voice_profiles`,
      [workspaceId],
    ),
    context.queryable.query<PreviewRow>(
      `select asset_previews.storage_kind, asset_previews.storage_key
       from asset_previews
       inner join assets on assets.id = asset_previews.asset_id
       where assets.workspace_id = $1`,
      [workspaceId],
    ),
    context.repository.safetySnapshots.getLatest(),
    context.repository.assetLibrary.list({ limit: 10000 }),
    context.repository.generationTasks.list({ limit: 10000 }),
    context.repository.voiceProfiles.list({ limit: 10000 }),
  ]);

  const assets = assetsResult.rows.map(row => row.meta);
  const boards = boardsResult.rows.map(row => row.board);
  const payloadAssetIds = new Set(payloadsResult.rows.map(row => row.asset_id));
  const payloadStorageKeys = payloadsResult.rows
    .filter(row => row.storage_kind === "local-file")
    .map(row => row.storage_key);
  const previewStorageKeys = previewsResult.rows
    .filter(row => row.storage_kind === "local-file" && row.storage_key)
    .map(row => row.storage_key ?? "");
  const counts = countsResult.rows[0] ?? emptyCounts();
  const boardAssetIds = collectBoardAssetIds(boards);
  const protectedAssetIds = collectProtectedAssetIds({
    boards,
    generationTasks: generationTasks.map(record => record.task),
    libraryRecords: libraryRecords.map(record => record.record),
    voiceProfiles: voiceProfiles.map(record => record.profile),
  });
  const stores: AssetDatabaseDiagnostics = {
    legacyAssetRecords: 0,
    legacyBlobRecords: 0,
    libraryRecords: counts.asset_library_records,
    metaRecords: assets.length,
    previewRecords: previewsResult.rows.length,
    sharedBlobRecords: payloadAssetIds.size,
    version: 1,
  };
  const integrity = buildTeamWorkspaceIntegrityDiagnostics(
    assets,
    boards,
    payloadAssetIds,
    Date.now(),
    protectedAssetIds,
  );
  const mediaConsistency = await inspectTeamMediaConsistency(config.mediaDir, {
    payloadStorageKeys,
    previewStorageKeys,
  });
  const summaryIntegrity = withTeamMediaConsistencyIssues(integrity, mediaConsistency);
  const payloadBytes = payloadsResult.rows.reduce((total, row) => total + numberFromDatabase(row.size_bytes), 0);

  return {
    summary: {
      assets: {
        audio: assets.filter(item => item.type === "audio").length,
        brokenComplete: summaryIntegrity.brokenCompleteAssetIds.length,
        estimatedBytes: assets.reduce((total, item) => total + textByteSize(JSON.stringify(item)), 0),
        failed: summaryIntegrity.failedAssetIds.length,
        image: assets.filter(item => item.type === "image").length,
        largest: assets
          .map(item => ({ id: item.id, label: item.prompt || item.model || item.id, bytes: textByteSize(JSON.stringify(item)) }))
          .sort((left, right) => right.bytes - left.bytes)
          .slice(0, 5),
        missingBoardReferences: summaryIntegrity.missingBoardReferences.length,
        orphaned: summaryIntegrity.orphanedAssetIds.length,
        pending: assets.filter(item => item.status === "pending").length,
        processing: assets.filter(item => item.status === "processing").length,
        referencedByBoards: boardAssetIds.size,
        staleProcessing: summaryIntegrity.staleProcessingAssetIds.length,
        stores,
        total: assets.length,
        transcript: assets.filter(item => item.type === "transcript").length,
        video: assets.filter(item => item.type === "video").length,
      },
      boards: {
        estimatedBytes: boards.reduce((total, board) => total + textByteSize(JSON.stringify(board)), 0),
        nodes: boards.reduce((total, board) => total + board.nodes.length, 0),
        total: boards.length,
      },
      integrity: summaryIntegrity,
      localStorage: {
        agentKeys: 0,
        credentialKeys: counts.secret_settings,
        estimatedBytes: 0,
        inventory: [],
        modelCacheKeys: 0,
        providerSettingKeys: counts.settings,
        uiPreferenceKeys: 0,
      },
      safety: {
        latestSnapshot: latestSnapshot ? toWorkspaceSafetySnapshotSummary(latestSnapshot) : null,
        origin: "postgres-team",
      },
      teamStorage: {
        assetLibraryRecords: counts.asset_library_records,
        generationTasks: counts.generation_tasks,
        mediaConsistency,
        payloadBytes,
        payloadRefs: payloadAssetIds.size,
        promptTemplates: counts.prompt_templates,
        providerTargets: counts.provider_targets,
        secretSettings: counts.secret_settings,
        settings: counts.settings,
        voiceProfiles: counts.voice_profiles,
      },
    },
    targetKind: "postgres",
    workspaceId,
  };
}

async function inspectTeamMediaConsistency(
  mediaDir: string,
  input: { payloadStorageKeys: string[]; previewStorageKeys: string[] },
): Promise<TeamMediaConsistencySummary> {
  const payloadStorageKeys = new Set(input.payloadStorageKeys);
  const previewStorageKeys = new Set(input.previewStorageKeys);
  const [
    missingPayloadFiles,
    missingPreviewFiles,
    originalFiles,
    previewFiles,
    tmpFiles,
    trashFiles,
  ] = await Promise.all([
    countMissingStorageKeys(mediaDir, payloadStorageKeys),
    countMissingStorageKeys(mediaDir, previewStorageKeys),
    collectStorageKeysUnder(mediaDir, "originals"),
    collectStorageKeysUnder(mediaDir, "previews"),
    collectStorageKeysUnder(mediaDir, "tmp"),
    collectStorageKeysUnder(mediaDir, "trash"),
  ]);

  return {
    missingPayloadFiles,
    missingPreviewFiles,
    orphanedPayloadFiles: originalFiles.filter(storageKey => !payloadStorageKeys.has(storageKey)).length,
    orphanedPreviewFiles: previewFiles.filter(storageKey => !previewStorageKeys.has(storageKey)).length,
    tmpFiles: tmpFiles.length,
    trashFiles: trashFiles.length,
  };
}

function countTeamMediaConsistencyIssues(summary: TeamMediaConsistencySummary): number {
  return summary.missingPayloadFiles +
    summary.missingPreviewFiles +
    summary.orphanedPayloadFiles +
    summary.orphanedPreviewFiles +
    summary.tmpFiles +
    summary.trashFiles;
}

function withTeamMediaConsistencyIssues(
  integrity: WorkspaceIntegrityDiagnostics,
  mediaConsistency: TeamMediaConsistencySummary,
): WorkspaceIntegrityDiagnostics {
  const issueCount = integrity.issueCount + countTeamMediaConsistencyIssues(mediaConsistency);
  const status = mediaConsistency.missingPayloadFiles > 0 || integrity.status === "critical"
    ? "critical"
    : issueCount > 0 ? "attention" : "healthy";
  return { ...integrity, issueCount, status };
}

async function countMissingStorageKeys(mediaDir: string, storageKeys: ReadonlySet<string>): Promise<number> {
  let missing = 0;
  for (const storageKey of storageKeys) {
    if (!await storageKeyExists(mediaDir, storageKey)) missing += 1;
  }
  return missing;
}

async function storageKeyExists(mediaDir: string, storageKey: string): Promise<boolean> {
  try {
    const stats = await stat(resolveMediaStorageKey(mediaDir, storageKey));
    return stats.isFile();
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

async function collectStorageKeysUnder(mediaDir: string, relativeDir: "originals" | "previews" | "tmp" | "trash"): Promise<string[]> {
  const absoluteDir = resolveMediaStorageKey(mediaDir, relativeDir);
  return collectStorageKeys(mediaDir, absoluteDir);
}

async function collectStorageKeys(mediaDir: string, absoluteDir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = await readdir(absoluteDir, { encoding: "utf8", withFileTypes: true });
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return [];
    throw error;
  }

  const storageKeys: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      storageKeys.push(...await collectStorageKeys(mediaDir, absolutePath));
    } else if (entry.isFile()) {
      storageKeys.push(relativeMediaStorageKey(mediaDir, absolutePath));
    }
  }
  return storageKeys;
}

function resolveMediaStorageKey(mediaDir: string, storageKey: string): string {
  if (path.isAbsolute(storageKey)) throw new Error("Invalid team media storage key");
  const parts = storageKey.split(/[\\/]+/);
  if (parts.includes("..") || parts.includes("")) throw new Error("Invalid team media storage key");
  const resolvedMediaDir = path.resolve(mediaDir);
  const resolved = path.resolve(resolvedMediaDir, ...parts);
  if (resolved !== resolvedMediaDir && !resolved.startsWith(`${resolvedMediaDir}${path.sep}`)) {
    throw new Error("Invalid team media storage key");
  }
  return resolved;
}

function relativeMediaStorageKey(mediaDir: string, absolutePath: string): string {
  return path.relative(path.resolve(mediaDir), absolutePath).split(path.sep).join(path.posix.sep);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function emptyCounts(): TeamSummaryCountRow {
  return {
    asset_library_records: 0,
    generation_tasks: 0,
    prompt_templates: 0,
    provider_targets: 0,
    secret_settings: 0,
    settings: 0,
    voice_profiles: 0,
  };
}

function collectProtectedAssetIds(input: {
  boards: BoardDocument[];
  generationTasks: GenerationTask[];
  libraryRecords: LibraryAssetRecord[];
  voiceProfiles: VoiceProfile[];
}): Set<string> {
  const ids = collectBoardAssetIds(input.boards);
  for (const record of input.libraryRecords) {
    ids.add(record.assetId);
    if (record.sourceAssetId) ids.add(record.sourceAssetId);
  }
  for (const task of input.generationTasks) {
    if (task.activeResultAssetId) ids.add(task.activeResultAssetId);
    for (const assetId of task.resultAssetIds) ids.add(assetId);
    for (const assetId of generationRequestAssetIds(task.request)) ids.add(assetId);
  }
  for (const profile of input.voiceProfiles) {
    if (profile.previewAudioAssetId) ids.add(profile.previewAudioAssetId);
    for (const assetId of profile.referenceAudioAssetIds) ids.add(assetId);
    for (const assetId of profile.sourceAssetIds ?? []) ids.add(assetId);
  }
  return ids;
}

function generationRequestAssetIds(request: GenerationTask["request"]): string[] {
  return (request?.referenceMedia ?? [])
    .map(reference => reference.sourceAssetId)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function collectBoardAssetIds(boards: BoardDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const board of boards) {
    for (const assetId of collectBoardAssetIdsFromNodes(board.nodes)) ids.add(assetId);
  }
  return ids;
}

function collectBoardNodeIds(boards: BoardDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const board of boards) {
    for (const node of board.nodes) ids.add(node.id);
  }
  return ids;
}

function collectBoardAssetReferences(boards: BoardDocument[]): WorkspaceBoardAssetReference[] {
  const references: WorkspaceBoardAssetReference[] = [];
  for (const board of boards) {
    for (const node of board.nodes) references.push(...collectNodeAssetReferences(board, node));
  }
  return references;
}

function collectNodeAssetReferences(
  board: BoardDocument,
  node: BoardNode,
): WorkspaceBoardAssetReference[] {
  const base = {
    boardId: board.id,
    boardTitle: board.title,
    nodeId: node.id,
    nodeKind: node.kind,
  };
  if (node.kind === "asset") return [{ ...base, assetId: node.asset.assetId, field: "asset.assetId" }];
  if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app") {
    return [
      ...(node.resultAssetId ? [{ ...base, assetId: node.resultAssetId, field: "resultAssetId" }] : []),
      ...(node.resultAssetIds ?? []).map(assetId => ({ ...base, assetId, field: "resultAssetIds" })),
    ];
  }
  if (node.kind === "result") {
    return [
      { ...base, assetId: node.asset.assetId, field: "asset.assetId" },
      ...node.resultAssetIds.map(assetId => ({ ...base, assetId, field: "resultAssetIds" })),
    ];
  }
  if (node.kind === "reference-group") {
    return node.references.map(reference => ({ ...base, assetId: reference.assetId, field: "references.assetId" }));
  }
  if (node.kind === "multi-grid") {
    return node.items.map(item => ({ ...base, assetId: item.assetId, field: "items.assetId" }));
  }
  return [];
}

function buildTeamWorkspaceIntegrityDiagnostics(
  assets: StorageItemMeta[],
  boards: BoardDocument[],
  payloadAssetIds: ReadonlySet<string>,
  now: number,
  protectedAssetIds: ReadonlySet<string>,
): WorkspaceIntegrityDiagnostics {
  const assetIds = new Set(assets.map(item => item.id));
  const boardNodeIds = collectBoardNodeIds(boards);
  const missingBoardReferences = collectBoardAssetReferences(boards)
    .filter(reference => !assetIds.has(reference.assetId));
  const staleAssetSourceLinks: WorkspaceStaleAssetSourceLink[] = assets
    .filter(item => item.sourceBoardNodeId && !boardNodeIds.has(item.sourceBoardNodeId))
    .map(item => ({
      assetId: item.id,
      boardId: item.boardId,
      model: item.model,
      prompt: item.prompt,
      sourceBoardNodeId: item.sourceBoardNodeId ?? "",
      status: item.status,
    }));
  const brokenCompleteAssetIds = assets
    .filter(item => item.status === "complete" && ((!item.hasBlob && !item.url?.trim()) || (item.hasBlob && !payloadAssetIds.has(item.id))))
    .map(item => item.id);
  const failedAssetIds = assets.filter(item => item.status === "failed").map(item => item.id);
  const orphanedAssetIds = assets
    .filter(item => item.status === "complete" && !protectedAssetIds.has(item.id))
    .map(item => item.id);
  const staleProcessingAssetIds = assets
    .filter(item => {
      if (item.status !== "processing" && item.status !== "pending") return false;
      const createdAt = Date.parse(item.createdAt);
      return Number.isFinite(createdAt) && now - createdAt > STALE_PROCESSING_MS;
    })
    .map(item => item.id);
  const issueCount = missingBoardReferences.length +
    staleAssetSourceLinks.length +
    brokenCompleteAssetIds.length +
    failedAssetIds.length +
    staleProcessingAssetIds.length;
  const status = missingBoardReferences.length > 0 || brokenCompleteAssetIds.length > 0
    ? "critical"
    : issueCount > 0 ? "attention" : "healthy";
  return {
    brokenCompleteAssetIds,
    failedAssetIds,
    issueCount,
    missingBoardReferences,
    orphanedAssetIds,
    staleAssetSourceLinks,
    staleProcessingAssetIds,
    status,
  };
}

function toWorkspaceSafetySnapshotSummary(snapshot: WorkspaceSafetySnapshotRecord): WorkspaceSafetySnapshotSummary {
  return {
    assetCount: snapshot.assetCount,
    boardCount: snapshot.boardCount,
    createdAt: snapshot.createdAt,
    fileName: snapshot.fileName,
    generationTaskCount: snapshot.generationTaskCount,
    id: snapshot.id,
    libraryAssetCount: snapshot.libraryAssetCount,
    origin: snapshot.origin,
    reason: snapshot.reason,
    settingsKeyCount: snapshot.settingsKeyCount,
    sizeBytes: snapshot.sizeBytes,
    voiceProfileCount: snapshot.voiceProfileCount,
  };
}

function numberFromDatabase(value: string | number | null): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function textByteSize(value: string): number {
  return new TextEncoder().encode(value).length;
}
