import { apiErrorResponse } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import { exportTeamWorkspaceBackup } from "@/lib/storage/team-workspace-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const includeCredentials = new URL(request.url).searchParams.get("includeCredentials") === "1";
    const result = await withPostgresClient(config, client => exportTeamWorkspaceBackup(
      client,
      config,
      request,
      includeCredentials,
    ));
    return new Response(result.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff",
        "X-Imagine-Asset-Count": String(result.assetCount),
        "X-Imagine-Board-Count": String(result.boardCount),
        "X-Imagine-Backup-File-Name": result.fileName,
        "X-Imagine-Generation-Task-Count": String(result.generationTaskCount),
        "X-Imagine-Library-Asset-Count": String(result.libraryAssetCount),
        "X-Imagine-Settings-Key-Count": String(result.settingsKeyCount),
        "X-Imagine-Voice-Profile-Count": String(result.voiceProfileCount),
      },
    });
  } catch (error) {
    const response = apiErrorResponse(error, "Team backup export failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}
