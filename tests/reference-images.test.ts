import assert from "node:assert/strict";
import test from "node:test";

import {
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_MAX_EDGE,
  REFERENCE_IMAGES_MAX_TOTAL_BYTES,
  dataUriByteSize,
  getReferenceImagePayloadError,
  scaleImageDimensions,
} from "../lib/reference-images";

function makeDataUri(byteCount: number): string {
  const triples = Math.floor(byteCount / 3);
  const remainder = byteCount % 3;
  const suffix = remainder === 1 ? "AA==" : remainder === 2 ? "AAA=" : "";
  return `data:image/webp;base64,${"A".repeat(triples * 4)}${suffix}`;
}

test("scaleImageDimensions keeps smaller images unchanged", () => {
  assert.deepEqual(scaleImageDimensions(1024, 768, REFERENCE_IMAGE_MAX_EDGE), { width: 1024, height: 768 });
});

test("scaleImageDimensions constrains the longest edge", () => {
  assert.deepEqual(scaleImageDimensions(6000, 3000, REFERENCE_IMAGE_MAX_EDGE), {
    width: REFERENCE_IMAGE_MAX_EDGE,
    height: 1024,
  });
});

test("dataUriByteSize reads base64 payload bytes", () => {
  assert.equal(dataUriByteSize(makeDataUri(5)), 5);
});

test("getReferenceImagePayloadError rejects one oversized data URI", () => {
  const error = getReferenceImagePayloadError([makeDataUri(REFERENCE_IMAGE_MAX_BYTES + 1)]);

  assert.match(error ?? "", /单张参考图/);
});

test("getReferenceImagePayloadError rejects oversized data URI totals", () => {
  const halfTotal = Math.floor(REFERENCE_IMAGES_MAX_TOTAL_BYTES / 2) + 1;
  const error = getReferenceImagePayloadError([makeDataUri(halfTotal), makeDataUri(halfTotal)]);

  assert.match(error ?? "", /参考图总大小/);
});

test("getReferenceImagePayloadError ignores remote references", () => {
  assert.equal(getReferenceImagePayloadError(["https://example.com/reference.png"]), null);
});
