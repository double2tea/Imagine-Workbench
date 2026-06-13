import { mediaReferenceLabel, type MediaReferenceType } from "../media-references";
import { getOptionalModelCapability, type ProviderModelCapability } from "./model-catalog";
import type { ProviderPayloadFieldMappingDescriptor, ProviderPayloadMappingDescriptor } from "./model-capabilities";
import { getRunningHubYouchuanCatalog, isRunningHubYouchuanImageModel, type RunningHubYouchuanCatalog } from "./runninghub-youchuan";
import type { RunningHubTaskNodeBinding, RunningHubYouchuanAdvancedSettings } from "./types";
export {
  RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS,
  RUNNINGHUB_YOUCHUAN_ADVANCED_LIMITS,
  getRunningHubYouchuanCatalog,
  isRunningHubYouchuanImageModel,
  normalizeRunningHubYouchuanSettingsForModel,
  runningHubYouchuanParameterDescriptors,
  runningHubYouchuanQualityValues,
  runningHubYouchuanSettingsFromParameterValues,
  runningHubYouchuanSettingsToParameterValues,
  runningHubYouchuanSupportsHd,
  type RunningHubYouchuanBooleanField,
  type RunningHubYouchuanBooleanParam,
  type RunningHubYouchuanCatalog,
  type RunningHubYouchuanNumericField,
  type RunningHubYouchuanNumericParam,
  type RunningHubYouchuanReferenceField,
  type RunningHubYouchuanReferenceParam,
} from "./runninghub-youchuan";

export const RUNNINGHUB_LLM_BASE_URL = "https://llm.runninghub.cn";
export const RUNNINGHUB_DEFAULT_LLM_MODEL = "qwen/qwen3.7-max";
export const RUNNINGHUB_CONTROL_IMAGE_APP_MODEL = "ai-app-image:1961345119528140802";
export const RUNNINGHUB_CONTROL_IMAGE_APP_LABEL = "RunningHub Control Image AI App";
const RUNNINGHUB_PROVIDER_PREFIX = "runninghub:";
const RUNNINGHUB_STANDARD_BASE_URLS = new Set(["https://www.runninghub.cn", "https://www.runninghub.ai"]);
export type RunningHubStandardModelKind = "image" | "video" | "audio";
export type RunningHubAppPresetKind = "image" | "video";

export interface RunningHubAppPreset {
  model: string;
  label: string;
  kind: RunningHubAppPresetKind;
  promptRequired: boolean;
  supportsReferences: boolean;
  minReferenceImages: number;
  maxReferenceImages: number;
  referenceMediaTypes: readonly MediaReferenceType[];
  nodeInfoList: readonly RunningHubTaskNodeBinding[];
}

export type RunningHubReferenceMode = "reference" | "firstLast";

export type RunningHubStandardModel = ProviderModelCapability & {
  provider: "runninghub";
  kind: RunningHubStandardModelKind;
  payloadMapping: ProviderPayloadMappingDescriptor;
};

export interface RunningHubStandardRequestInput {
  prompt: string;
  aspectRatio?: string;
  imageResolution?: string;
  imageQuality?: string;
  resolutionName?: string;
  durationSeconds?: string;
  referenceImages: Array<{ dataUri: string }>;
  referenceUrls?: string[];
  referenceMediaUrls?: {
    imageUrls: string[];
    videoUrls: string[];
    audioUrls: string[];
  };
  youchuan?: RunningHubYouchuanAdvancedSettings;
}

export const RUNNINGHUB_APP_PRESETS: readonly RunningHubAppPreset[] = [
  {
    model: RUNNINGHUB_CONTROL_IMAGE_APP_MODEL,
    label: RUNNINGHUB_CONTROL_IMAGE_APP_LABEL,
    kind: "image",
    promptRequired: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    referenceMediaTypes: ["image"],
    nodeInfoList: [
      {
        nodeId: "252",
        fieldName: "image",
        label: "Control image",
        source: "reference",
        valueType: "image",
        required: true,
        referenceIndex: 0,
        referenceType: "image",
        deliveryMode: "fileName",
      },
    ],
  },
];

