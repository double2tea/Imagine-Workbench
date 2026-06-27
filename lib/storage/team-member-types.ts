import type { TeamRole } from "@/lib/storage/team-auth";

export type ManageableTeamRole = Exclude<TeamRole, "owner">;

export interface PublicTeamMember {
  createdAt: string;
  email: string;
  role: TeamRole;
  userId: string;
}

export interface TeamMemberListResult {
  members: PublicTeamMember[];
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamMemberMutationResult {
  member: PublicTeamMember;
  targetKind: "postgres";
  workspaceId: string;
}
