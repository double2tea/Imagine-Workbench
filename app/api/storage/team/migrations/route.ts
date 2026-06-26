import { APP_VERSION } from "@/lib/app-version";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  PostgresStorageConfigError,
  requireTeamSetupToken,
  resolvePostgresStorageConfig,
} from "@/lib/storage/postgres/config";
import { applyPostgresMigrations } from "@/lib/storage/postgres/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    requireTeamSetupToken(process.env, request.headers.get("x-imagine-setup-token"));
    const config = resolvePostgresStorageConfig(process.env);
    const migrationStatus = await withPostgresClient(config, client =>
      applyPostgresMigrations(client, APP_VERSION),
    );

    return Response.json({
      appVersion: APP_VERSION,
      migrationStatus,
      mode: "postgres",
      targetKind: "postgres",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PostgreSQL migration failed";
    return Response.json(
      {
        error: message,
        mode: "postgres",
        targetKind: "postgres",
      },
      { status: error instanceof PostgresStorageConfigError ? 400 : 500 },
    );
  }
}
