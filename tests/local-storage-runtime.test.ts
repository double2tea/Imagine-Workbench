import assert from "node:assert/strict";
import test from "node:test";

import { parseWorkspaceStorageMode } from "../lib/storage/local-config";
import { resolveLocalWorkspacePaths } from "../lib/storage/local-paths";
import { resolveLocalStorageRuntimeStatus } from "../lib/storage/local-runtime";

test("resolveLocalWorkspacePaths uses the default local workspace directory", () => {
  const paths = resolveLocalWorkspacePaths({ homeDir: "/Users/alice" });

  assert.equal(paths.rootDir, "/Users/alice/.imagine-workbench/workspaces/default");
  assert.equal(paths.databaseFile, "/Users/alice/.imagine-workbench/workspaces/default/imagine-workbench.sqlite");
  assert.equal(paths.assetDir, "/Users/alice/.imagine-workbench/workspaces/default/assets");
  assert.equal(paths.previewDir, "/Users/alice/.imagine-workbench/workspaces/default/previews");
  assert.equal(paths.exportDir, "/Users/alice/.imagine-workbench/workspaces/default/exports");
  assert.equal(paths.trashDir, "/Users/alice/.imagine-workbench/workspaces/default/trash");
});

test("resolveLocalStorageRuntimeStatus keeps browser storage as the default", () => {
  const status = resolveLocalStorageRuntimeStatus({}, { homeDir: "/Users/alice" });

  assert.equal(status.enabled, false);
  assert.equal(status.mode, "browser");
  assert.equal(status.targetKind, "indexeddb");
  assert.equal(status.reason, "browser-storage-selected");
  assert.equal(status.paths, undefined);
});

test("resolveLocalStorageRuntimeStatus enables local database only when explicitly selected", () => {
  const status = resolveLocalStorageRuntimeStatus({
    IMAGINE_LOCAL_WORKSPACE_DIR: "~/Creative",
    IMAGINE_STORAGE_TARGET: "local-database",
  }, { homeDir: "/Users/alice" });

  assert.equal(status.enabled, true);
  assert.equal(status.targetKind, "local-database");
  assert.equal(status.reason, "local-database-selected");
  assert.equal(status.paths?.rootDir, "/Users/alice/Creative");
  assert.equal(status.syncPolicy.bidirectionalSync, false);
  assert.equal(status.cleanupPolicy.automaticStartupCleanup, false);
});

test("resolveLocalStorageRuntimeStatus disables local database on hosted deployments", () => {
  const status = resolveLocalStorageRuntimeStatus({
    CF_PAGES: "1",
    IMAGINE_STORAGE_TARGET: "local-database",
  }, { homeDir: "/Users/alice" });

  assert.equal(status.enabled, false);
  assert.equal(status.targetKind, "local-database");
  assert.equal(status.reason, "hosted-deployment");
  assert.equal(status.paths, undefined);
});

test("parseWorkspaceStorageMode rejects unknown storage targets", () => {
  assert.throws(
    () => parseWorkspaceStorageMode("sqlite"),
    /IMAGINE_STORAGE_TARGET must be "browser" or "local-database"/,
  );
});
