import { z } from "zod";
import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { cleanupTeamMediaMaintenance } from "@/lib/storage/team-media-maintenance";
import { TEAM_MEDIA_MAINTENANCE_TARGETS } from "@/lib/storage/team-media-maintenance-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const teamMediaMaintenanceBodySchema = z.object({
  target: z.enum(TEAM_MEDIA_MAINTENANCE_TARGETS),
});

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const parsedBody = teamMediaMaintenanceBodySchema.safeParse(await readTeamMediaMaintenanceRequestJson(request));
    if (!parsedBody.success) throw badRequest("Invalid team media maintenance request", "invalid_team_media_maintenance_request");
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => cleanupTeamMediaMaintenance(
      client,
      config,
      request,
      parsedBody.data.target,
    ));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team media maintenance failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

async function readTeamMediaMaintenanceRequestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("Invalid team media maintenance request", "invalid_team_media_maintenance_request");
  }
}
