import assert from "node:assert/strict";
import test from "node:test";

import {
  isCustomProviderDefinition,
  normalizeCustomProviderBaseUrl,
  normalizeCustomProviderDefinition,
} from "../lib/providers/custom-providers";
import { listProviderModels } from "../lib/providers/models";
import { resolveProviderApiKey } from "../lib/providers/registry";
import type { ProviderConfig } from "../lib/providers/types";

test("custom provider base URLs are normalized and require http protocols", () => {
  assert.equal(normalizeCustomProviderBaseUrl(" https://example.test/api/// "), "https://example.test/api");
  assert.equal(
    normalizeCustomProviderDefinition({ key: "custom-provider", label: " Local ", baseUrl: "http://localhost:8080/v1/" }).baseUrl,
    "http://localhost:8080/v1",
  );

  assert.throws(() => normalizeCustomProviderBaseUrl("ftp://example.test"), /http 或 https/);
  assert.throws(() => normalizeCustomProviderBaseUrl("not a url"), /格式无效/);
});

test("custom provider definitions reject malformed base URLs", () => {
  assert.equal(isCustomProviderDefinition({ key: "custom-provider", label: "Local", baseUrl: "https://example.test" }), true);
  assert.equal(isCustomProviderDefinition({ key: "custom-provider", label: "Local", baseUrl: "javascript:alert(1)" }), false);
  assert.equal(isCustomProviderDefinition({ key: "custom-provider", label: "Local", baseUrl: "example.test" }), false);
});

test("custom provider model listing does not duplicate v1 in base URLs", async () => {
  const config: ProviderConfig = {
    provider: "localai",
    providerLabel: "LocalAI",
    apiKey: "local_key",
    baseUrl: "https://example.test/v1",
    videoBaseUrl: "https://example.test/v1",
  };
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    urls.push(input.toString());
    return Response.json({ data: [{ id: "gpt-4o" }] });
  };

  try {
    const models = await listProviderModels(config, "chat");
    assert.deepEqual(urls, ["https://example.test/v1/models"]);
    assert.deepEqual(models, [{ value: "localai:gpt-4o", label: "LocalAI gpt-4o" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("custom providers do not read the global AI_API_KEY", () => {
  const originalGlobalKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "global_openai_key";

  try {
    assert.equal(resolveProviderApiKey("localai"), "");
  } finally {
    if (originalGlobalKey === undefined) {
      delete process.env.AI_API_KEY;
    } else {
      process.env.AI_API_KEY = originalGlobalKey;
    }
  }
});
