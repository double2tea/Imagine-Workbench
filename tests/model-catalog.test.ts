import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_MODEL_OPTIONS,
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  DEFAULT_VISION_CHAT_MODEL,
  IMAGE_MODEL_OPTIONS,
  MODEL_CAPABILITY_CATALOG_VERSION,
  VIDEO_MODEL_OPTIONS,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getListedModelCapabilities,
  getModelCapabilities,
  getModelCapability,
  getVideoModelCapabilities,
  imageParameterValuesFromLegacy,
  imageParameterValuesToRunningHubYouchuan,
  isMimoWorkbenchTtsModel,
  parseProviderModel,
  readModelCapabilityCatalog,
  resolveImageModelQuality,
  resolveAsyncImageModelValue,
  supportsAsyncImageGeneration,
  tryParseProviderModel,
  type ModelCapabilityCatalogDocument,
} from "../lib/providers/model-catalog";
import modelCapabilityCatalog from "../lib/providers/catalog/data/model-capabilities.json";
import {
  defaultCapabilityParameterValues,
  inputModalitiesReferenceCountRange,
  validateCapabilityParameterValues,
  validateInputModalityReferences,
} from "../lib/providers/model-capabilities";
import { getGenerationReferenceMedia } from "../lib/db";
import {
  BOARD_PORT_IDS,
  boardNodeSupportsReferenceInput,
  resolveBoardConnectionKind,
  resolveBoardConnectionNodesWithCompatibleModel,
} from "../lib/board/ports";
import type { BoardNode } from "../lib/board/types";
import { getProviderMeta } from "../lib/providers/registry";
import {
  RUNNINGHUB_CONTROL_IMAGE_APP_LABEL,
  RUNNINGHUB_CONTROL_IMAGE_APP_MODEL,
} from "../lib/providers/runninghub";
import {
  generateModelCapabilityCatalog,
  isRunningHubStandardCatalogEntry,
} from "../lib/providers/catalog/runninghub-standard-generator";
import { dynamicProviderModelOption } from "../lib/providers/model-gating";

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

test("parseProviderModel accepts dynamic provider prefixes", () => {
  assert.deepEqual(parseProviderModel("unknown-provider:model-id", "12ai"), {
    provider: "unknown-provider",
    model: "model-id",
    async: false,
  });
});

