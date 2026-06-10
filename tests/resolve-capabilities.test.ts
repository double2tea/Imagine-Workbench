import assert from "node:assert/strict";
import test from "node:test";

import { getResolveBridgeCapabilities } from "../lib/api/resolve-capabilities";
import { GET } from "../app/api/resolve/capabilities/route";

test("Resolve bridge capabilities describe supported operations without provider execution", async () => {
  const capabilities = getResolveBridgeCapabilities();

  assert.equal(capabilities.name, "imagine-resolve-bridge");
  assert.deepEqual(capabilities.clientModes, ["external", "in_resolve"]);
  assert.equal(capabilities.routes.status, "/api/media/status");
  assert.ok(capabilities.operations.some(operation =>
    operation.id === "generate_image" &&
    operation.route.path === "/v1/images/generations" &&
    operation.async === false
  ));
  assert.ok(capabilities.operations.some(operation =>
    operation.id === "generate_video" &&
    operation.route.path === "/api/media/generate-video" &&
    operation.async === true
  ));
  assert.ok(capabilities.operations.some(operation =>
    operation.id === "transcribe" &&
    operation.resultKind === "transcript" &&
    operation.requiresPrompt === false
  ));
});

test("Resolve capabilities route returns the bridge contract", async () => {
  const response = GET();
  assert.equal(response.status, 200);

  const body = await response.json() as { name?: unknown; operations?: Array<{ id?: unknown }> };
  assert.equal(body.name, "imagine-resolve-bridge");
  assert.ok(body.operations?.some(operation => operation.id === "tts"));
});
