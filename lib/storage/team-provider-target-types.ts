import type {
  BoardRunningHubNodeInfoBinding,
  BoardRunningHubOutputType,
  BoardRunningHubTargetType,
} from "@/lib/board/types";

export interface PublicTeamProviderTarget {
  accessPasswordConfigured: boolean;
  bindings: BoardRunningHubNodeInfoBinding[];
  id: string;
  label: string;
  outputType: BoardRunningHubOutputType;
  provider: "runninghub";
  targetId: string;
  targetType: BoardRunningHubTargetType;
  updatedAt: string;
}

export interface TeamProviderTargetListResult {
  targetKind: "postgres";
  targets: PublicTeamProviderTarget[];
  workspaceId: string;
}

export interface TeamProviderTargetMutationResult {
  target: PublicTeamProviderTarget;
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamProviderTargetSaveInput {
  accessPassword?: string;
  bindings: BoardRunningHubNodeInfoBinding[];
  label: string;
  outputType: BoardRunningHubOutputType;
  provider: "runninghub";
  targetId: string;
  targetType: BoardRunningHubTargetType;
}
