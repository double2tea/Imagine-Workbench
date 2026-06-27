import { APP_VERSION } from "@/lib/app-version";
import { checkPostgresConnection, withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertPostgresMediaDirectoryAccess,
  PostgresStorageConfigError,
  resolvePostgresStorageConfig,
} from "@/lib/storage/postgres/config";
import { getPostgresMigrationStatus } from "@/lib/storage/postgres/migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    await assertPostgresMediaDirectoryAccess(config.mediaDir);
    const migrationStatus = await withPostgresClient(config, async client => {
      await checkPostgresConnection(client);
      return getPostgresMigrationStatus(client);
    });

    return Response.json({
      appVersion: APP_VERSION,
      databaseConfigured: true,
      maxMediaPayloadBytes: config.maxMediaPayloadBytes,
      mediaDirectoryConfigured: true,
      migrationStatus,
      mode: "postgres",
      reachable: true,
      targetKind: "postgres",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PostgreSQL health check failed";
    return Response.json(
      {
        error: message,
        mode: "postgres",
        reachable: false,
        targetKind: "postgres",
      },
      { status: error instanceof PostgresStorageConfigError ? 400 : 503 },
    );
  }
}
