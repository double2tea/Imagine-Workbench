import assert from "node:assert/strict";
import test from "node:test";

import { aspectRatioToOpenAiSize, aspectRatioToVideoSize, parseProviderResponseBody } from "../lib/providers/utils";

test("parseProviderResponseBody parses JSON response text", () => {
  assert.deepEqual(parseProviderResponseBody('{"ok":true}'), { ok: true });
});

test("parseProviderResponseBody converts plain text provider errors", () => {
  assert.deepEqual(parseProviderResponseBody("error code: 502"), { error: "error code: 502" });
});

test("grok2api image sizes preserve selected dimensions", () => {
  assert.equal(aspectRatioToOpenAiSize("1280x720"), "1280x720");
  assert.equal(aspectRatioToOpenAiSize("720x1280"), "720x1280");
});

test("grok2api video sizes preserve selected dimensions", () => {
  assert.equal(aspectRatioToVideoSize("1792x1024", "grok2api"), "1792x1024");
  assert.equal(aspectRatioToVideoSize("1024x1792", "grok2api"), "1024x1792");
});
