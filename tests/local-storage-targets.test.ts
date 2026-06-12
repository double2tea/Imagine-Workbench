import assert from "node:assert/strict";
import test from "node:test";

import { buildLocalFolderWorkspaceManifest } from "../lib/local-storage-targets";

test("buildLocalFolderWorkspaceManifest creates a portable local folder manifest", () => {
  const manifest = buildLocalFolderWorkspaceManifest({
    assetCount: 4,
    blob: new Blob(["zip"]),
    boardCount: 2,
    exportedAt: "2026-06-12T12:00:00.000Z",
    fileName: "Imagine_Workbench_Local_Backup_20260612_120000.zip",
    includeCredentials: false,
    settingsKeyCount: 3,
  });

  assert.deepEqual(manifest, {
    app: "Imagine Workbench",
    assetCount: 4,
    backupFileName: "Imagine_Workbench_Local_Backup_20260612_120000.zip",
    boardCount: 2,
    exportedAt: "2026-06-12T12:00:00.000Z",
    includeCredentials: false,
    kind: "local-folder",
    schemaVersion: 1,
    settingsKeyCount: 3,
  });
});
