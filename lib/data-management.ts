import { t } from "@/lib/i18n-core";
import JSZip from "jszip";
import { clearBoardsFromDB, listBoardsFromDB, saveBoardToDB } from "@/lib/board/persistence";
import { createEmptyBoard, DEFAULT_BOARD_CONFIG, DEFAULT_BOARD_ID } from "@/lib/board/defaults";
import { resolveBoardConnectionKind } from "@/lib/board/ports";
import type {
  BoardConfig,
  BoardDocument,
  BoardEdge,
  BoardGenerateVariantCount,
  BoardGenerationStatus,
  BoardNode,
  BoardPoint,
  BoardPortRef,
  BoardReferenceGroupItem,
  BoardReferenceRole,
  BoardRunningHubBindingDelivery,
  BoardRunningHubBindingSource,
  BoardRunningHubBindingValueType,
  BoardRunningHubNodeInfoBinding,
  BoardRunningHubOutputType,
  BoardRunningHubTargetType,
  BoardSize,
  BoardViewport,
} from "@/lib/board/types";
import type { AudioOperationMode } from "@/lib/providers/model-catalog";
import type { RunningHubYouchuanAdvancedSettings } from "@/lib/providers/types";
import { CUSTOM_PROVIDERS_STORAGE_KEY } from "@/lib/providers/custom-providers";
import { collectBoardAssetIdsFromNodes } from "@/lib/assets/board-scope";
import {
  buildStorageItem,
  clearAllDB,
  deleteFromDB,
  getAssetDatabaseDiagnostics,
  getAllFromDB,
  hasAssetBlobPayload,
  hydrateAsset,
  hydrateAssets,
  listLibraryAssetRecords,
  listAllAssetMetas,
  listBoardScopedAssetMetas,
  saveLibraryAssetRecord,
  saveToDB,
  type AssetDatabaseDiagnostics,
  type AssetCropDerivative,
  type GenerationReferenceMediaSnapshot,
  type GenerationRequestSnapshot,
  type LibraryAssetCategory,
  type LibraryAssetMediaType,
  type LibraryAssetOrigin,
  type LibraryAssetRecord,
  type StorageItem,
  type StorageItemMeta,
} from "@/lib/db";
import { isMediaReferenceType, mediaReferenceTypeFromDataUri, mediaReferenceTypeFromMime } from "@/lib/media-references";
import { compressReferenceImageFile } from "@/lib/reference-images";
import { normalizeCinematicProfile } from "@/lib/cinematic-controls";
import {
  listGenerationTasks,
  saveGenerationTask,
  type GenerationTask,
  type GenerationTaskSource,
  type GenerationTaskStatus,
} from "@/lib/generation-tasks";
import { isKnownProvider } from "@/lib/providers/registry";
import {
  deleteVoiceProfile,
  listVoiceProfiles,
  saveVoiceProfile,
  type VoiceProfile,
  type VoiceProfileSource,
} from "@/lib/voice-profiles";
import type { WorkspaceSafetySnapshotReason } from "@/lib/storage/schema";

export type { WorkspaceSafetySnapshotReason };

export const WORKSPACE_BACKUP_SCHEMA_VERSION = 3;
const SUPPORTED_WORKSPACE_BACKUP_SCHEMA_VERSIONS = new Set([1, 2, WORKSPACE_BACKUP_SCHEMA_VERSION]);

const BACKUP_APP_NAME = "Imagine Workbench";
const MANIFEST_FILE = "manifest.json";
const ASSET_INDEX_FILE = "assets/index.json";
const LIBRARY_INDEX_FILE = "library/index.json";
const BOARD_INDEX_FILE = "boards/index.json";
const GENERATION_TASK_INDEX_FILE = "generation-tasks/index.json";
const VOICE_PROFILE_INDEX_FILE = "voice-profiles/index.json";
const SETTINGS_FILE = "settings/local-storage.json";
const MAX_BACKUP_FILE_COUNT = 10000;
const STALE_PROCESSING_MS = 2 * 60 * 60 * 1000;
const SAFETY_DB_NAME = "ImagineWorkbenchSafetyDB";
const SAFETY_DB_VERSION = 1;
const SAFETY_SNAPSHOT_STORE = "workspace_safety_snapshots";
const LATEST_SAFETY_SNAPSHOT_ID = "latest";

const MODEL_CACHE_KEYS = [
  "imagine_chat_model_options",
  "imagine_image_model_options",
  "imagine_video_model_options",
  "imagine_audio_model_options",
  "imagine_default_audio_model",
  "imagine_default_image_model",
  "imagine_default_video_model",
  "imagine_image_edit_feature_models",
] as const;

const PROVIDER_SETTING_KEYS = [
  "imagine_ai_provider",
  "imagine_chat_model",
  CUSTOM_PROVIDERS_STORAGE_KEY,
] as const;

const PROVIDER_CREDENTIAL_KEYS = [
  "imagine_provider_credentials",
  "imagine_runninghub_saved_targets",
  "imagine_12ai_api_key",
  "imagine_custom_api_key",
  "imagine_grok2api_api_key",
  "imagine_grok2api_base_url",
  "imagine_custom_api_base_url",
] as const;

const AGENT_STORAGE_KEYS = [
  "imagine_agent_chat",
  "imagine_auto_execute",
] as const;

const UI_PREFERENCE_KEYS = [
  "imagine_theme_mode",
  "imagine_language",
  "imagine_agent_orb_position",
  "imagine_board_last_insert",
  "imagine_board_handles_hint_seen",
  "imagine_board_side_collapsed",
  "imagine_board_side_tab",
  "imagine_custom_prompt_templates",
  "imagine_resolve_integration_enabled",
  "imagine_show_price",
] as const;

const MANAGED_EXACT_KEYS = [
  ...MODEL_CACHE_KEYS,
  ...PROVIDER_SETTING_KEYS,
  ...PROVIDER_CREDENTIAL_KEYS,
  ...AGENT_STORAGE_KEYS,
  ...UI_PREFERENCE_KEYS,
] as const;

const AGENT_PREFIX_KEYS = ["imagine_agent_chat:"] as const;
const UI_PREFERENCE_PREFIX_KEYS = ["imagine_board_viewed_generated_asset_ids:"] as const;
const MANAGED_PREFIX_KEYS = [
  ...AGENT_PREFIX_KEYS,
  ...UI_PREFERENCE_PREFIX_KEYS,
] as const;

export type WorkspaceCleanupKind =
  | "failed"
  | "stale-processing"
  | "broken-complete"
  | "orphaned";

export type LocalStorageCleanupKind =
  | "agent"
  | "model-cache"
  | "provider-settings"
  | "provider-credentials"
  | "ui-preferences";

export type LocalStorageMigrationPolicy = "required" | "optional" | "local-only";

export interface LocalStorageInventoryEntry {
  bytes: number;
  includeCredentialsRequired: boolean;
  key: string;
  kind: LocalStorageCleanupKind;
  migrationPolicy: LocalStorageMigrationPolicy;
}

export interface WorkspaceBackupManifest {
  app: typeof BACKUP_APP_NAME;
  schemaVersion: number;
  exportedAt: string;
  assetsFile: typeof ASSET_INDEX_FILE;
  libraryFile?: typeof LIBRARY_INDEX_FILE;
  boardsFile: typeof BOARD_INDEX_FILE;
  generationTasksFile?: typeof GENERATION_TASK_INDEX_FILE;
  voiceProfilesFile?: typeof VOICE_PROFILE_INDEX_FILE;
  settingsFile?: typeof SETTINGS_FILE;
  counts: {
    assets: number;
    boards: number;
    generationTasks?: number;
    libraryAssets?: number;
    settingsKeys: number;
    voiceProfiles?: number;
  };
}

export interface WorkspaceExportResult {
  assetCount: number;
  boardCount: number;
  fileName: string;
  generationTaskCount: number;
  libraryAssetCount: number;
  settingsKeyCount: number;
  voiceProfileCount: number;
}

export interface WorkspaceSafetySnapshotSummary {
  assetCount: number;
  boardCount: number;
  createdAt: string;
  fileName: string;
  generationTaskCount: number;
  id: string;
  libraryAssetCount: number;
  origin: string;
  reason: WorkspaceSafetySnapshotReason;
  settingsKeyCount: number;
  sizeBytes: number;
  voiceProfileCount: number;
}

export interface WorkspaceImportPreview {
  assetCount: number;
  boardCount: number;
  exportedAt: string;
  includesCredentials: boolean;
  includesMediaFiles: boolean;
  generationTaskCount: number;
  libraryAssetCount: number;
  schemaVersion: number;
  settingsKeyCount: number;
  voiceProfileCount: number;
}

export interface WorkspaceImportResult {
  assetCount: number;
  boardCount: number;
  generationTaskCount: number;
  libraryAssetCount: number;
  settingsKeyCount: number;
  voiceProfileCount: number;
}

export interface WorkspaceCleanupResult {
  deletedIds: string[];
  kind: WorkspaceCleanupKind;
}

export interface WorkspaceAssetSourceRepairResult {
  repairedIds: string[];
}

export interface WorkspaceBoardAssetReference {
  assetId: string;
  boardId: string;
  boardTitle: string;
  field: string;
  nodeId: string;
  nodeKind: BoardNode["kind"];
}

export interface WorkspaceStaleAssetSourceLink {
  assetId: string;
  boardId: string;
  model: string;
  prompt: string;
  sourceBoardNodeId: string;
  status: StorageItem["status"];
}

export interface WorkspaceIntegrityDiagnostics {
  brokenCompleteAssetIds: string[];
  failedAssetIds: string[];
  issueCount: number;
  missingBoardReferences: WorkspaceBoardAssetReference[];
  orphanedAssetIds: string[];
  staleAssetSourceLinks: WorkspaceStaleAssetSourceLink[];
  staleProcessingAssetIds: string[];
  status: "healthy" | "attention" | "critical";
}

type AssetBlobPayloadExists = (asset: StorageItemMeta) => Promise<boolean>;

export interface WorkspaceDataSummary {
  assets: {
    audio: number;
    brokenComplete: number;
    failed: number;
    image: number;
    largest: Array<{ id: string; label: string; bytes: number }>;
    missingBoardReferences: number;
    orphaned: number;
    pending: number;
    processing: number;
    referencedByBoards: number;
    staleProcessing: number;
    stores: AssetDatabaseDiagnostics;
    total: number;
    video: number;
    transcript: number;
    estimatedBytes: number;
  };
  integrity: WorkspaceIntegrityDiagnostics;
  boards: {
    total: number;
    nodes: number;
    estimatedBytes: number;
  };
  localStorage: {
    agentKeys: number;
    credentialKeys: number;
    modelCacheKeys: number;
    providerSettingKeys: number;
    uiPreferenceKeys: number;
    inventory: LocalStorageInventoryEntry[];
    estimatedBytes: number;
  };
  browserStorage?: {
    quota?: number;
    usage?: number;
  };
  teamStorage?: {
    assetLibraryRecords: number;
    generationTasks: number;
    payloadBytes: number;
    payloadRefs: number;
    promptTemplates: number;
    providerTargets: number;
    secretSettings: number;
    settings: number;
    voiceProfiles: number;
  };
  safety: {
    latestSnapshot: WorkspaceSafetySnapshotSummary | null;
    origin: string;
  };
}

