import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalFilePayloadStore } from "../lib/storage/local-file-payload-store";

async function withTempMediaDir<T>(run: (mediaDir: string) => Promise<T>): Promise<T> {
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), "imagine-payload-store-"));
  try {
    return await run(mediaDir);
  } finally {
    await rm(mediaDir, { force: true, recursive: true });
  }
}

test("LocalFilePayloadStore writes reads and deletes validated local file refs", async () => {
  await withTempMediaDir(async mediaDir => {
    const store = new LocalFilePayloadStore(mediaDir);
    const blob = new Blob(["image bytes"], { type: "image/png" });

    const ref = await store.write({ blob, mimeType: "image/png" });

    assert.equal(ref.kind, "local-file");
    assert.equal(ref.mimeType, "image/png");
    assert.equal(ref.sizeBytes, blob.size);
    assert.match(ref.contentHash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.match(ref.uri, /^originals\/image\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-f0-9]{64}\.png$/);
    assert.equal(await readFile(path.join(mediaDir, ref.uri), "utf8"), "image bytes");

    const readBlob = await store.read(ref);
    assert.equal(readBlob.type, "image/png");
    assert.equal(await readBlob.text(), "image bytes");

    await store.delete(ref);
    await assert.rejects(() => readFile(path.join(mediaDir, ref.uri)), /ENOENT/);
  });
});

test("LocalFilePayloadStore rejects unsafe or unsupported payload refs", async () => {
  await withTempMediaDir(async mediaDir => {
    const store = new LocalFilePayloadStore(mediaDir);

    await assert.rejects(
      () => store.read({ kind: "local-file", uri: "../secret.txt" }),
      /Invalid relative storage key/,
    );
    await assert.rejects(
      () => store.read({ kind: "indexeddb", uri: "payload" }),
      /Unsupported payload location/,
    );
  });
});

test("LocalFilePayloadStore validates MIME type and provided content hash", async () => {
  await withTempMediaDir(async mediaDir => {
    const store = new LocalFilePayloadStore(mediaDir);

    await assert.rejects(
      () => store.write({ blob: new Blob(["data"], { type: "image/png" }), mimeType: "application/octet-stream" }),
      /Payload MIME type does not match blob type/,
    );
    await assert.rejects(
      () => store.write({ blob: new Blob(["data"], { type: "application/json" }), mimeType: "application/json" }),
      /Unsupported payload MIME type/,
    );
    await assert.rejects(
      () => store.write({
        blob: new Blob(["data"], { type: "text/plain" }),
        contentHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        mimeType: "text/plain",
      }),
      /Payload content hash does not match bytes/,
    );
  });
});
