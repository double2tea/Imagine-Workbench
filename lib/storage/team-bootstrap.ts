import type { QueryResultRow } from "pg";
import { ApiError } from "@/lib/api/errors";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import {
  createTeamCsrfToken,
  createTeamSessionToken,
  hashTeamCsrfToken,
  hashTeamPassword,
  hashTeamSessionToken,
  TEAM_SESSION_TTL_MS,
} from "@/lib/storage/team-auth";

export interface BootstrapFirstOwnerInput {
  appUrl: string;
  email: string;
  password: string;
  teamName?: string;
  workspaceName?: string;
}

export interface BootstrapFirstOwnerResult {
  csrfToken: string;
  csrfTokenExpiresAt: Date;
  email: string;
  role: "owner";
  sessionToken: string;
  sessionTokenExpiresAt: Date;
  teamId: string;
  userId: string;
  workspaceId: string;
}

interface ExistsRow extends QueryResultRow {
  owner_exists: boolean;
}

interface IdRow extends QueryResultRow {
  id: string;
}

export async function bootstrapFirstTeamOwner(
  queryable: PostgresQueryable,
  input: BootstrapFirstOwnerInput,
  now = new Date(),
): Promise<BootstrapFirstOwnerResult> {
  const email = normalizeBootstrapEmail(input.email);
  const workspaceName = input.workspaceName?.trim() || "Imagine Workspace";
  const teamName = input.teamName?.trim() || "Imagine Team";
  const passwordHash = await hashTeamPassword(input.password);
  const sessionToken = createTeamSessionToken();
  const csrfToken = createTeamCsrfToken();
  const sessionTokenExpiresAt = new Date(now.getTime() + TEAM_SESSION_TTL_MS);
  const csrfTokenExpiresAt = sessionTokenExpiresAt;

  await queryable.query("begin");
  try {
    const ownerStatus = await queryable.query<ExistsRow>(
      "select exists (select 1 from team_memberships where role = 'owner') as owner_exists",
    );
    if (ownerStatus.rows[0]?.owner_exists) {
      throw new ApiError(409, "team_owner_exists", "A team owner already exists");
    }

    const workspaceId = await insertReturningId(
      queryable,
      "insert into workspaces (name) values ($1) returning id",
      [workspaceName],
    );
    const userId = await insertReturningId(
      queryable,
      "insert into users (email, password_hash) values ($1, $2) returning id",
      [email, passwordHash],
    );
    const teamId = await insertReturningId(
      queryable,
      "insert into teams (workspace_id, name) values ($1, $2) returning id",
      [workspaceId, teamName],
    );

    await queryable.query(
      "insert into team_memberships (team_id, user_id, role) values ($1, $2, 'owner')",
      [teamId, userId],
    );
    await queryable.query(
      "insert into sessions (id, user_id, expires_at) values ($1, $2, $3)",
      [hashTeamSessionToken(sessionToken), userId, sessionTokenExpiresAt],
    );
    await queryable.query(
      "insert into csrf_tokens (token_hash, session_id, expires_at) values ($1, $2, $3)",
      [hashTeamCsrfToken(csrfToken), hashTeamSessionToken(sessionToken), csrfTokenExpiresAt],
    );
    await recordTeamAuditEvent(queryable, {
      eventType: "team_bootstrap.owner",
      metadata: { email, teamId, workspaceId },
      userId,
      workspaceId,
    });
    await queryable.query("commit");

    return {
      csrfToken,
      csrfTokenExpiresAt,
      email,
      role: "owner",
      sessionToken,
      sessionTokenExpiresAt,
      teamId,
      userId,
      workspaceId,
    };
  } catch (error) {
    await queryable.query("rollback");
    throw error;
  }
}

async function insertReturningId(
  queryable: PostgresQueryable,
  text: string,
  values: readonly unknown[],
): Promise<string> {
  const result = await queryable.query<IdRow>(text, values);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Database insert did not return an id");
  return id;
}

function normalizeBootstrapEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "invalid_email", "Valid email is required");
  return email;
}