interface WorkspaceBackupAssetRecord extends Omit<StorageItem, "url"> {
  mediaFile?: string;
  mediaMimeType?: string;
  url?: string;
}

interface WorkspaceBackupSettings {
  localStorage: Record<string, string>;
}

interface ParsedBackup {
  assets: StorageItem[];
  boards: BoardDocument[];
  generationTasks: GenerationTask[];
  libraryAssets: LibraryAssetRecord[];
  settings: WorkspaceBackupSettings;
  voiceProfiles: VoiceProfile[];
}

interface DataUriParts {
  base64: string;
  mimeType: string;
}

interface WorkspaceBackupArchive extends WorkspaceExportResult {
  blob: Blob;
  exportedAt: string;
}

interface WorkspaceSafetySnapshotRecord extends WorkspaceSafetySnapshotSummary {
  blob: Blob;
}

export async function getWorkspaceDataSummary(items: StorageItem[] = []): Promise<WorkspaceDataSummary> {
  const assetMetas: StorageItemMeta[] = items.length > 0 ? items : await listAllAssetMetas();
  const [boards, libraryRecords, voiceProfiles, generationTasks] = await Promise.all([
    listBoardsFromDB(),
    listLibraryAssetRecords(),
    listVoiceProfiles(),
    listGenerationTasks(),
  ]);
  const protectedAssetIds = collectWorkspaceProtectedAssetIds({ boards, generationTasks, libraryRecords, voiceProfiles });
  const boardAssetIds = collectBoardAssetIds(boards);
  const assetIds = new Set(assetMetas.map(item => item.id));
  const stores = await getAssetDatabaseDiagnostics();
  const latestSnapshot = await getLatestWorkspaceSafetySnapshotSummary();
  const integrity = await buildWorkspaceIntegrityDiagnosticsWithPayloads(
    assetMetas,
    boards,
    Date.now(),
    hasAssetBlobPayload,
    protectedAssetIds,
  );
  const largest = assetMetas
    .map(item => ({ id: item.id, label: item.prompt || item.model || item.id, bytes: estimateStorageRecordBytes(item) }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 5);
  const localStorageEntries = readManagedLocalStorage(true);
  const browserStorage = typeof navigator !== "undefined" && navigator.storage?.estimate
    ? await navigator.storage.estimate()
    : undefined;

  return {
    assets: {
      audio: assetMetas.filter(item => item.type === "audio").length,
      brokenComplete: integrity.brokenCompleteAssetIds.length,
      failed: assetMetas.filter(item => item.status === "failed").length,
      image: assetMetas.filter(item => item.type === "image").length,
      largest,
      missingBoardReferences: Array.from(boardAssetIds).filter(assetId => !assetIds.has(assetId)).length,
      orphaned: findOrphanAssetIds(assetMetas, protectedAssetIds).length,
      pending: assetMetas.filter(item => item.status === "pending").length,
      processing: assetMetas.filter(item => item.status === "processing").length,
      referencedByBoards: boardAssetIds.size,
      staleProcessing: findStaleProcessingAssetIds(assetMetas).length,
      stores,
      total: assetMetas.length,
      video: assetMetas.filter(item => item.type === "video").length,
      transcript: assetMetas.filter(item => item.type === "transcript").length,
      estimatedBytes: assetMetas.reduce((total, item) => total + estimateStorageRecordBytes(item), 0),
    },
    integrity,
    boards: {
      total: boards.length,
      nodes: boards.reduce((total, board) => total + board.nodes.length, 0),
      estimatedBytes: boards.reduce((total, board) => total + textByteSize(JSON.stringify(board)), 0),
    },
    localStorage: {
      agentKeys: countLocalStorageKeys(localStorageEntries, isAgentStorageKey),
      credentialKeys: countLocalStorageKeys(localStorageEntries, isProviderCredentialKey),
      modelCacheKeys: countLocalStorageKeys(localStorageEntries, isModelCacheKey),
      providerSettingKeys: countLocalStorageKeys(localStorageEntries, isProviderSettingKey),
      uiPreferenceKeys: countLocalStorageKeys(localStorageEntries, isUiPreferenceKey),
      inventory: buildManagedLocalStorageInventory(localStorageEntries),
      estimatedBytes: Object.entries(localStorageEntries).reduce(
        (total, [key, value]) => total + textByteSize(key) + textByteSize(value),
        0,
      ),
    },
    browserStorage: browserStorage
      ? { quota: browserStorage.quota, usage: browserStorage.usage }
      : undefined,
    safety: {
      latestSnapshot,
      origin: currentWorkspaceOrigin(),
    },
  };
}

export async function exportCompleteWorkspaceBackup(includeCredentials: boolean): Promise<WorkspaceExportResult> {
  return exportWorkspaceBackup({
    assets: await getAllFromDB(),
    boards: await listBoardsFromDB(),
    filePrefix: "Imagine_Workbench_Backup",
    includeCredentials,
    includeAllWorkspaceData: true,
    includeSettings: true,
  });
}

export async function exportBoardWorkspaceBackup(
  board: BoardDocument,
  includeCredentials: boolean,
): Promise<WorkspaceExportResult> {
  const referencedIds = Array.from(collectBoardAssetIdsFromNodes(board.nodes));
  const metas = await listBoardScopedAssetMetas(board.id, referencedIds, board.nodes.map(node => node.id));
  const assets = await hydrateAssets(metas);
  return exportWorkspaceBackup({
    assets,
    boards: [board],
    filePrefix: `Imagine_Board_${safeFileSegment(board.title)}`,
    includeCredentials,
    includeAllWorkspaceData: false,
    includeSettings: true,
  });
}

export async function previewWorkspaceBackup(file: File): Promise<WorkspaceImportPreview> {
  const zip = await JSZip.loadAsync(file);
  validateZipFileCount(zip);
  const manifest = parseManifest(await readRequiredZipText(zip, MANIFEST_FILE));
  const assetRecords = parseAssetRecords(await readRequiredZipText(zip, manifest.assetsFile));
  const libraryRecords = manifest.libraryFile
    ? parseLibraryAssetRecords(await readRequiredZipText(zip, manifest.libraryFile))
    : [];
  const boards = parseBoardDocuments(await readRequiredZipText(zip, manifest.boardsFile));
  const generationTasks = manifest.generationTasksFile
    ? parseGenerationTasks(await readRequiredZipText(zip, manifest.generationTasksFile))
    : [];
  const voiceProfiles = manifest.voiceProfilesFile
    ? parseVoiceProfiles(await readRequiredZipText(zip, manifest.voiceProfilesFile))
    : [];
  const settings = manifest.settingsFile
    ? parseSettings(await readRequiredZipText(zip, manifest.settingsFile))
    : { localStorage: {} };

  validateBoardAssetReferences(boards, new Set(assetRecords.map(asset => asset.id)));
  validateLibraryAssetReferences(libraryRecords, new Set(assetRecords.map(asset => asset.id)));
  validateGenerationTaskAssetReferences(generationTasks, new Set(assetRecords.map(asset => asset.id)));
  validateVoiceProfileAssetReferences(voiceProfiles, new Set(assetRecords.map(asset => asset.id)));
  return {
    assetCount: assetRecords.length,
    boardCount: boards.length,
    exportedAt: manifest.exportedAt,
    generationTaskCount: generationTasks.length,
    includesCredentials: Object.keys(settings.localStorage).some(isProviderCredentialKey),
    includesMediaFiles: assetRecords.some(asset => Boolean(asset.mediaFile)),
    libraryAssetCount: libraryRecords.length,
    schemaVersion: manifest.schemaVersion,
    settingsKeyCount: Object.keys(settings.localStorage).length,
    voiceProfileCount: voiceProfiles.length,
  };
}

export async function importWorkspaceBackup(
  file: File,
  includeCredentials: boolean,
): Promise<WorkspaceImportResult> {
  const parsed = await parseWorkspaceBackup(file);
  await createWorkspaceSafetySnapshot("restore-workspace");
  await clearAllDB();
  await clearBoardsFromDB();
  clearManagedLocalStorage(includeCredentials);

  for (const asset of parsed.assets) {
    await saveToDB(asset);
  }
  for (const board of parsed.boards) {
    await saveBoardToDB(board);
  }
  for (const record of parsed.libraryAssets) {
    await saveLibraryAssetRecord(record);
  }
  for (const task of parsed.generationTasks) {
    await saveGenerationTask(task);
  }
  for (const profile of await listVoiceProfiles()) {
    await deleteVoiceProfile(profile.id);
  }
  for (const profile of parsed.voiceProfiles) {
    await saveVoiceProfile(profile);
  }
  writeManagedLocalStorage(parsed.settings.localStorage, includeCredentials);

  return {
    assetCount: parsed.assets.length,
    boardCount: parsed.boards.length,
    generationTaskCount: parsed.generationTasks.length,
    libraryAssetCount: parsed.libraryAssets.length,
    settingsKeyCount: Object.keys(parsed.settings.localStorage).filter(key =>
      includeCredentials || !isProviderCredentialKey(key),
    ).length,
    voiceProfileCount: parsed.voiceProfiles.length,
  };
}

export async function resetBoardsToDefault(): Promise<void> {
  await createWorkspaceSafetySnapshot("reset-boards");
  await clearBoardsFromDB();
  await saveBoardToDB(createEmptyBoard(DEFAULT_BOARD_ID));
}

function generationRequestAssetIds(request: GenerationRequestSnapshot | undefined): string[] {
  if (!request?.referenceMedia) return [];
  return request.referenceMedia
    .map(reference => reference.sourceAssetId)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function collectWorkspaceProtectedAssetIds(input: {
  boards: BoardDocument[];
  generationTasks: Awaited<ReturnType<typeof listGenerationTasks>>;
  libraryRecords: LibraryAssetRecord[];
  voiceProfiles: Awaited<ReturnType<typeof listVoiceProfiles>>;
}): Set<string> {
  const boardAssetIds = collectBoardAssetIds(input.boards);
  const libraryAssetIds = input.libraryRecords.map(record => record.assetId);
  const voiceProfileAssetIds = input.voiceProfiles.flatMap(profile => [
    ...profile.referenceAudioAssetIds,
    ...(profile.sourceAssetIds ?? []),
    ...(profile.previewAudioAssetId ? [profile.previewAudioAssetId] : []),
  ]);
  const generationTaskAssetIds = input.generationTasks.flatMap(task => [
    ...task.resultAssetIds,
    ...(task.activeResultAssetId ? [task.activeResultAssetId] : []),
    ...generationRequestAssetIds(task.request),
  ]);
  return new Set([
    ...boardAssetIds,
    ...libraryAssetIds,
    ...voiceProfileAssetIds,
    ...generationTaskAssetIds,
  ]);
}

export async function cleanupWorkspaceAssets(kind: WorkspaceCleanupKind): Promise<WorkspaceCleanupResult> {
  const [assets, boards, libraryRecords, voiceProfiles, generationTasks] = await Promise.all([
    listAllAssetMetas(),
    listBoardsFromDB(),
    listLibraryAssetRecords(),
    listVoiceProfiles(),
    listGenerationTasks(),
  ]);
  const protectedAssetIds = collectWorkspaceProtectedAssetIds({ boards, generationTasks, libraryRecords, voiceProfiles });
  const ids = await cleanupTargetIds(kind, assets, protectedAssetIds);
  if (ids.length > 0) {
    await createWorkspaceSafetySnapshot("cleanup-assets");
  }
  for (const id of ids) {
    await deleteFromDB(id);
  }
  return { deletedIds: ids, kind };
}

export async function repairStaleAssetSourceLinks(): Promise<WorkspaceAssetSourceRepairResult> {
  const [assets, boards] = await Promise.all([listAllAssetMetas(), listBoardsFromDB()]);
  const boardNodeIds = collectBoardNodeIds(boards);
  const staleAssets = assets.filter(item => item.sourceBoardNodeId && !boardNodeIds.has(item.sourceBoardNodeId));

  for (const item of staleAssets) {
    await saveToDB({ ...(await hydrateAsset(item)), sourceBoardNodeId: undefined });
  }

  return { repairedIds: staleAssets.map(item => item.id) };
}

export function clearLocalStorageGroup(kind: LocalStorageCleanupKind): number {
  const before = readManagedLocalStorage(true);
  const keys = Object.keys(before).filter(key => {
    if (kind === "agent") return isAgentStorageKey(key);
    if (kind === "model-cache") return isModelCacheKey(key);
    if (kind === "provider-settings") return isProviderSettingKey(key);
    if (kind === "provider-credentials") return isProviderCredentialKey(key);
    return isUiPreferenceKey(key);
  });
  keys.forEach(key => window.localStorage.removeItem(key));
  return keys.length;
}

export function formatWorkspaceSafetySnapshotReason(reason: WorkspaceSafetySnapshotReason): string {
  if (reason === "clear-assets") return t("common.dataManagement.clearAssetsReason");
  if (reason === "restore-workspace") return t("common.dataManagement.restoreBackupReason");
  if (reason === "reset-boards") return t("common.dataManagement.resetBoardsReason");
  return t("common.dataManagement.cleanupAssetsReason");
}

export async function createWorkspaceSafetySnapshot(
  reason: WorkspaceSafetySnapshotReason,
): Promise<WorkspaceSafetySnapshotSummary> {
  const archive = await createWorkspaceBackupArchive({
    assets: await getAllFromDB(),
    boards: await listBoardsFromDB(),
    filePrefix: `Imagine_Workbench_Safety_${reason}`,
    includeCredentials: false,
    includeAllWorkspaceData: true,
    includeSettings: true,
  });
  const record: WorkspaceSafetySnapshotRecord = {
    assetCount: archive.assetCount,
    blob: archive.blob,
    boardCount: archive.boardCount,
    createdAt: archive.exportedAt,
    fileName: archive.fileName,
    generationTaskCount: archive.generationTaskCount,
    id: LATEST_SAFETY_SNAPSHOT_ID,
    libraryAssetCount: archive.libraryAssetCount,
    origin: currentWorkspaceOrigin(),
    reason,
    settingsKeyCount: archive.settingsKeyCount,
    sizeBytes: archive.blob.size,
    voiceProfileCount: archive.voiceProfileCount,
  };
  await saveWorkspaceSafetySnapshotRecord(record);
  return toSafetySnapshotSummary(record);
}

export async function getLatestWorkspaceSafetySnapshotSummary(): Promise<WorkspaceSafetySnapshotSummary | null> {
  const record = await getLatestWorkspaceSafetySnapshotRecord();
  return record ? toSafetySnapshotSummary(record) : null;
}

export async function downloadLatestWorkspaceSafetySnapshot(): Promise<WorkspaceSafetySnapshotSummary> {
  const record = await getLatestWorkspaceSafetySnapshotRecord();
  if (!record) throw new Error(t("common.notices.noDownloadableSnapshot"));
  downloadBlob(record.blob, record.fileName);
  return toSafetySnapshotSummary(record);
}

export async function createLocalUploadAsset(
  file: File,
  id: string,
  options?: { boardId?: string },
): Promise<StorageItem> {
  const mediaType = mediaReferenceTypeFromMime(file.type);
  if (!mediaType) throw new Error(t("common.errors.fileReadFailed"));

  return buildStorageItem(
    {
      id,
      type: mediaType,
      url: mediaType === "image" ? await compressReferenceImageFile(file) : await readFileAsDataUrl(file),
      prompt: file.name || "Local upload",
      model: "local-upload",
      aspectRatio: "auto",
      createdAt: new Date().toISOString(),
      status: "complete",
      progress: 100,
      operationName: "local-upload",
    },
    { boardId: options?.boardId },
  );
}

export function findOrphanAssetIds(items: StorageItemMeta[], protectedAssetIds: ReadonlySet<string>): string[] {
  return items
    .filter(item => item.status === "complete" && !protectedAssetIds.has(item.id))
    .map(item => item.id);
}

export function collectBoardAssetIds(boards: BoardDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const board of boards) {
    for (const assetId of collectBoardAssetIdsFromNodes(board.nodes)) ids.add(assetId);
  }
  return ids;
}

export function collectBoardNodeIds(boards: BoardDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const board of boards) {
    for (const node of board.nodes) {
      ids.add(node.id);
    }
  }
  return ids;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function cleanupTargetIds(
  kind: WorkspaceCleanupKind,
  assets: StorageItemMeta[],
  protectedAssetIds: ReadonlySet<string>,
): Promise<string[]> {
  if (kind === "failed") return assets.filter(item => item.status === "failed").map(item => item.id);
  if (kind === "stale-processing") return findStaleProcessingAssetIds(assets);
  if (kind === "broken-complete") return findBrokenCompleteAssetIdsWithPayloads(assets);
  return findOrphanAssetIds(assets, protectedAssetIds);
}

function findStaleProcessingAssetIds(items: StorageItemMeta[], now = Date.now()): string[] {
  return items
    .filter(item => {
      if (item.status !== "processing" && item.status !== "pending") return false;
      const createdAt = Date.parse(item.createdAt);
      return Number.isFinite(createdAt) && now - createdAt > STALE_PROCESSING_MS;
    })
    .map(item => item.id);
}

function findBrokenCompleteAssetIds(items: StorageItemMeta[]): string[] {
  return items
    .filter(item => item.status === "complete" && !item.hasBlob && !item.url?.trim())
    .map(item => item.id);
}

async function findBrokenCompleteAssetIdsWithPayloads(
  items: StorageItemMeta[],
  assetBlobPayloadExists: AssetBlobPayloadExists = hasAssetBlobPayload,
): Promise<string[]> {
  const ids: string[] = [];
  for (const item of items) {
    if (item.status !== "complete") continue;
    if (!item.hasBlob) {
      if (!item.url?.trim()) ids.push(item.id);
      continue;
    }
    if (!(await assetBlobPayloadExists(item))) ids.push(item.id);
  }
  return ids;
}

function collectBoardAssetReferences(boards: BoardDocument[]): WorkspaceBoardAssetReference[] {
  const references: WorkspaceBoardAssetReference[] = [];
  for (const board of boards) {
    for (const node of board.nodes) {
      const base = {
        boardId: board.id,
        boardTitle: board.title,
        nodeId: node.id,
        nodeKind: node.kind,
      };
      if (node.kind === "asset") {
        references.push({ ...base, assetId: node.asset.assetId, field: "asset.assetId" });
      }
      if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app") {
        if (node.resultAssetId) references.push({ ...base, assetId: node.resultAssetId, field: "resultAssetId" });
        for (const assetId of node.resultAssetIds ?? []) references.push({ ...base, assetId, field: "resultAssetIds" });
      }
      if (node.kind === "result") {
        references.push({ ...base, assetId: node.asset.assetId, field: "asset.assetId" });
        for (const assetId of node.resultAssetIds) references.push({ ...base, assetId, field: "resultAssetIds" });
      }
      if (node.kind === "reference-group") {
        for (const reference of node.references) references.push({ ...base, assetId: reference.assetId, field: "references.assetId" });
      }
      if (node.kind === "multi-grid") {
        for (const item of node.items) references.push({ ...base, assetId: item.assetId, field: "items.assetId" });
      }
    }
  }
  return references;
}