test("tryParseProviderModel returns dynamic provider prefixes", () => {
  assert.deepEqual(tryParseProviderModel("unknown-provider:model-id", "12ai"), {
    provider: "unknown-provider",
    model: "model-id",
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

test("model capabilities are loaded from the reusable JSON catalog", () => {
  assert.equal(MODEL_CAPABILITY_CATALOG_VERSION, modelCapabilityCatalog.version);
  assert.equal(getModelCapabilities().length, modelCapabilityCatalog.entries.length);

  const hiddenRunningHubRoute = "runninghub:api:/openapi/v2/rhart-video-v3.1-fast-official/reference-to-video";
  assert.equal(getModelCapability(hiddenRunningHubRoute, "video").listed, false);
  assert.equal(getListedModelCapabilities("video", "runninghub").some(capability => capability.value === hiddenRunningHubRoute), false);
  assert.equal(VIDEO_MODEL_OPTIONS.runninghub.some(option => option.value === hiddenRunningHubRoute), false);
});

test("model capability catalog fails fast on invalid provider keys", () => {
  const catalog = cloneModelCapabilityCatalog();
  (catalog.entries[0] as unknown as { provider: string }).provider = "not-a-provider";

  assert.throws(
    () => readModelCapabilityCatalog(catalog),
    /has invalid provider/,
  );
});

test("model capability catalog fails fast on descriptor reference slot drift", () => {
  const catalog = cloneModelCapabilityCatalog();
  const entry = catalog.entries.find(item => item.parameterDescriptors.some(descriptor => descriptor.kind === "reference"));
  if (!entry) throw new Error("Expected at least one reference descriptor");
  entry.referenceSlots = [];

  assert.throws(
    () => readModelCapabilityCatalog(catalog),
    /has mismatched referenceSlots/,
  );
});

test("model capability catalog derives legacy reference fields from input modalities", () => {
  const catalog = cloneModelCapabilityCatalog();
  const entry = catalog.entries.find(item => item.inputModalities.images !== undefined);
  if (!entry) throw new Error("Expected at least one image reference capability");

  const capabilities = readModelCapabilityCatalog(catalog);
  const capability = capabilities.find(item => item.value === entry.value);
  if (!capability) throw new Error("Expected normalized capability");

  assert.equal(capability.supportsReferences, true);
  assert.deepEqual(capability.referenceSlots, entry.parameterDescriptors.filter(descriptor => descriptor.kind === "reference"));
  assert.deepEqual(capability.referenceMediaTypes, ["image"]);
  assert.equal(capability.minReferenceImages, entry.inputModalities.images?.minCount);
  assert.equal(capability.maxReferenceImages, entry.inputModalities.images?.maxCount);
});

test("model capability catalog fails fast on legacy reference field drift", () => {
  const catalog = cloneModelCapabilityCatalog();
  const entry = catalog.entries.find(item => item.inputModalities.images !== undefined);
  if (!entry) throw new Error("Expected at least one image reference capability");
  entry.maxReferenceImages = (entry.inputModalities.images?.maxCount ?? 0) + 1;

  assert.throws(
    () => readModelCapabilityCatalog(catalog),
    /has mismatched maxReferenceImages/,
  );
});

test("model capability catalog fails fast on malformed pricing", () => {
  const catalog = cloneModelCapabilityCatalog();
  const entry = catalog.entries.find(item => item.pricing.status === "priced");
  if (!entry || entry.pricing.status !== "priced") throw new Error("Expected at least one priced capability");
  entry.pricing = { ...entry.pricing, price: -1 };

  assert.throws(
    () => readModelCapabilityCatalog(catalog),
    /has invalid price/,
  );
});

test("image video and audio model capabilities expose unified metadata", () => {
  const generationCapabilities = getModelCapabilities().filter(capability => capability.kind !== "chat");

  assert.ok(generationCapabilities.length > 0);
  for (const capability of generationCapabilities) {
    assert.ok(capability.inputModalities.text !== undefined || capability.inputModalities.images !== undefined || capability.inputModalities.audio !== undefined);
    assert.ok(Array.isArray(capability.parameterDescriptors));
    assert.ok(Array.isArray(capability.referenceSlots));
    assert.ok(capability.pricing.status === "priced" || capability.pricing.status === "unpriced");
    assert.deepEqual(
      capability.referenceSlots,
      capability.parameterDescriptors.filter(descriptor => descriptor.kind === "reference"),
    );
  }
});

function cloneModelCapabilityCatalog(): ModelCapabilityCatalogDocument {
  return JSON.parse(JSON.stringify(modelCapabilityCatalog)) as ModelCapabilityCatalogDocument;
}

function hasRunningHubStandardGeneratedMarker(entry: ModelCapabilityCatalogDocument["entries"][number]): boolean {
  const maybeGenerated = (entry as { generated?: { source?: unknown } }).generated;
  return maybeGenerated?.source === "runninghub-standard";
}

test("async image model resolution is driven by async capability reference limits", () => {
  assert.equal(resolveAsyncImageModelValue("12ai:gpt-image-2", 0), "12ai-async:gpt-image-2");
  assert.equal(resolveAsyncImageModelValue("12ai:gpt-image-2", 1), null);
  assert.equal(
    resolveAsyncImageModelValue("12ai:gemini-3.1-flash-image-preview", 1),
    "12ai-async:gemini-3.1-flash-image-preview",
  );
});

test("grok2api image references are limited to the edit model", () => {
  const grokImage = getModelCapability("grok2api:grok-imagine-image", "image");
  const grokImageEdit = getModelCapability("grok2api:grok-imagine-image-edit", "image");

  assert.equal(grokImage.supportsReferences, false);
  assert.equal(grokImageEdit.supportsReferences, true);
  assert.deepEqual(grokImageEdit.sizes, [{ value: "1024x1024", label: "1K" }]);
});

test("reference-capable image models expose a usable reference limit", () => {
  const capabilities = getImageModelCapabilities("12ai:gemini-3.1-flash-image-preview");

  assert.equal(capabilities.referenceMediaTypes.includes("image"), true);
  assert.equal(capabilities.minReferenceImages, 0);
  assert.equal(capabilities.maxReferenceImages >= 2, true);
});

test("image quality resolution follows the selected model capabilities", () => {
  assert.equal(resolveImageModelQuality("runninghub:api:/openapi/v2/seedream-v5-lite/text-to-image", "1"), undefined);
  assert.equal(resolveImageModelQuality("runninghub:api:/openapi/v2/youchuan/text-to-image-v7", "1"), "1");
});

test("runninghub control image app exposes one required image reference", () => {
  const modelValue = `runninghub:${RUNNINGHUB_CONTROL_IMAGE_APP_MODEL}`;
  const capabilities = getImageModelCapabilities(modelValue);

  assert.ok(
    IMAGE_MODEL_OPTIONS.runninghub.some(option => option.value === modelValue && option.label === RUNNINGHUB_CONTROL_IMAGE_APP_LABEL),
  );
  assert.equal(IMAGE_MODEL_OPTIONS.runninghub.some(option => option.value.includes("<webappId>")), false);
  assert.equal(capabilities.minReferenceImages, 1);
  assert.equal(capabilities.maxReferenceImages, 1);
  assert.deepEqual(capabilities.referenceMediaTypes, ["image"]);
});

test("runninghub standard capabilities include pricing and payload mapping for listed and routed endpoints", () => {
  const youchuan = getModelCapability("runninghub:api:/openapi/v2/youchuan/text-to-image-v7", "image");
  assert.equal(youchuan.pricing.status, "priced");
  if (youchuan.pricing.status !== "priced") throw new Error("Expected Youchuan pricing");
  assert.equal(youchuan.pricing.price, 0.54);
  assert.equal(youchuan.payloadMapping?.endpoint, "/openapi/v2/youchuan/text-to-image-v7");

  const routedVideo = getModelCapability("runninghub:api:/openapi/v2/rhart-video-v3.1-fast-official/reference-to-video", "video");
  assert.equal(routedVideo.pricing.status, "priced");
  if (routedVideo.pricing.status !== "priced") throw new Error("Expected routed video pricing");
  assert.equal(routedVideo.pricing.price, 4.03);
  assert.equal(routedVideo.payloadMapping?.operation, "referenceArray");
});

test("runninghub standard generator preserves hand-authored catalog entries", () => {
  const catalog = cloneModelCapabilityCatalog();
  const generated = generateModelCapabilityCatalog(catalog);

  assert.deepEqual(
    generated.entries.filter(entry => !isRunningHubStandardCatalogEntry(entry)),
    catalog.entries.filter(entry => !isRunningHubStandardCatalogEntry(entry)),
  );
});

test("runninghub standard generator overwrites stale generated entries", () => {
  const catalog = cloneModelCapabilityCatalog();
  const stale = catalog.entries.find(entry => isRunningHubStandardCatalogEntry(entry) && hasRunningHubStandardGeneratedMarker(entry));
  if (!stale) throw new Error("Expected a generated RunningHub Standard entry");
  stale.label = "Manual stale edit";

  const generated = generateModelCapabilityCatalog(catalog);
  const repaired = generated.entries.find(entry => entry.value === stale.value);

  assert.ok(repaired);
  assert.notEqual(repaired.label, "Manual stale edit");
});

test("dynamic media model gating requires catalog-known media capabilities", () => {
  assert.equal(dynamicProviderModelOption("12ai", "unlisted-image-alpha", "image", "12AI"), null);
  assert.equal(dynamicProviderModelOption("12ai", "unlisted-video-alpha", "video", "12AI"), null);
  assert.equal(dynamicProviderModelOption("12ai", "unlisted-tts-alpha", "audio", "12AI"), null);

  assert.deepEqual(dynamicProviderModelOption("12ai", "frontier-alpha", "chat", "12AI"), {
    value: "12ai:frontier-alpha",
    label: "12AI frontier-alpha",
  });
  assert.deepEqual(dynamicProviderModelOption("12ai", "gpt-4o-audio-preview", "chat", "12AI"), {
    value: "12ai:gpt-4o-audio-preview",
    label: "12AI gpt-4o-audio-preview",
  });
  assert.deepEqual(dynamicProviderModelOption("12ai", "claude-video-chat", "chat", "12AI"), {
    value: "12ai:claude-video-chat",
    label: "12AI claude-video-chat",
  });
  assert.equal(dynamicProviderModelOption("12ai", "unlisted-image-alpha", "all", "12AI"), null);
  assert.equal(dynamicProviderModelOption("12ai", "unlisted-video-alpha", "all", "12AI"), null);
  assert.equal(dynamicProviderModelOption("12ai", "unlisted-tts-alpha", "all", "12AI"), null);
  assert.deepEqual(dynamicProviderModelOption("12ai", "frontier-alpha", "all", "12AI"), {
    value: "12ai:frontier-alpha",
    label: "12AI frontier-alpha",
  });
  assert.deepEqual(dynamicProviderModelOption("runninghub", "api:/openapi/v2/minimax/hailuo-2.3/t2v-pro", "video", "RunningHub"), {
    value: "runninghub:api:/openapi/v2/minimax/hailuo-2.3/t2v-pro",
    label: "RunningHub api:/openapi/v2/minimax/hailuo-2.3/t2v-pro",
  });
  assert.deepEqual(dynamicProviderModelOption("runninghub", "api:/openapi/v2/minimax/hailuo-2.3/t2v-pro", "all", "RunningHub"), {
    value: "runninghub:api:/openapi/v2/minimax/hailuo-2.3/t2v-pro",
    label: "RunningHub api:/openapi/v2/minimax/hailuo-2.3/t2v-pro",
  });
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
    model: "runninghub:api:/openapi/v2/bytedance/seedance-2.0-global/text-to-video",
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

test("board video reference connections auto-switch to an audio-compatible model", () => {
  const audioNode: BoardNode = {
    id: "asset_audio",
    kind: "asset",
    title: "Audio",
    position: { x: 0, y: 0 },
    size: { width: 280, height: 180 },
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    asset: {
      assetId: "audio_1",
      type: "audio",
      url: "data:audio/mpeg;base64,YQ==",
      prompt: "audio",
      model: "local",
    },
  };
  const videoNode: BoardNode = {
    id: "video_1",
    kind: "video-generate",
    title: "Video",
    position: { x: 320, y: 0 },
    size: { width: 320, height: 240 },
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    prompt: "",
    model: "12ai:veo_3_1-fast",
    aspectRatio: "16:9",
    variantCount: 1,
    status: "idle",
  };
  const from = { nodeId: audioNode.id, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" as const };
  const to = { nodeId: videoNode.id, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" as const };
  const nodes = resolveBoardConnectionNodesWithCompatibleModel([audioNode, videoNode], from, to);
  const patchedVideoNode = nodes.find(node => node.id === videoNode.id);

  assert.equal(patchedVideoNode?.kind, "video-generate");
  if (patchedVideoNode?.kind !== "video-generate") throw new Error("Expected video node");
  const patchedCapabilities = getVideoModelCapabilities(patchedVideoNode.model);
  assert.notEqual(patchedVideoNode.model, videoNode.model);
  assert.equal(patchedCapabilities.referenceMediaTypes.includes("audio"), true);
  assert.equal(patchedCapabilities.sizes.some(option => option.value === patchedVideoNode.aspectRatio), true);
  if (patchedVideoNode.videoDuration) {
    assert.equal(patchedCapabilities.durations.some(option => option.value === patchedVideoNode.videoDuration), true);
  }
  assert.equal(resolveBoardConnectionKind(nodes, from, to), "reference");
});

test("board video reference connections recover from unknown current models", () => {
  const audioNode: BoardNode = {
    id: "asset_audio",
    kind: "asset",
    title: "Audio",
    position: { x: 0, y: 0 },
    size: { width: 280, height: 180 },
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    asset: {
      assetId: "audio_1",
      type: "audio",
      url: "data:audio/mpeg;base64,YQ==",
      prompt: "audio",
      model: "local",
    },
  };
  const videoNode: BoardNode = {
    id: "video_unknown",
    kind: "video-generate",
    title: "Video",
    position: { x: 320, y: 0 },
    size: { width: 320, height: 240 },
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    prompt: "",
    model: "12ai:not-a-real-video-model",
    aspectRatio: "auto",
    variantCount: 1,
    status: "idle",
  };
  const from = { nodeId: audioNode.id, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" as const };
  const to = { nodeId: videoNode.id, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" as const };
  const nodes = resolveBoardConnectionNodesWithCompatibleModel([audioNode, videoNode], from, to);
  const patchedVideoNode = nodes.find(node => node.id === videoNode.id);

  assert.equal(boardNodeSupportsReferenceInput(videoNode), true);
  assert.equal(patchedVideoNode?.kind, "video-generate");
  if (patchedVideoNode?.kind !== "video-generate") throw new Error("Expected video node");
  assert.notEqual(patchedVideoNode.model, videoNode.model);
  assert.equal(getVideoModelCapabilities(patchedVideoNode.model).referenceMediaTypes.includes("audio"), true);
  assert.equal(resolveBoardConnectionKind(nodes, from, to), "reference");
});

test("board image reference connections auto-switch to an image-reference model", () => {
  const originalModel = "grok2api:grok-imagine-image";
  const imageNode: BoardNode = {
    id: "asset_image",
    kind: "asset",
    title: "Image",
    position: { x: 0, y: 0 },
    size: { width: 280, height: 180 },
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    asset: {
      assetId: "image_1",
      type: "image",
      url: "data:image/png;base64,YQ==",
      prompt: "image",
      model: "local",
    },
  };
  const generateNode: BoardNode = {
    id: "image_generate_1",
    kind: "image-generate",
    title: "Image Generate",
    position: { x: 320, y: 0 },
    size: { width: 320, height: 240 },
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    prompt: "",
    model: originalModel,
    aspectRatio: "1:1",
    customImageResolution: "2560x1440",
    imageResolution: "1024x1024",
    variantCount: 1,
    status: "idle",
  };
  const from = { nodeId: imageNode.id, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" as const };
  const to = { nodeId: generateNode.id, portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" as const };
  const nodes = resolveBoardConnectionNodesWithCompatibleModel([imageNode, generateNode], from, to);
  const patchedGenerateNode = nodes.find(node => node.id === generateNode.id);

  assert.equal(patchedGenerateNode?.kind, "image-generate");
  if (patchedGenerateNode?.kind !== "image-generate") throw new Error("Expected image generate node");
  const patchedCapability = getModelCapability(patchedGenerateNode.model, "image");
  assert.notEqual(patchedGenerateNode.model, originalModel);
  assert.equal(patchedCapability.supportsAsync, false);
  assert.equal(patchedCapability.referenceMediaTypes.includes("image"), true);
  assert.equal(getImageModelCapabilities(patchedGenerateNode.model).aspectRatios.some(option => option.value === patchedGenerateNode.aspectRatio), true);
  assert.equal(resolveBoardConnectionKind(nodes, from, to), "reference");
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

test("gpt image 2 exposes extended 4k-capable image sizes", () => {
  const capability = getModelCapability("12ai:gpt-image-2", "image");
  const xstxCapability = getModelCapability("xstx:gpt-image-2", "image");
  const xstx2kCapability = getModelCapability("xstx:gpt-image-2-2k", "image");

  assert.ok(capability.sizes.some(option => option.value === "512x512" && option.label === "512p"));
  assert.ok(capability.sizes.some(option => option.value === "1536x1024" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "1024x1536" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "1792x1008" && option.label === "1K"));
  assert.ok(capability.sizes.some(option => option.value === "2048x1024" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "1024x2048" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "2560x1280" && option.label === "2.5K"));
  assert.ok(capability.sizes.some(option => option.value === "1280x2560" && option.label === "2.5K"));
  assert.ok(capability.sizes.some(option => option.value === "2048x1152" && option.label === "2K"));
  assert.ok(capability.sizes.some(option => option.value === "2880x2880" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "3840x1920" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "1920x3840" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "3840x2160" && option.label === "4K"));
  assert.ok(capability.sizes.some(option => option.value === "2160x3840" && option.label === "4K"));
  assert.deepEqual(capability.aspectRatios.map(option => option.value), ["1:1", "2:1", "1:2", "3:2", "2:3", "4:3", "3:4", "7:4", "4:7", "16:9", "9:16"]);
  assert.deepEqual(xstxCapability.aspectRatios.map(option => option.value), capability.aspectRatios.map(option => option.value));
  assert.equal(xstxCapability.sizes.some(option => option.value === "3840x1920"), true);
  assert.equal(xstx2kCapability.sizes.some(option => option.value === "2048x1024"), true);
  assert.equal(xstx2kCapability.sizes.some(option => option.value === "3840x1920"), false);
});

test("image resolution labels hide pixel dimensions while keeping request values", () => {
  assert.deepEqual(getImageResolutionOptions("12ai:gpt-image-2", "2:1"), [
    { value: "auto", label: "Auto" },
    { value: "2048x1024", label: "2K" },
    { value: "2560x1280", label: "2.5K" },
    { value: "3840x1920", label: "4K" },
    { value: "custom", label: "自定义尺寸" },
  ]);

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
    { value: "1472x1104", label: "1K" },
  ]);
  assert.deepEqual(getImageResolutionOptions("modelscope:Qwen/Qwen-Image", "3:4"), [
    { value: "1104x1472", label: "1K" },
  ]);
  assert.deepEqual(getImageResolutionOptions("modelscope:Qwen/Qwen-Image", "3:2"), [
    { value: "1584x1056", label: "1K" },
  ]);
  assert.deepEqual(getImageResolutionOptions("modelscope:Qwen/Qwen-Image", "2:3"), [
    { value: "1056x1584", label: "1K" },
  ]);
});

test("modelscope exposes current chat and image presets", () => {
  assert.equal(getProviderMeta("modelscope").supportsChat, true);
  assert.equal(
    CHAT_MODEL_OPTIONS["modelscope"].some(option => option.value === "modelscope:Qwen/Qwen3-235B-A22B"),
    true,
  );
  assert.equal(
    CHAT_MODEL_OPTIONS["modelscope"].some(option => option.value === "modelscope:MiniMax/MiniMax-M2.7:MiniMax"),
    true,
  );
  assert.equal(
    getModelCapabilities("image", "modelscope").some(
      capability => capability.value === "modelscope:Tongyi-MAI/Z-Image-Turbo",
    ),
    true,
  );
  assert.equal(
    getModelCapabilities("image", "modelscope").some(
      capability => capability.value === "modelscope:Qwen/Qwen-Image-Edit-2511",
    ),
    true,
  );
  assert.equal(
    getModelCapability("modelscope:Qwen/Qwen-Image-Edit-2511", "image").supportsReferences,
    true,
  );
});

test("runninghub exposes concrete standard model capabilities", () => {
  assert.equal(getProviderMeta("runninghub").supportsChat, true);
  assert.equal(getProviderMeta("runninghub").supportsAudio, true);
  assert.equal(CHAT_MODEL_OPTIONS["runninghub"].some(option => option.value === "runninghub:qwen/qwen3.7-max"), true);
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
  assert.equal(
    IMAGE_MODEL_OPTIONS["runninghub"].some(
      option => option.value === "runninghub:api:/openapi/v2/alibaba/qwen-image-2.0/text-to-image",
    ),
    true,
  );
  assert.equal(
    AUDIO_MODEL_OPTIONS["runninghub"].some(
      option => option.value === "runninghub:api:/openapi/v2/rhart-audio/text-to-audio/speech-2.8-hd",
    ),
    true,
  );

  const image = getModelCapability("runninghub:api:/openapi/v2/rhart-image/f-2-dev/text-to-image", "image");
  const video = getModelCapability("runninghub:api:/openapi/v2/minimax/hailuo-02/standard", "video");
  const seedream = getModelCapability("runninghub:api:/openapi/v2/seedream-v5-lite/text-to-image", "image");
  const qwenImage = getModelCapability("runninghub:api:/openapi/v2/alibaba/qwen-image-2.0/text-to-image", "image");
  const seedance = getModelCapability("runninghub:api:/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video", "video");
  const seedanceMultimodal = getModelCapability(
    "runninghub:api:/openapi/v2/bytedance/seedance-2.0-global/text-to-video",
    "video",
  );
  const omniFlash = getModelCapability("runninghub:api:/openapi/v2/gemini-omni-flash/text-to-video", "video");
  const videoX = getModelCapability("runninghub:api:/openapi/v2/rhart-video-g/text-to-video", "video");
  const veo = getModelCapability("runninghub:api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video", "video");
  const videoXI2vHidden = "runninghub:api:/openapi/v2/rhart-video-g/image-to-video";
  const veoStartEndHidden = "runninghub:api:/openapi/v2/rhart-video-v3.1-fast/start-end-to-video";
  const grokImage = getModelCapability("runninghub:api:/openapi/v2/rhart-image-g/text-to-image", "image");
  const jimeng = getModelCapability("runninghub:api:/openapi/v2/bytedance/jimeng-4.6/text-to-image", "image");
  const gptImage = getModelCapability("runninghub:api:/openapi/v2/rhart-image-g-2-official/text-to-image", "image");
  const gptImageChannel = getModelCapability("runninghub:api:/openapi/v2/rhart-image-g-2/text-to-image", "image");
  const gptImageEditHidden = "runninghub:api:/openapi/v2/rhart-image-g-2-official/image-to-image";
  const geminiFlash = getModelCapability("runninghub:api:/openapi/v2/rhart-image-n-g31-flash-official/text-to-image", "image");
  const geminiProUltra = getModelCapability("runninghub:api:/openapi/v2/rhart-image-n-pro-official/text-to-image-ultra", "image");
  const youchuan = getModelCapability("runninghub:api:/openapi/v2/youchuan/text-to-image-v81", "image");
  assert.equal(image.supportsReferences, false);
  assert.equal(image.sizes.some(option => option.value === "custom"), true);
  assert.equal(seedream.supportsReferences, true);
  assert.equal(seedream.maxReferenceImages, 10);
  assert.deepEqual(seedream.sizes.map(option => option.value), ["auto", "2k", "3k"]);
  assert.deepEqual(seedream.qualityLevels, []);
  assert.equal(seedream.payloadMapping?.fields.some(field => field.target === "width" || field.target === "height"), false);
  assert.equal(seedream.payloadMapping?.fields.some(field => field.target === "resolution"), true);
  assert.equal(qwenImage.payloadMapping?.operation, "promptDimensions");
  assert.deepEqual(qwenImage.sizes.map(option => option.value).slice(0, 2), ["1024*1024", "1536*1536"]);
  assert.deepEqual(jimeng.sizes.map(option => option.value), [
    "auto",
    "1024x1024",
    "1536x1024",
    "1024x1536",
    "1536x1536",
    "2048x2048",
  ]);
  assert.equal(jimeng.sizes.some(option => option.value === "1280x720" || option.value === "720x1280" || option.value === "custom"), false);
  assert.equal(getImageModelCapabilities("runninghub:api:/openapi/v2/seedream-v5-lite/text-to-image").maxReferenceImages, 10);
  assert.deepEqual(
    getImageModelCapabilities("runninghub:api:/openapi/v2/seedream-v5-lite/text-to-image").referenceMediaTypes,
    ["image"],
  );
  assert.equal(video.videoReferenceMode, "firstLast");
  assert.deepEqual(video.sizes.map(option => option.value), ["auto"]);
  assert.equal(video.maxReferenceImages, 2);
  assert.deepEqual(video.durations.map(option => option.value), ["6", "10"]);
  assert.deepEqual(seedance.sizes.map(option => option.value), ["auto", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]);
  assert.deepEqual(seedance.resolutions.map(option => option.value), ["480p", "720p", "1080p", "2k", "4k"]);
  assert.deepEqual(seedance.durations.map(option => option.value), [
    "-1",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
  ]);
  assert.equal(seedance.videoReferenceMode, "reference");
  assert.deepEqual(seedance.videoReferenceModes, ["reference", "firstLast"]);
  assert.deepEqual(seedance.referenceMediaTypes, ["image", "video", "audio"]);
  assert.equal(inputModalitiesReferenceCountRange(seedance.inputModalities).maxCount, seedance.maxReferenceImages);
  assert.throws(
    () => validateInputModalityReferences(seedance.inputModalities, [
      { type: "image" },
      { type: "video" },
      { type: "audio" },
      { type: "image" },
      { type: "video" },
      { type: "audio" },
      { type: "image" },
      { type: "video" },
      { type: "audio" },
      { type: "image" },
    ]),
    /当前模型支持 0-9 个参考媒体/,
  );
  assert.deepEqual(seedanceMultimodal.referenceMediaTypes, ["image", "video", "audio"]);
  assert.equal(omniFlash.maxReferenceImages, 8);
  assert.equal(inputModalitiesReferenceCountRange(omniFlash.inputModalities).maxCount, omniFlash.maxReferenceImages);
  assert.deepEqual(omniFlash.videoReferenceModes, ["reference"]);
  assert.deepEqual(omniFlash.sizes.map(option => option.value), ["auto", "16:9", "9:16"]);
  assert.deepEqual(omniFlash.resolutions.map(option => option.value), ["720p", "1080p", "4k"]);
  assert.deepEqual(omniFlash.referenceMediaTypes, ["image", "video"]);
  assert.equal(VIDEO_MODEL_OPTIONS["runninghub"].some(option => option.value === "runninghub:api:/openapi/v2/rhart-video-g/text-to-video"), true);
  assert.equal(VIDEO_MODEL_OPTIONS["runninghub"].some(option => option.value === videoXI2vHidden), false);
  assert.equal(videoX.videoReferenceMode, "reference");
  assert.deepEqual(videoX.videoReferenceModes, ["reference"]);
  assert.deepEqual(videoX.sizes.map(option => option.value), ["2:3", "3:2", "1:1", "16:9", "9:16"]);
  assert.deepEqual(videoX.resolutions.map(option => option.value), ["720p", "480p"]);
  assert.deepEqual(videoX.durations.map(option => option.value), [
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
  ]);
  assert.equal(videoX.maxReferenceImages, 7);
  assert.equal(veo.videoReferenceMode, "reference");
  assert.deepEqual(veo.videoReferenceModes, ["reference", "firstLast"]);
  assert.deepEqual(veo.sizes.map(option => option.value), ["auto", "16:9", "9:16"]);
  assert.deepEqual(veo.resolutions.map(option => option.value), ["720p", "1080p", "4k"]);
  assert.equal(veo.maxReferenceImages, 3);
  assert.deepEqual(veo.durations.map(option => option.value), ["4", "6", "8"]);
  assert.equal(VIDEO_MODEL_OPTIONS["runninghub"].some(option => option.value === veoStartEndHidden), false);
  assert.deepEqual(grokImage.sizes.map(option => option.value), ["960x960", "720x1280", "1280x720", "1168x784", "784x1168"]);
  assert.equal(grokImage.payloadMapping?.fields.some(field => field.target === "aspectRatio" && field.source === "imageResolution"), true);
  assert.equal(gptImage.maxReferenceImages, 10);
  assert.equal(gptImage.supportsReferences, true);
  assert.deepEqual(gptImage.aspectRatios.map(option => option.value), [
    "1:1",
    "1:2",
    "2:1",
    "1:3",
    "3:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "21:9",
    "9:21",
    "16:9",
  ]);
  assert.deepEqual(gptImage.qualityLevels.map(option => option.value), ["low", "medium", "high"]);
  assert.deepEqual(gptImage.sizes.map(option => option.value), ["1k", "2k", "4k"]);
  assert.equal(gptImageChannel.aspectRatios.some(option => option.value === "2:1"), false);
  assert.deepEqual(gptImageChannel.qualityLevels, []);
  assert.equal(gptImageChannel.payloadMapping?.fields.some(field => field.target === "quality"), false);
  assert.equal(geminiFlash.maxReferenceImages, 14);
  assert.deepEqual(geminiFlash.aspectRatios.map(option => option.value), [
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "5:4",
    "4:5",
    "21:9",
    "1:4",
    "4:1",
    "1:8",
    "8:1",
  ]);
  assert.deepEqual(geminiFlash.sizes.map(option => option.value), ["1k", "2k", "4k"]);
  assert.equal(geminiFlash.payloadMapping?.fields.some(field => field.target === "quality"), false);
  assert.deepEqual(geminiProUltra.sizes.map(option => option.value), ["4k", "8k"]);
  assert.equal(IMAGE_MODEL_OPTIONS["runninghub"].some(option => option.value === gptImageEditHidden), false);
  assert.equal(
    IMAGE_MODEL_OPTIONS["runninghub"].some(
      option => option.value === "runninghub:api:/openapi/v2/rhart-image-n-g31-flash-official/text-to-image",
    ),
    true,
  );
  assert.equal(
    IMAGE_MODEL_OPTIONS["runninghub"].some(
      option => option.value === "runninghub:api:/openapi/v2/rhart-image-n-g31-flash-official/image-to-image",
    ),
    false,
  );
  assert.equal(
    IMAGE_MODEL_OPTIONS["runninghub"].some(
      option => option.value === "runninghub:api:/openapi/v2/rhart-image-n-pro-official/text-to-image-ultra",
    ),
    true,
  );
  assert.equal(IMAGE_MODEL_OPTIONS["runninghub"].some(option => option.value === "runninghub:api:/openapi/v2/seedream-v5-lite/image-to-image"), false);
  assert.equal(VIDEO_MODEL_OPTIONS["runninghub"].some(option => option.value === "runninghub:api:/openapi/v2/gemini-omni-flash/image-to-video"), false);
  assert.equal(youchuan.supportsReferences, true);
  assert.equal(youchuan.maxReferenceImages, 1);
  assert.deepEqual(youchuan.aspectRatios.map(option => option.value), ["1:1", "4:3", "3:2", "16:9", "3:4", "2:3", "9:16"]);
  assert.deepEqual(youchuan.qualityLevels.map(option => option.value), ["1", "4"]);
  assert.deepEqual(youchuan.sizes.map(option => option.value), ["auto"]);
  const youchuanV7 = getModelCapability("runninghub:api:/openapi/v2/youchuan/text-to-image-v7", "image");
  const minimaxSpeech = getModelCapability("runninghub:api:/openapi/v2/rhart-audio/text-to-audio/speech-2.8-hd", "audio");
  assert.ok(youchuanV7);
  assert.equal(youchuanV7.supportsReferences, true);
  assert.equal(youchuanV7.maxReferenceImages, 1);
  assert.deepEqual(youchuanV7.qualityLevels.map(option => option.value), ["1", "2", "4"]);
  assert.equal(minimaxSpeech.kind, "audio");
  assert.deepEqual(minimaxSpeech.audioModes, ["tts"]);
  assert.throws(
    () => getModelCapability("runninghub:ai-app-audio:2061323800511344642", "audio"),
    /Unknown provider model capability/,
  );
});

test("runninghub youchuan descriptors expose version-specific fields", () => {
  const v7 = getImageModelCapabilities("runninghub:api:/openapi/v2/youchuan/text-to-image-v7");
  const v81 = getImageModelCapabilities("runninghub:api:/openapi/v2/youchuan/text-to-image-v81");
  const v7Keys = v7.parameterDescriptors.map(descriptor => descriptor.key);
  const v81Keys = v81.parameterDescriptors.map(descriptor => descriptor.key);

  assert.ok(v7Keys.includes("runninghub.youchuan.weird"));
  assert.ok(v7Keys.includes("runninghub.youchuan.tile"));
  assert.ok(v7Keys.includes("runninghub.youchuan.oref"));
  assert.ok(v7Keys.includes("runninghub.youchuan.ow"));
  assert.equal(v7Keys.includes("runninghub.youchuan.hd"), false);
  assert.ok(v81Keys.includes("runninghub.youchuan.hd"));
  assert.ok(v81Keys.includes("runninghub.youchuan.sref"));
  assert.equal(v81Keys.includes("runninghub.youchuan.weird"), false);
  assert.equal(v81Keys.includes("runninghub.youchuan.tile"), false);
  assert.equal(v81Keys.includes("runninghub.youchuan.oref"), false);

  assert.deepEqual(defaultCapabilityParameterValues(v7.parameterDescriptors), {
    "runninghub.youchuan.chaos": 0,
    "runninghub.youchuan.stylize": 0,
    "runninghub.youchuan.iw": 1,
    "runninghub.youchuan.sw": 100,
    "runninghub.youchuan.weird": 0,
    "runninghub.youchuan.ow": 100,
    "runninghub.youchuan.raw": false,
    "runninghub.youchuan.tile": false,
  });
  assert.throws(
    () => validateCapabilityParameterValues(v81.parameterDescriptors, { "runninghub.youchuan.weird": 1 }),
    /not supported/,
  );
});

test("runninghub youchuan descriptor values bridge legacy settings", () => {
  const values = imageParameterValuesFromLegacy("runninghub:api:/openapi/v2/youchuan/text-to-image-v7", {
    runningHubYouchuan: {
      chaos: 12,
      stylize: 80,
      raw: true,
      iw: 1.2,
      sw: 160,
      sref: "data:image/png;base64,c3R5bGU=",
      oref: "data:image/png;base64,b2JqZWN0",
    },
  });

  assert.deepEqual(values["runninghub.youchuan.sref"], [
    { url: "data:image/png;base64,c3R5bGU=", type: "image", role: "style" },
  ]);
  assert.deepEqual(values["runninghub.youchuan.oref"], [
    { url: "data:image/png;base64,b2JqZWN0", type: "image", role: "object" },
  ]);
  assert.deepEqual(
    imageParameterValuesToRunningHubYouchuan("runninghub:api:/openapi/v2/youchuan/text-to-image-v7", values),
    {
      chaos: 12,
      stylize: 80,
      raw: true,
      iw: 1.2,
      sw: 160,
      weird: 0,
      ow: 100,
      tile: false,
      sref: "data:image/png;base64,c3R5bGU=",
      oref: "data:image/png;base64,b2JqZWN0",
    },
  );
});

test("agent chat defaults use 12AI Gemini 3.1 Flash Lite", () => {
  assert.equal(DEFAULT_CHAT_MODEL, "12ai:gemini-3.1-flash-lite-preview");
  assert.equal(DEFAULT_VISION_CHAT_MODEL, "12ai:gemini-3.1-flash-lite-preview");
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === "12ai:gemini-3.1-flash"), false);
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === "12ai:deepseek-v4-flash"), false);
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === DEFAULT_CHAT_MODEL), true);
  assert.equal(CHAT_MODEL_OPTIONS["12ai"].some(option => option.value === DEFAULT_VISION_CHAT_MODEL), true);
});

test("mimo exposes chat models and workbench TTS voice design", () => {
  assert.equal(getProviderMeta("mimo").supportsChat, true);
  assert.equal(getProviderMeta("mimo").supportsAudio, true);
  assert.equal(CHAT_MODEL_OPTIONS["mimo"].some(option => option.value === "mimo:mimo-v2.5-pro"), true);
  assert.equal(CHAT_MODEL_OPTIONS["mimo"].some(option => option.value === "mimo:mimo-v2.5"), true);
  assert.equal(CHAT_MODEL_OPTIONS["mimo"].some(option => option.value === "mimo:mimo-v2-flash"), true);
  assert.deepEqual(AUDIO_MODEL_OPTIONS["mimo"], [
    { value: "mimo:mimo-v2.5-tts", label: "MiMo V2.5 TTS" },
    { value: "mimo:mimo-v2.5-tts-voicedesign", label: "MiMo V2.5 Voice Design" },
    { value: "mimo:mimo-v2.5-tts-voiceclone", label: "MiMo V2.5 Voice Clone" },
    { value: "mimo:mimo-v2.5-asr", label: "MiMo V2.5 ASR" },
  ]);
  assert.deepEqual(getModelCapabilities("audio", "mimo").map(capability => capability.value), [
    "mimo:mimo-v2.5-tts",
    "mimo:mimo-v2.5-tts-voicedesign",
    "mimo:mimo-v2.5-tts-voiceclone",
    "mimo:mimo-v2.5-asr",
  ]);
  assert.equal(isMimoWorkbenchTtsModel("mimo:mimo-v2.5-tts"), true);
  assert.equal(isMimoWorkbenchTtsModel("mimo:mimo-v2.5-tts-voicedesign"), true);
  assert.equal(isMimoWorkbenchTtsModel("mimo-v2.5-tts"), false);
  assert.equal(isMimoWorkbenchTtsModel("mimo:mimo-v2.5-tts-voiceclone"), true);
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
  assert.deepEqual(twelveAiVideo.sizes.map(option => option.value), ["auto", "16:9", "9:16"]);
  assert.deepEqual(twelveAiVideo.resolutions.map(option => option.value), ["720p", "1080p"]);
  assert.deepEqual(twelveAiVideo.durations.map(option => option.value), ["4", "6", "8"]);
  assert.equal(twelveAiVideo.videoReferenceMode, "reference");
  assert.equal(twelveAiVideo.maxReferenceImages, 3);
  assert.equal(twelveAiFirstLastVideo.videoReferenceMode, "firstLast");
  assert.equal(twelveAiFirstLastVideo.minReferenceImages, 1);
  assert.equal(twelveAiFirstLastVideo.maxReferenceImages, 2);
  assert.deepEqual(twelveAiOmniVideo.sizes.map(option => option.value), ["auto", "16:9", "9:16"]);
  assert.deepEqual(twelveAiOmniVideo.resolutions.map(option => option.value), ["720p", "1080p", "4k"]);
  assert.deepEqual(twelveAiOmniVideo.durations.map(option => option.value), ["4", "6", "8", "10"]);
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
  assert.deepEqual(getVideoModelCapabilities("12ai:veo_3_1-fast-fl").referenceModes, ["firstLast"]);
});

test("unknown video model capabilities do not invent reference support", () => {
  const video = getVideoModelCapabilities("12ai:manual-video-model");
  assert.equal(video.referenceMode, "none");
  assert.deepEqual(video.referenceModes, []);
  assert.equal(video.maxReferenceImages, 0);
  assert.deepEqual(video.referenceMediaTypes, []);
});
