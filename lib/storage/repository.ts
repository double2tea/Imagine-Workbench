import type { BoardDocument } from "@/lib/board/types";
import type { StorageItemMeta } from "@/lib/db";
import type { GenerationTask, GenerationTaskStatus } from "@/lib/generation-tasks";
import type { WorkspaceStorageTargetKind } from "@/lib/local-storage-targets";
import type {
  WorkspaceAssetPayloadRef,
  WorkspaceAssetRecord,
  WorkspaceBoardRecord,
  WorkspaceGenerationTaskRecord,
  WorkspaceSafetySnapshotRecord,
  WorkspaceSettingGroup,
  WorkspaceSettingRecord,
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

export interface WorkspaceStorageRepository {
  assets: WorkspaceAssetRepository;
  boards: WorkspaceBoardRepository;
  generationTasks: WorkspaceGenerationTaskRepository;
  payloads: WorkspaceAssetPayloadRepository;
  safetySnapshots: WorkspaceSafetySnapshotRepository;
  schemaVersion: typeof WORKSPACE_STORAGE_SCHEMA_VERSION;
  settings: WorkspaceSettingsRepository;
  targetKind: WorkspaceStorageTargetKind;
}