export function buildWorkspaceIntegrityDiagnostics(
  assets: StorageItemMeta[],
  boards: BoardDocument[],
  now = Date.now(),
  protectedAssetIds?: ReadonlySet<string>,
): WorkspaceIntegrityDiagnostics {
  const assetIds = new Set(assets.map(item => item.id));
  const boardAssetIds = collectBoardAssetIds(boards);
  const boardNodeIds = collectBoardNodeIds(boards);
  const missingBoardReferences = collectBoardAssetReferences(boards).filter(reference => !assetIds.has(reference.assetId));
  const staleAssetSourceLinks = assets
    .filter(item => item.sourceBoardNodeId && !boardNodeIds.has(item.sourceBoardNodeId))
    .map(item => ({
      assetId: item.id,
      boardId: item.boardId,
      model: item.model,
      prompt: item.prompt,
      sourceBoardNodeId: item.sourceBoardNodeId ?? "",
      status: item.status,
    }));
  const brokenCompleteAssetIds = findBrokenCompleteAssetIds(assets);
  const failedAssetIds = assets.filter(item => item.status === "failed").map(item => item.id);
  const orphanedAssetIds = findOrphanAssetIds(assets, protectedAssetIds ?? boardAssetIds);
  const staleProcessingAssetIds = findStaleProcessingAssetIds(assets, now);
  const issueCount = workspaceIntegrityIssueCount({
    brokenCompleteAssetIds,
    failedAssetIds,
    missingBoardReferences,
    staleAssetSourceLinks,
    staleProcessingAssetIds,
  });
  const status = workspaceIntegrityStatus(issueCount, missingBoardReferences.length, brokenCompleteAssetIds.length);
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

export async function buildWorkspaceIntegrityDiagnosticsWithPayloads(
  assets: StorageItemMeta[],
  boards: BoardDocument[],
  now = Date.now(),
  assetBlobPayloadExists: AssetBlobPayloadExists = hasAssetBlobPayload,
  protectedAssetIds?: ReadonlySet<string>,
): Promise<WorkspaceIntegrityDiagnostics> {
  const diagnostics = buildWorkspaceIntegrityDiagnostics(assets, boards, now, protectedAssetIds);
  const brokenCompleteAssetIds = await findBrokenCompleteAssetIdsWithPayloads(assets, assetBlobPayloadExists);
  const issueCount = workspaceIntegrityIssueCount({ ...diagnostics, brokenCompleteAssetIds });
  return {
    ...diagnostics,
    brokenCompleteAssetIds,
    issueCount,
    status: workspaceIntegrityStatus(issueCount, diagnostics.missingBoardReferences.length, brokenCompleteAssetIds.length),
  };
}

function workspaceIntegrityIssueCount(input: Pick<
  WorkspaceIntegrityDiagnostics,
  "brokenCompleteAssetIds" | "failedAssetIds" | "missingBoardReferences" | "staleAssetSourceLinks" | "staleProcessingAssetIds"
>): number {
  return input.missingBoardReferences.length +
    input.staleAssetSourceLinks.length +
    input.brokenCompleteAssetIds.length +
    input.failedAssetIds.length +
    input.staleProcessingAssetIds.length;
}

function workspaceIntegrityStatus(
  issueCount: number,
  missingBoardReferenceCount: number,
  brokenCompleteAssetCount: number,
): WorkspaceIntegrityDiagnostics["status"] {
  if (missingBoardReferenceCount > 0 || brokenCompleteAssetCount > 0) return "critical";
  return issueCount > 0 ? "attention" : "healthy";
}

async function exportWorkspaceBackup(input: {
  assets: StorageItem[];
  boards: BoardDocument[];
  filePrefix: string;
  includeCredentials: boolean;
  includeAllWorkspaceData: boolean;
  includeSettings: boolean;
}): Promise<WorkspaceExportResult> {
  const archive = await createWorkspaceBackupArchive(input);
  downloadBlob(archive.blob, archive.fileName);
  return {
    assetCount: archive.assetCount,
    boardCount: archive.boardCount,
    fileName: archive.fileName,
    generationTaskCount: archive.generationTaskCount,
    libraryAssetCount: archive.libraryAssetCount,
    settingsKeyCount: archive.settingsKeyCount,
    voiceProfileCount: archive.voiceProfileCount,
  };
}

async function createWorkspaceBackupArchive(input: {
  assets: StorageItem[];
  boards: BoardDocument[];
  filePrefix: string;
  includeCredentials: boolean;
  includeAllWorkspaceData: boolean;
  includeSettings: boolean;
}): Promise<WorkspaceBackupArchive> {
  const zip = new JSZip();
  const assetRecords: WorkspaceBackupAssetRecord[] = [];
  for (const asset of input.assets) {
    assetRecords.push(addAssetToZip(zip, asset));
  }
  const exportedAssetIds = new Set(input.assets.map(asset => asset.id));
  const exportedBoardIds = new Set(input.boards.map(board => board.id));
  const libraryRecords = (await listLibraryAssetRecords())
    .filter(record => exportedAssetIds.has(record.assetId));
  const generationTasks = selectGenerationTasksForBackup(
    await listGenerationTasks(),
    exportedAssetIds,
    exportedBoardIds,
    input.includeAllWorkspaceData,
  );
  const voiceProfiles = selectVoiceProfilesForBackup(
    await listVoiceProfiles(),
    exportedAssetIds,
    input.includeAllWorkspaceData,
  );

  const settings = input.includeSettings
    ? { localStorage: readManagedLocalStorage(input.includeCredentials) }
    : { localStorage: {} };
  const exportedAt = new Date().toISOString();
  const manifest: WorkspaceBackupManifest = {
    app: BACKUP_APP_NAME,
    schemaVersion: WORKSPACE_BACKUP_SCHEMA_VERSION,
    exportedAt,
    assetsFile: ASSET_INDEX_FILE,
    libraryFile: LIBRARY_INDEX_FILE,
    boardsFile: BOARD_INDEX_FILE,
    generationTasksFile: GENERATION_TASK_INDEX_FILE,
    voiceProfilesFile: VOICE_PROFILE_INDEX_FILE,
    settingsFile: input.includeSettings ? SETTINGS_FILE : undefined,
    counts: {
      assets: assetRecords.length,
      boards: input.boards.length,
      generationTasks: generationTasks.length,
      libraryAssets: libraryRecords.length,
      settingsKeys: Object.keys(settings.localStorage).length,
      voiceProfiles: voiceProfiles.length,
    },
  };

  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  zip.file(ASSET_INDEX_FILE, JSON.stringify(assetRecords, null, 2));
  zip.file(LIBRARY_INDEX_FILE, JSON.stringify(libraryRecords, null, 2));
  zip.file(BOARD_INDEX_FILE, JSON.stringify(input.boards, null, 2));
  zip.file(GENERATION_TASK_INDEX_FILE, JSON.stringify(generationTasks, null, 2));
  zip.file(VOICE_PROFILE_INDEX_FILE, JSON.stringify(voiceProfiles, null, 2));
  if (input.includeSettings) zip.file(SETTINGS_FILE, JSON.stringify(settings, null, 2));

  const fileName = `${input.filePrefix}_${compactTimestamp(exportedAt)}.zip`;
  const blob = await zip.generateAsync({ type: "blob" });
  return {
    assetCount: assetRecords.length,
    blob,
    boardCount: input.boards.length,
    exportedAt,
    fileName,
    generationTaskCount: generationTasks.length,
    libraryAssetCount: libraryRecords.length,
    settingsKeyCount: Object.keys(settings.localStorage).length,
    voiceProfileCount: voiceProfiles.length,
  };
}

function selectGenerationTasksForBackup(
  tasks: GenerationTask[],
  assetIds: ReadonlySet<string>,
  boardIds: ReadonlySet<string>,
  includeAllWorkspaceData: boolean,
): GenerationTask[] {
  if (includeAllWorkspaceData) return tasks;
  return tasks.filter(task => {
    const taskAssetIds = generationTaskAssetIds(task);
    if (!taskAssetIds.every(assetId => assetIds.has(assetId))) return false;
    if (task.source.boardId && boardIds.has(task.source.boardId)) return true;
    return taskAssetIds.length > 0;
  });
}

function generationTaskAssetIds(task: GenerationTask): string[] {
  return [
    ...(task.activeResultAssetId ? [task.activeResultAssetId] : []),
    ...task.resultAssetIds,
    ...generationRequestAssetIds(task.request),
  ];
}

function selectVoiceProfilesForBackup(
  profiles: VoiceProfile[],
  assetIds: ReadonlySet<string>,
  includeAllWorkspaceData: boolean,
): VoiceProfile[] {
  if (includeAllWorkspaceData) return profiles;
  return profiles.filter(profile => {
    if (profile.referenceAudioAssetIds.some(assetId => assetIds.has(assetId))) return true;
    if (profile.sourceAssetIds?.some(assetId => assetIds.has(assetId))) return true;
    return Boolean(profile.previewAudioAssetId && assetIds.has(profile.previewAudioAssetId));
  });
}

function addAssetToZip(zip: JSZip, asset: StorageItem): WorkspaceBackupAssetRecord {
  const dataUri = parseDataUri(asset.url);
  if (!dataUri) return { ...asset, url: asset.url };

  const extension = mediaExtension(dataUri.mimeType, asset.type);
  const mediaFile = `assets/media/${safeFileSegment(asset.id)}.${extension}`;
  zip.file(mediaFile, dataUri.base64, { base64: true });
  const { url: _url, ...record } = asset;
  void _url;
  return {
    ...record,
    mediaFile,
    mediaMimeType: dataUri.mimeType,
  };
}

async function parseWorkspaceBackup(file: File): Promise<ParsedBackup> {
  const zip = await JSZip.loadAsync(file);
  validateZipFileCount(zip);
  const manifest = parseManifest(await readRequiredZipText(zip, MANIFEST_FILE));
  const assetRecords = parseAssetRecords(await readRequiredZipText(zip, manifest.assetsFile));
  const libraryRecords = manifest.libraryFile
    ? parseLibraryAssetRecords(await readRequiredZipText(zip, manifest.libraryFile))
    : [];
  const boards = parseBoardDocuments(await readRequiredZipText(zip, manifest.boardsFile));
  const generationTasks = manifest.generationTasksFile
    ? parseGenerationTasks(await readRequiredZipText(zip, manifest.generationTasksFile))
    : [];
  const voiceProfiles = manifest.voiceProfilesFile
    ? parseVoiceProfiles(await readRequiredZipText(zip, manifest.voiceProfilesFile))
    : [];
  const settings = manifest.settingsFile
    ? parseSettings(await readRequiredZipText(zip, manifest.settingsFile))
    : { localStorage: {} };
  const assets = await Promise.all(assetRecords.map(record => restoreAssetRecord(zip, record)));

  if (manifest.counts.assets !== assets.length) throw new Error("备份资产数量与 manifest 不一致");
  if (manifest.counts.boards !== boards.length) throw new Error("备份画板数量与 manifest 不一致");
  if ((manifest.counts.generationTasks ?? 0) !== generationTasks.length) throw new Error("备份任务数量与 manifest 不一致");
  if ((manifest.counts.libraryAssets ?? 0) !== libraryRecords.length) throw new Error("备份素材库数量与 manifest 不一致");
  if ((manifest.counts.voiceProfiles ?? 0) !== voiceProfiles.length) throw new Error("备份音色数量与 manifest 不一致");
  validateBoardAssetReferences(boards, new Set(assets.map(asset => asset.id)));
  validateLibraryAssetReferences(libraryRecords, new Set(assets.map(asset => asset.id)));
  validateGenerationTaskAssetReferences(generationTasks, new Set(assets.map(asset => asset.id)));
  validateVoiceProfileAssetReferences(voiceProfiles, new Set(assets.map(asset => asset.id)));

  return { assets, boards, generationTasks, libraryAssets: libraryRecords, settings, voiceProfiles };
}

function validateZipFileCount(zip: JSZip): void {
  if (Object.keys(zip.files).length > MAX_BACKUP_FILE_COUNT) {
    throw new Error("备份文件数量超过限制");
  }
}

async function restoreAssetRecord(zip: JSZip, record: WorkspaceBackupAssetRecord): Promise<StorageItem> {
  const { mediaFile, mediaMimeType, ...storageFields } = record;
  if (!mediaFile) {
    if (!record.url) throw new Error(`资产 ${record.id} 缺少媒体内容`);
    return buildStorageItem({ ...storageFields, url: record.url });
  }
  if (!record.mediaMimeType) throw new Error(`资产 ${record.id} 缺少媒体 MIME`);
  const zipMediaFile = zip.file(mediaFile);
  if (!zipMediaFile) throw new Error(`资产 ${record.id} 缺少媒体文件 ${mediaFile}`);
  const base64 = await zipMediaFile.async("base64");
  const url = `data:${record.mediaMimeType};base64,${base64}`;
  validateAssetMediaType(record.id, record.type, record.mediaMimeType);
  void mediaMimeType;
  return buildStorageItem({ ...storageFields, url }, { boardId: storageFields.boardId });
}

function validateAssetMediaType(id: string, type: StorageItem["type"], mimeType: string): void {
  if (type === "image" && !mimeType.startsWith("image/")) throw new Error(`资产 ${id} 的媒体类型不是图片`);
  if (type === "video" && !mimeType.startsWith("video/")) throw new Error(`资产 ${id} 的媒体类型不是视频`);
  if (type === "audio" && !mimeType.startsWith("audio/")) throw new Error(`资产 ${id} 的媒体类型不是音频`);
}

function parseManifest(text: string): WorkspaceBackupManifest {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error("manifest 格式无效");
  const app = readString(value, "app");
  const schemaVersion = readNumber(value, "schemaVersion");
  if (app !== BACKUP_APP_NAME) throw new Error("不是 Imagine Workbench 备份");
  if (!SUPPORTED_WORKSPACE_BACKUP_SCHEMA_VERSIONS.has(schemaVersion)) throw new Error("备份版本不兼容");
  const counts = readRecord(value, "counts");
  return {
    app,
    schemaVersion,
    exportedAt: readDateString(value, "exportedAt"),
    assetsFile: readLiteral(value, "assetsFile", ASSET_INDEX_FILE),
    libraryFile: readOptionalLiteral(value, "libraryFile", LIBRARY_INDEX_FILE),
    boardsFile: readLiteral(value, "boardsFile", BOARD_INDEX_FILE),
    generationTasksFile: readOptionalLiteral(value, "generationTasksFile", GENERATION_TASK_INDEX_FILE),
    voiceProfilesFile: readOptionalLiteral(value, "voiceProfilesFile", VOICE_PROFILE_INDEX_FILE),
    settingsFile: readOptionalLiteral(value, "settingsFile", SETTINGS_FILE),
    counts: {
      assets: readNumber(counts, "assets"),
      boards: readNumber(counts, "boards"),
      generationTasks: readOptionalNumber(counts, "generationTasks"),
      libraryAssets: readOptionalNumber(counts, "libraryAssets"),
      settingsKeys: readNumber(counts, "settingsKeys"),
      voiceProfiles: readOptionalNumber(counts, "voiceProfiles"),
    },
  };
}

function parseAssetRecords(text: string): WorkspaceBackupAssetRecord[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("资产索引必须是数组");
  const seenIds = new Set<string>();
  return value.map((record, index) => {
    const parsed = parseAssetRecord(record, index);
    if (seenIds.has(parsed.id)) throw new Error(`资产 ID 重复：${parsed.id}`);
    seenIds.add(parsed.id);
    return parsed;
  });
}

function parseAssetRecord(value: unknown, index: number): WorkspaceBackupAssetRecord {
  if (!isRecord(value)) throw new Error(`资产 ${index + 1} 格式无效`);
  const type = readAssetType(value, "type");
  const status = readAssetStatus(value, "status");
  const progress = readNumber(value, "progress");
  if (progress < 0 || progress > 100) throw new Error(`资产 ${index + 1} 进度无效`);
  return {
    id: readString(value, "id"),
    type,
    url: readOptionalString(value, "url"),
    prompt: readString(value, "prompt"),
    model: readString(value, "model"),
    aspectRatio: readString(value, "aspectRatio"),
    createdAt: readDateString(value, "createdAt"),
    status,
    progress,
    operationName: readOptionalString(value, "operationName"),
    errorMessage: readOptionalString(value, "errorMessage"),
    generationRequest: parseGenerationRequest(value.generationRequest),
    maskOriginalId: readOptionalString(value, "maskOriginalId"),
    sourceBoardNodeId: readOptionalString(value, "sourceBoardNodeId"),
    sourceBoardResultStackKey: readOptionalString(value, "sourceBoardResultStackKey"),
    libraryItemId: readOptionalString(value, "libraryItemId"),
    cropDerivative: parseCropDerivative(value.cropDerivative),
    scope: value.scope === "board" ? "board" : "workspace",
    boardId: typeof value.boardId === "string" ? value.boardId : "",
    hasBlob:
      typeof value.hasBlob === "boolean"
        ? value.hasBlob
        : Boolean(value.mediaFile || readOptionalString(value, "url")?.startsWith("data:")),
    mediaFile: readOptionalSafePath(value, "mediaFile"),
    mediaMimeType: readOptionalString(value, "mediaMimeType"),
  };
}

function parseLibraryAssetRecords(text: string): LibraryAssetRecord[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("素材库索引必须是数组");
  const seenIds = new Set<string>();
  return value.map((record, index) => {
    const parsed = parseLibraryAssetRecord(record, index);
    if (seenIds.has(parsed.id)) throw new Error(`素材库 ID 重复：${parsed.id}`);
    seenIds.add(parsed.id);
    return parsed;
  });
}

function parseLibraryAssetRecord(value: unknown, index: number): LibraryAssetRecord {
  if (!isRecord(value)) throw new Error(`素材库 ${index + 1} 格式无效`);
  return {
    id: readString(value, "id"),
    assetId: readString(value, "assetId"),
    sourceAssetId: readOptionalString(value, "sourceAssetId"),
    origin: readLibraryAssetOrigin(value, "origin"),
    mediaType: readLibraryAssetMediaType(value, "mediaType"),
    category: readLibraryAssetCategory(value, "category"),
    title: readString(value, "title"),
    notes: readOptionalString(value, "notes") ?? "",
    tags: readOptionalStringArray(value, "tags") ?? [],
    favorite: readBoolean(value, "favorite"),
    createdAt: readDateString(value, "createdAt"),
    updatedAt: readDateString(value, "updatedAt"),
  };
}

function parseGenerationTasks(text: string): GenerationTask[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("生成任务索引必须是数组");
  const seenIds = new Set<string>();
  return value.map((task, index) => {
    const parsed = parseGenerationTask(task, index);
    if (seenIds.has(parsed.id)) throw new Error(`生成任务 ID 重复：${parsed.id}`);
    seenIds.add(parsed.id);
    return parsed;
  });
}

function parseGenerationTask(value: unknown, index: number): GenerationTask {
  if (!isRecord(value)) throw new Error(`生成任务 ${index + 1} 格式无效`);
  const progress = readNumber(value, "progress");
  if (progress < 0 || progress > 100) throw new Error(`生成任务 ${index + 1} 进度无效`);
  const createdAt = readDateString(value, "createdAt");
  return {
    id: readString(value, "id"),
    mediaType: readAssetType(value, "mediaType"),
    prompt: readString(value, "prompt"),
    model: readString(value, "model"),
    status: readGenerationTaskStatus(value, "status"),
    progress,
    createdAt,
    updatedAt: readOptionalDateString(value, "updatedAt") ?? createdAt,
    source: parseGenerationTaskSource(value.source),
    resultAssetIds: readOptionalStringArray(value, "resultAssetIds") ?? [],
    activeResultAssetId: readOptionalString(value, "activeResultAssetId"),
    operationName: readOptionalString(value, "operationName"),
    errorMessage: readOptionalString(value, "errorMessage"),
    request: parseGenerationRequest(value.request),
    legacyAssetId: readOptionalString(value, "legacyAssetId"),
    canCancelRemote: readOptionalBoolean(value, "canCancelRemote") ?? false,
  };
}

function parseGenerationTaskSource(value: unknown): GenerationTaskSource {
  if (!isRecord(value)) throw new Error("生成任务来源格式无效");
  return {
    surface: readGenerationTaskSourceSurface(value, "surface"),
    boardId: readOptionalString(value, "boardId"),
    boardNodeId: readOptionalString(value, "boardNodeId"),
    resultStackKey: readOptionalString(value, "resultStackKey"),
  };
}

function parseVoiceProfiles(text: string): VoiceProfile[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("音色索引必须是数组");
  const seenIds = new Set<string>();
  return value.map((profile, index) => {
    const parsed = parseVoiceProfile(profile, index);
    if (seenIds.has(parsed.id)) throw new Error(`音色 ID 重复：${parsed.id}`);
    seenIds.add(parsed.id);
    return parsed;
  });
}

function parseVoiceProfile(value: unknown, index: number): VoiceProfile {
  if (!isRecord(value)) throw new Error(`音色 ${index + 1} 格式无效`);
  const provider = readProvider(value, "provider");
  return {
    id: readString(value, "id"),
    name: readString(value, "name"),
    provider,
    source: readVoiceProfileSource(value, "source"),
    description: readOptionalString(value, "description"),
    tags: readOptionalStringArray(value, "tags") ?? [],
    providerVoiceId: readOptionalString(value, "providerVoiceId"),
    designPrompt: readOptionalString(value, "designPrompt"),
    referenceAudioAssetIds: readOptionalStringArray(value, "referenceAudioAssetIds") ?? [],
    sourceAssetIds: readOptionalStringArray(value, "sourceAssetIds"),
    consentAcceptedAt: readOptionalString(value, "consentAcceptedAt"),
    previewAudioAssetId: readOptionalString(value, "previewAudioAssetId"),
    createdAt: readDateString(value, "createdAt"),
    updatedAt: readDateString(value, "updatedAt"),
  };
}

function parseGenerationRequest(value: unknown): GenerationRequestSnapshot | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("generationRequest 格式无效");
  return {
    prompt: readString(value, "prompt"),
    model: readString(value, "model"),
    aspectRatio: readString(value, "aspectRatio"),
    imageResolution: readOptionalString(value, "imageResolution"),
    imageQuality: readOptionalString(value, "imageQuality"),
    thinkingLevel: readOptionalString(value, "thinkingLevel"),
    cinematicProfile: value.cinematicProfile === undefined ? undefined : normalizeCinematicProfile(value.cinematicProfile),
    videoDurationSeconds: readOptionalString(value, "videoDurationSeconds"),
    videoPreset: readOptionalString(value, "videoPreset"),
    videoReferenceMode: readVideoReferenceMode(value.videoReferenceMode),
    videoResolution: readOptionalString(value, "videoResolution"),
    audioFormat: readOptionalString(value, "audioFormat"),
    audioMode: readOptionalAudioOperationMode(value.audioMode),
    audioStylePrompt: readOptionalString(value, "audioStylePrompt"),
    asrLanguage: readAsrLanguage(value.asrLanguage),
    optimizeTextPreview: readOptionalBoolean(value, "optimizeTextPreview"),
    voiceProfileId: readOptionalString(value, "voiceProfileId"),
    runningHubYouchuan: readOptionalRunningHubYouchuanAdvancedSettings(value, "runningHubYouchuan"),
    referenceMedia: parseGenerationReferenceMedia(value.referenceMedia),
    referenceImages: readOptionalStringArray(value, "referenceImages"),
  };
}

