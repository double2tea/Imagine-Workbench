import JSZip from "jszip";
import { clearBoardsFromDB, listBoardsFromDB, saveBoardToDB } from "@/lib/board/persistence";
import { createEmptyBoard, DEFAULT_BOARD_ID } from "@/lib/board/defaults";
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
  BoardSize,
  BoardViewport,
} from "@/lib/board/types";
import { clearAllDB, deleteFromDB, getAllFromDB, saveToDB, type GenerationRequestSnapshot, type StorageItem } from "@/lib/db";
import { compressReferenceImageFile, dataUriByteSize } from "@/lib/reference-images";

export const WORKSPACE_BACKUP_SCHEMA_VERSION = 1;

const BACKUP_APP_NAME = "Imagine Workbench";
const MANIFEST_FILE = "manifest.json";
const ASSET_INDEX_FILE = "assets/index.json";
const BOARD_INDEX_FILE = "boards/index.json";
const SETTINGS_FILE = "settings/local-storage.json";
const MAX_BACKUP_FILE_COUNT = 10000;
const STALE_PROCESSING_MS = 2 * 60 * 60 * 1000;

const MODEL_CACHE_KEYS = [
  "imagine_chat_model_options",
  "imagine_image_model_options",
  "imagine_video_model_options",
] as const;

const PROVIDER_SETTING_KEYS = [
  "imagine_ai_provider",
  "imagine_chat_model",
] as const;

const PROVIDER_CREDENTIAL_KEYS = [
  "imagine_provider_credentials",
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
  "imagine_board_last_insert",
  "imagine_board_handles_hint_seen",
  "imagine_board_side_collapsed",
  "imagine_board_inspector_height",
] as const;

const MANAGED_EXACT_KEYS = [
  ...MODEL_CACHE_KEYS,
  ...PROVIDER_SETTING_KEYS,
  ...PROVIDER_CREDENTIAL_KEYS,
  ...AGENT_STORAGE_KEYS,
  ...UI_PREFERENCE_KEYS,
] as const;

const MANAGED_PREFIX_KEYS = ["imagine_agent_chat:"] as const;

export type WorkspaceCleanupKind =
  | "failed"
  | "stale-processing"
  | "broken-complete"
  | "orphaned";

export type LocalStorageCleanupKind =
  | "agent"
  | "model-cache"
  | "provider-credentials"
  | "ui-preferences";

export interface WorkspaceBackupManifest {
  app: typeof BACKUP_APP_NAME;
  schemaVersion: typeof WORKSPACE_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  assetsFile: typeof ASSET_INDEX_FILE;
  boardsFile: typeof BOARD_INDEX_FILE;
  settingsFile?: typeof SETTINGS_FILE;
  counts: {
    assets: number;
    boards: number;
    settingsKeys: number;
  };
}

export interface WorkspaceExportResult {
  assetCount: number;
  boardCount: number;
  fileName: string;
  settingsKeyCount: number;
}

export interface WorkspaceImportPreview {
  assetCount: number;
  boardCount: number;
  exportedAt: string;
  includesCredentials: boolean;
  includesMediaFiles: boolean;
  schemaVersion: number;
  settingsKeyCount: number;
}

export interface WorkspaceImportResult {
  assetCount: number;
  boardCount: number;
  settingsKeyCount: number;
}

export interface WorkspaceCleanupResult {
  deletedIds: string[];
  kind: WorkspaceCleanupKind;
}

