import { apiErrorResponse } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import { getLatestTeamSafetySnapshot } from "@/lib/storage/team-safety-snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => getLatestTeamSafetySnapshot(client, config, request));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team safety snapshot lookup failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}
