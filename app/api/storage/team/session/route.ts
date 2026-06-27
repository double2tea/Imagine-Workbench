import { z } from "zod";
import { ApiError, apiErrorResponse, badRequest } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
  requireTeamSession,
  serializeTeamCsrfCookie,
  serializeTeamSessionCookie,
} from "@/lib/storage/team-auth";
import {
  assertTeamRateLimit,
  clearTeamRateLimit,
  recordTeamRateLimitFailure,
  teamRequestRateLimitKey,
  TEAM_LOGIN_RATE_LIMIT,
} from "@/lib/storage/team-rate-limit";
import { createTeamSession, deleteTeamSession } from "@/lib/storage/team-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sessionLoginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const session = await withPostgresClient(config, client => requireTeamSession(client, request));
    return Response.json(session);
  } catch (error) {
    const response = apiErrorResponse(error, "Team session lookup failed");
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
    const config = resolvePostgresStorageConfig(process.env);
    const parsedBody = sessionLoginBodySchema.safeParse(await readTeamSessionRequestJson(request));
    if (!parsedBody.success) throw badRequest("Invalid team session request", "invalid_team_session_request");
    const appUrl = requireAppUrl(process.env.APP_URL);
    const rateLimitKey = teamRequestRateLimitKey(request, "team-login", parsedBody.data.email);
    assertTeamRateLimit(rateLimitKey, TEAM_LOGIN_RATE_LIMIT);
    const result = await withPostgresClient(config, async client => {
      try {
        const session = await createTeamSession(client, parsedBody.data);
        clearTeamRateLimit(rateLimitKey);
        return session;
      } catch (error) {
        if (error instanceof ApiError && error.code === "invalid_credentials") {
          recordTeamRateLimitFailure(rateLimitKey, TEAM_LOGIN_RATE_LIMIT);
        }
        throw error;
      }
    });

    const headers = new Headers();
    headers.append("Set-Cookie", serializeTeamSessionCookie(result.sessionToken, result.sessionTokenExpiresAt, appUrl));
    headers.append("Set-Cookie", serializeTeamCsrfCookie(result.csrfToken, result.csrfTokenExpiresAt, appUrl));

    return Response.json({
      email: result.email,
      role: result.role,
      teamId: result.teamId,
      userId: result.userId,
      workspaceId: result.workspaceId,
    }, { headers });
  } catch (error) {
    const response = apiErrorResponse(error, "Team session login failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const config = resolvePostgresStorageConfig(process.env);
    await withPostgresClient(config, client => deleteTeamSession(client, request));
    const appUrl = requireAppUrl(process.env.APP_URL);

    const headers = new Headers();
    headers.append("Set-Cookie", serializeTeamSessionCookie("", new Date(0), appUrl));
    headers.append("Set-Cookie", serializeTeamCsrfCookie("", new Date(0), appUrl));
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const response = apiErrorResponse(error, "Team session logout failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

function requireAppUrl(value: string | undefined): string {
  const appUrl = value?.trim();
  if (!appUrl) throw new Error("APP_URL is required for team session routes");
  return appUrl;
}

async function readTeamSessionRequestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("Invalid team session request", "invalid_team_session_request");
  }
}