export function getRunningHubAppPreset(model: string): RunningHubAppPreset | undefined {
  const normalized = normalizeRunningHubModel(model);
  return RUNNINGHUB_APP_PRESETS.find(preset => preset.model === normalized);
}

export function hasRunningHubAppPreset(model: string): boolean {
  return getRunningHubAppPreset(model) !== undefined;
}

export function runningHubAppPresetRequiresPrompt(model: string): boolean {
  return getRunningHubAppPreset(model)?.promptRequired !== false;
}

function normalizeRunningHubModel(model: string): string {
  return model.startsWith(RUNNINGHUB_PROVIDER_PREFIX)
    ? model.slice(RUNNINGHUB_PROVIDER_PREFIX.length)
    : model;
}

export function runningHubLlmBaseUrl(baseUrl: string): string {
  return RUNNINGHUB_STANDARD_BASE_URLS.has(baseUrl) ? RUNNINGHUB_LLM_BASE_URL : baseUrl;
}

export function getRunningHubStandardModel(
  model: string,
  kind: RunningHubStandardModelKind,
): RunningHubStandardModel | undefined {
  const capability = getOptionalModelCapability(`runninghub:${normalizeRunningHubModel(model)}`, kind);
  if (!capability?.payloadMapping || capability.provider !== "runninghub" || capability.kind !== kind) return undefined;
  return capability as RunningHubStandardModel;
}

export function resolveRunningHubStandardModelForReferences(
  model: RunningHubStandardModel,
  referenceCount: number,
): RunningHubStandardModel {
  return resolveRunningHubStandardModel(model, referenceCount, false);
}

export function resolveRunningHubStandardModelForReferenceMedia(
  model: RunningHubStandardModel,
  references: readonly { type: MediaReferenceType }[],
  referenceMode?: RunningHubReferenceMode,
): RunningHubStandardModel {
  return resolveRunningHubStandardModel(
    model,
    references.length,
    references.some(reference => reference.type !== "image"),
    referenceMode,
  );
}

function resolveRunningHubStandardModel(
  model: RunningHubStandardModel,
  referenceCount: number,
  hasNonImageReference: boolean,
  referenceMode?: RunningHubReferenceMode,
): RunningHubStandardModel {
  const routes = model.payloadMapping.referenceRoutes;
  if (!routes || referenceCount === 0) return model;

  if (model.kind === "image" && routes.imageToImage) {
    const resolved = getRunningHubStandardModel(routes.imageToImage, model.kind);
    if (!resolved) throw new Error(model.label + " route target is not configured: " + routes.imageToImage);
    return resolved;
  }

  const routedModel = hasNonImageReference
    ? routes.reference
    : referenceMode === "reference"
      ? routes.reference ?? routes.imageToVideo
      : referenceMode === "firstLast"
        ? referenceCount === 2
          ? routes.firstLast ?? routes.imageToVideo
          : routes.imageToVideo ?? routes.reference
        : referenceCount === 1
          ? routes.imageToVideo ?? routes.reference
          : referenceCount === 2
            ? routes.firstLast ?? routes.reference
            : routes.reference;
  if (!routedModel) return model;

  const resolved = getRunningHubStandardModel(routedModel, model.kind);
  if (!resolved) throw new Error(model.label + " route target is not configured: " + routedModel);
  return resolved;
}

export function getRunningHubStandardEndpoint(model: RunningHubStandardModel): string {
  return model.payloadMapping.endpoint;
}

export function validateRunningHubStandardReferenceCount(model: RunningHubStandardModel, referenceCount: number): void {
  if (!model.supportsReferences && referenceCount > 0) throw new Error(model.label + " does not support reference media");
  if (referenceCount < model.minReferenceImages) throw new Error(model.label + " requires at least " + model.minReferenceImages + " reference media item");
  if (referenceCount > model.maxReferenceImages) throw new Error(model.label + " supports at most " + model.maxReferenceImages + " reference media items");
}

