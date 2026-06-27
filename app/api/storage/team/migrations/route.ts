import { APP_VERSION } from "@/lib/app-version";
import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  PostgresStorageConfigError,
  resolvePostgresStorageConfig,
} from "@/lib/storage/postgres/config";
import { applyPostgresMigrations } from "@/lib/storage/postgres/migrations";
import { assertTrustedTeamRequestOrigin } from "@/lib/storage/team-auth";
import {
  assertTeamRateLimit,
  clearTeamRateLimit,
  recordTeamRateLimitFailure,
  teamRequestRateLimitKey,
  TEAM_MIGRATION_RATE_LIMIT,
} from "@/lib/storage/team-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    const rateLimitKey = teamRequestRateLimitKey(request, "team-migrations");
    assertTeamRateLimit(rateLimitKey, TEAM_MIGRATION_RATE_LIMIT);
    assertMigrationSetupToken(process.env.IMAGINE_TEAM_SETUP_TOKEN, request.headers.get("x-imagine-setup-token"), rateLimitKey);
    const config = resolvePostgresStorageConfig(process.env);
    const migrationStatus = await withPostgresClient(config, client =>
      applyPostgresMigrations(client, APP_VERSION),
    );
    clearTeamRateLimit(rateLimitKey);

    return Response.json({
      appVersion: APP_VERSION,
      migrationStatus,
      mode: "postgres",
      targetKind: "postgres",
    });
  } catch (error) {
    const response = apiErrorResponse(error, "PostgreSQL migration failed");
    return Response.json(
      { ...response.body, mode: "postgres", targetKind: "postgres" },
      { status: error instanceof PostgresStorageConfigError ? 400 : response.status },
    );
  }
}

function assertMigrationSetupToken(
  expectedToken: string | undefined,
  requestToken: string | null,
  rateLimitKey: string,
): void {
  const setupToken = expectedToken?.trim();
  if (!setupToken) throw new PostgresStorageConfigError("IMAGINE_TEAM_SETUP_TOKEN is required for team storage migrations");
  if (requestToken === setupToken) return;
  recordTeamRateLimitFailure(rateLimitKey, TEAM_MIGRATION_RATE_LIMIT);
  throw new ApiError(401, "team_migration_failed", "PostgreSQL migration failed");
}