function parseCropDerivative(value: unknown): AssetCropDerivative | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("cropDerivative 格式无效");
  const cropRect = readRecord(value, "cropRect");
  return {
    sourceAssetId: readString(value, "sourceAssetId"),
    sourceWidth: readNumber(value, "sourceWidth"),
    sourceHeight: readNumber(value, "sourceHeight"),
    splitIndex: readNumber(value, "splitIndex"),
    splitCount: readNumber(value, "splitCount"),
    cropRect: {
      x: readNumber(cropRect, "x"),
      y: readNumber(cropRect, "y"),
      width: readNumber(cropRect, "width"),
      height: readNumber(cropRect, "height"),
    },
  };
}

function readVideoReferenceMode(value: unknown): "reference" | "firstLast" | undefined {
  return value === "reference" || value === "firstLast" ? value : undefined;
}

function readAudioOperationMode(value: unknown): AudioOperationMode {
  if (value === "tts" || value === "voice_design" || value === "voice_clone" || value === "music" || value === "sfx" || value === "asr") return value;
  return "tts";
}

function readOptionalAudioOperationMode(value: unknown): AudioOperationMode | undefined {
  if (value === undefined) return undefined;
  return readAudioOperationMode(value);
}

function readAsrLanguage(value: unknown): "auto" | "zh" | "en" | undefined {
  return value === "auto" || value === "zh" || value === "en" ? value : undefined;
}

