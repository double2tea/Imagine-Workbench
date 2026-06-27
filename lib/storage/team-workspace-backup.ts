import JSZip from "jszip";
import { badRequest } from "@/lib/api/errors";
import type { StorageItemMeta, StorageItemType } from "@/lib/db";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type {
  WorkspaceAssetRecord,
  WorkspaceAssetPayloadRef,
} from "@/lib/storage/schema";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import { redactTeamBoardDocument } from "@/lib/storage/team-boards";
import type { TeamWorkspaceBackupExport } from "@/lib/storage/team-workspace-backup-types";
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
  type WorkspaceBackupAssetRecord,
  type WorkspaceBackupManifest,
} from "@/lib/workspace-backup-format";

const BACKUP_PAGE_SIZE = 500;

export async function exportTeamWorkspaceBackup(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  includeCredentials: boolean,
): Promise<TeamWorkspaceBackupExport> {
  if (includeCredentials) {
    throw badRequest(
      "PostgreSQL credential-inclusive backup export is not available yet",
      "team_backup_credentials_unsupported",
    );
  }
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const zip = new JSZip();
  const assets = await listAll(offset => context.repository.assets.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const boards = await listAll(offset => context.repository.boards.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const libraryRecords = await listAll(offset => context.repository.assetLibrary.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const generationTasks = await listAll(offset => context.repository.generationTasks.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const voiceProfiles = await listAll(offset => context.repository.voiceProfiles.list({ limit: BACKUP_PAGE_SIZE, offset }));
  const assetRecords: WorkspaceBackupAssetRecord[] = [];
  for (const asset of assets) {
    assetRecords.push(await addTeamAssetToZip(zip, context.repository.payloads.read.bind(context.repository.payloads), asset));
  }
  const exportedAt = new Date().toISOString();
  const settings = { localStorage: {} };
  const manifest: WorkspaceBackupManifest = {
    app: BACKUP_APP_NAME,
    assetsFile: ASSET_INDEX_FILE,
    boardsFile: BOARD_INDEX_FILE,
    counts: {
      assets: assetRecords.length,
      boards: boards.length,
      generationTasks: generationTasks.length,
      libraryAssets: libraryRecords.length,
      settingsKeys: Object.keys(settings.localStorage).length,
      voiceProfiles: voiceProfiles.length,
    },
    exportedAt,
    generationTasksFile: GENERATION_TASK_INDEX_FILE,
    libraryFile: LIBRARY_INDEX_FILE,
    schemaVersion: WORKSPACE_BACKUP_SCHEMA_VERSION,
    settingsFile: SETTINGS_FILE,
    voiceProfilesFile: VOICE_PROFILE_INDEX_FILE,
  };
  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  zip.file(ASSET_INDEX_FILE, JSON.stringify(assetRecords, null, 2));
  zip.file(LIBRARY_INDEX_FILE, JSON.stringify(libraryRecords.map(record => record.record), null, 2));
  zip.file(BOARD_INDEX_FILE, JSON.stringify(boards.map(record => redactTeamBoardDocument(record.board)), null, 2));
  zip.file(GENERATION_TASK_INDEX_FILE, JSON.stringify(generationTasks.map(record => record.task), null, 2));
  zip.file(VOICE_PROFILE_INDEX_FILE, JSON.stringify(voiceProfiles.map(record => record.profile), null, 2));
  zip.file(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  const body = await zip.generateAsync({ type: "arraybuffer" });
  const fileName = `Imagine_Team_Backup_${compactTimestamp(exportedAt)}.zip`;
  await recordTeamAuditEvent(context.queryable, {
    eventType: "team_backup.export",
    metadata: {
      assetCount: assetRecords.length,
      boardCount: boards.length,
      generationTaskCount: generationTasks.length,
      includeCredentials,
      libraryAssetCount: libraryRecords.length,
      settingsKeyCount: Object.keys(settings.localStorage).length,
      voiceProfileCount: voiceProfiles.length,
    },
    userId: context.session.userId,
    workspaceId: context.session.workspaceId,
  });
  return {
    assetCount: assetRecords.length,
    boardCount: boards.length,
    body,
    fileName,
    generationTaskCount: generationTasks.length,
    libraryAssetCount: libraryRecords.length,
    settingsKeyCount: Object.keys(settings.localStorage).length,
    targetKind: "postgres",
    voiceProfileCount: voiceProfiles.length,
    workspaceId: context.session.workspaceId,
  };
}

async function listAll<T>(load: (offset: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += BACKUP_PAGE_SIZE) {
    const page = await load(offset);
    all.push(...page);
    if (page.length < BACKUP_PAGE_SIZE) return all;
  }
}

async function addTeamAssetToZip(
  zip: JSZip,
  readPayload: (ref: WorkspaceAssetPayloadRef) => Promise<Blob>,
  asset: WorkspaceAssetRecord,
): Promise<WorkspaceBackupAssetRecord> {
  const meta = redactAssetMeta(asset.meta);
  if (!asset.payload) {
    if (meta.hasBlob) throw new Error(`Team asset ${meta.id} is missing its payload`);
    return { ...meta, url: meta.url ?? "" };
  }
  if (!asset.payload.mimeType) throw new Error(`Team asset ${meta.id} payload MIME type is missing`);
  const extension = mediaExtension(asset.payload.mimeType, meta.type);
  const mediaFile = `assets/media/${safeFileSegment(meta.id)}.${extension}`;
  const blob = await readPayload(asset.payload);
  zip.file(mediaFile, Buffer.from(await blob.arrayBuffer()).toString("base64"), { base64: true });
  const { url: _url, ...record } = meta;
  void _url;
  return {
    ...record,
    mediaFile,
    mediaMimeType: asset.payload.mimeType,
  };
}

function redactAssetMeta(meta: StorageItemMeta): StorageItemMeta {
  if (!meta.generationRequest?.runningHubAccessPassword) return meta;
  const { runningHubAccessPassword: _runningHubAccessPassword, ...generationRequest } = meta.generationRequest;
  void _runningHubAccessPassword;
  return { ...meta, generationRequest };
}

function mediaExtension(mimeType: string, type: StorageItemType): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "text/plain") return "txt";
  if (type === "image") return "png";
  if (type === "video") return "mp4";
  if (type === "audio") return "mp3";
  return "txt";
}

function safeFileSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "workspace";
}

function compactTimestamp(value: string): string {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
