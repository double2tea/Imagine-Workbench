import type { WorkspaceSettingGroup } from "@/lib/storage/schema";

export interface PublicTeamSecretStatus {
  configured: true;
  group: WorkspaceSettingGroup;
  key: string;
  updatedAt: string;
}

export interface TeamSecretListResult {
  secrets: PublicTeamSecretStatus[];
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamSecretMutationResult {
  secret: PublicTeamSecretStatus;
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamSecretSaveInput {
  group: WorkspaceSettingGroup;
  key: string;
  value: string;
}
