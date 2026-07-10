import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../lib/api/errors";
import { fetchPublicHttpUrl, readResponseBytesWithLimit } from "../lib/api/public-http-fetch";

const publicResolver = async (): Promise<readonly string[]> => ["203.0.114.10"];

test("fetchPublicHttpUrl rejects hostnames resolving to private addresses before fetch", async () => {
  let called = false;
  await assert.rejects(
    () => fetchPublicHttpUrl("https://media.example/image.png", {
      resolver: async () => ["127.0.0.1"],
      requester: async () => {
        called = true;
        return new Response();
      },
    }),
    (error: unknown) => error instanceof ApiError && error.code === "unsafe_remote_url",
  );
  assert.equal(called, false);
});

test("fetchPublicHttpUrl validates redirect targets", async () => {
  await assert.rejects(
    () => fetchPublicHttpUrl("https://media.example/image.png", {
      resolver: publicResolver,
      requester: async () => new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/secret" } }),
    }),
    /local or private network/,
  );
});

test("fetchPublicHttpUrl blocks cross-origin credential redirects", async () => {
  await assert.rejects(
    () => fetchPublicHttpUrl("https://provider.example/file", {
      resolver: publicResolver,
      headers: { Authorization: "Bearer secret" },
      requester: async () => new Response(null, { status: 302, headers: { Location: "https://cdn.example/file" } }),
    }),
    /redirect credentials/,
  );
});

test("fetchPublicHttpUrl passes the validated address to the pinned requester", async () => {
  let requestedAddress = "";
  const response = await fetchPublicHttpUrl("https://media.example/image.png", {
    resolver: async () => ["93.184.216.34"],
    requester: async (_url, address) => {
      requestedAddress = address;
      return new Response("image");
    },
  });
  assert.equal(response.status, 200);
  assert.equal(requestedAddress, "93.184.216.34");
});

test("fetchPublicHttpUrl maps malformed redirects to a typed error", async () => {
  await assert.rejects(
    () => fetchPublicHttpUrl("https://media.example/image.png", {
      resolver: publicResolver,
      requester: async () => new Response(null, { status: 302, headers: { Location: "http://[invalid" } }),
    }),
    (error: unknown) => error instanceof ApiError && error.code === "unsafe_remote_url",
  );
});

test("readResponseBytesWithLimit rejects chunked oversized responses", async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(9));
      controller.close();
    },
  }));
  await assert.rejects(
    () => readResponseBytesWithLimit(response, 16),
    (error: unknown) => error instanceof ApiError && error.code === "remote_payload_too_large",
  );
});
