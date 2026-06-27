import type { BoardDocument, BoardSummary } from "@/lib/board/types";
import type { AssetPreviewRecord, LibraryAssetRecord, StorageItemMeta } from "@/lib/db";
import type { GenerationTask } from "@/lib/generation-tasks";
import type { WorkspaceStorageTargetKind } from "@/lib/local-storage-targets";
import type { VoiceProfile } from "@/lib/voice-profiles";

export const WORKSPACE_STORAGE_SCHEMA_VERSION = 1;

export const WORKSPACE_STORAGE_TABLE_NAMES = [
  "schema_migrations",
  "workspaces",
  "users",
  "teams",
  "team_memberships",
  "sessions",
  "csrf_tokens",
  "assets",
  "asset_payloads",
  "asset_previews",
  "asset_library",
  "boards",
  "board_summaries",
  "generation_tasks",
  "settings",
  "user_preferences",
  "prompt_templates",
  "agent_chats",
  "saved_provider_targets",
  "safety_snapshots",
  "voice_profiles",
  "audit_events",
] as const;

export type WorkspaceStorageTableName = (typeof WORKSPACE_STORAGE_TABLE_NAMES)[number];
export type WorkspaceAssetPayloadLocationKind = "indexeddb" | "inline" | "local-file" | "object-storage";
export type WorkspaceSettingGroup = "agent" | "model-cache" | "provider" | "ui" | "other";
export type WorkspaceSafetySnapshotReason = "clear-assets" | "restore-workspace" | "reset-boards" | "cleanup-assets";

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

export interface WorkspaceAssetLibraryRecord {
  record: LibraryAssetRecord;
}

export type WorkspaceAssetPreviewMetadata = Omit<AssetPreviewRecord, "dataUrl"> & {
  dataUrl?: string;
};

export interface WorkspaceAssetPreviewRecord {
  preview: WorkspaceAssetPreviewMetadata;
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
  generationTaskCount: number;
  id: string;
  libraryAssetCount: number;
  origin: string;
  payload: WorkspaceAssetPayloadRef;
  reason: WorkspaceSafetySnapshotReason;
  settingsKeyCount: number;
  sizeBytes: number;
  voiceProfileCount: number;
}

export interface WorkspaceVoiceProfileRecord {
  profile: VoiceProfile;
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
