import { z } from "zod";
import { ApiError, apiErrorResponse, badRequest } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import { bootstrapFirstTeamOwner } from "@/lib/storage/team-bootstrap";
import {
  assertTrustedTeamRequestOrigin,
  serializeTeamCsrfCookie,
  serializeTeamSessionCookie,
} from "@/lib/storage/team-auth";
import {
  assertTeamRateLimit,
  clearTeamRateLimit,
  recordTeamRateLimitFailure,
  teamRequestRateLimitKey,
  TEAM_BOOTSTRAP_RATE_LIMIT,
} from "@/lib/storage/team-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bootstrapBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(12),
  teamName: z.string().trim().min(1).optional(),
  workspaceName: z.string().trim().min(1).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    const rateLimitKey = teamRequestRateLimitKey(request, "team-bootstrap");
    assertTeamRateLimit(rateLimitKey, TEAM_BOOTSTRAP_RATE_LIMIT);
    assertBootstrapSetupToken(process.env.IMAGINE_TEAM_SETUP_TOKEN, request.headers.get("x-imagine-setup-token"), rateLimitKey);
    const config = resolvePostgresStorageConfig(process.env);
    const parsedBody = bootstrapBodySchema.safeParse(await readBootstrapRequestJson(request));
    if (!parsedBody.success) throw badRequest("Invalid team bootstrap request", "invalid_bootstrap_request");
    const body = parsedBody.data;
    const appUrl = requireAppUrl(process.env.APP_URL);
    const result = await withPostgresClient(config, client => bootstrapFirstTeamOwner(client, {
      appUrl,
      email: body.email,
      password: body.password,
      teamName: body.teamName,
      workspaceName: body.workspaceName,
    }));
    clearTeamRateLimit(rateLimitKey);

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
    const response = apiErrorResponse(error, "Team bootstrap failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

function assertBootstrapSetupToken(
  expectedToken: string | undefined,
  requestToken: string | null,
  rateLimitKey: string,
): void {
  const setupToken = expectedToken?.trim();
  if (!setupToken) throw new PostgresStorageConfigError("IMAGINE_TEAM_SETUP_TOKEN is required for team storage migrations");
  if (requestToken === setupToken) return;
  recordTeamRateLimitFailure(rateLimitKey, TEAM_BOOTSTRAP_RATE_LIMIT);
  throw new ApiError(401, "team_bootstrap_failed", "Team bootstrap failed");
}

function requireAppUrl(value: string | undefined): string {
  const appUrl = value?.trim();
  if (!appUrl) throw new Error("APP_URL is required for team bootstrap");
  return appUrl;
}

async function readBootstrapRequestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("Invalid team bootstrap request", "invalid_bootstrap_request");
  }
}
