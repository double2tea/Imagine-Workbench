import type { QueryResultRow } from "pg";
import { ApiError } from "@/lib/api/errors";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import {
  createTeamCsrfToken,
  createTeamSessionToken,
  hashTeamCsrfToken,
  hashTeamSessionToken,
  readTeamSessionToken,
  TEAM_SESSION_TTL_MS,
  type TeamRole,
  verifyTeamPassword,
} from "@/lib/storage/team-auth";

export interface TeamLoginInput {
  email: string;
  password: string;
}

export interface TeamSessionLoginResult {
  csrfToken: string;
  csrfTokenExpiresAt: Date;
  email: string;
  role: TeamRole;
  sessionToken: string;
  sessionTokenExpiresAt: Date;
  teamId: string;
  userId: string;
  workspaceId: string;
}

interface TeamLoginUserRow extends QueryResultRow {
  email: string;
  password_hash: string;
  role: TeamRole;
  team_id: string;
  user_id: string;
  workspace_id: string;
}

export async function createTeamSession(
  queryable: PostgresQueryable,
  input: TeamLoginInput,
  now = new Date(),
): Promise<TeamSessionLoginResult> {
  const email = normalizeTeamSessionEmail(input.email);
  const result = await queryable.query<TeamLoginUserRow>(
    `select users.id as user_id, users.email, users.password_hash,
      teams.id as team_id, teams.workspace_id, team_memberships.role
     from users
     join team_memberships on team_memberships.user_id = users.id
     join teams on teams.id = team_memberships.team_id
     where users.email = $1
     order by team_memberships.created_at asc
     limit 1`,
    [email],
  );
  const user = result.rows[0];
  if (!user || !await verifyTeamPassword(input.password, user.password_hash)) {
    throw new ApiError(401, "invalid_credentials", "Email or password is incorrect");
  }

  const sessionToken = createTeamSessionToken();
  const csrfToken = createTeamCsrfToken();
  const sessionTokenExpiresAt = new Date(now.getTime() + TEAM_SESSION_TTL_MS);
  const sessionId = hashTeamSessionToken(sessionToken);
  await queryable.query("begin");
  try {
    await queryable.query(
      "insert into sessions (id, user_id, expires_at) values ($1, $2, $3)",
      [sessionId, user.user_id, sessionTokenExpiresAt],
    );
    await queryable.query(
      "insert into csrf_tokens (token_hash, session_id, expires_at) values ($1, $2, $3)",
      [hashTeamCsrfToken(csrfToken), sessionId, sessionTokenExpiresAt],
    );
    await queryable.query("commit");
  } catch (error) {
    await queryable.query("rollback");
    throw error;
  }

  return {
    csrfToken,
    csrfTokenExpiresAt: sessionTokenExpiresAt,
    email: user.email,
    role: user.role,
    sessionToken,
    sessionTokenExpiresAt,
    teamId: user.team_id,
    userId: user.user_id,
    workspaceId: user.workspace_id,
  };
}

export async function deleteTeamSession(queryable: PostgresQueryable, request: Request): Promise<void> {
  const token = readTeamSessionToken(request);
  if (!token) throw new ApiError(401, "unauthorized", "Team session is required");
  await queryable.query("delete from sessions where id = $1", [hashTeamSessionToken(token)]);
}

function normalizeTeamSessionEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "invalid_email", "Valid email is required");
  return email;
}
