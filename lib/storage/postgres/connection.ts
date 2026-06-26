import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";

export interface PostgresQueryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

export async function withPostgresClient<T>(
  config: PostgresStorageConfig,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 1000,
    max: 5,
  });
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
    await pool.end();
  }
}

export async function checkPostgresConnection(queryable: PostgresQueryable): Promise<void> {
  await queryable.query("select 1");
}
