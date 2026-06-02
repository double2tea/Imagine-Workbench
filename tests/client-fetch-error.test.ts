import assert from "node:assert/strict";
import test from "node:test";

import { readFetchError } from "../lib/client-fetch-error";

test("readFetchError prefers JSON error messages", async () => {
  const response = new Response(JSON.stringify({ error: "Provider failed" }), { status: 500 });

  assert.equal(await readFetchError(response, "请求失败"), "Provider failed");
});

test("readFetchError summarizes non-JSON error responses", async () => {
  const response = new Response("<html><body><h1>500</h1><p>Maximum call stack size exceeded</p></body></html>", {
    status: 500,
  });

  assert.equal(
    await readFetchError(response, "图片生成请求失败"),
    "图片生成请求失败 (HTTP 500): 500 Maximum call stack size exceeded",
  );
});
