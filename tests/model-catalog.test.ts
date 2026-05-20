import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_VISION_CHAT_MODEL,
  IMAGE_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  getImageModelCapabilities,
  getModelCapabilities,
  getModelCapability,
  getVideoModelCapabilities,
  parseProviderModel,
  supportsAsyncImageGeneration,
} from "../lib/providers/model-catalog";

test("parseProviderModel reads provider prefixes", () => {
  assert.deepEqual(parseProviderModel("12ai-async:gemini-3.1-flash-image-preview", "12ai"), {
    provider: "12ai",
    model: "gemini-3.1-flash-image-preview",
    async: true,
  });
  assert.deepEqual(parseProviderModel("grok2api:grok-4.20-fast", "12ai"), {
    provider: "grok2api",
    model: "grok-4.20-fast",
    async: false,
  });
});

test("getModelCapability exposes explicit provider capability schema", () => {
  const capability = getModelCapability("12ai-async:gemini-3.1-flash-image-preview", "image");

  assert.equal(capability.provider, "12ai");
  assert.equal(capability.kind, "image");
  assert.equal(capability.supportsAsync, true);
  assert.equal(capability.supportsReferences, true);
  assert.ok(capability.aspectRatios.some(option => option.value === "16:9"));
  assert.ok(capability.sizes.some(option => option.value === "4K"));
  assert.ok(capability.thinkingLevels.some(option => option.value === "minimal"));
});

test("getModelCapabilities filters by kind and provider", () => {
  const grokImageCapabilities = getModelCapabilities("image", "grok2api");

  assert.ok(grokImageCapabilities.length > 0);
  assert.ok(grokImageCapabilities.every(capability => capability.kind === "image"));
  assert.ok(grokImageCapabilities.every(capability => capability.provider === "grok2api"));
});

test("unknown model capability fails fast", () => {
  assert.throws(
    () => getModelCapability("12ai:not-a-real-model", "image"),
    /Unknown provider model capability: 12ai:not-a-real-model/,
  );
});

test("legacy image capability helper remains compatible", () => {
  const capability = getImageModelCapabilities("grok2api:grok-imagine-image-edit");

  assert.deepEqual(capability.aspectRatios, [{ value: "1024x1024", label: "1024x1024" }]);
  assert.deepEqual(capability.imageSizes, []);
  assert.deepEqual(capability.thinkingLevels, []);
});

test("image model selector hides duplicate async variants", () => {
  assert.equal(IMAGE_MODEL_OPTIONS["12ai"].some(option => option.value.startsWith("12ai-async:")), false);
  assert.equal(supportsAsyncImageGeneration("12ai:gemini-3.1-flash-image-preview"), true);
  assert.equal(supportsAsyncImageGeneration("12ai:gpt-image-2"), false);
});

test("agent chat defaults use 12AI DeepSeek and Gemini vision", () => {
  assert.equal(DEFAULT_CHAT_MODEL, "12ai:deepseek-v4-flash");
  assert.equal(DEFAULT_VISION_CHAT_MODEL, "12ai:gemini-3.1-flash");
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === "12ai:gpt-5.1"), false);
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === DEFAULT_CHAT_MODEL), true);
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === DEFAULT_VISION_CHAT_MODEL), true);
});

test("video model selector exposes auto size", () => {
  assert.equal(VIDEO_MODEL_OPTIONS["12ai"].length > 0, true);
  const twelveAiVideo = getModelCapability("12ai:veo_3_1-fast", "video");
  const twelveAiFirstLastVideo = getModelCapability("12ai:veo_3_1-fast-fl", "video");
  const grokVideo = getModelCapability("grok2api:grok-imagine-video", "video");

  assert.equal(twelveAiVideo.sizes[0]?.value, "auto");
  assert.equal(twelveAiVideo.videoReferenceMode, "reference");
  assert.equal(twelveAiVideo.maxReferenceImages, 3);
  assert.equal(twelveAiFirstLastVideo.videoReferenceMode, "firstLast");
  assert.equal(twelveAiFirstLastVideo.minReferenceImages, 1);
  assert.equal(twelveAiFirstLastVideo.maxReferenceImages, 2);
  assert.equal(grokVideo.sizes[0]?.value, "auto");
  assert.equal(grokVideo.videoReferenceMode, "reference");
  assert.equal(grokVideo.maxReferenceImages, 7);
  assert.equal(getVideoModelCapabilities("12ai:veo_3_1-fast-fl").referenceMode, "firstLast");
});
