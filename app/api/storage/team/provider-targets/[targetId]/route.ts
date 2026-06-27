import { apiErrorResponse } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { deleteTeamProviderTarget } from "@/lib/storage/team-provider-targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamProviderTargetRouteContext {
  params: Promise<{ targetId: string }>;
}

export async function DELETE(request: Request, context: TeamProviderTargetRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { targetId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    await withPostgresClient(config, client => deleteTeamProviderTarget(client, config, request, targetId));
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error, "Team provider target delete failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}
