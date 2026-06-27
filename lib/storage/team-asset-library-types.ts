import type { LibraryAssetRecord } from "@/lib/db";
import type { PublicTeamAssetRecord } from "@/lib/storage/team-asset-types";

export interface PublicTeamAssetLibraryEntry {
  asset: PublicTeamAssetRecord | null;
  record: LibraryAssetRecord;
}

export interface TeamAssetLibraryListResult {
  entries: PublicTeamAssetLibraryEntry[];
  limit: number;
  offset: number;
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamAssetLibraryMutationResult {
  entry: PublicTeamAssetLibraryEntry;
  targetKind: "postgres";
  workspaceId: string;
}