function parseGenerationReferenceMedia(value: unknown): GenerationReferenceMediaSnapshot[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("referenceMedia 格式无效");
  return value.map(item => {
    if (!isRecord(item)) throw new Error("referenceMedia 条目格式无效");
    const sourceAssetId = readOptionalString(item, "sourceAssetId");
    const url = readOptionalString(item, "url") ?? "";
    if (!sourceAssetId && !url) throw new Error("referenceMedia.url 必须是非空字符串");
    const typeValue = item.type;
    const type = isMediaReferenceType(typeValue) ? typeValue : mediaReferenceTypeFromDataUri(url) ?? "image";
    const roleValue = item.role;
    return {
      ...(sourceAssetId ? { sourceAssetId } : {}),
      url,
      type,
      ...(roleValue === "start" || roleValue === "end" || roleValue === "general" ? { role: roleValue } : {}),
    };
  });
}

function parseBoardDocuments(text: string): BoardDocument[] {
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("画板索引必须是数组");
  const seenIds = new Set<string>();
  return value.map((board, index) => {
    const parsed = parseBoardDocument(board, index);
    if (seenIds.has(parsed.id)) throw new Error(`画板 ID 重复：${parsed.id}`);
    seenIds.add(parsed.id);
    return parsed;
  });
}

function parseBoardDocument(value: unknown, index: number): BoardDocument {
  if (!isRecord(value)) throw new Error(`画板 ${index + 1} 格式无效`);
  const nodes = readArray(value, "nodes").map(parseBoardNode);
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) throw new Error(`画板 ${index + 1} 节点 ID 重复：${node.id}`);
    nodeIds.add(node.id);
  }
  const edges = readArray(value, "edges").map(edge => parseBoardEdge(edge, nodes));
  return {
    id: readString(value, "id"),
    title: readString(value, "title"),
    config: parseBoardConfig(value.config),
    nodes,
    edges,
    viewport: parseBoardViewport(value.viewport),
    createdAt: readDateString(value, "createdAt"),
    updatedAt: readDateString(value, "updatedAt"),
  };
}

