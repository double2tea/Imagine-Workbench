import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../lib/api/errors";
import { readBoundedJsonRequest } from "../lib/api/request-body";

test("readBoundedJsonRequest rejects chunked bodies over the limit", async () => {
  const encoder = new TextEncoder();
  const request = new Request("https://local.test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"value":"'));
        controller.enqueue(encoder.encode("x".repeat(32)));
        controller.enqueue(encoder.encode('"}'));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  await assert.rejects(
    () => readBoundedJsonRequest(request, 16),
    (error: unknown) => error instanceof ApiError && error.status === 413 && error.code === "payload_too_large",
  );
});

test("readBoundedJsonRequest rejects malformed Content-Length", async () => {
  const request = new Request("https://local.test", {
    method: "POST",
    headers: { "Content-Length": "unknown" },
    body: "{}",
  });
  await assert.rejects(
    () => readBoundedJsonRequest(request, 16),
    (error: unknown) => error instanceof ApiError && error.code === "invalid_content_length",
  );
});

test("readBoundedJsonRequest parses a bounded JSON body", async () => {
  const request = new Request("https://local.test", { method: "POST", body: '{"ok":true}' });
  assert.deepEqual(await readBoundedJsonRequest(request, 32), { ok: true });
});
