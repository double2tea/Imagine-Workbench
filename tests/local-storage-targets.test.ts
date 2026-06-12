import assert from "node:assert/strict";
import test from "node:test";

import {
  INDEXED_DB_STORAGE_ADAPTER,
  listWorkspaceStorageAdapters,
} from "../lib/local-storage-targets";

test("workspace storage adapters keep IndexedDB active and future targets planned", () => {
  const adapters = listWorkspaceStorageAdapters();

  assert.equal(adapters.length, 3);
  assert.equal(INDEXED_DB_STORAGE_ADAPTER.status, "active");
  assert.deepEqual(
    adapters.filter(adapter => adapter.status === "planned").map(adapter => adapter.kind),
    ["local-folder", "remote-api"],
  );
  assert.equal(adapters.every(adapter => adapter.capabilities.supportsRealtimeSync), true);
});
