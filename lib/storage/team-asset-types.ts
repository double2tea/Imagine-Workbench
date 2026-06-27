import type { StorageItemMeta } from "@/lib/db";
import type { WorkspaceAssetPayloadLocationKind } from "@/lib/storage/schema";

export interface PublicTeamAssetPayload {
  contentHash?: string;
  kind: WorkspaceAssetPayloadLocationKind;
  mimeType?: string;
  sizeBytes?: number;
}

export interface PublicTeamAssetRecord {
  downloadUrl?: string;
  mediaUrl?: string;
  meta: StorageItemMeta;
  payload?: PublicTeamAssetPayload;
  preview?: PublicTeamAssetPayload;
}

export interface TeamAssetListResult {
  assets: PublicTeamAssetRecord[];
  limit: number;
  offset: number;
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamAssetMutationResult {
  asset: PublicTeamAssetRecord;
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamAssetClearResult {
  deletedAssetCount: number;
  deletedGenerationTaskCount: number;
  deletedLibraryAssetCount: number;
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamAssetSourceRepairResult {
  repairedIds: string[];
  targetKind: "postgres";
  workspaceId: string;
}
