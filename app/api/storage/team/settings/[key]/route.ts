import { apiErrorResponse } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { deleteTeamSetting } from "@/lib/storage/team-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamSettingRouteContext {
  params: Promise<{ key: string }>;
}

export async function DELETE(request: Request, context: TeamSettingRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { key } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    await withPostgresClient(config, client => deleteTeamSetting(client, config, request, key, request.headers.get("if-match") ?? undefined));
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error, "Team setting delete failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}
