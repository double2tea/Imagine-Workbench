import assert from "node:assert/strict";
import test from "node:test";

import {
  mediaReferenceFileExtension,
  mediaReferenceTypeFromBase64DataUri,
} from "../lib/media-references";
import {
  REFERENCE_IMAGE_COMPRESSION_POLICY,
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_MAX_EDGE,
  REFERENCE_IMAGE_MAX_ORIGINAL_TRANSCODE_EDGE,
  REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES,
  REFERENCE_IMAGES_MAX_TOTAL_BYTES,
  buildReferenceImageCompressionAttempts,
  dataUriByteSize,
  getReferenceImagePayloadError,
  getReferenceMediaPayloadError,
  scaleImageDimensions,
} from "../lib/reference-images";

function makeDataUri(byteCount: number, mimeType = "image/webp"): string {
  const triples = Math.floor(byteCount / 3);
  const remainder = byteCount % 3;
  const suffix = remainder === 1 ? "AA==" : remainder === 2 ? "AAA=" : "";
  return `data:${mimeType};base64,${"A".repeat(triples * 4)}${suffix}`;
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

test("reference image compression attempts transcode at original dimensions before resizing", () => {
  const attempts = buildReferenceImageCompressionAttempts(3000, 1500);

  assert.deepEqual(attempts.slice(0, 4), [
    { width: 3000, height: 1500, outputType: "image/webp", quality: 0.85 },
    { width: 3000, height: 1500, outputType: "image/webp", quality: 0.75 },
    { width: 3000, height: 1500, outputType: "image/webp", quality: 0.65 },
    { width: 3000, height: 1500, outputType: "image/webp", quality: 0.55 },
  ]);
  assert.deepEqual(attempts.slice(4, 8), [
    { width: 2048, height: 1024, outputType: "image/webp", quality: 0.85 },
    { width: 2048, height: 1024, outputType: "image/webp", quality: 0.75 },
    { width: 2048, height: 1024, outputType: "image/webp", quality: 0.65 },
    { width: 2048, height: 1024, outputType: "image/webp", quality: 0.55 },
  ]);
  assert.deepEqual(attempts[8], { width: 1638, height: 819, outputType: "image/webp", quality: 0.85 });
  assert.deepEqual(attempts.at(-1), { width: 1024, height: 512, outputType: "image/webp", quality: 0.55 });
});

test("reference image compression attempts skip original dimensions above browser-safe limits", () => {
  const attempts = buildReferenceImageCompressionAttempts(REFERENCE_IMAGE_MAX_ORIGINAL_TRANSCODE_EDGE + 1, 3000);

  assert.deepEqual(attempts[0], { width: 2048, height: 1500, outputType: "image/webp", quality: 0.85 });
});

test("reference image compression attempts dedupe unchanged small dimensions", () => {
  const attempts = buildReferenceImageCompressionAttempts(400, 300);

  assert.equal(attempts.length, REFERENCE_IMAGE_COMPRESSION_POLICY.qualitySteps.length);
  assert.deepEqual(attempts.map(attempt => `${attempt.width}x${attempt.height}`), ["400x300", "400x300", "400x300", "400x300"]);
});

test("reference image compression attempts resize only after original-dimension transcode", () => {
  const attempts = buildReferenceImageCompressionAttempts(800, 600);

  assert.equal(attempts.length, REFERENCE_IMAGE_COMPRESSION_POLICY.qualitySteps.length);
  assert.deepEqual(attempts.map(attempt => `${attempt.width}x${attempt.height}`), ["800x600", "800x600", "800x600", "800x600"]);
});

test("dataUriByteSize reads base64 payload bytes", () => {
  assert.equal(dataUriByteSize(makeDataUri(5)), 5);
});

test("getReferenceImagePayloadError rejects one oversized data URI", () => {
  const error = getReferenceImagePayloadError([makeDataUri(REFERENCE_IMAGE_MAX_BYTES + 1)]);

  assert.match(error ?? "", /单张参考图/);
});

test("getReferenceImagePayloadError rejects oversized data URI totals", () => {
  const quarterTotal = Math.floor(REFERENCE_IMAGES_MAX_TOTAL_BYTES / 4) + 1;
  const error = getReferenceImagePayloadError([
    makeDataUri(quarterTotal),
    makeDataUri(quarterTotal),
    makeDataUri(quarterTotal),
    makeDataUri(quarterTotal),
    makeDataUri(quarterTotal),
  ]);

  assert.match(error ?? "", /参考图总大小/);
});

test("getReferenceImagePayloadError ignores remote references", () => {
  assert.equal(getReferenceImagePayloadError(["https://example.com/reference.png"]), null);
});

test("getReferenceMediaPayloadError allows large video within request total", () => {
  const error = getReferenceMediaPayloadError([makeDataUri(REFERENCE_IMAGE_MAX_BYTES + 1, "video/mp4")]);

  assert.equal(error, null);
});

test("getReferenceMediaPayloadError rejects oversized media totals", () => {
  const halfTotal = Math.floor(REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES / 2) + 1;
  const error = getReferenceMediaPayloadError([
    makeDataUri(halfTotal, "video/mp4"),
    makeDataUri(halfTotal, "audio/mpeg"),
  ]);

  assert.match(error ?? "", /参考媒体总大小/);
});

test("media base64 data URI type detection rejects non-base64 data URI", () => {
  assert.equal(mediaReferenceTypeFromBase64DataUri("data:video/mp4,not-base64"), null);
  assert.equal(mediaReferenceTypeFromBase64DataUri(makeDataUri(5, "audio/ogg")), "audio");
});

test("mediaReferenceFileExtension preserves imported audio formats", () => {
  assert.equal(mediaReferenceFileExtension("audio/wav", "audio"), "wav");
  assert.equal(mediaReferenceFileExtension("audio/ogg", "audio"), "ogg");
});