function parseBoardConfig(value: unknown): BoardConfig {
  if (!isRecord(value)) throw new Error("画板 config 格式无效");
  return {
    showGrid: readBoolean(value, "showGrid"),
    showMiniMap: readBoolean(value, "showMiniMap"),
    snapToGrid:
      typeof value.snapToGrid === "boolean" ? value.snapToGrid : DEFAULT_BOARD_CONFIG.snapToGrid,
  };
}

function parseBoardViewport(value: unknown): BoardViewport {
  const point = parseBoardPoint(value);
  if (!isRecord(value)) throw new Error("画板 viewport 格式无效");
  return { ...point, zoom: readNumber(value, "zoom") };
}

function parseBoardNode(value: unknown): BoardNode {
  if (!isRecord(value)) throw new Error("画板节点格式无效");
  const kind = readBoardNodeKind(value, "kind");
  const base = {
    id: readString(value, "id"),
    parentId: readOptionalString(value, "parentId"),
    position: parseBoardPoint(value.position),
    size: parseBoardSize(value.size),
    title: readString(value, "title"),
    createdAt: readDateString(value, "createdAt"),
    updatedAt: readDateString(value, "updatedAt"),
  };
  if (kind === "asset") {
    const asset = readRecord(value, "asset");
    return {
      ...base,
      kind,
      asset: {
        assetId: readString(asset, "assetId"),
        type: readBoardAssetType(asset, "type"),
        url: readString(asset, "url"),
        prompt: readString(asset, "prompt"),
        model: readString(asset, "model"),
      },
      resultSourceNodeId: readOptionalString(value, "resultSourceNodeId"),
      resultStackKey: readOptionalString(value, "resultStackKey"),
      resultAssetIds: readOptionalStringArray(value, "resultAssetIds"),
    };
  }
  if (kind === "prompt") return { ...base, kind, prompt: readText(value, "prompt") };
  if (kind === "reference-group") {
    return { ...base, kind, references: readArray(value, "references").map(parseReferenceGroupItem) };
  }
  if (kind === "group") return { ...base, kind };
  if (kind === "image-generate") {
    return {
      ...base,
      kind,
      prompt: readText(value, "prompt"),
      model: readString(value, "model"),
      aspectRatio: readString(value, "aspectRatio"),
      cinematicProfile: normalizeCinematicProfile(value.cinematicProfile),
      customImageResolution: readString(value, "customImageResolution"),
        imageQuality: readOptionalString(value, "imageQuality"),
        imageResolution: readString(value, "imageResolution"),
        runningHubYouchuan: readOptionalRunningHubYouchuanAdvancedSettings(value, "runningHubYouchuan"),
        thinkingLevel: readOptionalString(value, "thinkingLevel"),
        variantCount: readVariantCount(value, "variantCount"),
        status: readGenerationStatus(value, "status"),
        resultAssetId: readOptionalString(value, "resultAssetId"),
        resultAssetIds: readOptionalStringArray(value, "resultAssetIds"),
        resultStackKey: readOptionalString(value, "resultStackKey"),
        errorMessage: readOptionalString(value, "errorMessage"),
    };
  }
  if (kind === "video-generate") {
    return {
      ...base,
      kind,
      prompt: readText(value, "prompt"),
      model: readString(value, "model"),
      aspectRatio: readString(value, "aspectRatio"),
      cinematicProfile: normalizeCinematicProfile(value.cinematicProfile),
      videoDuration: readOptionalString(value, "videoDuration"),
        videoPreset: readOptionalString(value, "videoPreset"),
        videoReferenceMode: readVideoReferenceMode(value.videoReferenceMode),
        videoResolution: readOptionalString(value, "videoResolution"),
        variantCount: readVariantCount(value, "variantCount"),
        status: readGenerationStatus(value, "status"),
        resultAssetId: readOptionalString(value, "resultAssetId"),
        resultAssetIds: readOptionalStringArray(value, "resultAssetIds"),
        resultStackKey: readOptionalString(value, "resultStackKey"),
        errorMessage: readOptionalString(value, "errorMessage"),
    };
  }
  if (kind === "audio-operation") {
    return {
      ...base,
      kind,
      prompt: readText(value, "prompt"),
      model: readString(value, "model"),
      audioMode: readAudioOperationMode(value.audioMode),
      audioFormat: readOptionalString(value, "audioFormat") ?? "wav",
      audioStylePrompt: readOptionalString(value, "audioStylePrompt"),
      asrLanguage: readAsrLanguage(value.asrLanguage),
      voiceProfileId: readOptionalString(value, "voiceProfileId"),
      voiceCloneConsentAccepted: readOptionalBoolean(value, "voiceCloneConsentAccepted"),
      variantCount: readVariantCount(value, "variantCount"),
      status: readGenerationStatus(value, "status"),
      resultAssetId: readOptionalString(value, "resultAssetId"),
      resultAssetIds: readOptionalStringArray(value, "resultAssetIds"),
      resultStackKey: readOptionalString(value, "resultStackKey"),
      errorMessage: readOptionalString(value, "errorMessage"),
    };
  }
  if (kind === "runninghub-app") {
    return {
      ...base,
      kind,
      targetType: readRunningHubTargetType(value, "targetType"),
      outputType: readRunningHubOutputType(value, "outputType"),
      targetId: readString(value, "targetId"),
      accessPassword: readOptionalString(value, "accessPassword"),
      prompt: readText(value, "prompt"),
      bindings: readArray(value, "bindings").map(parseRunningHubBinding),
      status: readGenerationStatus(value, "status"),
      resultAssetId: readOptionalString(value, "resultAssetId"),
      resultAssetIds: readOptionalStringArray(value, "resultAssetIds"),
      resultStackKey: readOptionalString(value, "resultStackKey"),
      errorMessage: readOptionalString(value, "errorMessage"),
    };
  }
  if (kind === "agent") return { ...base, kind, instruction: readText(value, "instruction") };
  if (kind === "result") {
    const asset = readRecord(value, "asset");
    return {
      ...base,
      kind,
      sourceNodeId: readString(value, "sourceNodeId"),
      resultStackKey: readString(value, "resultStackKey"),
      activeAssetId: readString(value, "activeAssetId"),
      resultAssetIds: readOptionalStringArray(value, "resultAssetIds") ?? [],
      asset: {
        assetId: readString(asset, "assetId"),
        type: readBoardAssetType(asset, "type"),
        url: readString(asset, "url"),
        prompt: readString(asset, "prompt"),
        model: readString(asset, "model"),
      },
    };
  }
  if (kind === "note") return {
    ...base,
    kind,
    body: readText(value, "body"),
    source: parseBoardNoteSource(value.source),
    variant: value.variant === "transcript" ? "transcript" : "plain",
  };
  throw new Error(`不支持的画板节点类型: ${kind}`);
}

