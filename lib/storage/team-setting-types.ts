import type { WorkspaceSettingGroup } from "@/lib/storage/schema";

export interface PublicTeamSetting {
  group: WorkspaceSettingGroup;
  key: string;
  updatedAt: string;
  value: string;
}

export interface TeamSettingListResult {
  settings: PublicTeamSetting[];
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamSettingMutationResult {
  setting: PublicTeamSetting;
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamSettingSaveInput {
  group: WorkspaceSettingGroup;
  key: string;
  value: string;
}
