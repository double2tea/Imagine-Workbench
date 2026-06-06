import assert from "node:assert/strict";
import test from "node:test";

import { computeAssetContentHash } from "../lib/db";

test("computeAssetContentHash returns a stable SHA-256 content key", async () => {
  assert.equal(
    await computeAssetContentHash("data:image/png;base64,AA=="),
    "sha256:e2c4bf98685a8d0674e42fe055e6768d7da848691d4fa7c9dbd5b0703d9dfaf4",
  );
});
