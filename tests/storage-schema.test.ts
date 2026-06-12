import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSPACE_STORAGE_SCHEMA,
  WORKSPACE_STORAGE_SCHEMA_VERSION,
  listWorkspaceStorageTables,
  type WorkspaceStorageTableName,
} from "../lib/storage/schema";
import type { WorkspaceStorageRepository } from "../lib/storage/repository";

test("workspace storage schema separates database records from large payload locations", () => {
  assert.equal(WORKSPACE_STORAGE_SCHEMA.version, WORKSPACE_STORAGE_SCHEMA_VERSION);
  assert.equal(WORKSPACE_STORAGE_SCHEMA.defaultTargetKind, "indexeddb");
  assert.equal(WORKSPACE_STORAGE_SCHEMA.assetPayloadPolicy.databaseStoresLargePayloadsByDefault, false);
  assert.deepEqual(WORKSPACE_STORAGE_SCHEMA.assetPayloadPolicy.preferredExternalLocations, ["local-file", "object-storage"]);
});

test("workspace storage schema exposes stable table names for future adapters", () => {
  const tables: readonly WorkspaceStorageTableName[] = listWorkspaceStorageTables();

  assert.deepEqual(tables, [
    "assets",
    "asset_payloads",
    "asset_previews",
    "boards",
    "generation_tasks",
    "settings",
    "safety_snapshots",
  ]);
});

test("workspace storage repository contract can target the current IndexedDB store", () => {
  const targetKind: WorkspaceStorageRepository["targetKind"] = "indexeddb";

  assert.equal(targetKind, "indexeddb");
});
