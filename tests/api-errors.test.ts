import assert from "node:assert/strict";
import test from "node:test";

import { audioOperationApiError } from "../lib/api/audio-errors";
import { ApiError, apiErrorResponse, badRequest, requireApiText } from "../lib/api/errors";

test("requireApiText maps missing values to a structured 400 error", () => {
  assert.throws(
    () => requireApiText("  ", "operationName"),
    (error: unknown) => {
      assert.equal(error instanceof ApiError, true);
      if (!(error instanceof ApiError)) return false;
      assert.equal(error.status, 400);
      assert.equal(error.code, "missing_required_field");
      assert.equal(error.message, "operationName is required");
      return true;
    },
  );
});

test("apiErrorResponse preserves explicit API status and code", () => {
  const response = apiErrorResponse(
    badRequest("provider must be a valid provider key", "invalid_provider"),
    "Failed",
  );

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "provider must be a valid provider key",
    code: "invalid_provider",
  });
});

test("apiErrorResponse converts unknown failures to internal errors", () => {
  const response = apiErrorResponse(new Error("Provider failed"), "Failed");

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    error: "Provider failed",
    code: "internal_error",
  });
});

test("audioOperationApiError maps audio operation request errors to structured 400s", () => {
  const error = audioOperationApiError(new Error("MiMo voice clone requires exactly one audio reference"));

  assert.equal(error instanceof ApiError, true);
  if (!(error instanceof ApiError)) return;
  assert.equal(error.status, 400);
  assert.equal(error.code, "invalid_reference_media_count");
  assert.equal(error.message, "MiMo voice clone requires exactly one audio reference");
});

test("audioOperationApiError maps unsupported audio operations to structured 400s", () => {
  const error = audioOperationApiError(new Error("runninghub audio operation is not supported yet"));

  assert.equal(error instanceof ApiError, true);
  if (!(error instanceof ApiError)) return;
  assert.equal(error.status, 400);
  assert.equal(error.code, "unsupported_audio_operation");
});

test("audioOperationApiError ignores provider runtime failures", () => {
  assert.equal(audioOperationApiError(new Error("Provider failed")), null);
});
