import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { deleteTeamMember, updateTeamMemberRole } from "@/lib/storage/team-members";
import type { ManageableTeamRole } from "@/lib/storage/team-member-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamMemberRouteContext {
  params: Promise<{
    userId: string;
  }>;
}

export async function PATCH(request: Request, context: TeamMemberRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { userId } = await context.params;
    const body = await readTeamMemberRoleRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => updateTeamMemberRole(client, config, request, userId, {
      role: requireManageableRole(body.role),
    }));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team member update failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

export async function DELETE(request: Request, context: TeamMemberRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { userId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    await withPostgresClient(config, client => deleteTeamMember(client, config, request, userId));
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error, "Team member delete failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

async function readTeamMemberRoleRequestJson(request: Request): Promise<Record<string, unknown>> {
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

function requireManageableRole(value: unknown): ManageableTeamRole {
  if (value === "admin" || value === "editor" || value === "viewer") return value;
  throw badRequest("Invalid team member role", "invalid_team_member_role");
}
