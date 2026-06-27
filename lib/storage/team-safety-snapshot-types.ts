import type { WorkspaceSafetySnapshotReason } from "@/lib/storage/schema";

export interface PublicTeamSafetySnapshot {
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

export interface TeamSafetySnapshotResult {
  snapshot: PublicTeamSafetySnapshot | null;
  targetKind: "postgres";
  workspaceId: string;
}
