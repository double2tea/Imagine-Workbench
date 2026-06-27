import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import {
  DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS,
  DEFAULT_POSTGRES_IDLE_TIMEOUT_MS,
  DEFAULT_POSTGRES_POOL_MAX,
  DEFAULT_POSTGRES_QUERY_TIMEOUT_MS,
  type PostgresStorageConfig,
} from "@/lib/storage/postgres/config";

export interface PostgresQueryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

const postgresPools = new Map<string, Pool>();

export async function withPostgresClient<T>(
  config: PostgresStorageConfig,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPostgresPool(config);
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

export async function checkPostgresConnection(queryable: PostgresQueryable): Promise<void> {
  await queryable.query("select 1");
}

export function createPostgresPoolConfig(config: PostgresStorageConfig): PoolConfig {
  return {
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: config.postgresConnectionTimeoutMillis ?? DEFAULT_POSTGRES_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.postgresIdleTimeoutMillis ?? DEFAULT_POSTGRES_IDLE_TIMEOUT_MS,
    max: config.postgresPoolMax ?? DEFAULT_POSTGRES_POOL_MAX,
    query_timeout: config.postgresQueryTimeoutMillis ?? DEFAULT_POSTGRES_QUERY_TIMEOUT_MS,
  };
}

export async function closePostgresPools(): Promise<void> {
  const pools = [...postgresPools.values()];
  postgresPools.clear();
  await Promise.all(pools.map(pool => pool.end()));
}

function getPostgresPool(config: PostgresStorageConfig): Pool {
  const poolKey = postgresPoolKey(config);
  const existing = postgresPools.get(poolKey);
  if (existing) return existing;
  const pool = new Pool(createPostgresPoolConfig(config));
  postgresPools.set(poolKey, pool);
  return pool;
}

function postgresPoolKey(config: PostgresStorageConfig): string {
  const poolConfig = createPostgresPoolConfig(config);
  return JSON.stringify([
    poolConfig.connectionString,
    poolConfig.connectionTimeoutMillis,
    poolConfig.idleTimeoutMillis,
    poolConfig.max,
    poolConfig.query_timeout,
  ]);
}
