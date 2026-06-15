import type { BoardDocument, BoardSummary } from "@/lib/board/types";
import type { AssetPreviewRecord, StorageItemMeta } from "@/lib/db";
import type { GenerationTask } from "@/lib/generation-tasks";
import type { WorkspaceStorageTargetKind } from "@/lib/local-storage-targets";

export const WORKSPACE_STORAGE_SCHEMA_VERSION = 1;

export const WORKSPACE_STORAGE_TABLE_NAMES = [
  "assets",
  "asset_payloads",
  "asset_previews",
  "asset_library",
  "boards",
  "generation_tasks",
  "settings",
  "safety_snapshots",
] as const;

export type WorkspaceStorageTableName = (typeof WORKSPACE_STORAGE_TABLE_NAMES)[number];
export type WorkspaceAssetPayloadLocationKind = "indexeddb" | "inline" | "local-file" | "object-storage";
export type WorkspaceSettingGroup = "agent" | "model-cache" | "provider" | "ui" | "other";

export interface WorkspaceAssetPayloadRef {
  contentHash?: string;
  kind: WorkspaceAssetPayloadLocationKind;
  mimeType?: string;
  sizeBytes?: number;
  uri: string;
}

export interface WorkspaceAssetRecord {
  meta: StorageItemMeta;
  payload?: WorkspaceAssetPayloadRef;
  preview?: WorkspaceAssetPayloadRef;
}

export interface WorkspaceAssetPayloadRecord {
  assetId: string;
  ref: WorkspaceAssetPayloadRef;
}

export interface WorkspaceAssetPreviewRecord {
  preview: AssetPreviewRecord;
  ref?: WorkspaceAssetPayloadRef;
}

export interface WorkspaceBoardRecord {
  board: BoardDocument;
  summary: BoardSummary;
}

export interface WorkspaceGenerationTaskRecord {
  task: GenerationTask;
}

export interface WorkspaceSettingRecord {
  group: WorkspaceSettingGroup;
  isSecret: boolean;
  key: string;
  updatedAt: string;
  value: string;
}

export interface WorkspaceSafetySnapshotRecord {
  assetCount: number;
  boardCount: number;
  createdAt: string;
  fileName: string;
  id: string;
  origin: string;
  payload: WorkspaceAssetPayloadRef;
  settingsKeyCount: number;
  sizeBytes: number;
}

export interface WorkspaceAssetPayloadPolicy {
  databaseStoresLargePayloadsByDefault: boolean;
  preferredExternalLocations: readonly WorkspaceAssetPayloadLocationKind[];
}

export interface WorkspaceStorageSchema {
  assetPayloadPolicy: WorkspaceAssetPayloadPolicy;
  defaultTargetKind: WorkspaceStorageTargetKind;
  tableNames: readonly WorkspaceStorageTableName[];
  version: typeof WORKSPACE_STORAGE_SCHEMA_VERSION;
}

export const WORKSPACE_STORAGE_SCHEMA: WorkspaceStorageSchema = {
  assetPayloadPolicy: {
    databaseStoresLargePayloadsByDefault: false,
    preferredExternalLocations: ["local-file", "object-storage"],
  },
  defaultTargetKind: "indexeddb",
  tableNames: WORKSPACE_STORAGE_TABLE_NAMES,
  version: WORKSPACE_STORAGE_SCHEMA_VERSION,
};

export function listWorkspaceStorageTables(): readonly WorkspaceStorageTableName[] {
  return WORKSPACE_STORAGE_TABLE_NAMES;
}
