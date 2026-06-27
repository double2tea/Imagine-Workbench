import type { BoardDocument } from "@/lib/board/types";
import type { LibraryAssetRecord, StorageItem } from "@/lib/db";
import type { GenerationTask } from "@/lib/generation-tasks";
import type { WorkspaceSettingGroup } from "@/lib/storage/schema";
import type { WorkspaceSafetySnapshotReason } from "@/lib/storage/schema";
import type { VoiceProfile } from "@/lib/voice-profiles";

export const WORKSPACE_BACKUP_SCHEMA_VERSION = 3;
export const SUPPORTED_WORKSPACE_BACKUP_SCHEMA_VERSIONS = new Set([1, 2, WORKSPACE_BACKUP_SCHEMA_VERSION]);

export const BACKUP_APP_NAME = "Imagine Workbench";
export const MANIFEST_FILE = "manifest.json";
export const ASSET_INDEX_FILE = "assets/index.json";
export const LIBRARY_INDEX_FILE = "library/index.json";
export const BOARD_INDEX_FILE = "boards/index.json";
export const GENERATION_TASK_INDEX_FILE = "generation-tasks/index.json";
export const VOICE_PROFILE_INDEX_FILE = "voice-profiles/index.json";
export const SETTINGS_FILE = "settings/local-storage.json";
export const MAX_BACKUP_FILE_COUNT = 10000;

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

export interface WorkspaceBackupAssetRecord extends Omit<StorageItem, "url"> {
  mediaFile?: string;
  mediaMimeType?: string;
  url?: string;
}

export interface WorkspaceBackupTeamSetting {
  group: WorkspaceSettingGroup;
  key: string;
  value: string;
}

export interface WorkspaceBackupSettings {
  localStorage: Record<string, string>;
  teamSecrets?: WorkspaceBackupTeamSetting[];
  teamSettings?: WorkspaceBackupTeamSetting[];
}

export interface ParsedBackup {
  assets: StorageItem[];
  boards: BoardDocument[];
  generationTasks: GenerationTask[];
  libraryAssets: LibraryAssetRecord[];
  settings: WorkspaceBackupSettings;
  voiceProfiles: VoiceProfile[];
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
