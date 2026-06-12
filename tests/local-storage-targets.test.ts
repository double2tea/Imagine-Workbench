import assert from "node:assert/strict";
import test from "node:test";

import {
  INDEXED_DB_STORAGE_ADAPTER,
  LOCAL_DATABASE_STORAGE_ADAPTER,
  listWorkspaceStorageAdapters,
} from "../lib/local-storage-targets";

test("workspace storage adapters keep IndexedDB active and future targets planned", () => {
  const adapters = listWorkspaceStorageAdapters();

  assert.equal(adapters.length, 4);
  assert.equal(INDEXED_DB_STORAGE_ADAPTER.status, "active");
  assert.deepEqual(
    adapters.filter(adapter => adapter.status === "planned").map(adapter => adapter.kind),
    ["local-folder", "local-database", "remote-api"],
  );
  assert.deepEqual(LOCAL_DATABASE_STORAGE_ADAPTER.localDatabase, {
    assetDirectoryName: "assets",
    databaseFileName: "imagine-workbench.sqlite",
    engine: "sqlite",
    previewDirectoryName: "previews",
  });
  assert.equal(adapters.every(adapter => adapter.capabilities.supportsRealtimeSync), true);
});
