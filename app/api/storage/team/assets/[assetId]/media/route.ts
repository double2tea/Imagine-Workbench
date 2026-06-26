import { apiErrorResponse } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import { readTeamAssetMedia } from "@/lib/storage/team-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamAssetMediaRouteContext {
  params: Promise<{
    assetId: string;
  }>;
}

export async function GET(request: Request, context: TeamAssetMediaRouteContext): Promise<Response> {
  try {
    const { assetId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const media = await withPostgresClient(config, client => readTeamAssetMedia(client, config, request, assetId, { download }));
    return new Response(media.body, { headers: media.headers });
  } catch (error) {
    const response = apiErrorResponse(error, "Team asset media read failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}
