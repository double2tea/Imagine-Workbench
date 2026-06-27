import type { QueryResultRow } from "pg";
import { ApiError, badRequest } from "@/lib/api/errors";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import {
  hashTeamPassword,
  type TeamRole,
} from "@/lib/storage/team-auth";
import type {
  ManageableTeamRole,
  PublicTeamMember,
  TeamMemberListResult,
  TeamMemberMutationResult,
} from "@/lib/storage/team-member-types";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";

interface TeamMemberRow extends QueryResultRow {
  created_at: Date | string;
  email: string;
  role: TeamRole;
  user_id: string;
}

interface IdRow extends QueryResultRow {
  id: string;
}

export interface CreateTeamMemberInput {
  email: string;
  password: string;
  role: ManageableTeamRole;
}

export interface UpdateTeamMemberRoleInput {
  role: ManageableTeamRole;
}

export async function listTeamMembers(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
): Promise<TeamMemberListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const result = await queryable.query<TeamMemberRow>(
    `select users.id as user_id, users.email, team_memberships.role, team_memberships.created_at
     from team_memberships
     join users on users.id = team_memberships.user_id
     where team_memberships.team_id = $1
     order by team_memberships.created_at asc`,
    [context.session.teamId],
  );
  return {
    members: result.rows.map(toPublicTeamMember),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function createTeamMember(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: CreateTeamMemberInput,
): Promise<TeamMemberMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const email = normalizeTeamMemberEmail(input.email);
  const role = normalizeManageableRole(input.role);
  const passwordHash = await hashTeamPassword(input.password);

  await queryable.query("begin");
  try {
    const existingUser = await queryable.query<IdRow>("select id from users where email = $1", [email]);
    if (existingUser.rows[0]) {
      throw new ApiError(409, "team_member_email_exists", "Team member email already exists");
    }
    const userResult = await queryable.query<IdRow>(
      "insert into users (email, password_hash) values ($1, $2) returning id",
      [email, passwordHash],
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) throw new Error("Team member insert did not return a user id");
    const membershipResult = await queryable.query<TeamMemberRow>(
      `insert into team_memberships (team_id, user_id, role)
       values ($1, $2, $3)
       returning user_id, $4::text as email, role, created_at`,
      [context.session.teamId, userId, role, email],
    );
    const member = membershipResult.rows[0];
    if (!member) throw new Error("Team member insert did not return a membership");
    await queryable.query("commit");
    return {
      member: toPublicTeamMember(member),
      targetKind: "postgres",
      workspaceId: context.session.workspaceId,
    };
  } catch (error) {
    await queryable.query("rollback");
    throw error;
  }
}

export async function updateTeamMemberRole(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  userId: string,
  input: UpdateTeamMemberRoleInput,
): Promise<TeamMemberMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const role = normalizeManageableRole(input.role);
  if (userId === context.session.userId) throw badRequest("Cannot change your own team role", "team_member_self_update_unsupported");
  const current = await readTeamMember(queryable, context.session.teamId, userId);
  if (current.role === "owner") throw badRequest("Owner role cannot be changed here", "team_owner_role_immutable");
  const result = await queryable.query<TeamMemberRow>(
    `update team_memberships
     set role = $3
     from users
     where team_memberships.team_id = $1
       and team_memberships.user_id = $2
       and users.id = team_memberships.user_id
     returning users.id as user_id, users.email, team_memberships.role, team_memberships.created_at`,
    [context.session.teamId, userId, role],
  );
  const member = result.rows[0];
  if (!member) throw new Error("Team member update did not return a membership");
  return {
    member: toPublicTeamMember(member),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function deleteTeamMember(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  userId: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  if (userId === context.session.userId) throw badRequest("Cannot remove your own team membership", "team_member_self_delete_unsupported");
  const current = await readTeamMember(queryable, context.session.teamId, userId);
  if (current.role === "owner") throw badRequest("Owner membership cannot be removed here", "team_owner_role_immutable");
  await queryable.query("begin");
  try {
    await queryable.query("delete from team_memberships where team_id = $1 and user_id = $2", [context.session.teamId, userId]);
    await queryable.query("delete from sessions where user_id = $1", [userId]);
    await queryable.query("commit");
  } catch (error) {
    await queryable.query("rollback");
    throw error;
  }
}

async function readTeamMember(queryable: PostgresQueryable, teamId: string, userId: string): Promise<PublicTeamMember> {
  const result = await queryable.query<TeamMemberRow>(
    `select users.id as user_id, users.email, team_memberships.role, team_memberships.created_at
     from team_memberships
     join users on users.id = team_memberships.user_id
     where team_memberships.team_id = $1 and team_memberships.user_id = $2`,
    [teamId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "team_member_not_found", "Team member was not found");
  return toPublicTeamMember(row);
}

function toPublicTeamMember(row: TeamMemberRow): PublicTeamMember {
  return {
    createdAt: new Date(row.created_at).toISOString(),
    email: row.email,
    role: row.role,
    userId: row.user_id,
  };
}

function normalizeManageableRole(value: ManageableTeamRole): ManageableTeamRole {
  if (value === "admin" || value === "editor" || value === "viewer") return value;
  throw badRequest("Invalid team member role", "invalid_team_member_role");
}

function normalizeTeamMemberEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("Valid email is required", "invalid_email");
  return email;
}
