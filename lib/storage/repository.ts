import type { BoardDocument } from "@/lib/board/types";
import type { StorageItemMeta } from "@/lib/db";
import type { GenerationTask, GenerationTaskStatus } from "@/lib/generation-tasks";
import type { WorkspaceStorageTargetKind } from "@/lib/local-storage-targets";
import type {
  WorkspaceAssetPayloadRef,
  WorkspaceAssetLibraryRecord,
  WorkspaceAssetPreviewRecord,
  WorkspaceAssetRecord,
  WorkspaceBoardRecord,
  WorkspaceGenerationTaskRecord,
  WorkspaceSafetySnapshotRecord,
  WorkspaceSettingGroup,
  WorkspaceSettingRecord,
  WorkspaceVoiceProfileRecord,
  WORKSPACE_STORAGE_SCHEMA_VERSION,
} from "@/lib/storage/schema";

export interface WorkspaceStoragePageOptions {
  limit?: number;
  offset?: number;
}

export interface WorkspaceAssetListOptions extends WorkspaceStoragePageOptions {
  /** Empty string targets workspace-global assets. Undefined means no board filter. */
  boardId?: string;
  ids?: string[];
  statuses?: StorageItemMeta["status"][];
}

export interface WorkspaceBoardListOptions extends WorkspaceStoragePageOptions {
  ids?: string[];
}

export interface WorkspaceGenerationTaskListOptions extends WorkspaceStoragePageOptions {
  boardId?: string;
  sourceBoardNodeIds?: string[];
  statuses?: GenerationTaskStatus[];
}

export interface WorkspaceSettingListOptions {
  groups?: WorkspaceSettingGroup[];
  includeSecrets: boolean;
  keys?: string[];
}

export interface WorkspaceAssetRepository {
  delete(id: string): Promise<void>;
  get(id: string): Promise<WorkspaceAssetRecord | null>;
  list(options?: WorkspaceAssetListOptions): Promise<WorkspaceAssetRecord[]>;
  put(record: WorkspaceAssetRecord): Promise<void>;
}

export interface WorkspaceAssetPayloadRepository {
  delete(ref: WorkspaceAssetPayloadRef): Promise<void>;
  read(ref: WorkspaceAssetPayloadRef): Promise<Blob>;
  write(input: {
    assetId: string;
    blob: Blob;
    contentHash?: string;
    mimeType: string;
  }): Promise<WorkspaceAssetPayloadRef>;
}

export interface WorkspaceAssetPreviewRepository {
  delete(assetId: string): Promise<void>;
  get(assetId: string): Promise<WorkspaceAssetPreviewRecord | null>;
  put(record: WorkspaceAssetPreviewRecord): Promise<void>;
}

export interface WorkspaceAssetLibraryRepository {
  delete(id: string): Promise<void>;
  get(id: string): Promise<WorkspaceAssetLibraryRecord | null>;
  list(options?: WorkspaceStoragePageOptions): Promise<WorkspaceAssetLibraryRecord[]>;
  put(record: WorkspaceAssetLibraryRecord): Promise<void>;
}

export interface WorkspaceBoardRepository {
  delete(id: string): Promise<void>;
  get(id: string): Promise<WorkspaceBoardRecord | null>;
  list(options?: WorkspaceBoardListOptions): Promise<WorkspaceBoardRecord[]>;
  put(board: BoardDocument): Promise<void>;
}

export interface WorkspaceGenerationTaskRepository {
  delete(id: string): Promise<void>;
  get(id: string): Promise<WorkspaceGenerationTaskRecord | null>;
  list(options?: WorkspaceGenerationTaskListOptions): Promise<WorkspaceGenerationTaskRecord[]>;
  put(task: GenerationTask): Promise<void>;
}

export interface WorkspaceSettingsRepository {
  delete(key: string): Promise<void>;
  get(key: string): Promise<WorkspaceSettingRecord | null>;
  list(options: WorkspaceSettingListOptions): Promise<WorkspaceSettingRecord[]>;
  put(record: WorkspaceSettingRecord): Promise<void>;
}

export interface WorkspaceSafetySnapshotRepository {
  clear(): Promise<void>;
  getLatest(): Promise<WorkspaceSafetySnapshotRecord | null>;
  put(record: WorkspaceSafetySnapshotRecord): Promise<void>;
}

export interface WorkspaceVoiceProfileRepository {
  delete(id: string): Promise<void>;
  get(id: string): Promise<WorkspaceVoiceProfileRecord | null>;
  list(options?: WorkspaceStoragePageOptions): Promise<WorkspaceVoiceProfileRecord[]>;
  put(record: WorkspaceVoiceProfileRecord): Promise<void>;
}

export interface WorkspaceStorageRepository {
  assetLibrary: WorkspaceAssetLibraryRepository;
  assets: WorkspaceAssetRepository;
  boards: WorkspaceBoardRepository;
  generationTasks: WorkspaceGenerationTaskRepository;
  payloads: WorkspaceAssetPayloadRepository;
  previews: WorkspaceAssetPreviewRepository;
  safetySnapshots: WorkspaceSafetySnapshotRepository;
  schemaVersion: typeof WORKSPACE_STORAGE_SCHEMA_VERSION;
  settings: WorkspaceSettingsRepository;
  targetKind: WorkspaceStorageTargetKind;
  voiceProfiles: WorkspaceVoiceProfileRepository;
}
