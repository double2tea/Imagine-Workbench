import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_VISION_CHAT_MODEL,
  IMAGE_MODEL_OPTIONS,
  VIDEO_MODEL_OPTIONS,
  getImageModelCapabilities,
  getImageResolutionOptions,
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

test("grok2api image references are limited to the edit model", () => {
  const grokImage = getModelCapability("grok2api:grok-imagine-image", "image");
  const grokImageEdit = getModelCapability("grok2api:grok-imagine-image-edit", "image");

  assert.equal(grokImage.supportsReferences, false);
  assert.equal(grokImageEdit.supportsReferences, true);
  assert.deepEqual(grokImageEdit.sizes, [{ value: "1024x1024", label: "1K" }]);
});

test("unknown model capability fails fast", () => {
  assert.throws(
    () => getModelCapability("12ai:not-a-real-model", "image"),
    /Unknown provider model capability: 12ai:not-a-real-model/,
  );
});

test("image capability helper separates aspect ratios from requestable resolutions", () => {
  const capability = getImageModelCapabilities("grok2api:grok-imagine-image-edit");

  assert.deepEqual(capability.aspectRatios, [{ value: "1:1", label: "1:1 Square" }]);
  assert.deepEqual(getImageResolutionOptions("grok2api:grok-imagine-image-edit", "1:1"), [
    { value: "1024x1024", label: "1K" },
  ]);
  assert.deepEqual(capability.qualities, []);
  assert.deepEqual(capability.thinkingLevels, []);
});

test("image model selector hides duplicate async variants", () => {
  assert.equal(IMAGE_MODEL_OPTIONS["12ai"].some(option => option.value.startsWith("12ai-async:")), false);
  assert.equal(supportsAsyncImageGeneration("12ai:gemini-2.5-flash-image"), true);
  assert.equal(supportsAsyncImageGeneration("12ai:gemini-3.1-flash-image-preview"), true);
  assert.equal(supportsAsyncImageGeneration("12ai:gpt-image-2"), false);
});

test("gpt image 2 exposes common portrait and landscape sizes", () => {
  const capability = getModelCapability("12ai:gpt-image-2", "image");

  assert.ok(capability.sizes.some(option => option.value === "1536x1024" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "1024x1536" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "2048x1536" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "1536x2048" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "2880x2880" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "2560x1440" && option.label === "2.5K"));
  assert.ok(capability.sizes.some(option => option.value === "3504x2336" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "2336x3504" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "3264x2448" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "2448x3264" && option.label === "4K"));
});

test("image resolution labels hide pixel dimensions while keeping request values", () => {
  assert.deepEqual(getImageResolutionOptions("12ai:gpt-image-2", "16:9"), [
    { value: "auto", label: "Auto" },
    { value: "2048x1152", label: "2K" },
    { value: "2560x1440", label: "2.5K" },
    { value: "3840x2160", label: "4K" },
    { value: "custom", label: "自定义尺寸" },
  ]);

  assert.deepEqual(getImageResolutionOptions("12ai:gpt-image-2", "1:1"), [
    { value: "auto", label: "Auto" },
    { value: "1024x1024", label: "1K" },
    { value: "2048x2048", label: "2K" },
    { value: "2880x2880", label: "4K" },
    { value: "custom", label: "自定义尺寸" },
  ]);

  const grokLandscapeLabels = getImageResolutionOptions("grok2api:grok-imagine-image", "16:9").map(
    option => option.label,
  );
  assert.deepEqual(grokLandscapeLabels, ["720p"]);
  assert.equal(grokLandscapeLabels.some(label => label.includes("x")), false);
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
  const twelveAiOmniVideo = getModelCapability("12ai:omni_flash-10s", "video");
  const grokVideo = getModelCapability("grok2api:grok-imagine-video", "video");

  assert.equal(VIDEO_MODEL_OPTIONS["12ai"].some(option => option.value === "12ai:omni_flash-10s"), true);
  assert.equal(twelveAiVideo.sizes[0]?.value, "auto");
  assert.equal(twelveAiVideo.videoReferenceMode, "reference");
  assert.equal(twelveAiVideo.maxReferenceImages, 3);
  assert.equal(twelveAiFirstLastVideo.videoReferenceMode, "firstLast");
  assert.equal(twelveAiFirstLastVideo.minReferenceImages, 1);
  assert.equal(twelveAiFirstLastVideo.maxReferenceImages, 2);
  assert.deepEqual(twelveAiOmniVideo.sizes.map(option => option.value), ["auto", "1280x720", "720x1280"]);
  assert.equal(twelveAiOmniVideo.videoReferenceMode, "reference");
  assert.equal(twelveAiOmniVideo.maxReferenceImages, 7);
  assert.equal(grokVideo.sizes[0]?.value, "auto");
  assert.equal(grokVideo.sizes.some(option => option.value === "1280x720" && option.label.includes("16:9")), true);
  assert.deepEqual(grokVideo.resolutions.map(option => option.value), ["720p", "480p"]);
  assert.deepEqual(grokVideo.durations.map(option => option.value), ["6", "10", "12", "16", "20"]);
  assert.deepEqual(grokVideo.presets.map(option => option.value), ["normal", "fun", "spicy", "custom"]);
  assert.equal(grokVideo.videoReferenceMode, "reference");
  assert.equal(grokVideo.maxReferenceImages, 7);
  assert.equal(getVideoModelCapabilities("12ai:veo_3_1-fast-fl").referenceMode, "firstLast");
});