function parseBoardNoteSource(value: unknown): { assetId: string; model: string; sourceNodeId?: string } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("note source 格式无效");
  return {
    assetId: readString(value, "assetId"),
    model: readString(value, "model"),
    sourceNodeId: readOptionalString(value, "sourceNodeId"),
  };
}

function parseReferenceGroupItem(value: unknown): BoardReferenceGroupItem {
  if (!isRecord(value)) throw new Error("参考组条目格式无效");
  return {
    assetId: readString(value, "assetId"),
    model: readString(value, "model"),
    prompt: readString(value, "prompt"),
    role: readReferenceRole(value, "role"),
    type: isMediaReferenceType(value.type) ? value.type : mediaReferenceTypeFromDataUri(readString(value, "url")) ?? "image",
    url: readString(value, "url"),
  };
}

function parseRunningHubBinding(value: unknown): BoardRunningHubNodeInfoBinding {
  if (!isRecord(value)) throw new Error("RunningHub 参数绑定格式无效");
  return {
    id: readString(value, "id"),
    nodeId: readString(value, "nodeId"),
    fieldName: readString(value, "fieldName"),
    label: readOptionalString(value, "label"),
    source: readRunningHubBindingSource(value, "source"),
    value: readOptionalString(value, "value") ?? "",
    valueType: readRunningHubBindingValueType(value.valueType),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    required: typeof value.required === "boolean" ? value.required : undefined,
    referenceIndex: typeof value.referenceIndex === "number" && Number.isInteger(value.referenceIndex) && value.referenceIndex >= 0
      ? value.referenceIndex
      : undefined,
    referenceType: isMediaReferenceType(value.referenceType) ? value.referenceType : "image",
    deliveryMode: readRunningHubBindingDelivery(value, "deliveryMode"),
  };
}

function parseBoardEdge(value: unknown, nodes: BoardNode[]): BoardEdge {
  if (!isRecord(value)) throw new Error("画板连线格式无效");
  const from = parseBoardPortRef(value.from);
  const to = parseBoardPortRef(value.to);
  return {
    id: readString(value, "id"),
    kind: resolveBoardConnectionKind(nodes, from, to),
    from,
    to,
    createdAt: readDateString(value, "createdAt"),
  };
}

function parseBoardPortRef(value: unknown): BoardPortRef {
  if (!isRecord(value)) throw new Error("画板端口格式无效");
  const portKind = value.portKind;
  if (portKind !== "asset" && portKind !== "prompt" && portKind !== "result" && portKind !== "agent") {
    throw new Error("画板端口类型无效");
  }
  return {
    nodeId: readString(value, "nodeId"),
    portId: readString(value, "portId"),
    portKind,
  };
}

function parseBoardPoint(value: unknown): BoardPoint {
  if (!isRecord(value)) throw new Error("画板坐标格式无效");
  return { x: readNumber(value, "x"), y: readNumber(value, "y") };
}

function parseBoardSize(value: unknown): BoardSize {
  if (!isRecord(value)) throw new Error("画板尺寸格式无效");
  return { width: readNumber(value, "width"), height: readNumber(value, "height") };
}

function validateBoardAssetReferences(boards: BoardDocument[], assetIds: ReadonlySet<string>): void {
  const missing = collectBoardAssetReferences(boards).find(reference => !assetIds.has(reference.assetId));
  if (missing) throw new Error(`画板 ${missing.boardTitle} 节点 ${missing.nodeId} 引用缺失资产 ${missing.assetId}`);
}

function validateLibraryAssetReferences(records: LibraryAssetRecord[], assetIds: ReadonlySet<string>): void {
  const missing = records.find(record => !assetIds.has(record.assetId));
  if (missing) throw new Error(`素材库 ${missing.title} 引用缺失资产 ${missing.assetId}`);
}

function validateGenerationTaskAssetReferences(tasks: GenerationTask[], assetIds: ReadonlySet<string>): void {
  for (const task of tasks) {
    if (task.activeResultAssetId && !assetIds.has(task.activeResultAssetId)) {
      throw new Error(`生成任务 ${task.id} 引用缺失资产 ${task.activeResultAssetId}`);
    }
    const resultMissing = task.resultAssetIds.find(assetId => !assetIds.has(assetId));
    if (resultMissing) throw new Error(`生成任务 ${task.id} 引用缺失资产 ${resultMissing}`);
    const requestMissing = generationRequestAssetIds(task.request).find(assetId => !assetIds.has(assetId));
    if (requestMissing) throw new Error(`生成任务 ${task.id} 引用缺失资产 ${requestMissing}`);
  }
}

function validateVoiceProfileAssetReferences(profiles: VoiceProfile[], assetIds: ReadonlySet<string>): void {
  for (const profile of profiles) {
    const missing = [
      ...profile.referenceAudioAssetIds,
      ...(profile.sourceAssetIds ?? []),
      ...(profile.previewAudioAssetId ? [profile.previewAudioAssetId] : []),
    ].find(assetId => !assetIds.has(assetId));
    if (missing) throw new Error(`音色 ${profile.name} 引用缺失资产 ${missing}`);
  }
}

function parseSettings(text: string): WorkspaceBackupSettings {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error("设置文件格式无效");
  const localStorage = readRecord(value, "localStorage");
  const entries: Record<string, string> = {};
  for (const [key, entryValue] of Object.entries(localStorage)) {
    if (!isManagedLocalStorageKey(key)) throw new Error(`设置包含不允许导入的键：${key}`);
    if (typeof entryValue !== "string") throw new Error(`设置键 ${key} 的值无效`);
    entries[key] = entryValue;
  }
  return { localStorage: entries };
}

function readManagedLocalStorage(includeCredentials: boolean): Record<string, string> {
  if (typeof window === "undefined") return {};
  const entries: Record<string, string> = {};
  for (const key of MANAGED_EXACT_KEYS) {
    if (!includeCredentials && isProviderCredentialKey(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    if (!MANAGED_PREFIX_KEYS.some(prefix => key.startsWith(prefix))) continue;
    const value = window.localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return entries;
}

export function buildManagedLocalStorageInventory(entries: Record<string, string>): LocalStorageInventoryEntry[] {
  return Object.entries(entries)
    .filter(([key]) => isManagedLocalStorageKey(key))
    .map(([key, value]) => ({
      bytes: textByteSize(key) + textByteSize(value),
      includeCredentialsRequired: isProviderCredentialKey(key),
      key,
      kind: classifyLocalStorageKey(key),
      migrationPolicy: localStorageMigrationPolicy(key),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function clearManagedLocalStorage(includeCredentials: boolean): void {
  if (typeof window === "undefined") return;
  Object.keys(readManagedLocalStorage(includeCredentials)).forEach(key => window.localStorage.removeItem(key));
}

function writeManagedLocalStorage(entries: Record<string, string>, includeCredentials: boolean): void {
  if (typeof window === "undefined") return;
  for (const [key, value] of Object.entries(entries)) {
    if (!includeCredentials && isProviderCredentialKey(key)) continue;
    window.localStorage.setItem(key, value);
  }
}

function isManagedLocalStorageKey(key: string): boolean {
  return MANAGED_EXACT_KEYS.some(item => item === key) || MANAGED_PREFIX_KEYS.some(prefix => key.startsWith(prefix));
}

function isAgentStorageKey(key: string): boolean {
  return AGENT_STORAGE_KEYS.some(item => item === key) || AGENT_PREFIX_KEYS.some(prefix => key.startsWith(prefix));
}

function isModelCacheKey(key: string): boolean {
  return MODEL_CACHE_KEYS.some(item => item === key);
}

function isProviderSettingKey(key: string): boolean {
  return PROVIDER_SETTING_KEYS.some(item => item === key);
}

function isProviderCredentialKey(key: string): boolean {
  return PROVIDER_CREDENTIAL_KEYS.some(item => item === key);
}

function isUiPreferenceKey(key: string): boolean {
  return UI_PREFERENCE_KEYS.some(item => item === key) || UI_PREFERENCE_PREFIX_KEYS.some(prefix => key.startsWith(prefix));
}

function classifyLocalStorageKey(key: string): LocalStorageCleanupKind {
  if (isAgentStorageKey(key)) return "agent";
  if (isModelCacheKey(key)) return "model-cache";
  if (isProviderSettingKey(key)) return "provider-settings";
  if (isProviderCredentialKey(key)) return "provider-credentials";
  if (isUiPreferenceKey(key)) return "ui-preferences";
  throw new Error(`Unsupported managed localStorage key: ${key}`);
}

function localStorageMigrationPolicy(key: string): LocalStorageMigrationPolicy {
  if (isProviderCredentialKey(key)) return "optional";
  if (isAgentStorageKey(key)) return "optional";
  if (UI_PREFERENCE_PREFIX_KEYS.some(prefix => key.startsWith(prefix))) return "local-only";
  return "required";
}

function countLocalStorageKeys(entries: Record<string, string>, predicate: (key: string) => boolean): number {
  return Object.keys(entries).filter(predicate).length;
}

async function readRequiredZipText(zip: JSZip, path: string): Promise<string> {
  if (path.includes("..")) throw new Error("备份文件路径无效");
  const file = zip.file(path);
  if (!file) throw new Error(`备份缺少 ${path}`);
  return file.async("text");
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function currentWorkspaceOrigin(): string {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function openSafetySnapshotDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 不可用"));
      return;
    }
    const request = indexedDB.open(SAFETY_DB_NAME, SAFETY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAFETY_SNAPSHOT_STORE)) {
        db.createObjectStore(SAFETY_SNAPSHOT_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("安全快照数据库打开失败"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function saveWorkspaceSafetySnapshotRecord(record: WorkspaceSafetySnapshotRecord): Promise<void> {
  const db = await openSafetySnapshotDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SAFETY_SNAPSHOT_STORE, "readwrite");
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("安全快照保存失败"));
    };
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.objectStore(SAFETY_SNAPSHOT_STORE).put(record);
  });
}

async function getLatestWorkspaceSafetySnapshotRecord(): Promise<WorkspaceSafetySnapshotRecord | null> {
  const db = await openSafetySnapshotDatabase();
  return new Promise((resolve, reject) => {
    let record: WorkspaceSafetySnapshotRecord | null = null;
    const transaction = db.transaction(SAFETY_SNAPSHOT_STORE, "readonly");
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("安全快照读取失败"));
    };
    transaction.oncomplete = () => {
      db.close();
      resolve(record);
    };
    const request = transaction.objectStore(SAFETY_SNAPSHOT_STORE).get(LATEST_SAFETY_SNAPSHOT_ID);
    request.onsuccess = () => {
      record = (request.result as WorkspaceSafetySnapshotRecord | undefined) ?? null;
    };
  });
}

function toSafetySnapshotSummary(record: WorkspaceSafetySnapshotRecord): WorkspaceSafetySnapshotSummary {
  const { blob: _blob, ...summary } = record;
  void _blob;
  return { ...summary, libraryAssetCount: summary.libraryAssetCount ?? 0 };
}

function parseDataUri(value: string): DataUriParts | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function mediaExtension(mimeType: string, type: StorageItem["type"]): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (type === "image") return "png";
  if (type === "audio") return "mp3";
  return "mp4";
}

function estimateStorageRecordBytes(item: StorageItemMeta): number {
  const urlBytes = item.url ? textByteSize(item.url) : 0;
  return urlBytes + textByteSize(JSON.stringify({
    id: item.id,
    type: item.type,
    prompt: item.prompt,
    model: item.model,
    aspectRatio: item.aspectRatio,
    createdAt: item.createdAt,
    status: item.status,
    progress: item.progress,
    scope: item.scope,
    boardId: item.boardId,
    operationName: item.operationName,
    errorMessage: item.errorMessage,
    generationRequest: item.generationRequest,
    cropDerivative: item.cropDerivative,
    contentHash: item.contentHash,
    previewStatus: item.previewStatus,
  }));
}

function textByteSize(value: string): number {
  return new Blob([value]).size;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("文件读取结果不是 Data URL"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function safeFileSegment(value: string): string {
  const sanitized = value.trim().replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "");
  return sanitized || "untitled";
}

function compactTimestamp(value: string): string {
  return value.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readRecord(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = record[field];
  if (!isRecord(value)) throw new Error(`${field} 格式无效`);
  return value;
}

function readArray(record: Record<string, unknown>, field: string): unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) throw new Error(`${field} 必须是数组`);
  return value;
}

function readString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} 必须是非空字符串`);
  return value;
}

function readText(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串`);
  return value;
}