export interface WorkspaceDataSummary {
  assets: {
    brokenComplete: number;
    failed: number;
    image: number;
    largest: Array<{ id: string; label: string; bytes: number }>;
    orphaned: number;
    pending: number;
    processing: number;
    staleProcessing: number;
    total: number;
    video: number;
    estimatedBytes: number;
  };
  boards: {
    total: number;
    nodes: number;
    estimatedBytes: number;
  };
  localStorage: {
    agentKeys: number;
    credentialKeys: number;
    modelCacheKeys: number;
    uiPreferenceKeys: number;
    estimatedBytes: number;
  };
  browserStorage?: {
    quota?: number;
    usage?: number;
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
  settings: WorkspaceBackupSettings;
}

interface DataUriParts {
  base64: string;
  mimeType: string;
}

export async function getWorkspaceDataSummary(items: StorageItem[] = []): Promise<WorkspaceDataSummary> {
  const assets = items.length > 0 ? items : await getAllFromDB();
  const boards = await listBoardsFromDB();
  const boardAssetIds = collectBoardAssetIds(boards);
  const largest = assets
    .map(item => ({ id: item.id, label: item.prompt || item.model || item.id, bytes: estimateAssetBytes(item) }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 5);
  const localStorageEntries = readManagedLocalStorage(true);
  const browserStorage = typeof navigator !== "undefined" && navigator.storage?.estimate
    ? await navigator.storage.estimate()
    : undefined;

  return {
    assets: {
      brokenComplete: findBrokenCompleteAssetIds(assets).length,
      failed: assets.filter(item => item.status === "failed").length,
      image: assets.filter(item => item.type === "image").length,
      largest,
      orphaned: findOrphanAssetIds(assets, boardAssetIds).length,
      pending: assets.filter(item => item.status === "pending").length,
      processing: assets.filter(item => item.status === "processing").length,
      staleProcessing: findStaleProcessingAssetIds(assets).length,
      total: assets.length,
      video: assets.filter(item => item.type === "video").length,
      estimatedBytes: assets.reduce((total, item) => total + estimateAssetBytes(item), 0),
    },
    boards: {
      total: boards.length,
      nodes: boards.reduce((total, board) => total + board.nodes.length, 0),
      estimatedBytes: boards.reduce((total, board) => total + textByteSize(JSON.stringify(board)), 0),
    },
    localStorage: {
      agentKeys: countLocalStorageKeys(localStorageEntries, isAgentStorageKey),
      credentialKeys: countLocalStorageKeys(localStorageEntries, isProviderCredentialKey),
      modelCacheKeys: countLocalStorageKeys(localStorageEntries, isModelCacheKey),
      uiPreferenceKeys: countLocalStorageKeys(localStorageEntries, isUiPreferenceKey),
      estimatedBytes: Object.entries(localStorageEntries).reduce(
        (total, [key, value]) => total + textByteSize(key) + textByteSize(value),
        0,
      ),
    },
    browserStorage: browserStorage
      ? { quota: browserStorage.quota, usage: browserStorage.usage }
      : undefined,
  };
}

export async function exportCompleteWorkspaceBackup(includeCredentials: boolean): Promise<WorkspaceExportResult> {
  return exportWorkspaceBackup({
    assets: await getAllFromDB(),
    boards: await listBoardsFromDB(),
    filePrefix: "Imagine_Workbench_Backup",
    includeCredentials,
    includeSettings: true,
  });
}

export async function exportBoardWorkspaceBackup(
  board: BoardDocument,
  includeCredentials: boolean,
): Promise<WorkspaceExportResult> {
  const assetIds = collectBoardAssetIds([board]);
  const assets = (await getAllFromDB()).filter(item => assetIds.has(item.id));
  return exportWorkspaceBackup({
    assets,
    boards: [board],
    filePrefix: `Imagine_Board_${safeFileSegment(board.title)}`,
    includeCredentials,
    includeSettings: true,
  });
}

export async function previewWorkspaceBackup(file: File): Promise<WorkspaceImportPreview> {
  const zip = await JSZip.loadAsync(file);
  validateZipFileCount(zip);
  const manifest = parseManifest(await readRequiredZipText(zip, MANIFEST_FILE));
  const assetRecords = parseAssetRecords(await readRequiredZipText(zip, manifest.assetsFile));
  const boards = parseBoardDocuments(await readRequiredZipText(zip, manifest.boardsFile));
  const settings = manifest.settingsFile
    ? parseSettings(await readRequiredZipText(zip, manifest.settingsFile))
    : { localStorage: {} };

  validateBoardAssetReferences(boards, new Set(assetRecords.map(asset => asset.id)));
  return {
    assetCount: assetRecords.length,
    boardCount: boards.length,
    exportedAt: manifest.exportedAt,
    includesCredentials: Object.keys(settings.localStorage).some(isProviderCredentialKey),
    includesMediaFiles: assetRecords.some(asset => Boolean(asset.mediaFile)),
    schemaVersion: manifest.schemaVersion,
    settingsKeyCount: Object.keys(settings.localStorage).length,
  };
}

export async function importWorkspaceBackup(
  file: File,
  includeCredentials: boolean,
): Promise<WorkspaceImportResult> {
  const parsed = await parseWorkspaceBackup(file);
  await clearAllDB();
  await clearBoardsFromDB();
  clearManagedLocalStorage();

  for (const asset of parsed.assets) {
    await saveToDB(asset);
  }
  for (const board of parsed.boards) {
    await saveBoardToDB(board);
  }
  writeManagedLocalStorage(parsed.settings.localStorage, includeCredentials);

  return {
    assetCount: parsed.assets.length,
    boardCount: parsed.boards.length,
    settingsKeyCount: Object.keys(parsed.settings.localStorage).filter(key =>
      includeCredentials || !isProviderCredentialKey(key),
    ).length,
  };
}

export async function resetBoardsToDefault(): Promise<void> {
  await clearBoardsFromDB();
  await saveBoardToDB(createEmptyBoard(DEFAULT_BOARD_ID));
}

export async function cleanupWorkspaceAssets(kind: WorkspaceCleanupKind): Promise<WorkspaceCleanupResult> {
  const assets = await getAllFromDB();
  const boardAssetIds = collectBoardAssetIds(await listBoardsFromDB());
  const ids = cleanupTargetIds(kind, assets, boardAssetIds);
  for (const id of ids) {
    await deleteFromDB(id);
  }
  return { deletedIds: ids, kind };
}

export function clearLocalStorageGroup(kind: LocalStorageCleanupKind): number {
  const before = readManagedLocalStorage(true);
  const keys = Object.keys(before).filter(key => {
    if (kind === "agent") return isAgentStorageKey(key);
    if (kind === "model-cache") return isModelCacheKey(key);
    if (kind === "provider-credentials") return isProviderCredentialKey(key);
    return isUiPreferenceKey(key);
  });
  keys.forEach(key => window.localStorage.removeItem(key));
  return keys.length;
}

export async function createLocalUploadAsset(file: File, id: string): Promise<StorageItem> {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    throw new Error("只支持导入图片或视频文件");
  }

  return {
    id,
    type: isImage ? "image" : "video",
    url: isImage ? await compressReferenceImageFile(file) : await readFileAsDataUrl(file),
    prompt: file.name || "Local upload",
    model: "local-upload",
    aspectRatio: "auto",
    createdAt: new Date().toISOString(),
    status: "complete",
    progress: 100,
    operationName: "local-upload",
  };
}

export function findOrphanAssetIds(items: StorageItem[], boardAssetIds: ReadonlySet<string>): string[] {
  return items
    .filter(item => item.status === "complete" && !boardAssetIds.has(item.id))
    .map(item => item.id);
}

export function collectBoardAssetIds(boards: BoardDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const board of boards) {
    for (const node of board.nodes) {
      if (node.kind === "asset") ids.add(node.asset.assetId);
      if (node.kind === "reference-group") {
        for (const reference of node.references) ids.add(reference.assetId);
      }
      if ((node.kind === "image-generate" || node.kind === "video-generate") && node.resultAssetId) {
        ids.add(node.resultAssetId);
      }
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

function cleanupTargetIds(
  kind: WorkspaceCleanupKind,
  assets: StorageItem[],
  boardAssetIds: ReadonlySet<string>,
): string[] {
  if (kind === "failed") return assets.filter(item => item.status === "failed").map(item => item.id);
  if (kind === "stale-processing") return findStaleProcessingAssetIds(assets);
  if (kind === "broken-complete") return findBrokenCompleteAssetIds(assets);
  return findOrphanAssetIds(assets, boardAssetIds);
}

function findStaleProcessingAssetIds(items: StorageItem[]): string[] {
  const now = Date.now();
  return items
    .filter(item => {
      if (item.status !== "processing" && item.status !== "pending") return false;
      const createdAt = Date.parse(item.createdAt);
      return Number.isFinite(createdAt) && now - createdAt > STALE_PROCESSING_MS;
    })
    .map(item => item.id);
}

function findBrokenCompleteAssetIds(items: StorageItem[]): string[] {
  return items
    .filter(item => item.status === "complete" && item.url.trim().length === 0)
    .map(item => item.id);
}

async function exportWorkspaceBackup(input: {
  assets: StorageItem[];
  boards: BoardDocument[];
  filePrefix: string;
  includeCredentials: boolean;
  includeSettings: boolean;
}): Promise<WorkspaceExportResult> {
  const zip = new JSZip();
  const assetRecords: WorkspaceBackupAssetRecord[] = [];
  for (const asset of input.assets) {
    assetRecords.push(addAssetToZip(zip, asset));
  }

  const settings = input.includeSettings
    ? { localStorage: readManagedLocalStorage(input.includeCredentials) }
    : { localStorage: {} };
  const exportedAt = new Date().toISOString();
  const manifest: WorkspaceBackupManifest = {
    app: BACKUP_APP_NAME,
    schemaVersion: WORKSPACE_BACKUP_SCHEMA_VERSION,
    exportedAt,
    assetsFile: ASSET_INDEX_FILE,
    boardsFile: BOARD_INDEX_FILE,
    settingsFile: input.includeSettings ? SETTINGS_FILE : undefined,
    counts: {
      assets: assetRecords.length,
      boards: input.boards.length,
      settingsKeys: Object.keys(settings.localStorage).length,
    },
  };

  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  zip.file(ASSET_INDEX_FILE, JSON.stringify(assetRecords, null, 2));
  zip.file(BOARD_INDEX_FILE, JSON.stringify(input.boards, null, 2));
  if (input.includeSettings) zip.file(SETTINGS_FILE, JSON.stringify(settings, null, 2));

  const fileName = `${input.filePrefix}_${compactTimestamp(exportedAt)}.zip`;
  downloadBlob(await zip.generateAsync({ type: "blob" }), fileName);
  return {
    assetCount: assetRecords.length,
    boardCount: input.boards.length,
    fileName,
    settingsKeyCount: Object.keys(settings.localStorage).length,
  };
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
  const boards = parseBoardDocuments(await readRequiredZipText(zip, manifest.boardsFile));
  const settings = manifest.settingsFile
    ? parseSettings(await readRequiredZipText(zip, manifest.settingsFile))
    : { localStorage: {} };
  const assets = await Promise.all(assetRecords.map(record => restoreAssetRecord(zip, record)));

  if (manifest.counts.assets !== assets.length) throw new Error("备份资产数量与 manifest 不一致");
  if (manifest.counts.boards !== boards.length) throw new Error("备份画板数量与 manifest 不一致");
  validateBoardAssetReferences(boards, new Set(assets.map(asset => asset.id)));

  return { assets, boards, settings };
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
    return { ...storageFields, url: record.url };
  }
  if (!record.mediaMimeType) throw new Error(`资产 ${record.id} 缺少媒体 MIME`);
  const zipMediaFile = zip.file(mediaFile);
  if (!zipMediaFile) throw new Error(`资产 ${record.id} 缺少媒体文件 ${mediaFile}`);
  const base64 = await zipMediaFile.async("base64");
  const url = `data:${record.mediaMimeType};base64,${base64}`;
  validateAssetMediaType(record.id, record.type, record.mediaMimeType);
  void mediaMimeType;
  return { ...storageFields, url };
}

function validateAssetMediaType(id: string, type: StorageItem["type"], mimeType: string): void {
  if (type === "image" && !mimeType.startsWith("image/")) throw new Error(`资产 ${id} 的媒体类型不是图片`);
  if (type === "video" && !mimeType.startsWith("video/")) throw new Error(`资产 ${id} 的媒体类型不是视频`);
}

function parseManifest(text: string): WorkspaceBackupManifest {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error("manifest 格式无效");
  const app = readString(value, "app");
  const schemaVersion = readNumber(value, "schemaVersion");
  if (app !== BACKUP_APP_NAME) throw new Error("不是 Imagine Workbench 备份");
  if (schemaVersion !== WORKSPACE_BACKUP_SCHEMA_VERSION) throw new Error("备份版本不兼容");
  const counts = readRecord(value, "counts");
  return {
    app,
    schemaVersion: WORKSPACE_BACKUP_SCHEMA_VERSION,
    exportedAt: readDateString(value, "exportedAt"),
    assetsFile: readLiteral(value, "assetsFile", ASSET_INDEX_FILE),
    boardsFile: readLiteral(value, "boardsFile", BOARD_INDEX_FILE),
    settingsFile: readOptionalLiteral(value, "settingsFile", SETTINGS_FILE),
    counts: {
      assets: readNumber(counts, "assets"),
      boards: readNumber(counts, "boards"),
      settingsKeys: readNumber(counts, "settingsKeys"),
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
    mediaFile: readOptionalSafePath(value, "mediaFile"),
    mediaMimeType: readOptionalString(value, "mediaMimeType"),
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
    videoDurationSeconds: readOptionalString(value, "videoDurationSeconds"),
    videoPreset: readOptionalString(value, "videoPreset"),
    videoResolution: readOptionalString(value, "videoResolution"),
    referenceImages: readOptionalStringArray(value, "referenceImages"),
  };
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
    };
  }
  if (kind === "prompt") return { ...base, kind, prompt: readText(value, "prompt") };
  if (kind === "reference-group") {
    return { ...base, kind, references: readArray(value, "references").map(parseReferenceGroupItem) };
  }
  if (kind === "image-generate") {
    return {
      ...base,
      kind,
      prompt: readText(value, "prompt"),
      model: readString(value, "model"),
      aspectRatio: readString(value, "aspectRatio"),
      customImageResolution: readString(value, "customImageResolution"),
      imageQuality: readOptionalString(value, "imageQuality"),
      imageResolution: readString(value, "imageResolution"),
      thinkingLevel: readOptionalString(value, "thinkingLevel"),
      variantCount: readVariantCount(value, "variantCount"),
      status: readGenerationStatus(value, "status"),
      resultAssetId: readOptionalString(value, "resultAssetId"),
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
      videoDuration: readOptionalString(value, "videoDuration"),
      videoPreset: readOptionalString(value, "videoPreset"),
      videoResolution: readOptionalString(value, "videoResolution"),
      variantCount: readVariantCount(value, "variantCount"),
      status: readGenerationStatus(value, "status"),
      resultAssetId: readOptionalString(value, "resultAssetId"),
      errorMessage: readOptionalString(value, "errorMessage"),
    };
  }
  if (kind === "agent") return { ...base, kind, instruction: readText(value, "instruction") };
  return { ...base, kind, body: readText(value, "body") };
}

function parseReferenceGroupItem(value: unknown): BoardReferenceGroupItem {
  if (!isRecord(value)) throw new Error("参考组条目格式无效");
  return {
    assetId: readString(value, "assetId"),
    model: readString(value, "model"),
    prompt: readString(value, "prompt"),
    role: readReferenceRole(value, "role"),
    url: readString(value, "url"),
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
  for (const board of boards) {
    for (const node of board.nodes) {
      if (node.kind === "asset" && !assetIds.has(node.asset.assetId)) {
        throw new Error(`画板 ${board.title} 引用缺失资产 ${node.asset.assetId}`);
      }
      if (node.kind === "reference-group") {
        for (const reference of node.references) {
          if (!assetIds.has(reference.assetId)) {
            throw new Error(`画板 ${board.title} 参考组引用缺失资产 ${reference.assetId}`);
          }
        }
      }
      if ((node.kind === "image-generate" || node.kind === "video-generate") && node.resultAssetId && !assetIds.has(node.resultAssetId)) {
        throw new Error(`画板 ${board.title} 生成节点引用缺失结果资产 ${node.resultAssetId}`);
      }
    }
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

function clearManagedLocalStorage(): void {
  if (typeof window === "undefined") return;
  Object.keys(readManagedLocalStorage(true)).forEach(key => window.localStorage.removeItem(key));
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
  return AGENT_STORAGE_KEYS.some(item => item === key) || MANAGED_PREFIX_KEYS.some(prefix => key.startsWith(prefix));
}

function isModelCacheKey(key: string): boolean {
  return MODEL_CACHE_KEYS.some(item => item === key);
}

function isProviderCredentialKey(key: string): boolean {
  return PROVIDER_CREDENTIAL_KEYS.some(item => item === key);
}

function isUiPreferenceKey(key: string): boolean {
  return UI_PREFERENCE_KEYS.some(item => item === key);
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
  return type === "image" ? "png" : "mp4";
}

function estimateAssetBytes(item: StorageItem): number {
  const dataUriBytes = dataUriByteSize(item.url);
  return dataUriBytes ?? textByteSize(item.url) + textByteSize(JSON.stringify({
    id: item.id,
    prompt: item.prompt,
    model: item.model,
    generationRequest: item.generationRequest,
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

function readOptionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串`);
  return value;
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
  if (value !== "image" && value !== "video") throw new Error(`${field} 类型无效`);
  return value;
}

function readBoardAssetType(record: Record<string, unknown>, field: string): "image" | "video" {
  const value = record[field];
  if (value !== "image" && value !== "video") throw new Error(`${field} 类型无效`);
  return value;
}

function readAssetStatus(record: Record<string, unknown>, field: string): StorageItem["status"] {
  const value = record[field];
  if (value !== "complete" && value !== "processing" && value !== "pending" && value !== "failed") {
    throw new Error(`${field} 状态无效`);
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
    value !== "prompt" &&
    value !== "reference-group" &&
    value !== "image-generate" &&
    value !== "video-generate" &&
    value !== "agent" &&
    value !== "note"
  ) {
    throw new Error(`${field} 节点类型无效`);
  }
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
