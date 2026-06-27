import assert from "node:assert/strict";
import test from "node:test";

import { parseWorkspaceStorageMode } from "../lib/storage/local-config";
import { resolveLocalWorkspacePaths } from "../lib/storage/local-paths";
import {
  resolveLocalStorageRuntimeStatus,
  resolvePublicLocalStorageRuntimeStatus,
  toPublicLocalStorageRuntimeStatus,
} from "../lib/storage/local-runtime";

test("resolveLocalWorkspacePaths uses the default media workspace directory", () => {
  const paths = resolveLocalWorkspacePaths({ homeDir: "/Users/alice" });

  assert.equal(paths.rootDir, "/Users/alice/.imagine-workbench/workspaces/default");
  assert.equal(paths.mediaDir, "/Users/alice/.imagine-workbench/workspaces/default");
  assert.equal(paths.assetDir, "/Users/alice/.imagine-workbench/workspaces/default/originals");
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

test("resolveLocalStorageRuntimeStatus enables PostgreSQL only when explicitly selected", () => {
  const status = resolveLocalStorageRuntimeStatus({
    DATABASE_URL: "postgres://localhost/imagine",
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: "1024",
    IMAGINE_MEDIA_DIR: "/srv/imagine/media",
    IMAGINE_STORAGE_TARGET: "postgres",
  }, { homeDir: "/Users/alice" });

  assert.equal(status.enabled, true);
  assert.equal(status.targetKind, "postgres");
  assert.equal(status.reason, "postgres-selected");
  assert.equal(status.paths?.mediaDir, "/srv/imagine/media");
  assert.equal(status.syncPolicy.bidirectionalSync, false);
  assert.equal(status.cleanupPolicy.automaticStartupCleanup, false);
});

test("resolvePublicLocalStorageRuntimeStatus exposes only PostgreSQL config status", () => {
  const status = resolvePublicLocalStorageRuntimeStatus({
    DATABASE_URL: "postgres://localhost/imagine",
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: "1024",
    IMAGINE_MEDIA_DIR: "/srv/imagine/media",
    IMAGINE_STORAGE_TARGET: "postgres",
  });

  assert.equal(Object.hasOwn(status, "paths"), false);
  assert.deepEqual(status.pathPlan, {
    databaseUrlConfigured: true,
    exportDirectoryName: "exports",
    maxMediaPayloadBytes: 1024,
    maxMediaPayloadBytesConfigured: true,
    mediaDirectoryConfigured: true,
    payloadDirectoryName: "originals",
    previewDirectoryName: "previews",
    trashDirectoryName: "trash",
  });
});

test("toPublicLocalStorageRuntimeStatus redacts private runtime paths", () => {
  const privateStatus = resolveLocalStorageRuntimeStatus({
    DATABASE_URL: "postgres://localhost/imagine",
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: "1024",
    IMAGINE_MEDIA_DIR: "/srv/imagine/media",
    IMAGINE_STORAGE_TARGET: "postgres",
  }, { homeDir: "/Users/alice" });
  const publicStatus = toPublicLocalStorageRuntimeStatus(privateStatus, {
    DATABASE_URL: "postgres://localhost/imagine",
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: "1024",
    IMAGINE_MEDIA_DIR: "/srv/imagine/media",
  });

  assert.equal(Object.hasOwn(publicStatus, "paths"), false);
  assert.equal(publicStatus.pathPlan?.databaseUrlConfigured, true);
  assert.equal(publicStatus.pathPlan?.maxMediaPayloadBytes, 1024);
  assert.equal(publicStatus.pathPlan?.mediaDirectoryConfigured, true);
});

test("resolveLocalStorageRuntimeStatus rejects PostgreSQL on hosted deployments", () => {
  assert.throws(
    () => resolveLocalStorageRuntimeStatus({
      CF_PAGES: "1",
      DATABASE_URL: "postgres://localhost/imagine",
      IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: "1024",
      IMAGINE_MEDIA_DIR: "/srv/imagine/media",
      IMAGINE_STORAGE_TARGET: "postgres",
    }, { homeDir: "/Users/alice" }),
    /PostgreSQL storage requires a Node server deployment/,
  );
});

test("resolveLocalStorageRuntimeStatus rejects missing PostgreSQL config", () => {
  assert.throws(
    () => resolveLocalStorageRuntimeStatus({ IMAGINE_STORAGE_TARGET: "postgres" }),
    /DATABASE_URL is required/,
  );
  assert.throws(
    () => resolveLocalStorageRuntimeStatus({
      DATABASE_URL: "postgres://localhost/imagine",
      IMAGINE_STORAGE_TARGET: "postgres",
    }),
    /IMAGINE_MEDIA_DIR is required/,
  );
  assert.throws(
    () => resolveLocalStorageRuntimeStatus({
      DATABASE_URL: "postgres://localhost/imagine",
      IMAGINE_MEDIA_DIR: "/srv/imagine/media",
      IMAGINE_STORAGE_TARGET: "postgres",
    }),
    /IMAGINE_MAX_MEDIA_PAYLOAD_BYTES must be a positive integer byte count/,
  );
});

test("parseWorkspaceStorageMode trims selected storage targets", () => {
  assert.equal(parseWorkspaceStorageMode(" postgres "), "postgres");
});

test("parseWorkspaceStorageMode rejects stale and unknown storage targets", () => {
  assert.throws(
    () => parseWorkspaceStorageMode("local-database"),
    /IMAGINE_STORAGE_TARGET must be "browser" or "postgres"/,
  );
  assert.throws(
    () => parseWorkspaceStorageMode("local-folder"),
    /IMAGINE_STORAGE_TARGET must be "browser" or "postgres"/,
  );
  assert.throws(
    () => parseWorkspaceStorageMode("remote-api"),
    /IMAGINE_STORAGE_TARGET must be "browser" or "postgres"/,
  );
});