function validateRunningHubStandardReferenceMediaCounts(
  model: RunningHubStandardModel,
  counts: { image: number; video: number; audio: number },
): void {
  validateRunningHubStandardReferenceMediaCount(model, "image", counts.image, model.inputModalities.images);
  validateRunningHubStandardReferenceMediaCount(model, "video", counts.video, model.inputModalities.videos);
  validateRunningHubStandardReferenceMediaCount(model, "audio", counts.audio, model.inputModalities.audio);
}

function validateRunningHubStandardReferenceMediaCount(
  model: RunningHubStandardModel,
  type: MediaReferenceType,
  count: number,
  range: { minCount: number; maxCount: number } | undefined,
): void {
  if (!range) return;
  if (count < range.minCount) throw new Error(model.label + " requires at least " + range.minCount + " " + mediaReferenceLabel(type) + " reference");
  if (count > range.maxCount) throw new Error(model.label + " supports at most " + range.maxCount + " " + mediaReferenceLabel(type) + " reference");
}

export function buildRunningHubStandardBody(
  model: RunningHubStandardModel,
  input: RunningHubStandardRequestInput,
): Record<string, unknown> {
  const referenceMediaUrls = input.referenceMediaUrls ?? {
    imageUrls: input.referenceUrls ?? input.referenceImages.map(ref => ref.dataUri),
    videoUrls: [],
    audioUrls: [],
  };
  const referenceCount = referenceMediaUrls.imageUrls.length + referenceMediaUrls.videoUrls.length + referenceMediaUrls.audioUrls.length;
  validateRunningHubStandardReferenceCount(model, referenceCount);
  validateRunningHubStandardReferenceMediaCounts(model, {
    image: referenceMediaUrls.imageUrls.length,
    video: referenceMediaUrls.videoUrls.length,
    audio: referenceMediaUrls.audioUrls.length,
  });

  const body = buildMappedFieldsBody(model.payloadMapping.fields, input, referenceMediaUrls, model.label);
  if (isRunningHubYouchuanImageModel(model.model)) {
    Object.assign(body, readYouchuanAdvancedSettings(input.youchuan, getRunningHubYouchuanCatalog(model.model)));
  }
  return body;
}

function buildMappedFieldsBody(
  fields: readonly ProviderPayloadFieldMappingDescriptor[],
  input: RunningHubStandardRequestInput,
  referenceMediaUrls: { imageUrls: string[]; videoUrls: string[]; audioUrls: string[] },
  label: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const value = readMappedFieldValue(field, input, referenceMediaUrls, label);
    if (value !== undefined) body[field.target] = value;
  }
  return body;
}

function readMappedFieldValue(
  field: ProviderPayloadFieldMappingDescriptor,
  input: RunningHubStandardRequestInput,
  referenceMediaUrls: { imageUrls: string[]; videoUrls: string[]; audioUrls: string[] },
  label: string,
): unknown {
  if (field.source === "literal") return field.literal;
  if (field.source === "imageUrls" || field.source === "videoUrls" || field.source === "audioUrls" || field.source === "referenceUrls") {
    const values = field.source === "referenceUrls" ? referenceMediaUrls.imageUrls : referenceMediaUrls[field.source];
    return field.valueType === "array" ? values : values[field.index ?? 0];
  }
  return readMappedScalarSource(field, input, label);
}

