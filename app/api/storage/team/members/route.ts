import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { createTeamMember, listTeamMembers } from "@/lib/storage/team-members";
import type { ManageableTeamRole } from "@/lib/storage/team-member-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => listTeamMembers(client, config, request));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team member list failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const body = await readTeamMemberRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => createTeamMember(client, config, request, {
      email: requireText(body, "email"),
      password: requireText(body, "password"),
      role: requireManageableRole(body.role),
    }));
    return Response.json(result, { status: 201 });
  } catch (error) {
    const response = apiErrorResponse(error, "Team member create failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

async function readTeamMemberRequestJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (isRecord(value)) return value;
  } catch {
    throw badRequest("Invalid team member request", "invalid_team_member_request");
  }
  throw badRequest("Invalid team member request", "invalid_team_member_request");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireText(value: Record<string, unknown>, field: string): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || !fieldValue.trim()) {
    throw badRequest("Invalid team member request", "invalid_team_member_request");
  }
  return fieldValue;
}

function requireManageableRole(value: unknown): ManageableTeamRole {
  if (value === "admin" || value === "editor" || value === "viewer") return value;
  throw badRequest("Invalid team member role", "invalid_team_member_role");
}