function readDateString(record: Record<string, unknown>, field: string): string {
  const value = readString(record, field);
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} 日期无效`);
  return value;
}

function readOptionalDateString(record: Record<string, unknown>, field: string): string | undefined {
  const value = readOptionalString(record, field);
  if (value === undefined) return undefined;
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} 日期无效`);
  return value;
}

function readOptionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串`);
  return value;
}

function readOptionalBoolean(record: Record<string, unknown>, field: string): boolean | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} 必须是布尔值`);
  return value;
}

function readOptionalRunningHubYouchuanAdvancedSettings(
  record: Record<string, unknown>,
  field: string,
): RunningHubYouchuanAdvancedSettings | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${field} 格式无效`);
  return {
    chaos: readNumberInRange(value, "chaos", 0, 100),
    stylize: readNumberInRange(value, "stylize", 0, 1000),
    raw: readBoolean(value, "raw"),
    iw: readNumberInRange(value, "iw", 0, 3),
    sw: readNumberInRange(value, "sw", 0, 1000),
    ...readOptionalNumberInRange(value, "weird", 0, 3000),
    ...readOptionalBooleanField(value, "tile"),
    ...readOptionalStringField(value, "sref"),
    ...readOptionalStringField(value, "oref"),
    ...readOptionalNumberInRange(value, "ow", 1, 1000),
    ...readOptionalHd(value),
  };
}

function readNumberInRange(record: Record<string, unknown>, field: string, min: number, max: number): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} 必须是 ${min}-${max} 之间的数字`);
  }
  return value;
}

function readOptionalNumberInRange(record: Record<string, unknown>, field: keyof RunningHubYouchuanAdvancedSettings, min: number, max: number): Partial<RunningHubYouchuanAdvancedSettings> {
  const value = record[field];
  if (value === undefined) return {};
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} 必须是 ${min}-${max} 之间的数字`);
  }
  return { [field]: value };
}

function readOptionalBooleanField(record: Record<string, unknown>, field: keyof RunningHubYouchuanAdvancedSettings): Partial<RunningHubYouchuanAdvancedSettings> {
  const value = record[field];
  if (value === undefined) return {};
  if (typeof value !== "boolean") throw new Error(`${field} 必须是布尔值`);
  return { [field]: value };
}

function readOptionalStringField(record: Record<string, unknown>, field: "sref" | "oref"): Partial<Pick<RunningHubYouchuanAdvancedSettings, "sref" | "oref">> {
  const value = record[field];
  if (value === undefined) return {};
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串`);
  return { [field]: value };
}

function readOptionalHd(record: Record<string, unknown>): Partial<Pick<RunningHubYouchuanAdvancedSettings, "hd">> {
  const value = record.hd;
  if (value === undefined) return {};
  if (typeof value !== "boolean") throw new Error("hd 必须是布尔值");
  return { hd: value };
}

function readOptionalSafePath(record: Record<string, unknown>, field: string): string | undefined {
  const value = readOptionalString(record, field);
  if (value && value.includes("..")) throw new Error(`${field} 路径无效`);
  return value;
}

function readOptionalStringArray(record: Record<string, unknown>, field: string): string[] | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new Error(`${field} 必须是字符串数组`);
  }
  return value;
}

function readNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} 必须是有限数字`);
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} 必须是有限数字`);
  return value;
}

function readBoolean(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") throw new Error(`${field} 必须是布尔值`);
  return value;
}

function readLiteral<T extends string>(record: Record<string, unknown>, field: string, literal: T): T {
  const value = readString(record, field);
  if (value !== literal) throw new Error(`${field} 不兼容`);
  return literal;
}

function readOptionalLiteral<T extends string>(record: Record<string, unknown>, field: string, literal: T): T | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (value !== literal) throw new Error(`${field} 不兼容`);
  return literal;
}

function readAssetType(record: Record<string, unknown>, field: string): StorageItem["type"] {
  const value = record[field];
  if (value !== "image" && value !== "video" && value !== "audio" && value !== "transcript") throw new Error(`${field} 类型无效`);
  return value;
}

function readBoardAssetType(record: Record<string, unknown>, field: string): "image" | "video" | "audio" {
  const value = record[field];
  if (value !== "image" && value !== "video" && value !== "audio") throw new Error(`${field} 类型无效`);
  return value;
}

function readLibraryAssetMediaType(record: Record<string, unknown>, field: string): LibraryAssetMediaType {
  const value = record[field];
  if (value !== "image" && value !== "video" && value !== "audio") throw new Error(`${field} 类型无效`);
  return value;
}

function readLibraryAssetCategory(record: Record<string, unknown>, field: string): LibraryAssetCategory {
  const value = record[field];
  if (value !== "character" && value !== "scene" && value !== "prop" && value !== "style" && value !== "other") {
    throw new Error(`${field} 分类无效`);
  }
  return value;
}

function readLibraryAssetOrigin(record: Record<string, unknown>, field: string): LibraryAssetOrigin {
  const value = record[field];
  if (value !== "promoted" && value !== "imported") throw new Error(`${field} 来源无效`);
  return value;
}

function readAssetStatus(record: Record<string, unknown>, field: string): StorageItem["status"] {
  const value = record[field];
  if (value !== "complete" && value !== "processing" && value !== "pending" && value !== "failed") {
    throw new Error(`${field} 状态无效`);
  }
  return value;
}

function readGenerationTaskStatus(record: Record<string, unknown>, field: string): GenerationTaskStatus {
  const value = record[field];
  if (value !== "pending" && value !== "processing" && value !== "complete" && value !== "failed" && value !== "canceled") {
    throw new Error(`${field} 状态无效`);
  }
  return value;
}

function readGenerationTaskSourceSurface(record: Record<string, unknown>, field: string): GenerationTaskSource["surface"] {
  const value = record[field];
  if (value !== "workspace" && value !== "board" && value !== "agent") throw new Error(`${field} 来源无效`);
  return value;
}

function readProvider(record: Record<string, unknown>, field: string): VoiceProfile["provider"] {
  const value = readString(record, field);
  if (!isKnownProvider(value)) throw new Error(`${field} 服务商无效`);
  return value;
}

function readVoiceProfileSource(record: Record<string, unknown>, field: string): VoiceProfileSource {
  const value = record[field];
  if (value !== "builtin" && value !== "designed" && value !== "cloned" && value !== "imported") {
    throw new Error(`${field} 来源无效`);
  }
  return value;
}

function readGenerationStatus(record: Record<string, unknown>, field: string): BoardGenerationStatus {
  const value = record[field];
  if (value !== "idle" && value !== "processing" && value !== "complete" && value !== "failed") {
    throw new Error(`${field} 状态无效`);
  }
  return value;
}

function readBoardNodeKind(record: Record<string, unknown>, field: string): BoardNode["kind"] {
  const value = record[field];
  if (
    value !== "asset" &&
    value !== "group" &&
    value !== "multi-grid" &&
    value !== "prompt" &&
    value !== "reference-group" &&
    value !== "image-generate" &&
    value !== "video-generate" &&
    value !== "audio-operation" &&
    value !== "runninghub-app" &&
    value !== "agent" &&
    value !== "note" &&
    value !== "result"
  ) {
    throw new Error(`${field} 节点类型无效`);
  }
  return value;
}

function readRunningHubTargetType(record: Record<string, unknown>, field: string): BoardRunningHubTargetType {
  const value = record[field];
  if (value !== "ai-app" && value !== "workflow") throw new Error(`${field} RunningHub 目标类型无效`);
  return value;
}

function readRunningHubOutputType(record: Record<string, unknown>, field: string): BoardRunningHubOutputType {
  const value = record[field];
  if (value !== "image" && value !== "video" && value !== "audio") throw new Error(`${field} RunningHub 输出类型无效`);
  return value;
}

function readRunningHubBindingSource(record: Record<string, unknown>, field: string): BoardRunningHubBindingSource {
  const value = record[field];
  if (value !== "literal" && value !== "prompt" && value !== "reference" && value !== "randomSeed") {
    throw new Error(`${field} RunningHub 参数来源无效`);
  }
  return value;
}

function readRunningHubBindingValueType(value: unknown): BoardRunningHubBindingValueType | undefined {
  if (
    value === "text" ||
    value === "number" ||
    value === "boolean" ||
    value === "image" ||
    value === "video" ||
    value === "audio" ||
    value === "raw"
  ) {
    return value;
  }
  return undefined;
}

function readRunningHubBindingDelivery(record: Record<string, unknown>, field: string): BoardRunningHubBindingDelivery {
  const value = record[field];
  if (value !== "raw" && value !== "url" && value !== "fileName") throw new Error(`${field} RunningHub 参数交付模式无效`);
  return value;
}

function readReferenceRole(record: Record<string, unknown>, field: string): BoardReferenceRole {
  const value = record[field];
  if (value !== "general" && value !== "start" && value !== "end") throw new Error(`${field} 参考角色无效`);
  return value;
}

function readVariantCount(record: Record<string, unknown>, field: string): BoardGenerateVariantCount {
  const value = record[field];
  if (value !== 1 && value !== 2 && value !== 4) throw new Error(`${field} 批量数量无效`);
  return value;
}