function readMappedScalarSource(
  field: ProviderPayloadFieldMappingDescriptor,
  input: RunningHubStandardRequestInput,
  label: string,
): string | number | boolean | undefined {
  if (field.source === "prompt") return input.prompt;
  if (field.source === "aspectRatio") return input.aspectRatio === "auto" || input.aspectRatio === undefined ? readMappedDefaultValue(field) : input.aspectRatio;
  if (field.source === "imageResolution") {
    const value = readMappedImageResolutionValue(field, input.imageResolution, label);
    if (value === undefined) return undefined;
    const dimensions = readDimensions(String(value));
    if (dimensions && field.dimensionAxis === "width") return dimensions.width;
    if (dimensions && field.dimensionAxis === "height") return dimensions.height;
    if (field.valueType === "number") return Number(value);
    return value;
  }
  if (field.source === "imageQuality") {
    if (input.imageQuality && input.imageQuality !== "auto") return input.imageQuality;
    return field.omitAuto ? undefined : readMappedDefaultValue(field);
  }
  if (field.source === "resolutionName") {
    const value = input.resolutionName;
    if (!value || value === "auto") return readMappedDefaultValue(field);
    if (field.allowedValues && !field.allowedValues.includes(value)) throw new Error(label + " " + field.target + " must be " + field.allowedValues.join(", "));
    return value;
  }
  if (field.source !== "durationSeconds") return undefined;
  const value = input.durationSeconds;
  if (!value || value === "auto") return readMappedDefaultValue(field);
  if (field.allowedValues && !field.allowedValues.includes(value)) throw new Error(label + " duration must be " + field.allowedValues.join(" or ") + " seconds");
  return field.durationValueType === "number" ? Number(value) : value;
}

function readMappedImageResolutionValue(
  field: ProviderPayloadFieldMappingDescriptor,
  inputValue: string | undefined,
  label: string,
): string | number | boolean | undefined {
  const value = inputValue;
    if (!value || value === "auto") return field.omitAuto ? undefined : readMappedDefaultValue(field);
  if (!field.allowedValues?.includes(value)) {
    const tier = readImageResolutionTier(value);
    if (field.allowedValues?.includes(tier)) return tier;
    if (isResolutionTierValue(field.defaultValue) && tier !== "auto") return tier;
    if (field.allowedValues) throw new Error(label + " resolution must be " + field.allowedValues.join(", "));
  }
  return value;
}

function readMappedDefaultValue(field: ProviderPayloadFieldMappingDescriptor): string | number | boolean | undefined {
  if (field.defaultValue === undefined) return undefined;
  if (field.durationValueType === "number" || field.valueType === "number" || field.target === "width" || field.target === "height") return Number(field.defaultValue);
  return field.defaultValue;
}

function readYouchuanAdvancedSettings(
  settings: RunningHubYouchuanAdvancedSettings | undefined,
  catalog: RunningHubYouchuanCatalog | undefined,
): Record<string, unknown> {
  if (!settings) return {};
  if (!catalog) return {};
  const body: Record<string, unknown> = {};
  for (const param of catalog.numericParams) {
    const value = settings[param.field];
    if (value !== undefined) body[param.field] = value;
  }
  for (const param of catalog.booleanParams) {
    const value = settings[param.field];
    if (value !== undefined) body[param.field] = value;
  }
  for (const param of catalog.referenceParams) {
    const value = settings[param.field];
    if (value !== undefined) body[param.field] = value;
  }
  return body;
}

function readDimensions(value: string | undefined): { width: number; height: number } | undefined {
  if (!value || value === "auto") return undefined;
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return undefined;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function readImageResolutionTier(value: string | undefined): "auto" | "1k" | "2k" | "4k" | "8k" {
  if (!value || value === "auto") return "auto";
  const normalized = value.toLowerCase();
  if (normalized === "1k" || normalized === "2k" || normalized === "4k" || normalized === "8k") return normalized;
  const dimensions = readDimensions(value);
  if (!dimensions) return "auto";
  const longSide = Math.max(dimensions.width, dimensions.height);
  if (longSide >= 7000) return "8k";
  if (longSide >= 3200) return "4k";
  if (longSide >= 1900) return "2k";
  return "1k";
}

function isResolutionTierValue(value: unknown): value is "1k" | "2k" | "4k" | "8k" {
  return value === "1k" || value === "2k" || value === "4k" || value === "8k";
}
