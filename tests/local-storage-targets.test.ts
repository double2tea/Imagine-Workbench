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
  assert.deepEqual(
    adapters.filter(adapter => adapter.status === "planned").map(adapter => adapter.kind),
    ["postgres"],
  );
  assert.deepEqual(POSTGRES_STORAGE_ADAPTER.postgres, {
    engine: "postgres",
    maxMediaPayloadBytesEnv: "IMAGINE_MAX_MEDIA_PAYLOAD_BYTES",
    mediaDirectoryEnv: "IMAGINE_MEDIA_DIR",
    payloadDirectoryName: "originals",
    previewDirectoryName: "previews",
    requiredDatabaseUrlEnv: "DATABASE_URL",
  });
  assert.equal(adapters.every(adapter => adapter.capabilities.supportsRealtimeSync), true);
});
