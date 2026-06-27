import assert from "node:assert/strict";
import test from "node:test";

import {
  INDEXED_DB_STORAGE_ADAPTER,
  POSTGRES_STORAGE_ADAPTER,
  listWorkspaceStorageAdapters,
} from "../lib/local-storage-targets";

test("workspace storage adapters expose only IndexedDB and PostgreSQL targets", () => {
  const adapters = listWorkspaceStorageAdapters();

  assert.equal(adapters.length, 2);
  assert.equal(INDEXED_DB_STORAGE_ADAPTER.status, "active");
  assert.equal(POSTGRES_STORAGE_ADAPTER.status, "active");
  assert.deepEqual(
    adapters.map(adapter => adapter.kind),
    ["indexeddb", "postgres"],
  );
  assert.deepEqual(
    adapters.filter(adapter => adapter.status === "planned").map(adapter => adapter.kind),
    [],
  );
  assert.deepEqual(POSTGRES_STORAGE_ADAPTER.postgres, {
    connectionTimeoutMillisEnv: "IMAGINE_POSTGRES_CONNECTION_TIMEOUT_MS",
    engine: "postgres",
    idleTimeoutMillisEnv: "IMAGINE_POSTGRES_IDLE_TIMEOUT_MS",
    maxMediaPayloadBytesEnv: "IMAGINE_MAX_MEDIA_PAYLOAD_BYTES",
    mediaDirectoryEnv: "IMAGINE_MEDIA_DIR",
    payloadDirectoryName: "originals",
    previewDirectoryName: "previews",
    poolMaxEnv: "IMAGINE_POSTGRES_POOL_MAX",
    queryTimeoutMillisEnv: "IMAGINE_POSTGRES_QUERY_TIMEOUT_MS",
    requiredDatabaseUrlEnv: "DATABASE_URL",
  });
  assert.equal(adapters.every(adapter => adapter.capabilities.supportsRealtimeSync), true);
});
