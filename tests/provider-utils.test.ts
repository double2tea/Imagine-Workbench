import assert from "node:assert/strict";
import test from "node:test";

import { formatDisplayedAspectRatio } from "../lib/media-display";
import { readRunningHubNodeInfoList } from "../lib/providers/runninghub-node-info";
import {
  aspectRatioToOpenAiSize,
  aspectRatioToVideoSize,
  authHeaders,
  openAiCompatibleUrl,
  parseProviderResponseBody,
  resolveProviderConfig,
} from "../lib/providers/utils";

test("parseProviderResponseBody parses JSON response text", () => {
  assert.deepEqual(parseProviderResponseBody('{"ok":true}'), { ok: true });
});

test("parseProviderResponseBody converts plain text provider errors", () => {
  assert.deepEqual(parseProviderResponseBody("error code: 502"), { error: "error code: 502" });
});

test("authHeaders uses MiMo api-key header", () => {
  assert.deepEqual(authHeaders({
    provider: "mimo",
    apiKey: "mimo_key",
    baseUrl: "https://api.xiaomimimo.com",
    videoBaseUrl: "https://api.xiaomimimo.com",
  }), { "api-key": "mimo_key" });
  assert.deepEqual(authHeaders({
    provider: "12ai",
    apiKey: "twelve_key",
    baseUrl: "https://cdn.12ai.org",
    videoBaseUrl: "https://new.12ai.org",
  }), { Authorization: "Bearer twelve_key" });
});

test("resolveProviderConfig routes MiMo keys by prefix", () => {
  const standardConfig = resolveProviderConfig(
    new Request("https://local.test", { headers: { "x-ai-api-key": " sk_standard_key " } }),
    "mimo",
  );
  assert.equal(standardConfig.apiKey, "sk_standard_key");
  assert.equal(standardConfig.baseUrl, "https://api.xiaomimimo.com");

  const tokenPlanConfig = resolveProviderConfig(
    new Request("https://local.test", { headers: { "x-ai-api-key": "tp-token-plan-key" } }),
    "mimo",
  );
  assert.equal(tokenPlanConfig.baseUrl, "https://token-plan-cn.xiaomimimo.com/v1");

  const tokenPlanSgpConfig = resolveProviderConfig(
    new Request("https://local.test", {
      headers: {
        "x-ai-api-key": "tp-token-plan-key",
        "x-ai-base-url": " https://token-plan-sgp.xiaomimimo.com/v1/ ",
      },
    }),
    "mimo",
  );
  assert.equal(tokenPlanSgpConfig.baseUrl, "https://token-plan-sgp.xiaomimimo.com/v1");
});

test("resolveProviderConfig accepts OpenAI-compatible bearer auth", () => {
  const config = resolveProviderConfig(
    new Request("https://local.test", { headers: { Authorization: " Bearer bearer_key " } }),
    "mimo",
  );
  assert.equal(config.apiKey, "bearer_key");
});

test("openAiCompatibleUrl supports root and v1 base URLs", () => {
  assert.equal(
    openAiCompatibleUrl("https://api.xiaomimimo.com", "/v1/chat/completions"),
    "https://api.xiaomimimo.com/v1/chat/completions",
  );
  assert.equal(
    openAiCompatibleUrl("https://token-plan-cn.xiaomimimo.com/v1", "/v1/chat/completions"),
    "https://token-plan-cn.xiaomimimo.com/v1/chat/completions",
  );
});

test("grok2api image sizes preserve selected dimensions", () => {
  assert.equal(aspectRatioToOpenAiSize("1280x720"), "1280x720");
  assert.equal(aspectRatioToOpenAiSize("720x1280"), "720x1280");
});

test("grok2api video sizes preserve selected dimensions", () => {
  assert.equal(aspectRatioToVideoSize("1792x1024", "grok2api"), "1792x1024");
  assert.equal(aspectRatioToVideoSize("1024x1792", "grok2api"), "1024x1792");
});

test("video pixel dimensions display as aspect ratios", () => {
  assert.equal(formatDisplayedAspectRatio({ type: "video", aspectRatio: "1280x720" }), "16:9");
  assert.equal(formatDisplayedAspectRatio({ type: "video", aspectRatio: "1792x1024" }), "7:4");
  assert.equal(formatDisplayedAspectRatio({ type: "image", aspectRatio: "1792x1024" }), "1792x1024");
});

test("readRunningHubNodeInfoList parses route binding payloads", () => {
  assert.deepEqual(
    readRunningHubNodeInfoList([
      {
        nodeId: "12",
        fieldName: "voice",
        label: "Voice",
        source: "reference",
        valueType: "audio",
        referenceIndex: 1,
        referenceType: "audio",
        deliveryMode: "url",
        enabled: false,
        required: true,
      },
      { nodeId: "", fieldName: "skip" },
    ]),
    [
      {
        nodeId: "12",
        fieldName: "voice",
        label: "Voice",
        source: "reference",
        valueType: "audio",
        referenceIndex: 1,
        referenceType: "audio",
        deliveryMode: "url",
        enabled: false,
        required: true,
        value: undefined,
      },
    ],
  );
});
