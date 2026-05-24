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

test("gpt image 2 exposes common portrait and landscape sizes", () => {
  const capability = getModelCapability("12ai:gpt-image-2", "image");

  assert.ok(capability.sizes.some(option => option.value === "1536x1024" && option.label.includes("3:2")));
  assert.ok(capability.sizes.some(option => option.value === "1024x1536" && option.label.includes("2:3")));
  assert.ok(capability.sizes.some(option => option.value === "2048x1536" && option.label.includes("4:3")));
  assert.ok(capability.sizes.some(option => option.value === "1536x2048" && option.label.includes("3:4")));
  assert.ok(capability.sizes.some(option => option.value === "3504x2336" && option.label.includes("3:2 4K")));
  assert.ok(capability.sizes.some(option => option.value === "2336x3504" && option.label.includes("2:3 4K")));
  assert.ok(capability.sizes.some(option => option.value === "3264x2448" && option.label.includes("4:3 4K")));
  assert.ok(capability.sizes.some(option => option.value === "2448x3264" && option.label.includes("3:4 4K")));
});

test("agent chat defaults use 12AI Gemini 3.1 Flash Lite", () => {
  assert.equal(DEFAULT_CHAT_MODEL, "12ai:gemini-3.1-flash-lite-preview");
  assert.equal(DEFAULT_VISION_CHAT_MODEL, "12ai:gemini-3.1-flash-lite-preview");
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === "12ai:gemini-3.1-flash"), false);
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === "12ai:deepseek-v4-flash"), false);
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === DEFAULT_CHAT_MODEL), true);
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === DEFAULT_VISION_CHAT_MODEL), true);
});

test("xstx chat defaults use pricing model identifiers", () => {
  assert.equal(CHAT_MODEL_OPTIONS["xstx"].some(option => option.value === "xstx:claude-opus-4-7"), true);
  assert.equal(CHAT_MODEL_OPTIONS["xstx"].some(option => option.value === "xstx:claude-sonnet-4-6-20260217"), true);
  assert.equal(CHAT_MODEL_OPTIONS["xstx"].some(option => option.value === "xstx:claude-haiku-4-5"), true);
  assert.equal(CHAT_MODEL_OPTIONS["xstx"].some(option => option.value === "xstx:gpt-5.5-pro"), true);
  assert.equal(CHAT_MODEL_OPTIONS["xstx"].some(option => option.value === "xstx:gemini-3.1-pro-high"), true);
  assert.equal(CHAT_MODEL_OPTIONS["xstx"].some(option => option.value === "xstx:deepseek-v4-pro"), true);
  assert.equal(CHAT_MODEL_OPTIONS["xstx"].some(option => option.value === "xstx:claude-haiku-4-5-20251001"), false);
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
