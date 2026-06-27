import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cleanupTeamMediaMaintenanceFiles,
  inspectTeamMediaConsistency,
} from "../lib/storage/team-media-consistency";

test("team media consistency cleanup deletes only unreferenced maintenance files", async () => {
  await withTempMediaDir(async mediaDir => {
    await writeMediaFile(mediaDir, "originals/image/kept.png");
    await writeMediaFile(mediaDir, "previews/image/kept.webp");
    await writeMediaFile(mediaDir, "originals/image/orphan.png");
    await writeMediaFile(mediaDir, "previews/image/orphan.webp");
    await writeMediaFile(mediaDir, "tmp/staged.part");
    await writeMediaFile(mediaDir, "trash/old.png");

    const refs = {
      payloadStorageKeys: ["originals/image/kept.png", "originals/image/missing.png"],
      previewStorageKeys: ["previews/image/kept.webp", "previews/image/missing.webp"],
    };

    assert.deepEqual(await inspectTeamMediaConsistency(mediaDir, refs), {
      missingPayloadFiles: 1,
      missingPreviewFiles: 1,
      orphanedPayloadFiles: 1,
      orphanedPreviewFiles: 1,
      tmpFiles: 1,
      trashFiles: 1,
    });

    assert.deepEqual(await cleanupTeamMediaMaintenanceFiles(mediaDir, refs), {
      deletedFiles: 4,
      deletedOrphanedPayloadFiles: 1,
      deletedOrphanedPreviewFiles: 1,
      deletedTmpFiles: 1,
      deletedTrashFiles: 1,
    });

    assert.equal(await fileExists(mediaDir, "originals/image/kept.png"), true);
    assert.equal(await fileExists(mediaDir, "previews/image/kept.webp"), true);
    assert.equal(await fileExists(mediaDir, "originals/image/orphan.png"), false);
    assert.equal(await fileExists(mediaDir, "previews/image/orphan.webp"), false);
    assert.equal(await fileExists(mediaDir, "tmp/staged.part"), false);
    assert.equal(await fileExists(mediaDir, "trash/old.png"), false);
  });
});

test("team media consistency rejects unsafe referenced storage keys", async () => {
  await withTempMediaDir(async mediaDir => {
    await assert.rejects(
      inspectTeamMediaConsistency(mediaDir, {
        payloadStorageKeys: ["../outside.png"],
        previewStorageKeys: [],
      }),
      /Invalid team media storage key/,
    );
  });
});

async function withTempMediaDir<T>(run: (mediaDir: string) => Promise<T>): Promise<T> {
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), "imagine-team-media-consistency-"));
  try {
    return await run(mediaDir);
  } finally {
    await rm(mediaDir, { force: true, recursive: true });
  }
}

async function writeMediaFile(mediaDir: string, storageKey: string): Promise<void> {
  const filePath = path.join(mediaDir, ...storageKey.split("/"));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "media");
}

async function fileExists(mediaDir: string, storageKey: string): Promise<boolean> {
  try {
    const stats = await stat(path.join(mediaDir, ...storageKey.split("/")));
    return stats.isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
