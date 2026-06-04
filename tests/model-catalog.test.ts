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
import { getGenerationReferenceMedia } from "../lib/db";
import { BOARD_PORT_IDS, resolveBoardConnectionKind } from "../lib/board/ports";
import type { BoardNode } from "../lib/board/types";

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

test("generation request reference media migrates legacy reference images", () => {
  assert.deepEqual(
    getGenerationReferenceMedia({
      prompt: "legacy",
      model: "m",
      aspectRatio: "1:1",
      referenceImages: ["data:video/mp4;base64,dmVv", "https://example.test/ref.png"],
    }),
    [
      { url: "data:video/mp4;base64,dmVv", type: "video" },
      { url: "https://example.test/ref.png", type: "image" },
    ],
  );
  assert.deepEqual(
    getGenerationReferenceMedia({
      prompt: "typed",
      model: "m",
      aspectRatio: "16:9",
      referenceMedia: [{ url: "data:audio/mpeg;base64,YQ==", type: "audio", role: "general" }],
    }),
    [{ url: "data:audio/mpeg;base64,YQ==", type: "audio", role: "general" }],
  );
});

test("board reference groups preserve media types for generate connections", () => {
  const groupNode: BoardNode = {
    id: "group_1",
    kind: "reference-group",
    title: "Media refs",
    position: { x: 0, y: 0 },
    size: { width: 280, height: 180 },
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    references: [
      { assetId: "a1", model: "m", prompt: "audio", role: "general", type: "audio", url: "data:audio/mpeg;base64,YQ==" },
    ],
  };
  const videoNode: BoardNode = {
    id: "video_1",
    kind: "video-generate",
    title: "Video",
    position: { x: 320, y: 0 },
    size: { width: 320, height: 240 },
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    prompt: "",
    model: "runninghub:api:/openapi/v2/bytedance/seedance-2.0-global/multimodal-video",
    aspectRatio: "16:9",
    variantCount: 1,
    status: "idle",
  };

  assert.equal(
    resolveBoardConnectionKind(
      [groupNode, videoNode],
      { nodeId: groupNode.id, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" },
      { nodeId: videoNode.id, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" },
    ),
    "reference",
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
  assert.equal(supportsAsyncImageGeneration("12ai:gpt-image-2"), true);
  assert.equal(getModelCapability("12ai-async:gpt-image-2", "image").supportsReferences, false);
});

test("gpt image 2 exposes common portrait and landscape sizes", () => {
  const capability = getModelCapability("12ai:gpt-image-2", "image");

  assert.ok(capability.sizes.some(option => option.value === "512x512" && option.label === "512p"));
  assert.ok(capability.sizes.some(option => option.value === "1536x1024" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "1024x1536" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "1792x1008" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "1008x1792" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "1792x1024" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "1024x1792" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "2048x1536" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "1536x2048" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "2304x1728" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "1728x2304" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "2880x2880" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "2560x1440" && option.label === "2.5K"));
  assert.ok(capability.sizes.some(option => option.value === "2496x1664" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "1664x2496" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "3504x2336" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "2336x3504" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "3264x2448" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "2448x3264" && option.label === "4K"));
});

test("image resolution labels hide pixel dimensions while keeping request values", () => {
  assert.deepEqual(getImageResolutionOptions("12ai:gpt-image-2", "16:9"), [
    { value: "auto", label: "Auto" },
    { value: "1792x1008", label: "1K" },
    { value: "2048x1152", label: "2K" },
    { value: "2560x1440", label: "2.5K" },
    { value: "3840x2160", label: "4K" },
    { value: "custom", label: "自定义尺寸" },
  ]);

  assert.deepEqual(getImageResolutionOptions("12ai:gpt-image-2", "1:1"), [
    { value: "auto", label: "Auto" },
    { value: "512x512", label: "512p" },
    { value: "1024x1024", label: "1K" },
    { value: "2048x2048", label: "2K" },
    { value: "2880x2880", label: "4K" },
    { value: "custom", label: "自定义尺寸" },
  ]);

  assert.deepEqual(getImageResolutionOptions("12ai:gpt-image-2", "7:4"), [
    { value: "auto", label: "Auto" },
    { value: "1792x1024", label: "1K" },
    { value: "custom", label: "自定义尺寸" },
  ]);

  const grokLandscapeLabels = getImageResolutionOptions("grok2api:grok-imagine-image", "16:9").map(
    option => option.label,
  );
  assert.deepEqual(grokLandscapeLabels, ["720p"]);
  assert.equal(grokLandscapeLabels.some(label => label.includes("x")), false);
});

test("modelscope qwen image exposes documented aspect ratio sizes", () => {
  assert.deepEqual(getImageResolutionOptions("modelscope:Qwen/Qwen-Image", "4:3"), [
    { value: "1472x1140", label: "1K" },
  ]);
  assert.deepEqual(getImageResolutionOptions("modelscope:Qwen/Qwen-Image", "3:4"), [
    { value: "1140x1472", label: "1K" },
  ]);
  assert.deepEqual(getImageResolutionOptions("modelscope:Qwen/Qwen-Image", "3:2"), [
    { value: "1584x1056", label: "1K" },
  ]);
  assert.deepEqual(getImageResolutionOptions("modelscope:Qwen/Qwen-Image", "2:3"), [
    { value: "1056x1584", label: "1K" },
  ]);
});

test("runninghub exposes concrete standard model capabilities", () => {
  assert.equal(IMAGE_MODEL_OPTIONS["runninghub"][0]?.value, "runninghub:api:/openapi/v2/seedream-v5-lite/text-to-image");
  assert.equal(VIDEO_MODEL_OPTIONS["runninghub"][0]?.value, "runninghub:api:/openapi/v2/minimax/hailuo-02/standard");
  assert.equal(
    IMAGE_MODEL_OPTIONS["runninghub"].some(
      option => option.value === "runninghub:api:/openapi/v2/seedream-v5-lite/text-to-image",
    ),
    true,
  );
  assert.equal(
    VIDEO_MODEL_OPTIONS["runninghub"].some(
      option => option.value === "runninghub:api:/openapi/v2/minimax/hailuo-02/standard",
    ),
    true,
  );

  const image = getModelCapability("runninghub:api:/openapi/v2/rhart-image/f-2-dev/text-to-image", "image");
  const video = getModelCapability("runninghub:api:/openapi/v2/minimax/hailuo-02/standard", "video");
  const imageToImage = getModelCapability("runninghub:api:/openapi/v2/seedream-v5-lite/image-to-image", "image");
  const i2v = getModelCapability("runninghub:api:/openapi/v2/minimax/hailuo-02/i2v-standard", "video");
  const seedance = getModelCapability("runninghub:api:/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video", "video");
  const seedanceI2v = getModelCapability(
    "runninghub:api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video",
    "video",
  );
  const seedanceFastMultimodal = getModelCapability(
    "runninghub:api:/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video",
    "video",
  );
  const seedanceMultimodal = getModelCapability(
    "runninghub:api:/openapi/v2/bytedance/seedance-2.0-global/multimodal-video",
    "video",
  );
  const omniFlash = getModelCapability("runninghub:api:/openapi/v2/gemini-omni-flash/image-to-video", "video");
  const omniFlashVideoEdit = getModelCapability("runninghub:api:/openapi/v2/gemini-omni-flash/video-edit", "video");
  const veo = getModelCapability("runninghub:api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video", "video");
  const veoStartEndHidden = "runninghub:api:/openapi/v2/rhart-video-v3.1-fast/start-end-to-video";
  const gptImage = getModelCapability("runninghub:api:/openapi/v2/rhart-image-g-2-official/text-to-image", "image");
  const gptImageEditHidden = "runninghub:api:/openapi/v2/rhart-image-g-2-official/image-to-image";
  const youchuan = getModelCapability("runninghub:api:/openapi/v2/youchuan/text-to-image-v81", "image");
  assert.equal(image.supportsReferences, false);
  assert.equal(imageToImage.supportsReferences, true);
  assert.equal(imageToImage.maxReferenceImages, 14);
  assert.equal(getImageModelCapabilities("runninghub:api:/openapi/v2/seedream-v5-lite/image-to-image").maxReferenceImages, 14);
  assert.deepEqual(
    getImageModelCapabilities("runninghub:api:/openapi/v2/seedream-v5-lite/image-to-image").referenceMediaTypes,
    ["image"],
  );
  assert.equal(video.videoReferenceMode, "none");
  assert.deepEqual(video.durations.map(option => option.value), ["6", "10"]);
  assert.equal(i2v.videoReferenceMode, "firstLast");
  assert.equal(i2v.minReferenceImages, 1);
  assert.equal(i2v.maxReferenceImages, 2);
  assert.deepEqual(seedance.durations.map(option => option.value), ["5", "8", "10", "12", "15"]);
  assert.equal(seedanceI2v.videoReferenceMode, "firstLast");
  assert.equal(seedanceI2v.maxReferenceImages, 2);
  assert.deepEqual(seedanceFastMultimodal.referenceMediaTypes, ["image", "video", "audio"]);
  assert.deepEqual(seedanceMultimodal.referenceMediaTypes, ["image", "video", "audio"]);
  assert.equal(omniFlash.maxReferenceImages, 3);
  assert.deepEqual(omniFlash.resolutions.map(option => option.value), ["720p", "1080p", "4k"]);
  assert.deepEqual(omniFlashVideoEdit.referenceMediaTypes, ["image", "video"]);
  assert.equal(veo.videoReferenceMode, "reference");
  assert.equal(veo.maxReferenceImages, 3);
  assert.deepEqual(veo.durations.map(option => option.value), ["4", "6", "8"]);
  assert.equal(VIDEO_MODEL_OPTIONS["runninghub"].some(option => option.value === veoStartEndHidden), false);
  assert.equal(gptImage.maxReferenceImages, 14);
  assert.equal(gptImage.supportsReferences, true);
  assert.equal(IMAGE_MODEL_OPTIONS["runninghub"].some(option => option.value === gptImageEditHidden), false);
  assert.equal(youchuan.supportsReferences, false);
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

test("agnes provider exposes documented chat image and video models", () => {
  assert.equal(CHAT_MODEL_OPTIONS["agnes"].some(option => option.value === "agnes:agnes-2.0-flash"), true);
  assert.equal(CHAT_MODEL_OPTIONS["agnes"].some(option => option.value === "agnes:agnes-1.5-flash"), true);
  assert.equal(IMAGE_MODEL_OPTIONS["agnes"].some(option => option.value === "agnes:agnes-image-2.1-flash"), true);
  assert.equal(VIDEO_MODEL_OPTIONS["agnes"].some(option => option.value === "agnes:agnes-video-v2.0"), true);

  const image = getModelCapability("agnes:agnes-image-2.1-flash", "image");
  const video = getModelCapability("agnes:agnes-video-v2.0", "video");
  assert.equal(image.supportsReferences, true);
  assert.deepEqual(getImageResolutionOptions("agnes:agnes-image-2.1-flash", "4:3"), [
    { value: "1024x768", label: "720p" },
    { value: "custom", label: "自定义尺寸" },
  ]);
  assert.deepEqual(getImageResolutionOptions("agnes:agnes-image-2.1-flash", "16:9"), [
    { value: "1280x720", label: "720p" },
    { value: "custom", label: "自定义尺寸" },
  ]);
  assert.deepEqual(getImageResolutionOptions("agnes:agnes-image-2.1-flash", "3:2"), [
    { value: "1152x768", label: "720p" },
    { value: "custom", label: "自定义尺寸" },
  ]);
  assert.equal(video.sizes.some(option => option.value === "1152x768"), true);
  assert.equal(video.maxReferenceImages, 2);
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

test("unknown video model capabilities do not invent reference support", () => {
  const video = getVideoModelCapabilities("12ai:manual-video-model");
  assert.equal(video.referenceMode, "none");
  assert.equal(video.maxReferenceImages, 0);
  assert.deepEqual(video.referenceMediaTypes, []);
});
