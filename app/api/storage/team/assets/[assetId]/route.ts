import { apiErrorResponse } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { deleteTeamAsset } from "@/lib/storage/team-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamAssetRouteContext {
  params: Promise<{
    assetId: string;
  }>;
}

export async function DELETE(request: Request, context: TeamAssetRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { assetId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    await withPostgresClient(config, client => deleteTeamAsset(client, config, request, assetId));
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error, "Team asset delete failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}
