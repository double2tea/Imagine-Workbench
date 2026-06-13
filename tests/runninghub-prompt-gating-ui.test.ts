import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import test, { after } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ImageModelCapabilities, VideoModelCapabilities } from "../lib/providers/model-catalog";

const noop = (): void => {};

const imageCapabilities: ImageModelCapabilities = {
  aspectRatios: [{ value: "1:1", label: "1:1" }],
  resolutions: [{ value: "auto", label: "Auto" }],
  qualities: [],
  thinkingLevels: [],
  parameterDescriptors: [],
  referenceSlots: [],
  maxReferenceImages: 1,
  minReferenceImages: 0,
  referenceMediaTypes: ["image"],
};

const videoCapabilities: VideoModelCapabilities = {
  sizes: [{ value: "16:9", label: "16:9" }],
  resolutions: [],
  durations: [],
  presets: [],
  parameterDescriptors: [],
  referenceSlots: [],
  referenceMode: "reference",
  referenceModes: ["reference"],
  maxReferenceImages: 1,
  minReferenceImages: 0,
  referenceMediaTypes: ["image"],
};

test("image generation panel generate button follows promptRequired", async () => {
  registerCompiledPathAlias();
  const { default: ImageGenerationPanel } = await import("../components/creation/ImageGenerationPanel");
  type ImagePanelProps = React.ComponentProps<typeof ImageGenerationPanel>;
  const baseProps: ImagePanelProps = {
    atDropdownNode: null,
    capabilities: imageCapabilities,
    customImageSize: "",
    imageBackgroundGeneration: false,
    imageQuality: "",
    imageResolution: "auto",
    imageResolutionOptions: imageCapabilities.resolutions,
    imageThinkingLevel: "",
    isOptimizing: false,
    isSubmitting: false,
    modelGroups: [{ provider: "runninghub", label: "RunningHub", options: [{ value: "runninghub:ai-app-image:1961345119528140802", label: "Control" }] }],
    negativePrompt: "",
    parameterValues: {},
    prompt: "",
    promptRequired: true,
    referenceImages: [],
    selectedAspectRatio: "1:1",
    selectedModel: "runninghub:ai-app-image:1961345119528140802",
    submitCount: 0,
    supportsBackgroundGeneration: false,
    onClearReferences: noop,
    onCustomImageSizeChange: noop,
    onGenerate: noop,
    onImageBackgroundGenerationChange: noop,
    onImageQualityChange: noop,
    onImageResolutionChange: noop,
    onNegativePromptChange: noop,
    onOptimizePrompt: noop,
    onParameterValuesChange: noop,
    onPromptChange: noop,
    onPromptDropAsset: noop,
    onReferenceDropAsset: noop,
    onReferenceDropFiles: noop,
    onReferenceRemove: noop,
    onReferenceUpload: noop,
    onSelectAspectRatio: noop,
    onSelectModel: noop,
    onThinkingLevelChange: noop,
  };

  assert.match(generateButtonMarkup(renderToStaticMarkup(React.createElement(ImageGenerationPanel, baseProps)), "生成图片"), /\sdisabled=""/);
  assert.doesNotMatch(
    generateButtonMarkup(renderToStaticMarkup(React.createElement(ImageGenerationPanel, { ...baseProps, promptRequired: false })), "生成图片"),
    /\sdisabled=""/,
  );
});

test("video generation panel generate button follows promptRequired", async () => {
  registerCompiledPathAlias();
  const { default: VideoGenerationPanel } = await import("../components/creation/VideoGenerationPanel");
  type VideoPanelProps = React.ComponentProps<typeof VideoGenerationPanel>;
  const baseProps: VideoPanelProps = {
    atDropdownNode: null,
    capabilities: videoCapabilities,
    clearReferenceLabel: "Clear",
    durationOptions: [],
    isOptimizing: false,
    isSubmitting: false,
    modelGroups: [{ provider: "runninghub", label: "RunningHub", options: [{ value: "runninghub:ai-app-video:123", label: "Video app" }] }],
    presetOptions: [],
    prompt: "",
    promptPlaceholder: "Describe",
    promptRequired: true,
    referenceHelp: "Help",
    referenceImages: [],
    referenceLabel: "Reference",
    referenceLimit: 1,
    referenceMode: "reference",
    referenceModeOptions: ["reference"],
    resolutionOptions: [],
    selectedDuration: "",
    selectedModel: "runninghub:ai-app-video:123",
    selectedPreset: "",
    selectedReferenceMode: "reference",
    selectedResolution: "",
    selectedSize: "16:9",
    submitCount: 0,
    onClearReferences: noop,
    onGenerate: noop,
    onOptimizePrompt: noop,
    onPromptChange: noop,
    onPromptDropAsset: noop,
    onReferenceDropAsset: noop,
    onReferenceDropFiles: noop,
    onReferenceRemove: noop,
    onReferenceRoleChange: noop,
    onReferenceUpload: noop,
    onSelectDuration: noop,
    onSelectReferenceMode: noop,
    onSelectResolution: noop,
    onSelectModel: noop,
    onSelectPreset: noop,
    onSelectSize: noop,
  };

  assert.match(generateButtonMarkup(renderToStaticMarkup(React.createElement(VideoGenerationPanel, baseProps)), "生成视频"), /\sdisabled=""/);
  assert.doesNotMatch(
    generateButtonMarkup(renderToStaticMarkup(React.createElement(VideoGenerationPanel, { ...baseProps, promptRequired: false })), "生成视频"),
    /\sdisabled=""/,
  );
});

function generateButtonMarkup(html: string, label: string): string {
  const labelIndex = html.indexOf(label);
  assert.notEqual(labelIndex, -1);
  const buttonStart = html.lastIndexOf("<button", labelIndex);
  assert.notEqual(buttonStart, -1);
  const buttonEnd = html.indexOf("</button>", labelIndex);
  assert.notEqual(buttonEnd, -1);
  return html.slice(buttonStart, buttonEnd);
}

type ResolveFilename = (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options?: unknown,
) => string;

let aliasRegistered = false;
let restoreCompiledPathAlias: (() => void) | undefined;

after(() => {
  restoreCompiledPathAlias?.();
});

function registerCompiledPathAlias(): void {
  if (aliasRegistered) return;
  aliasRegistered = true;

  const moduleWithResolver = Module as unknown as {
    _resolveFilename: ResolveFilename;
  };
  const originalResolveFilename = moduleWithResolver._resolveFilename;
  const compiledRoot = path.resolve(__dirname, "..");

  moduleWithResolver._resolveFilename = (request, parent, isMain, options) => {
    if (request.startsWith("@/")) {
      return path.join(compiledRoot, `${request.slice(2)}.js`);
    }
    return originalResolveFilename(request, parent, isMain, options);
  };
  restoreCompiledPathAlias = () => {
    moduleWithResolver._resolveFilename = originalResolveFilename;
    aliasRegistered = false;
    restoreCompiledPathAlias = undefined;
  };
}
