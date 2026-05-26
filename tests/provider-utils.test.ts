import assert from "node:assert/strict";
import test from "node:test";

import { parseProviderResponseBody } from "../lib/providers/utils";

test("parseProviderResponseBody parses JSON response text", () => {
  assert.deepEqual(parseProviderResponseBody('{"ok":true}'), { ok: true });
});

test("parseProviderResponseBody converts plain text provider errors", () => {
  assert.deepEqual(parseProviderResponseBody("error code: 502"), { error: "error code: 502" });
});
