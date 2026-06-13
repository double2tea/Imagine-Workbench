import { mediaReferenceLabel, type MediaReferenceType } from "../media-references";
import {
  defaultCapabilityParameterValues,
  pruneCapabilityParameterValues,
  validateCapabilityParameterValues,
  type JsonValue,
  type ModelParameterDescriptor,
  type ModelParameterValues,
  type ProviderPayloadFieldMappingDescriptor,
  type ProviderPayloadMappingDescriptor,
} from "./model-capabilities";
import type { RunningHubTaskNodeBinding, RunningHubYouchuanAdvancedSettings } from "./types";

export const RUNNINGHUB_LLM_BASE_URL = "https://llm.runninghub.cn";
export const RUNNINGHUB_DEFAULT_LLM_MODEL = "qwen/qwen3.7-max";
export const RUNNINGHUB_CONTROL_IMAGE_APP_MODEL = "ai-app-image:1961345119528140802";
export const RUNNINGHUB_CONTROL_IMAGE_APP_LABEL = "RunningHub Control Image AI App";
const RUNNINGHUB_PROVIDER_PREFIX = "runninghub:";
const RUNNINGHUB_STANDARD_BASE_URLS = new Set(["https://www.runninghub.cn", "https://www.runninghub.ai"]);
const RUNNINGHUB_YOUCHUAN_MODEL_MARKER = "/openapi/v2/youchuan/text-to-image";
const SEEDANCE_15_DURATIONS = ["4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
const SEEDANCE_20_DURATIONS = ["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const SEEDANCE_15_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
const SEEDANCE_15_FAST_RESOLUTIONS = ["720p", "1080p"] as const;
const SEEDANCE_20_FAST_RESOLUTIONS = ["480p", "720p", "1080p", "2k", "4k"] as const;
const SEEDANCE_20_GLOBAL_RESOLUTIONS = ["480p", "720p", "native1080p", "1080p", "2k", "4k"] as const;
const VIDEOX_15_DURATIONS = [
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
] as const;
const VIDEOX_15_RESOLUTIONS = ["720p", "480p"] as const;
const VEO_31_DURATIONS = ["4", "6", "8"] as const;
const VEO_31_CHANNEL_DURATIONS = ["8"] as const;
const VEO_31_4K_RESOLUTIONS = ["720p", "1080p", "4k"] as const;
const VEO_31_HD_RESOLUTIONS = ["720p", "1080p"] as const;
const SEEDREAM_V5_LITE_IMAGE_RESOLUTIONS = ["2k", "3k"] as const;
const RUNNINGHUB_GROK_IMAGE_ASPECT_RATIOS = ["960x960", "720x1280", "1280x720", "1168x784", "784x1168"] as const;

export type RunningHubStandardModelKind = "image" | "video" | "audio";
export type RunningHubAppPresetKind = "image" | "video";

export const RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS = {
  chaos: 0,
  stylize: 0,
  raw: false,
  iw: 1,
  sw: 100,
  hd: false,
} satisfies RunningHubYouchuanAdvancedSettings;

export type RunningHubYouchuanNumericField = Extract<keyof RunningHubYouchuanAdvancedSettings, "chaos" | "stylize" | "iw" | "sw" | "weird" | "ow">;
export type RunningHubYouchuanBooleanField = Extract<keyof RunningHubYouchuanAdvancedSettings, "raw" | "tile" | "hd">;
export type RunningHubYouchuanReferenceField = Extract<keyof RunningHubYouchuanAdvancedSettings, "sref" | "oref">;

export interface RunningHubYouchuanNumericParam {
  field: RunningHubYouchuanNumericField;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface RunningHubYouchuanBooleanParam {
  field: RunningHubYouchuanBooleanField;
  label: string;
  defaultValue: boolean;
}

export interface RunningHubYouchuanReferenceParam {
  field: RunningHubYouchuanReferenceField;
  label: string;
}

export interface RunningHubYouchuanCatalog {
  qualityValues: readonly string[];
  numericParams: readonly RunningHubYouchuanNumericParam[];
  booleanParams: readonly RunningHubYouchuanBooleanParam[];
  referenceParams: readonly RunningHubYouchuanReferenceParam[];
}

const RUNNINGHUB_YOUCHUAN_COMMON_NUMERIC_PARAMS = [
  { field: "chaos", label: "Chaos", min: 0, max: 100, step: 1, defaultValue: 0 },
  { field: "stylize", label: "Stylize", min: 0, max: 1000, step: 1, defaultValue: 0 },
  { field: "iw", label: "图像权重", min: 0, max: 3, step: 0.1, defaultValue: 1 },
  { field: "sw", label: "风格权重", min: 0, max: 1000, step: 1, defaultValue: 100 },
] as const satisfies readonly RunningHubYouchuanNumericParam[];

export const RUNNINGHUB_YOUCHUAN_ADVANCED_LIMITS = {
  chaos: { min: 0, max: 100, step: 1 },
  stylize: { min: 0, max: 1000, step: 1 },
  iw: { min: 0, max: 3, step: 0.1 },
  sw: { min: 0, max: 1000, step: 1 },
  weird: { min: 0, max: 3000, step: 1 },
  ow: { min: 1, max: 1000, step: 1 },
} as const satisfies Record<RunningHubYouchuanNumericField, { min: number; max: number; step: number }>;

const RUNNINGHUB_YOUCHUAN_CATALOGS = {
  v7: {
    qualityValues: ["1", "2", "4"],
    numericParams: [
      ...RUNNINGHUB_YOUCHUAN_COMMON_NUMERIC_PARAMS,
      { field: "weird", label: "Weird", min: 0, max: 3000, step: 1, defaultValue: 0 },
      { field: "ow", label: "对象权重", min: 1, max: 1000, step: 1, defaultValue: 100 },
    ],
    booleanParams: [
      { field: "raw", label: "Raw", defaultValue: false },
      { field: "tile", label: "Tile", defaultValue: false },
    ],
    referenceParams: [
      { field: "sref", label: "风格参考图" },
      { field: "oref", label: "对象参考图" },
    ],
  },
  v81: {
    qualityValues: ["1", "4"],
    numericParams: RUNNINGHUB_YOUCHUAN_COMMON_NUMERIC_PARAMS,
    booleanParams: [
      { field: "raw", label: "Raw", defaultValue: false },
      { field: "hd", label: "2K", defaultValue: false },
    ],
    referenceParams: [
      { field: "sref", label: "风格参考图" },
    ],
  },
} as const satisfies Record<string, RunningHubYouchuanCatalog>;

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

export interface RunningHubStandardModel {
  model: string;
  label: string;
  kind: RunningHubStandardModelKind;
  listed?: boolean;
  supportsReferences: boolean;
  minReferenceImages: number;
  maxReferenceImages: number;
  referenceCounts?: {
    images?: { minCount: number; maxCount: number };
    videos?: { minCount: number; maxCount: number };
    audio?: { minCount: number; maxCount: number };
  };
  videoReferenceMode?: "reference" | "firstLast";
  videoReferenceModes?: readonly ("reference" | "firstLast")[];
  referenceMediaTypes?: readonly MediaReferenceType[];
  sizeOptions?: readonly string[];
  durationOptions?: readonly string[];
  resolutionOptions?: readonly string[];
  audioModes?: readonly ("tts" | "voice_design" | "voice_clone" | "music" | "sfx" | "asr")[];
  audioFormatOptions?: readonly string[];
  referenceRoutes?: {
    imageToImage?: string;
    imageToVideo?: string;
    firstLast?: string;
    reference?: string;
  };
  request: RunningHubStandardRequest;
}

export interface RunningHubStandardRequestInput {
  prompt: string;
  aspectRatio?: string;
  imageResolution?: string;
  imageQuality?: string;
  resolutionName?: string;
  durationSeconds?: string;
  referenceImages: Array<{ dataUri: string }>;
  referenceMedia?: Array<{ dataUri: string; type: MediaReferenceType }>;
  referenceUrls?: string[];
  referenceMediaUrls?: {
    imageUrls: string[];
    videoUrls: string[];
    audioUrls: string[];
  };
  youchuan?: RunningHubYouchuanAdvancedSettings;
}

export type RunningHubReferenceMode = "reference" | "firstLast";

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

export function isRunningHubYouchuanImageModel(model: string): boolean {
  return normalizeRunningHubModel(model).includes(RUNNINGHUB_YOUCHUAN_MODEL_MARKER);
}

export function getRunningHubYouchuanCatalog(model: string): RunningHubYouchuanCatalog | undefined {
  const normalized = normalizeRunningHubModel(model);
  if (normalized.includes("/openapi/v2/youchuan/text-to-image-v7")) return RUNNINGHUB_YOUCHUAN_CATALOGS.v7;
  if (normalized.includes("/openapi/v2/youchuan/text-to-image-v81")) return RUNNINGHUB_YOUCHUAN_CATALOGS.v81;
  return undefined;
}

export function runningHubYouchuanSupportsHd(model: string): boolean {
  return getRunningHubYouchuanCatalog(model)?.booleanParams.some(param => param.field === "hd") === true;
}

export function runningHubYouchuanQualityValues(model: string): readonly string[] {
  return getRunningHubYouchuanCatalog(model)?.qualityValues ?? [];
}

export function runningHubYouchuanParameterDescriptors(model: string): readonly ModelParameterDescriptor[] {
  const catalog = getRunningHubYouchuanCatalog(model);
  if (!catalog) return [];
  return [
    ...catalog.numericParams.map(param => ({
      key: runningHubYouchuanDescriptorKey(param.field),
      kind: "number" as const,
      label: param.label,
      group: "advanced" as const,
      providerField: param.field,
      min: param.min,
      max: param.max,
      step: param.step,
      defaultValue: param.defaultValue,
      ui: { control: "slider" as const },
    })),
    ...catalog.booleanParams.map(param => ({
      key: runningHubYouchuanDescriptorKey(param.field),
      kind: "boolean" as const,
      label: param.label,
      group: "advanced" as const,
      providerField: param.field,
      defaultValue: param.defaultValue,
      ui: { control: "toggle" as const },
    })),
    ...catalog.referenceParams.map(param => ({
      key: runningHubYouchuanDescriptorKey(param.field),
      kind: "reference" as const,
      label: param.label,
      group: "references" as const,
      providerField: param.field,
      mediaTypes: ["image"] as const,
      minCount: 0,
      maxCount: 1,
      role: param.field === "sref" ? "style" as const : "object" as const,
      delivery: "uploadedUrl" as const,
      ui: { control: "referenceSlot" as const },
    })),
  ];
}

export function runningHubYouchuanSettingsToParameterValues(
  model: string,
  settings: RunningHubYouchuanAdvancedSettings | undefined,
): ModelParameterValues {
  const descriptors = runningHubYouchuanParameterDescriptors(model);
  const values = defaultCapabilityParameterValues(descriptors);
  if (!settings) return values;
  for (const descriptor of descriptors) {
    const field = runningHubYouchuanFieldFromDescriptorKey(descriptor.key);
    if (!field) continue;
    const value = settings[field];
    if (value === undefined) continue;
    if (descriptor.kind === "reference") {
      if (typeof value === "string" && value.length > 0) {
        values[descriptor.key] = [{ url: value, type: "image", role: descriptor.role }];
      }
      continue;
    }
    values[descriptor.key] = value;
  }
  return values;
}

export function runningHubYouchuanSettingsFromParameterValues(
  model: string,
  values: ModelParameterValues,
): RunningHubYouchuanAdvancedSettings | undefined {
  const descriptors = runningHubYouchuanParameterDescriptors(model);
  if (descriptors.length === 0) return undefined;
  const validated = validateCapabilityParameterValues(
    descriptors,
    pruneCapabilityParameterValues(descriptors, {
      ...defaultCapabilityParameterValues(descriptors),
      ...values,
    }),
  );
  const next: Partial<RunningHubYouchuanAdvancedSettings> = {};
  for (const descriptor of descriptors) {
    const field = runningHubYouchuanFieldFromDescriptorKey(descriptor.key);
    if (!field) continue;
    const value = validated[descriptor.key];
    if (value === undefined) continue;
    if (descriptor.kind === "reference") {
      if (Array.isArray(value)) {
        const first = value[0];
        if (first?.url) Object.assign(next, { [field]: first.url });
      }
      continue;
    }
    if (descriptor.kind === "number" && typeof value === "number") {
      Object.assign(next, { [field]: value });
    }
    if (descriptor.kind === "boolean" && typeof value === "boolean") {
      Object.assign(next, { [field]: value });
    }
  }
  if (
    typeof next.chaos !== "number" ||
    typeof next.stylize !== "number" ||
    typeof next.raw !== "boolean" ||
    typeof next.iw !== "number" ||
    typeof next.sw !== "number"
  ) {
    throw new Error("RunningHub Youchuan required parameters are missing");
  }
  return next as RunningHubYouchuanAdvancedSettings;
}

export function normalizeRunningHubYouchuanSettingsForModel(
  model: string,
  settings: RunningHubYouchuanAdvancedSettings,
): RunningHubYouchuanAdvancedSettings {
  return runningHubYouchuanSettingsFromParameterValues(
    model,
    runningHubYouchuanSettingsToParameterValues(model, settings),
  ) ?? settings;
}

function runningHubYouchuanDescriptorKey(field: keyof RunningHubYouchuanAdvancedSettings): string {
  return `runninghub.youchuan.${field}`;
}

function runningHubYouchuanFieldFromDescriptorKey(key: string): keyof RunningHubYouchuanAdvancedSettings | undefined {
  if (!key.startsWith("runninghub.youchuan.")) return undefined;
  const field = key.slice("runninghub.youchuan.".length);
  if (
    field === "chaos" ||
    field === "stylize" ||
    field === "raw" ||
    field === "iw" ||
    field === "sw" ||
    field === "weird" ||
    field === "tile" ||
    field === "sref" ||
    field === "oref" ||
    field === "ow" ||
    field === "hd"
  ) {
    return field;
  }
  return undefined;
}

function normalizeRunningHubModel(model: string): string {
  return model.startsWith(RUNNINGHUB_PROVIDER_PREFIX)
    ? model.slice(RUNNINGHUB_PROVIDER_PREFIX.length)
    : model;
}

type RunningHubStandardRequest =
  | {
      type: "mapped-fields";
      endpoint: string;
      operation?: ProviderPayloadMappingDescriptor["operation"];
      fields: readonly RunningHubMappedField[];
    }
  | {
      type: "prompt-dimensions";
      endpoint: string;
      extra?: Record<string, unknown>;
      referenceField?: "imageUrls";
      dimensionMode?: "pixel" | "resolution";
      resolutionField?: "resolution";
    }
  | {
      type: "grok-image";
      endpoint: string;
      model: string;
      referenceField?: "imageUrl";
      aspectField?: "aspectRatio";
      aspectRatioOptions?: readonly string[];
    }
  | {
      type: "node-dimensions";
      endpoint: string;
      promptField: string;
      widthField?: string;
      heightField?: string;
      extra: Record<string, unknown>;
    }
  | {
      type: "hailuo-video";
      endpoint: string;
      requiresReference?: boolean;
    }
  | {
      type: "seedance-video";
      endpoint: string;
      durations: readonly string[];
      aspectField: "aspectRatio" | "ratio";
      extra: Record<string, unknown>;
    }
  | {
      type: "aspect-resolution-video";
      endpoint: string;
      durations: readonly string[];
      aspectField: "aspectRatio" | "ratio";
      durationValueType?: "string" | "number";
      extra?: Record<string, unknown>;
    }
  | {
      type: "image-reference-video";
      endpoint: string;
      durations?: readonly string[];
      referenceField: "imageUrls" | "imageUrl" | "firstFrameUrl" | "firstImageUrl";
      referenceValue?: "single" | "array";
      lastReferenceField?: "lastFrameUrl" | "lastImageUrl";
      videoField?: "videoUrls" | "videoUrl";
      audioField?: "audioUrls";
      aspectField?: "aspectRatio" | "ratio";
      durationValueType?: "string" | "number";
      omitResolution?: boolean;
      extra?: Record<string, unknown>;
    }
  | {
      type: "aspect-resolution-image";
      endpoint: string;
      resolution: string;
      aspectRatioFallback?: string;
      quality?: string;
      referenceField?: "imageUrls";
      extra?: Record<string, unknown>;
    }
  | {
      type: "youchuan-image";
      endpoint: string;
      extra: Record<string, unknown>;
      aspectField?: "aspectRatio";
      qualityField?: "quality";
      referenceField?: "imageUrl";
    };

type RunningHubMappedField =
  | {
      target: string;
      source: "prompt" | "aspectRatio" | "imageResolution" | "imageQuality" | "resolutionName" | "durationSeconds";
      valueType?: "string" | "number" | "boolean" | "array" | "object";
      defaultValue?: string | number | boolean;
      omitAuto?: boolean;
      allowedValues?: readonly string[];
      durationValueType?: "string" | "number";
    }
  | {
      target: string;
      source: "imageUrls" | "videoUrls" | "audioUrls";
      valueType?: "string" | "array";
      index?: number;
    }
  | {
      target: string;
      source: "literal";
      literal: JsonValue;
      valueType?: "string" | "number" | "boolean" | "array" | "object";
    };

type RunningHubMappedScalarSource = "prompt" | "aspectRatio" | "imageResolution" | "imageQuality" | "resolutionName" | "durationSeconds";
type RunningHubMappedScalarField = Extract<RunningHubMappedField, { source: RunningHubMappedScalarSource }>;

const QWEN_IMAGE_20_SIZES = [
  "1024*1024",
  "1536*1536",
  "768*1152",
  "1024*1536",
  "1152*768",
  "1536*1024",
  "960*1280",
  "1080*1440",
  "1280*960",
  "1440*1080",
  "720*1280",
  "1080*1920",
  "1280*720",
  "1920*1080",
  "1344*576",
  "2048*872",
] as const;
const WAN_27_IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536", "1536x1536", "2048x2048"] as const;
const WAN_27_VIDEO_DURATIONS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const WAN_27_SHORT_VIDEO_DURATIONS = ["2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
const WAN_27_VIDEO_RESOLUTIONS = ["720P", "1080P"] as const;
const WAN_27_VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
const KLING_VIDEO_DURATIONS = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const KLING_VIDEO_ASPECT_RATIOS = ["1:1", "16:9", "9:16"] as const;
const KLING_O3_DURATIONS = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const PIXVERSE_V6_RESOLUTIONS = ["360p", "540p", "720p", "1080p"] as const;
const PIXVERSE_V6_DURATIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const PIXVERSE_V6_ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"] as const;
const HAILUO_SHORT_DURATIONS = ["6", "10"] as const;
const HAILUO_PRO_DURATIONS = ["6"] as const;
const MINIMAX_VIDEO_DURATIONS = ["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"] as const;
const MINIMAX_VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9", "adaptive"] as const;
const MINIMAX_VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
const MINIMAX_FAST_VIDEO_RESOLUTIONS = ["480p", "720p"] as const;
const MINIMAX_AUDIO_FORMATS = ["mp3", "wav", "pcm"] as const;

type MappedStandardModelInput = Omit<RunningHubStandardModel, "model" | "request"> & {
  endpoint: string;
  operation?: ProviderPayloadMappingDescriptor["operation"];
  fields: readonly RunningHubMappedField[];
};

function apiModel(endpoint: string): string {
  return `api:/openapi/v2/${endpoint}`;
}

function mappedStandardModel(input: MappedStandardModelInput): RunningHubStandardModel {
  return {
    ...input,
    model: apiModel(input.endpoint),
    request: {
      type: "mapped-fields",
      endpoint: `/openapi/v2/${input.endpoint}`,
      operation: input.operation,
      fields: input.fields,
    },
  };
}

function promptField(target = "prompt"): RunningHubMappedField {
  return { target, source: "prompt", valueType: "string" };
}

function literalField(target: string, literal: JsonValue): RunningHubMappedField {
  return { target, source: "literal", literal };
}

function optionField(
  target: string,
  source: Extract<RunningHubMappedScalarSource, "aspectRatio" | "imageResolution" | "resolutionName" | "durationSeconds">,
  defaultValue: string,
  allowedValues: readonly string[],
  durationValueType?: "string" | "number",
): RunningHubMappedField {
  return { target, source, valueType: "string", defaultValue, allowedValues, durationValueType };
}

function mediaField(target: string, source: "imageUrls" | "videoUrls" | "audioUrls", valueType: "string" | "array", index?: number): RunningHubMappedField {
  return { target, source, valueType, index };
}

function qwenImageFields(references: boolean): readonly RunningHubMappedField[] {
  return [
    ...(references ? [mediaField("imageUrls", "imageUrls", "array")] : []),
    promptField(),
    optionField("size", "imageResolution", "1024*1024", QWEN_IMAGE_20_SIZES),
    literalField("imageNum", "1"),
    ...(references ? [] : [literalField("promptExtend", true)]),
  ];
}

function wanImageFields(references: boolean): readonly RunningHubMappedField[] {
  return [
    ...(references ? [mediaField("imageUrls", "imageUrls", "array")] : []),
    promptField(),
    optionField("width", "imageResolution", "1024", WAN_27_IMAGE_SIZES),
    optionField("height", "imageResolution", "1024", WAN_27_IMAGE_SIZES),
    ...(references ? [] : [literalField("thinkingMode", true)]),
  ];
}

function klingVideoFields(references: "none" | "firstLast" | "single" | "reference" | "edit", durationValueType: "string" | "number" = "string"): readonly RunningHubMappedField[] {
  return [
    promptField(),
    ...(references === "firstLast" ? [mediaField("firstImageUrl", "imageUrls", "string", 0), mediaField("lastImageUrl", "imageUrls", "string", 1)] : []),
    ...(references === "single" ? [mediaField("imageUrl", "imageUrls", "string", 0)] : []),
    ...(references === "reference" ? [mediaField("imageUrls", "imageUrls", "array"), mediaField("videoUrl", "videoUrls", "string", 0)] : []),
    ...(references === "edit" ? [mediaField("videoUrl", "videoUrls", "string", 0), mediaField("imageUrls", "imageUrls", "array")] : []),
    optionField("aspectRatio", "aspectRatio", "16:9", KLING_VIDEO_ASPECT_RATIOS),
    optionField("duration", "durationSeconds", "5", durationValueType === "number" ? KLING_O3_DURATIONS : KLING_VIDEO_DURATIONS, durationValueType),
    literalField("sound", true),
    literalField("multiShot", false),
    literalField("shotType", "customize"),
  ];
}

function wanVideoFields(references: "none" | "firstLast" | "reference" | "edit" | "extend" | "single", durations: readonly string[] = WAN_27_VIDEO_DURATIONS): readonly RunningHubMappedField[] {
  return [
    promptField(),
    ...(references === "firstLast" ? [mediaField("firstImageUrl", "imageUrls", "string", 0), mediaField("lastImageUrl", "imageUrls", "string", 1)] : []),
    ...(references === "reference" || references === "edit" ? [mediaField("imageUrls", "imageUrls", "array"), mediaField("videoUrls", "videoUrls", "array"), mediaField("audioUrl", "audioUrls", "string", 0)] : []),
    ...(references === "extend" ? [mediaField("videoUrl", "videoUrls", "string", 0), mediaField("audioUrl", "audioUrls", "string", 0)] : []),
    ...(references === "single" ? [mediaField("imageUrl", "imageUrls", "string", 0), mediaField("audioUrl", "audioUrls", "string", 0)] : []),
    optionField("resolution", "resolutionName", "720P", WAN_27_VIDEO_RESOLUTIONS),
    optionField("duration", "durationSeconds", "5", durations),
    ...(references === "firstLast" || references === "extend" || references === "single" ? [] : [optionField("aspectRatio", "aspectRatio", "16:9", WAN_27_VIDEO_ASPECT_RATIOS)]),
    literalField("promptExtend", true),
  ];
}

function pixverseVideoFields(references: "none" | "single" | "transition" | "effects" | "extend"): readonly RunningHubMappedField[] {
  return [
    promptField(),
    ...(references === "single" || references === "effects" ? [mediaField(references === "effects" ? "imageUrls" : "imageUrl", "imageUrls", references === "effects" ? "array" : "string", 0)] : []),
    ...(references === "transition" ? [mediaField("firstImageUrl", "imageUrls", "string", 0), mediaField("endImageUrl", "imageUrls", "string", 1)] : []),
    ...(references === "extend" ? [mediaField("videoUrl", "videoUrls", "string", 0)] : []),
    optionField(references === "effects" ? "quality" : "resolution", "resolutionName", "720p", PIXVERSE_V6_RESOLUTIONS),
    optionField("duration", "durationSeconds", "5", PIXVERSE_V6_DURATIONS, "number"),
    ...(references === "single" || references === "effects" || references === "extend" ? [] : [optionField("aspectRatio", "aspectRatio", "16:9", PIXVERSE_V6_ASPECT_RATIOS)]),
    ...(references === "effects" ? [literalField("templateId", "hug") ] : []),
    literalField("generateAudioSwitch", true),
  ];
}

function minimaxVideoFields(references: "none" | "firstLast" | "single" | "multi", resolutions: readonly string[] = MINIMAX_VIDEO_RESOLUTIONS): readonly RunningHubMappedField[] {
  return [
    promptField(),
    ...(references === "firstLast" ? [mediaField("firstFrameUrl", "imageUrls", "string", 0), mediaField("lastFrameUrl", "imageUrls", "string", 1)] : []),
    ...(references === "single" ? [mediaField("imageUrl", "imageUrls", "string", 0)] : []),
    ...(references === "multi" ? [
      mediaField("firstFrameUrl", "imageUrls", "string", 0),
      mediaField("lastFrameUrl", "imageUrls", "string", 1),
      mediaField("imageUrls", "imageUrls", "array"),
      mediaField("videoUrl", "videoUrls", "string", 0),
      mediaField("audioUrl", "audioUrls", "string", 0),
    ] : []),
    optionField("resolution", "resolutionName", "720p", resolutions),
    optionField("duration", "durationSeconds", "5", MINIMAX_VIDEO_DURATIONS),
    optionField("ratio", "aspectRatio", "16:9", MINIMAX_VIDEO_ASPECT_RATIOS),
    literalField("generateAudio", true),
  ];
}

function minimaxTtsFields(): readonly RunningHubMappedField[] {
  return [
    promptField("text"),
    literalField("voice_id", "Wise_Woman"),
    literalField("speed", 1),
    literalField("volume", 1),
    literalField("pitch", 0),
    literalField("emotion", "happy"),
    literalField("enable_base64_output", false),
    literalField("english_normalization", false),
  ];
}

const RUNNINGHUB_PRIORITY_STANDARD_MODELS: readonly RunningHubStandardModel[] = [
  mappedStandardModel({
    endpoint: "alibaba/qwen-image-2.0/text-to-image",
    label: "RunningHub Qwen Image 2.0 Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 3,
    resolutionOptions: QWEN_IMAGE_20_SIZES,
    referenceRoutes: { imageToImage: apiModel("alibaba/qwen-image-2.0/image-edit") },
    operation: "promptDimensions",
    fields: qwenImageFields(false),
  }),
  mappedStandardModel({
    endpoint: "alibaba/qwen-image-2.0/image-edit",
    label: "RunningHub Qwen Image 2.0 Image Edit",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
    resolutionOptions: QWEN_IMAGE_20_SIZES,
    operation: "referenceArray",
    fields: qwenImageFields(true),
  }),
  mappedStandardModel({
    endpoint: "alibaba/qwen-image-2.0-pro/text-to-image",
    label: "RunningHub Qwen Image 2.0 Pro Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 3,
    resolutionOptions: QWEN_IMAGE_20_SIZES,
    referenceRoutes: { imageToImage: apiModel("alibaba/qwen-image-2.0-pro/image-edit") },
    operation: "promptDimensions",
    fields: qwenImageFields(false),
  }),
  mappedStandardModel({
    endpoint: "alibaba/qwen-image-2.0-pro/image-edit",
    label: "RunningHub Qwen Image 2.0 Pro Image Edit",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
    resolutionOptions: QWEN_IMAGE_20_SIZES,
    operation: "referenceArray",
    fields: qwenImageFields(true),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/text-to-image",
    label: "RunningHub Wan 2.7 Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 9,
    resolutionOptions: WAN_27_IMAGE_SIZES,
    referenceRoutes: { imageToImage: apiModel("alibaba/wan-2.7/image-edit") },
    operation: "promptDimensions",
    fields: wanImageFields(false),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/image-edit",
    label: "RunningHub Wan 2.7 Image Edit",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 9,
    resolutionOptions: WAN_27_IMAGE_SIZES,
    operation: "referenceArray",
    fields: wanImageFields(true),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/text-to-image-pro",
    label: "RunningHub Wan 2.7 Pro Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 9,
    resolutionOptions: WAN_27_IMAGE_SIZES,
    referenceRoutes: { imageToImage: apiModel("alibaba/wan-2.7/image-edit-pro") },
    operation: "promptDimensions",
    fields: wanImageFields(false),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/image-edit-pro",
    label: "RunningHub Wan 2.7 Pro Image Edit",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 9,
    resolutionOptions: WAN_27_IMAGE_SIZES,
    operation: "referenceArray",
    fields: wanImageFields(true),
  }),
  ...[
    ["kling-v3.0-std/text-to-video", "RunningHub Kling V3.0 Std Text-to-Video", "none", "string"] as const,
    ["kling-v3.0-pro/text-to-video", "RunningHub Kling V3.0 Pro Text-to-Video", "none", "string"] as const,
    ["kling-v3-4k/text-to-video", "RunningHub Kling V3 4K Text-to-Video", "none", "string"] as const,
    ["kling-video-o3-std/text-to-video", "RunningHub Kling O3 Std Text-to-Video", "none", "number"] as const,
    ["kling-video-o3-pro/text-to-video", "RunningHub Kling O3 Pro Text-to-Video", "none", "number"] as const,
    ["kling-video-o3-4k/text-to-video", "RunningHub Kling O3 4K Text-to-Video", "none", "number"] as const,
  ].map(([endpoint, label, references, durationValueType]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 7,
    referenceRoutes: { imageToVideo: apiModel(endpoint.replace("text-to-video", "image-to-video")) },
    durationOptions: durationValueType === "number" ? KLING_O3_DURATIONS : KLING_VIDEO_DURATIONS,
    sizeOptions: KLING_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: klingVideoFields(references, durationValueType),
  })),
  ...[
    ["kling-v3.0-std/image-to-video", "RunningHub Kling V3.0 Std Image-to-Video", "firstLast", "string"] as const,
    ["kling-v3.0-pro/image-to-video", "RunningHub Kling V3.0 Pro Image-to-Video", "firstLast", "string"] as const,
    ["kling-v3-4k/image-to-video", "RunningHub Kling V3 4K Image-to-Video", "single", "number"] as const,
    ["kling-video-o3-std/image-to-video", "RunningHub Kling O3 Std Image-to-Video", "firstLast", "number"] as const,
    ["kling-video-o3-pro/image-to-video", "RunningHub Kling O3 Pro Image-to-Video", "firstLast", "number"] as const,
    ["kling-video-o3-4k/image-to-video", "RunningHub Kling O3 4K Image-to-Video", "firstLast", "number"] as const,
  ].map(([endpoint, label, references, durationValueType]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: references === "firstLast" ? 2 : 1,
    videoReferenceMode: "firstLast",
    videoReferenceModes: ["firstLast"],
    referenceMediaTypes: ["image"],
    durationOptions: durationValueType === "number" ? KLING_O3_DURATIONS : KLING_VIDEO_DURATIONS,
    sizeOptions: KLING_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: klingVideoFields(references, durationValueType),
  })),
  ...[
    ["kling-video-o3-std/reference-to-video", "RunningHub Kling O3 Std Reference-to-Video"] as const,
    ["kling-video-o3-pro/reference-to-video", "RunningHub Kling O3 Pro Reference-to-Video"] as const,
    ["kling-video-o3-4k/reference-to-video", "RunningHub Kling O3 4K Reference-to-Video"] as const,
  ].map(([endpoint, label]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 7,
    referenceMediaTypes: ["image", "video"],
    durationOptions: KLING_O3_DURATIONS,
    sizeOptions: KLING_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: klingVideoFields("reference", "number"),
  })),
  ...[
    ["kling-v3.0-std/motion-control", "RunningHub Kling V3.0 Std Motion Control"] as const,
    ["kling-v3.0-pro/motion-control", "RunningHub Kling V3.0 Pro Motion Control"] as const,
  ].map(([endpoint, label]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
    referenceMediaTypes: ["image", "video"],
    referenceCounts: {
      images: { minCount: 1, maxCount: 1 },
      videos: { minCount: 1, maxCount: 1 },
    },
    operation: "providerSpecific",
    fields: [
      mediaField("imageUrl", "imageUrls", "string", 0),
      mediaField("videoUrl", "videoUrls", "string", 0),
      promptField(),
      literalField("characterOrientation", "image"),
      literalField("keepOriginalSound", true),
    ],
  })),
  ...[
    ["kling-video-o3-std/video-edit", "RunningHub Kling O3 Std Video Edit"] as const,
    ["kling-video-o3-pro/video-edit", "RunningHub Kling O3 Pro Video Edit"] as const,
  ].map(([endpoint, label]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 5,
    referenceMediaTypes: ["image", "video"],
    referenceCounts: {
      images: { minCount: 0, maxCount: 4 },
      videos: { minCount: 1, maxCount: 1 },
    },
    operation: "providerSpecific",
    fields: [
      promptField(),
      mediaField("videoUrl", "videoUrls", "string", 0),
      mediaField("imageUrls", "imageUrls", "array"),
      literalField("keepOriginalSound", true),
    ],
  })),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/text-to-video",
    label: "RunningHub Wan 2.7 Text-to-Video",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 2,
    referenceRoutes: { imageToVideo: apiModel("alibaba/wan-2.7/image-to-video"), reference: apiModel("alibaba/wan-2.7/reference-to-video") },
    durationOptions: WAN_27_VIDEO_DURATIONS,
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    sizeOptions: WAN_27_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: wanVideoFields("none"),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/image-to-video",
    label: "RunningHub Wan 2.7 Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
    videoReferenceModes: ["firstLast"],
    referenceMediaTypes: ["image", "audio"],
    durationOptions: WAN_27_VIDEO_DURATIONS,
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    operation: "providerSpecific",
    fields: wanVideoFields("firstLast"),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/reference-to-video",
    label: "RunningHub Wan 2.7 Reference-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 10,
    referenceMediaTypes: ["image", "video", "audio"],
    durationOptions: WAN_27_SHORT_VIDEO_DURATIONS,
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    sizeOptions: WAN_27_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: wanVideoFields("reference", WAN_27_SHORT_VIDEO_DURATIONS),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/video-edit",
    label: "RunningHub Wan 2.7 Video Edit",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 4,
    referenceMediaTypes: ["image", "video"],
    durationOptions: ["0", ...WAN_27_SHORT_VIDEO_DURATIONS],
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    sizeOptions: WAN_27_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: wanVideoFields("edit", ["0", ...WAN_27_SHORT_VIDEO_DURATIONS]),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7/video-extend",
    label: "RunningHub Wan 2.7 Video Extend",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    referenceMediaTypes: ["video", "audio"],
    durationOptions: WAN_27_VIDEO_DURATIONS,
    resolutionOptions: WAN_27_VIDEO_RESOLUTIONS,
    operation: "providerSpecific",
    fields: wanVideoFields("extend"),
  }),
  mappedStandardModel({
    endpoint: "alibaba/wan-2.7-spicy/image-to-video",
    label: "RunningHub Wan 2.7 Spicy Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    referenceMediaTypes: ["image", "audio"],
    durationOptions: WAN_27_VIDEO_DURATIONS,
    resolutionOptions: ["720p", "1080p"],
    operation: "providerSpecific",
    fields: wanVideoFields("single"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/text-to-video",
    label: "RunningHub PixVerse V6 Text-to-Video",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 4,
    referenceRoutes: { imageToVideo: apiModel("pixverse-v6/image-to-video") },
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    sizeOptions: PIXVERSE_V6_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("none"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/image-to-video",
    label: "RunningHub PixVerse V6 Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    referenceMediaTypes: ["image"],
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("single"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/transition",
    label: "RunningHub PixVerse V6 Transition",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
    referenceMediaTypes: ["image"],
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    sizeOptions: PIXVERSE_V6_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("transition"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/effects",
    label: "RunningHub PixVerse V6 Effects",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 4,
    referenceMediaTypes: ["image"],
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("effects"),
  }),
  mappedStandardModel({
    endpoint: "pixverse-v6/extend",
    label: "RunningHub PixVerse V6 Extend",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    referenceMediaTypes: ["video"],
    durationOptions: PIXVERSE_V6_DURATIONS,
    resolutionOptions: PIXVERSE_V6_RESOLUTIONS,
    operation: "providerSpecific",
    fields: pixverseVideoFields("extend"),
  }),
  ...[
    ["minimax/hailuo-02/t2v-pro", "RunningHub Hailuo 02 Text-to-Video Pro", HAILUO_PRO_DURATIONS] as const,
    ["minimax/hailuo-2.3/t2v-standard", "RunningHub Hailuo 2.3 Text-to-Video Standard", HAILUO_SHORT_DURATIONS] as const,
    ["minimax/hailuo-2.3/t2v-pro", "RunningHub Hailuo 2.3 Text-to-Video Pro", HAILUO_PRO_DURATIONS] as const,
  ].map(([endpoint, label, durations]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 2,
    referenceRoutes: {
      imageToVideo: apiModel(endpoint === "minimax/hailuo-2.3/t2v-pro"
        ? "minimax/hailuo-2.3/image-to-video-pro"
        : endpoint.replace("t2v", "i2v").replace("text-to-video", "image-to-video")),
    },
    durationOptions: durations,
    operation: "providerSpecific",
    fields: [promptField(), optionField("duration", "durationSeconds", durations[0], durations), literalField("enablePromptExpansion", true)],
  })),
  ...[
    ["minimax/hailuo-02/i2v-pro", "RunningHub Hailuo 02 Image-to-Video Pro", "firstLast", HAILUO_PRO_DURATIONS] as const,
    ["minimax/hailuo-2.3/i2v-standard", "RunningHub Hailuo 2.3 Image-to-Video Standard", "single", HAILUO_SHORT_DURATIONS] as const,
    ["minimax/hailuo-2.3/image-to-video-pro", "RunningHub Hailuo 2.3 Image-to-Video Pro", "single", HAILUO_PRO_DURATIONS] as const,
    ["minimax/hailuo-2.3-fast/image-to-video", "RunningHub Hailuo 2.3 Fast Image-to-Video", "single", HAILUO_SHORT_DURATIONS] as const,
    ["minimax/hailuo-2.3-fast-pro/image-to-video", "RunningHub Hailuo 2.3 Fast Pro Image-to-Video", "single", HAILUO_PRO_DURATIONS] as const,
    ["minimax/hailuo-02/fast", "RunningHub Hailuo 02 Fast Image-to-Video", "single", HAILUO_SHORT_DURATIONS] as const,
  ].map(([endpoint, label, referenceMode, durations]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: referenceMode === "firstLast" ? 2 : 1,
    videoReferenceMode: referenceMode === "firstLast" ? "firstLast" : "reference",
    videoReferenceModes: referenceMode === "firstLast" ? ["firstLast"] : ["reference"],
    referenceMediaTypes: ["image"],
    durationOptions: durations,
    operation: "providerSpecific",
    fields: [
      promptField(),
      ...(referenceMode === "firstLast" ? [mediaField("firstImageUrl", "imageUrls", "string", 0), mediaField("lastImageUrl", "imageUrls", "string", 1)] : [mediaField("imageUrl", "imageUrls", "string", 0)]),
      optionField("duration", "durationSeconds", durations[0], durations),
      literalField("enablePromptExpansion", true),
    ],
  })),
  ...[
    ["minimax/nova-video-2.0/text-to-video", "RunningHub MiniMax Nova Video 2.0 Text-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/nova-video-2.0-fast/text-to-video", "RunningHub MiniMax Nova Video 2.0 Fast Text-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0/text-to-video", "RunningHub MiniMax EVA Video 2.0 Text-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0-fast/text-to-video", "RunningHub MiniMax EVA Video 2.0 Fast Text-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
  ].map(([endpoint, label, resolutions]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 5,
    referenceRoutes: { imageToVideo: apiModel(endpoint.replace("text-to-video", "image-to-video")), reference: apiModel(endpoint.replace("text-to-video", "multimodal-to-video")) },
    durationOptions: MINIMAX_VIDEO_DURATIONS,
    resolutionOptions: resolutions,
    sizeOptions: MINIMAX_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: minimaxVideoFields("none", resolutions),
  })),
  ...[
    ["minimax/nova-video-2.0/image-to-video", "RunningHub MiniMax Nova Video 2.0 Image-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/nova-video-2.0-fast/image-to-video", "RunningHub MiniMax Nova Video 2.0 Fast Image-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0/image-to-video", "RunningHub MiniMax EVA Video 2.0 Image-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0-fast/image-to-video", "RunningHub MiniMax EVA Video 2.0 Fast Image-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
  ].map(([endpoint, label, resolutions]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
    videoReferenceModes: ["firstLast"],
    referenceMediaTypes: ["image"],
    durationOptions: MINIMAX_VIDEO_DURATIONS,
    resolutionOptions: resolutions,
    sizeOptions: MINIMAX_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: minimaxVideoFields("firstLast", resolutions),
  })),
  ...[
    ["minimax/nova-video-2.0/multimodal-to-video", "RunningHub MiniMax Nova Video 2.0 Multimodal-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/nova-video-2.0-fast/multimodal-to-video", "RunningHub MiniMax Nova Video 2.0 Fast Multimodal-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0/multimodal-to-video", "RunningHub MiniMax EVA Video 2.0 Multimodal-to-Video", MINIMAX_VIDEO_RESOLUTIONS] as const,
    ["minimax/eva-video-2.0-fast/multimodal-to-video", "RunningHub MiniMax EVA Video 2.0 Fast Multimodal-to-Video", MINIMAX_FAST_VIDEO_RESOLUTIONS] as const,
  ].map(([endpoint, label, resolutions]) => mappedStandardModel({
    endpoint,
    label,
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 5,
    referenceMediaTypes: ["image", "video", "audio"],
    durationOptions: MINIMAX_VIDEO_DURATIONS,
    resolutionOptions: resolutions,
    sizeOptions: MINIMAX_VIDEO_ASPECT_RATIOS,
    operation: "providerSpecific",
    fields: minimaxVideoFields("multi", resolutions),
  })),
  ...[
    ["rhart-audio/text-to-audio/speech-2.8-hd", "RunningHub MiniMax Speech 2.8 HD"] as const,
    ["rhart-audio/text-to-audio/speech-02-hd", "RunningHub MiniMax Speech 02 HD"] as const,
    ["rhart-audio/text-to-audio/speech-2.8-turbo", "RunningHub MiniMax Speech 2.8 Turbo"] as const,
    ["rhart-audio/text-to-audio/speech-02-turbo", "RunningHub MiniMax Speech 02 Turbo"] as const,
    ["rhart-audio/text-to-audio/speech-2.6-hd", "RunningHub MiniMax Speech 2.6 HD"] as const,
    ["rhart-audio/text-to-audio/speech-2.6-turbo", "RunningHub MiniMax Speech 2.6 Turbo"] as const,
  ].map(([endpoint, label]) => mappedStandardModel({
    endpoint,
    label,
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["tts"],
    audioFormatOptions: ["mp3"],
    operation: "providerSpecific",
    fields: minimaxTtsFields(),
  })),
  mappedStandardModel({
    endpoint: "rhart-audio/text-to-audio/voice-clone",
    label: "RunningHub MiniMax Voice Clone",
    kind: "audio",
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    referenceMediaTypes: ["audio"],
    audioModes: ["voice_clone"],
    audioFormatOptions: ["mp3"],
    operation: "providerSpecific",
    fields: [
      mediaField("audio", "audioUrls", "string", 0),
      promptField("text"),
      literalField("custom_voice_id", "Elegant_Man"),
      literalField("accuracy", 0.7),
      literalField("need_noise_reduction", false),
      literalField("need_volume_normalization", false),
      literalField("model", "speech-02-hd"),
    ],
  }),
  mappedStandardModel({
    endpoint: "minimax/voice-design",
    label: "RunningHub MiniMax Voice Design",
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["voice_design"],
    audioFormatOptions: ["mp3"],
    operation: "providerSpecific",
    fields: [
      promptField(),
      literalField("previewText", "漂亮！一个精彩的过人！他带球突破，射门——球进了！不可思议的进球，他再次拯救了队伍！"),
      literalField("aigcWatermark", false),
    ],
  }),
  mappedStandardModel({
    endpoint: "rhart-audio/text-to-audio/music-2.5",
    label: "RunningHub MiniMax Music 2.5 Text-to-Music",
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["music"],
    audioFormatOptions: ["mp3"],
    operation: "providerSpecific",
    fields: [
      promptField(),
      literalField("lyrics", "[Verse] 心早有预感 光速地飙燃 浑然不知山前的悬崖 生而无惧是少年"),
      literalField("sampleRate", "44100"),
      literalField("bitrate", "256000"),
    ],
  }),
  mappedStandardModel({
    endpoint: "minimax/music-2.6/text-to-music",
    label: "RunningHub MiniMax Music 2.6 Text-to-Music",
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["music"],
    audioFormatOptions: MINIMAX_AUDIO_FORMATS,
    operation: "providerSpecific",
    fields: [
      promptField(),
      literalField("lyrics", "[Verse] 心早有预感 光速地飙燃 浑然不知山前的悬崖 生而无惧是少年"),
      literalField("sampleRate", "44100"),
      literalField("bitrate", "256000"),
      literalField("format", "mp3"),
      literalField("lyricsOptimizer", false),
    ],
  }),
  mappedStandardModel({
    endpoint: "minimax/music-2.6/text-to-instrumental",
    label: "RunningHub MiniMax Music 2.6 Text-to-Instrumental",
    kind: "audio",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    audioModes: ["music"],
    audioFormatOptions: MINIMAX_AUDIO_FORMATS,
    operation: "providerSpecific",
    fields: [
      promptField(),
      literalField("sampleRate", "44100"),
      literalField("bitrate", "256000"),
      literalField("format", "mp3"),
    ],
  }),
];

export const RUNNINGHUB_STANDARD_MODELS: readonly RunningHubStandardModel[] = [
  ...RUNNINGHUB_PRIORITY_STANDARD_MODELS,
  {
    model: "api:/openapi/v2/seedream-v5-lite/text-to-image",
    label: "RunningHub Seedream V5 Lite Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 10,
    resolutionOptions: SEEDREAM_V5_LITE_IMAGE_RESOLUTIONS,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/seedream-v5-lite/image-to-image",
    },
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/seedream-v5-lite/text-to-image",
      dimensionMode: "resolution",
      resolutionField: "resolution",
      extra: {
        sequentialImageGeneration: "disabled",
        maxImages: 1,
      },
    },
  },
  {
    model: "api:/openapi/v2/seedream-v5-lite/image-to-image",
    label: "RunningHub Seedream V5 Lite Image-to-Image",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 10,
    resolutionOptions: SEEDREAM_V5_LITE_IMAGE_RESOLUTIONS,
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/seedream-v5-lite/image-to-image",
      referenceField: "imageUrls",
      dimensionMode: "resolution",
      resolutionField: "resolution",
      extra: {
        sequentialImageGeneration: "disabled",
        maxImages: 1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/jimeng-4.6/text-to-image",
    label: "RunningHub Jimeng 4.6 Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 16,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/bytedance/jimeng-4.6/image-to-image",
    },
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/bytedance/jimeng-4.6/text-to-image",
      extra: {
        scale: 50,
        forceSingle: false,
        minRatio: 0.333333,
        maxRatio: 3,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/jimeng-4.6/image-to-image",
    label: "RunningHub Jimeng 4.6 Image-to-Image",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 14,
    request: {
      type: "prompt-dimensions",
      endpoint: "/openapi/v2/bytedance/jimeng-4.6/image-to-image",
      referenceField: "imageUrls",
      extra: {
        scale: 50,
        forceSingle: false,
        minRatio: 0.333333,
        maxRatio: 3,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-g/text-to-image",
    label: "RunningHub Grok Image 4.2 Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 1,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-g/image-to-image",
    },
    request: {
      type: "grok-image",
      endpoint: "/openapi/v2/rhart-image-g/text-to-image",
      model: "g-4.2",
      aspectField: "aspectRatio",
      aspectRatioOptions: RUNNINGHUB_GROK_IMAGE_ASPECT_RATIOS,
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-g/image-to-image",
    label: "RunningHub Grok Image 4.2 Image-to-Image",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
    request: {
      type: "grok-image",
      endpoint: "/openapi/v2/rhart-image-g/image-to-image",
      model: "g-4.2",
      referenceField: "imageUrl",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image/z-image/turbo",
    label: "RunningHub Z-Image Turbo",
    kind: "image",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    request: {
      type: "node-dimensions",
      endpoint: "/openapi/v2/rhart-image/z-image/turbo",
      promptField: "10##text",
      extra: {
        "28##select": "8",
        "29##file_type": "PNG",
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-image/f-2-dev/text-to-image",
    label: "RunningHub Flux 2 Dev Text-to-Image",
    kind: "image",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    request: {
      type: "node-dimensions",
      endpoint: "/openapi/v2/rhart-image/f-2-dev/text-to-image",
      promptField: "12##text",
      widthField: "30##value",
      heightField: "29##value",
      extra: {
        "41##select": "1",
        "43##file_type": "PNG",
      },
    },
  },
  {
    model: "api:/openapi/v2/minimax/hailuo-02/standard",
    label: "RunningHub Hailuo 02 Standard Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
    durationOptions: ["6", "10"],
    referenceRoutes: {
      firstLast: "api:/openapi/v2/minimax/hailuo-02/i2v-standard",
      imageToVideo: "api:/openapi/v2/minimax/hailuo-02/i2v-standard",
    },
    request: {
      type: "hailuo-video",
      endpoint: "/openapi/v2/minimax/hailuo-02/standard",
    },
  },
  {
    model: "api:/openapi/v2/minimax/hailuo-02/t2v-standard",
    label: "RunningHub Hailuo 02 T2V Standard",
    kind: "video",
    listed: false,
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    durationOptions: ["6", "10"],
    request: {
      type: "hailuo-video",
      endpoint: "/openapi/v2/minimax/hailuo-02/t2v-standard",
    },
  },
  {
    model: "api:/openapi/v2/minimax/hailuo-02/pro",
    label: "RunningHub Hailuo 02 Pro Video",
    kind: "video",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
    durationOptions: ["6", "10"],
    request: {
      type: "hailuo-video",
      endpoint: "/openapi/v2/minimax/hailuo-02/pro",
    },
  },
  {
    model: "api:/openapi/v2/minimax/hailuo-02/i2v-standard",
    label: "RunningHub Hailuo 02 I2V Standard",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
    durationOptions: ["6", "10"],
    request: {
      type: "hailuo-video",
      endpoint: "/openapi/v2/minimax/hailuo-02/i2v-standard",
      requiresReference: true,
    },
  },
  {
    model: "api:/openapi/v2/seedance-v1.5-pro/text-to-video",
    label: "RunningHub Seedance 1.5 Pro Text-to-Video",
    kind: "video",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
      durationOptions: SEEDANCE_15_DURATIONS,
      resolutionOptions: SEEDANCE_15_RESOLUTIONS,
    request: {
      type: "seedance-video",
      endpoint: "/openapi/v2/seedance-v1.5-pro/text-to-video",
        durations: SEEDANCE_15_DURATIONS,
      aspectField: "aspectRatio",
      extra: {
        generateAudio: "true",
        cameraFixed: "false",
      },
    },
  },
  {
    model: "api:/openapi/v2/seedance-v1.5-pro/text-to-video-fast",
    label: "RunningHub Seedance 1.5 Pro Fast Text-to-Video",
    kind: "video",
    supportsReferences: false,
    minReferenceImages: 0,
    maxReferenceImages: 0,
      durationOptions: SEEDANCE_15_DURATIONS,
      resolutionOptions: SEEDANCE_15_FAST_RESOLUTIONS,
    request: {
      type: "seedance-video",
      endpoint: "/openapi/v2/seedance-v1.5-pro/text-to-video-fast",
        durations: SEEDANCE_15_DURATIONS,
      aspectField: "aspectRatio",
      extra: {
        generateAudio: "true",
        cameraFixed: "false",
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video",
    label: "RunningHub Seedance 2.0 Global Fast Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 9,
    videoReferenceMode: "reference",
    videoReferenceModes: ["reference", "firstLast"],
    referenceMediaTypes: ["image", "video", "audio"],
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_FAST_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video",
      firstLast: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video",
      reference: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video",
    },
    request: {
      type: "seedance-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global-fast/text-to-video",
        durations: SEEDANCE_20_DURATIONS,
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video",
    label: "RunningHub Seedance 2.0 Global Fast Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_FAST_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global-fast/image-to-video",
        durations: SEEDANCE_20_DURATIONS,
      referenceField: "firstFrameUrl",
      lastReferenceField: "lastFrameUrl",
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        realPersonMode: true,
        conversionSlots: ["all"],
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video",
    label: "RunningHub Seedance 2.0 Global Fast Multimodal Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 9,
    referenceMediaTypes: ["image", "video", "audio"],
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_FAST_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global-fast/multimodal-video",
        durations: SEEDANCE_20_DURATIONS,
      referenceField: "imageUrls",
      videoField: "videoUrls",
      audioField: "audioUrls",
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        realPersonMode: true,
        conversionSlots: ["all"],
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global/text-to-video",
    label: "RunningHub Seedance 2.0 Global Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 9,
    videoReferenceMode: "reference",
    videoReferenceModes: ["reference", "firstLast"],
    referenceMediaTypes: ["image", "video", "audio"],
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_GLOBAL_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/bytedance/seedance-2.0-global/image-to-video",
      firstLast: "api:/openapi/v2/bytedance/seedance-2.0-global/image-to-video",
      reference: "api:/openapi/v2/bytedance/seedance-2.0-global/multimodal-video",
    },
    request: {
      type: "seedance-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global/text-to-video",
        durations: SEEDANCE_20_DURATIONS,
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global/image-to-video",
    label: "RunningHub Seedance 2.0 Global Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_GLOBAL_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global/image-to-video",
        durations: SEEDANCE_20_DURATIONS,
      referenceField: "firstFrameUrl",
      lastReferenceField: "lastFrameUrl",
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        realPersonMode: true,
        conversionSlots: ["all"],
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/bytedance/seedance-2.0-global/multimodal-video",
    label: "RunningHub Seedance 2.0 Global Multimodal Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 9,
    referenceMediaTypes: ["image", "video", "audio"],
      durationOptions: SEEDANCE_20_DURATIONS,
      resolutionOptions: SEEDANCE_20_GLOBAL_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/bytedance/seedance-2.0-global/multimodal-video",
        durations: SEEDANCE_20_DURATIONS,
      referenceField: "imageUrls",
      videoField: "videoUrls",
      audioField: "audioUrls",
      aspectField: "ratio",
      extra: {
        generateAudio: true,
        realPersonMode: true,
        conversionSlots: ["all"],
        returnLastFrame: false,
        seed: -1,
      },
    },
  },
  {
    model: "api:/openapi/v2/gemini-omni-flash/text-to-video",
    label: "RunningHub Gemini Omni Flash Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 8,
    videoReferenceMode: "reference",
    referenceMediaTypes: ["image", "video"],
    durationOptions: ["4", "6", "8", "10"],
    resolutionOptions: ["720p", "1080p", "4k"],
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/gemini-omni-flash/image-to-video",
      reference: "api:/openapi/v2/gemini-omni-flash/video-edit",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/gemini-omni-flash/text-to-video",
      durations: ["4", "6", "8", "10"],
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/gemini-omni-flash/image-to-video",
    label: "RunningHub Gemini Omni Flash Image-to-Video",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
    durationOptions: ["4", "6", "8", "10"],
    resolutionOptions: ["720p", "1080p", "4k"],
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/gemini-omni-flash/image-to-video",
      durations: ["4", "6", "8", "10"],
      referenceField: "imageUrls",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/gemini-omni-flash/video-edit",
    label: "RunningHub Gemini Omni Flash Video Edit",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 8,
    referenceMediaTypes: ["image", "video"],
    resolutionOptions: ["720p", "1080p", "4k"],
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/gemini-omni-flash/video-edit",
      referenceField: "imageUrls",
      videoField: "videoUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-n-g31-flash/text-to-image",
    label: "RunningHub Gemini 3 Flash Image Channel Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 10,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-n-g31-flash/image-to-image",
    },
    request: {
      type: "aspect-resolution-image",
      endpoint: "/openapi/v2/rhart-image-n-g31-flash/text-to-image",
      resolution: "1k",
      aspectRatioFallback: "9:16",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-n-g31-flash/image-to-image",
    label: "RunningHub Gemini 3 Flash Image Edit Channel Low Price",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 10,
    request: {
      type: "aspect-resolution-image",
      endpoint: "/openapi/v2/rhart-image-n-g31-flash/image-to-image",
      resolution: "1k",
      aspectRatioFallback: "9:16",
      referenceField: "imageUrls",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-n-g31-flash-official/text-to-image",
    label: "RunningHub Gemini 3 Flash Image Official Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 14,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-n-g31-flash-official/image-to-image",
    },
    request: {
      type: "aspect-resolution-image",
      endpoint: "/openapi/v2/rhart-image-n-g31-flash-official/text-to-image",
      resolution: "1k",
      aspectRatioFallback: "21:9",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-n-g31-flash-official/image-to-image",
    label: "RunningHub Gemini 3 Flash Image Edit Official Stable",
    kind: "image",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 14,
    request: {
      type: "aspect-resolution-image",
      endpoint: "/openapi/v2/rhart-image-n-g31-flash-official/image-to-image",
      resolution: "1k",
      aspectRatioFallback: "9:16",
      referenceField: "imageUrls",
    },
  },
    {
      model: "api:/openapi/v2/rhart-image-n-pro/text-to-image",
      label: "RunningHub Gemini Pro Image Channel Auto",
      kind: "image",
      supportsReferences: true,
      minReferenceImages: 0,
      maxReferenceImages: 10,
      referenceRoutes: {
        imageToImage: "api:/openapi/v2/rhart-image-n-pro/edit",
      },
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro/text-to-image",
        resolution: "1k",
        aspectRatioFallback: "9:16",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro/edit",
      label: "RunningHub Gemini Pro Image Edit Channel Low Price",
      kind: "image",
      listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro/edit",
        resolution: "1k",
        aspectRatioFallback: "3:4",
        referenceField: "imageUrls",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro-official/text-to-image",
      label: "RunningHub Gemini Pro Image Official Auto",
      kind: "image",
      supportsReferences: true,
      minReferenceImages: 0,
      maxReferenceImages: 10,
      referenceRoutes: {
        imageToImage: "api:/openapi/v2/rhart-image-n-pro-official/edit",
      },
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro-official/text-to-image",
        resolution: "1k",
        aspectRatioFallback: "3:4",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro-official/edit",
      label: "RunningHub Gemini Pro Image Edit Official Stable",
      kind: "image",
      listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro-official/edit",
        resolution: "1k",
        aspectRatioFallback: "3:4",
        referenceField: "imageUrls",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro-official/text-to-image-ultra",
      label: "RunningHub Gemini Pro Image Ultra Official Auto",
      kind: "image",
      supportsReferences: true,
      minReferenceImages: 0,
      maxReferenceImages: 10,
      referenceRoutes: {
        imageToImage: "api:/openapi/v2/rhart-image-n-pro-official/edit-ultra",
      },
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro-official/text-to-image-ultra",
        resolution: "8k",
        aspectRatioFallback: "3:4",
      },
    },
    {
      model: "api:/openapi/v2/rhart-image-n-pro-official/edit-ultra",
      label: "RunningHub Gemini Pro Image Edit Ultra Official Stable",
      kind: "image",
      listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
      request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-n-pro-official/edit-ultra",
        resolution: "8k",
        aspectRatioFallback: "3:4",
        referenceField: "imageUrls",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-g/text-to-video",
    label: "RunningHub VideoX 1.5 Channel Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 7,
    videoReferenceMode: "reference",
    durationOptions: VIDEOX_15_DURATIONS,
    resolutionOptions: VIDEOX_15_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/rhart-video-g/image-to-video",
      reference: "api:/openapi/v2/rhart-video-g/image-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-g/text-to-video",
      durations: VIDEOX_15_DURATIONS,
      aspectField: "aspectRatio",
      durationValueType: "number",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-g/image-to-video",
    label: "RunningHub VideoX 1.5 I2V Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 7,
    durationOptions: VIDEOX_15_DURATIONS,
    resolutionOptions: VIDEOX_15_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-g/image-to-video",
      durations: VIDEOX_15_DURATIONS,
      referenceField: "imageUrls",
      aspectField: "aspectRatio",
      durationValueType: "number",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast/text-to-video",
    label: "RunningHub Veo 3.1 Fast Channel Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
      maxReferenceImages: 3,
      videoReferenceMode: "reference",
      videoReferenceModes: ["reference", "firstLast"],
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/rhart-video-v3.1-fast/image-to-video",
      firstLast: "api:/openapi/v2/rhart-video-v3.1-fast/start-end-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast/text-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast/image-to-video",
    label: "RunningHub Veo 3.1 Fast I2V Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
      maxReferenceImages: 3,
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast/image-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      referenceField: "imageUrls",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast/start-end-to-video",
    label: "RunningHub Veo 3.1 Fast Start-End Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast/start-end-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      referenceField: "firstFrameUrl",
      lastReferenceField: "lastFrameUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast-official/text-to-video",
    label: "RunningHub Veo 3.1 Fast Official Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
      maxReferenceImages: 3,
      videoReferenceMode: "reference",
      videoReferenceModes: ["reference", "firstLast"],
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
      referenceRoutes: {
        imageToVideo: "api:/openapi/v2/rhart-video-v3.1-fast-official/image-to-video",
        firstLast: "api:/openapi/v2/rhart-video-v3.1-fast-official/image-to-video",
        reference: "api:/openapi/v2/rhart-video-v3.1-fast-official/reference-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast-official/text-to-video",
        durations: VEO_31_DURATIONS,
      aspectField: "aspectRatio",
      extra: {
        generateAudio: true,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast-official/image-to-video",
    label: "RunningHub Veo 3.1 Fast I2V Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
      maxReferenceImages: 2,
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast-official/image-to-video",
        durations: VEO_31_DURATIONS,
        referenceField: "imageUrl",
        lastReferenceField: "lastImageUrl",
      aspectField: "aspectRatio",
      extra: {
        generateAudio: true,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-fast-official/reference-to-video",
    label: "RunningHub Veo 3.1 Fast Reference Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
      resolutionOptions: VEO_31_HD_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-fast-official/reference-to-video",
      referenceField: "imageUrls",
      aspectField: "aspectRatio",
      extra: {
        generateAudio: false,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro/text-to-video",
    label: "RunningHub Veo 3.1 Pro Channel Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
      maxReferenceImages: 3,
      videoReferenceMode: "reference",
      videoReferenceModes: ["reference", "firstLast"],
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/rhart-video-v3.1-pro/image-to-video",
      firstLast: "api:/openapi/v2/rhart-video-v3.1-pro/start-end-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro/text-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro/image-to-video",
    label: "RunningHub Veo 3.1 Pro I2V Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
      maxReferenceImages: 3,
      durationOptions: VEO_31_CHANNEL_DURATIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro/image-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
        referenceField: "imageUrl",
        referenceValue: "array",
        omitResolution: true,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro/start-end-to-video",
    label: "RunningHub Veo 3.1 Pro Start-End Channel Low Price",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
      durationOptions: VEO_31_CHANNEL_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro/start-end-to-video",
        durations: VEO_31_CHANNEL_DURATIONS,
      referenceField: "firstFrameUrl",
      lastReferenceField: "lastFrameUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro-official/text-to-video",
    label: "RunningHub Veo 3.1 Pro Official Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
      maxReferenceImages: 3,
      videoReferenceMode: "reference",
      videoReferenceModes: ["reference", "firstLast"],
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
      referenceRoutes: {
        imageToVideo: "api:/openapi/v2/rhart-video-v3.1-pro-official/image-to-video",
        firstLast: "api:/openapi/v2/rhart-video-v3.1-pro-official/image-to-video",
        reference: "api:/openapi/v2/rhart-video-v3.1-pro-official/reference-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro-official/text-to-video",
        durations: VEO_31_DURATIONS,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro-official/image-to-video",
    label: "RunningHub Veo 3.1 Pro I2V Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
      maxReferenceImages: 2,
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro-official/image-to-video",
        durations: VEO_31_DURATIONS,
        referenceField: "imageUrl",
        lastReferenceField: "lastImageUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-pro-official/reference-to-video",
    label: "RunningHub Veo 3.1 Pro Reference Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 3,
      resolutionOptions: VEO_31_4K_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-pro-official/reference-to-video",
      referenceField: "imageUrls",
      extra: {
        generateAudio: false,
      },
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-lite-official/text-to-video",
    label: "RunningHub Veo 3.1 Lite Official Auto",
    kind: "video",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 2,
    videoReferenceMode: "firstLast",
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_HD_RESOLUTIONS,
    referenceRoutes: {
      imageToVideo: "api:/openapi/v2/rhart-video-v3.1-lite-official/image-to-video",
      firstLast: "api:/openapi/v2/rhart-video-v3.1-lite-official/start-end-to-video",
    },
    request: {
      type: "aspect-resolution-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-lite-official/text-to-video",
        durations: VEO_31_DURATIONS,
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-lite-official/image-to-video",
    label: "RunningHub Veo 3.1 Lite I2V Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 1,
    maxReferenceImages: 1,
      durationOptions: VEO_31_DURATIONS,
      resolutionOptions: VEO_31_HD_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-lite-official/image-to-video",
        durations: VEO_31_DURATIONS,
      referenceField: "imageUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-video-v3.1-lite-official/start-end-to-video",
    label: "RunningHub Veo 3.1 Lite Start-End Official Stable",
    kind: "video",
    listed: false,
    supportsReferences: true,
    minReferenceImages: 2,
    maxReferenceImages: 2,
      resolutionOptions: VEO_31_HD_RESOLUTIONS,
    request: {
      type: "image-reference-video",
      endpoint: "/openapi/v2/rhart-video-v3.1-lite-official/start-end-to-video",
        referenceField: "firstImageUrl",
      lastReferenceField: "lastImageUrl",
      aspectField: "aspectRatio",
    },
  },
  {
    model: "api:/openapi/v2/rhart-image-g-2/text-to-image",
    label: "RunningHub GPT Image 2 Channel Auto",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 10,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-g-2/image-to-image",
    },
    request: {
        type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-g-2/text-to-image",
        resolution: "1k",
        aspectRatioFallback: "empty",
      },
    },
  {
    model: "api:/openapi/v2/rhart-image-g-2-official/text-to-image",
    label: "RunningHub GPT Image 2 Official Auto",
      kind: "image",
      supportsReferences: true,
      minReferenceImages: 0,
      maxReferenceImages: 10,
    referenceRoutes: {
      imageToImage: "api:/openapi/v2/rhart-image-g-2-official/image-to-image",
    },
    request: {
      type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-g-2-official/text-to-image",
        resolution: "2k",
        aspectRatioFallback: "16:9",
        quality: "medium",
      },
  },
  {
    model: "api:/openapi/v2/rhart-image-g-2/image-to-image",
    label: "RunningHub GPT Image 2 Edit Channel Low Price",
    kind: "image",
    listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
    request: {
      type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-g-2/image-to-image",
        resolution: "1k",
        aspectRatioFallback: "empty",
        referenceField: "imageUrls",
      },
  },
  {
    model: "api:/openapi/v2/rhart-image-g-2-official/image-to-image",
    label: "RunningHub GPT Image 2 Edit Official Stable",
    kind: "image",
    listed: false,
      supportsReferences: true,
      minReferenceImages: 1,
      maxReferenceImages: 10,
    request: {
      type: "aspect-resolution-image",
        endpoint: "/openapi/v2/rhart-image-g-2-official/image-to-image",
        resolution: "2k",
        aspectRatioFallback: "16:9",
        quality: "medium",
      referenceField: "imageUrls",
    },
  },
  {
    model: "api:/openapi/v2/youchuan/text-to-image-v7",
    label: "RunningHub Youchuan V7 Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 1,
    request: {
      type: "youchuan-image",
      endpoint: "/openapi/v2/youchuan/text-to-image-v7",
      aspectField: "aspectRatio",
      qualityField: "quality",
      referenceField: "imageUrl",
      extra: {
        chaos: 0,
        quality: "1",
        stylize: 0,
        weird: 0,
        raw: false,
        iw: 1,
        sw: 100,
        sv: 4,
        ow: 100,
        tile: false,
      },
    },
  },
  {
    model: "api:/openapi/v2/youchuan/text-to-image-v81",
    label: "RunningHub Youchuan V8.1 Text-to-Image",
    kind: "image",
    supportsReferences: true,
    minReferenceImages: 0,
    maxReferenceImages: 1,
    request: {
      type: "youchuan-image",
      endpoint: "/openapi/v2/youchuan/text-to-image-v81",
      aspectField: "aspectRatio",
      qualityField: "quality",
      referenceField: "imageUrl",
      extra: {
        chaos: 0,
        quality: "1",
        stylize: 0,
        raw: false,
        iw: 1,
        sw: 100,
        sv: 6,
        hd: false,
      },
    },
  },
];

export function runningHubLlmBaseUrl(baseUrl: string): string {
  return RUNNINGHUB_STANDARD_BASE_URLS.has(baseUrl) ? RUNNINGHUB_LLM_BASE_URL : baseUrl;
}

export function getRunningHubStandardModel(
  model: string,
  kind: RunningHubStandardModelKind,
): RunningHubStandardModel | undefined {
  return RUNNINGHUB_STANDARD_MODELS.find(item => item.kind === kind && item.model === model);
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
  const routes = model.referenceRoutes;
  if (!routes || referenceCount === 0) return model;

  if (model.kind === "image" && routes.imageToImage) {
    const resolved = getRunningHubStandardModel(routes.imageToImage, model.kind);
    if (!resolved) throw new Error(`${model.label} route target is not configured: ${routes.imageToImage}`);
    return resolved;
  }

  const routedModel =
    hasNonImageReference
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
  if (!resolved) throw new Error(`${model.label} route target is not configured: ${routedModel}`);
  return resolved;
}

export function getRunningHubStandardEndpoint(model: RunningHubStandardModel): string {
  return model.request.endpoint;
}

export function runningHubStandardPayloadMapping(model: RunningHubStandardModel): ProviderPayloadMappingDescriptor {
  return {
    provider: "runninghub",
    endpoint: model.request.endpoint,
    operation: runningHubPayloadMappingOperation(model.request),
    fields: runningHubPayloadFieldMappings(model.request),
    logic: runningHubPayloadMappingLogic(model.request),
  };
}

export function validateRunningHubStandardReferenceCount(model: RunningHubStandardModel, referenceCount: number): void {
  if (!model.supportsReferences && referenceCount > 0) {
    throw new Error(`${model.label} does not support reference media`);
  }
  if (referenceCount < model.minReferenceImages) {
    throw new Error(`${model.label} requires at least ${model.minReferenceImages} reference media item`);
  }
  if (referenceCount > model.maxReferenceImages) {
    throw new Error(`${model.label} supports at most ${model.maxReferenceImages} reference media items`);
  }
}

function validateRunningHubStandardReferenceMediaCounts(
  model: RunningHubStandardModel,
  counts: { image: number; video: number; audio: number },
): void {
  if (!model.referenceCounts) return;
  validateRunningHubStandardReferenceMediaCount(model, "image", counts.image, model.referenceCounts.images);
  validateRunningHubStandardReferenceMediaCount(model, "video", counts.video, model.referenceCounts.videos);
  validateRunningHubStandardReferenceMediaCount(model, "audio", counts.audio, model.referenceCounts.audio);
}

function validateRunningHubStandardReferenceMediaCount(
  model: RunningHubStandardModel,
  type: MediaReferenceType,
  count: number,
  range: { minCount: number; maxCount: number } | undefined,
): void {
  if (!range) return;
  if (count < range.minCount) {
    throw new Error(`${model.label} requires at least ${range.minCount} ${mediaReferenceLabel(type)} reference`);
  }
  if (count > range.maxCount) {
    throw new Error(`${model.label} supports at most ${range.maxCount} ${mediaReferenceLabel(type)} reference`);
  }
}

function runningHubPayloadMappingOperation(
  request: RunningHubStandardRequest,
): ProviderPayloadMappingDescriptor["operation"] {
  if (request.type === "mapped-fields") return request.operation ?? "providerSpecific";
  if (request.type === "prompt-dimensions" || request.type === "aspect-resolution-image") return "promptDimensions";
  if (request.type === "grok-image") return request.referenceField ? "singleReference" : "promptDimensions";
  if (request.type === "node-dimensions") return "nodeFields";
  if (request.type === "image-reference-video") {
    if (request.lastReferenceField) return "firstLastFrames";
    if (request.videoField || request.audioField) return "groupedReferences";
    return request.referenceValue === "single" || request.referenceField !== "imageUrls" ? "singleReference" : "referenceArray";
  }
  return "providerSpecific";
}

function runningHubPayloadFieldMappings(
  request: RunningHubStandardRequest,
): ProviderPayloadFieldMappingDescriptor[] {
  const fields: ProviderPayloadFieldMappingDescriptor[] = [];
  if (request.type === "mapped-fields") {
    return request.fields.map(field => {
      if (field.source === "literal") {
        return {
          target: field.target,
          source: "literal",
          literal: field.literal,
          ...(field.valueType ? { valueType: field.valueType } : {}),
        };
      }
      return {
        target: field.target,
        source: field.source,
        ...(field.valueType ? { valueType: field.valueType } : {}),
      };
    });
  }
  if (request.type === "node-dimensions") {
    fields.push({ target: request.promptField, source: "prompt", valueType: "string" });
    if (request.widthField) fields.push({ target: request.widthField, source: "imageResolution", valueType: "number" });
    if (request.heightField) fields.push({ target: request.heightField, source: "imageResolution", valueType: "number" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }

  fields.push({ target: "prompt", source: "prompt", valueType: "string" });
  if (request.type === "grok-image") {
    fields.push({ target: "model", source: "literal", valueType: "string", literal: request.model });
    if (request.aspectField) fields.push({ target: request.aspectField, source: "imageResolution", valueType: "string" });
    if (request.referenceField) fields.push({ target: request.referenceField, source: "imageUrls", valueType: "string" });
    return fields;
  }
  if (request.type === "prompt-dimensions") {
    if (request.dimensionMode === "resolution" && request.resolutionField) {
      fields.push({ target: request.resolutionField, source: "imageResolution", valueType: "string" });
    } else {
      fields.push({ target: "width", source: "imageResolution", valueType: "number" });
      fields.push({ target: "height", source: "imageResolution", valueType: "number" });
    }
    if (request.referenceField) fields.push({ target: request.referenceField, source: "imageUrls", valueType: "array" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }
  if (request.type === "hailuo-video") {
    fields.push({ target: "duration", source: "durationSeconds", valueType: "string" });
    if (request.requiresReference) {
      fields.push({ target: "firstImageUrl", source: "imageUrls", valueType: "string" });
      fields.push({ target: "lastImageUrl", source: "imageUrls", valueType: "string" });
    }
    return fields;
  }
  if (request.type === "seedance-video" || request.type === "aspect-resolution-video") {
    fields.push({ target: "resolution", source: "resolutionName", valueType: "string" });
    fields.push({ target: "duration", source: "durationSeconds" });
    fields.push({ target: request.aspectField, source: "aspectRatio", valueType: "string" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }
  if (request.type === "image-reference-video") {
    if (!request.omitResolution) fields.push({ target: "resolution", source: "resolutionName", valueType: "string" });
    if (request.durations) fields.push({ target: "duration", source: "durationSeconds" });
    if (request.aspectField) fields.push({ target: request.aspectField, source: "aspectRatio", valueType: "string" });
    fields.push({ target: request.referenceField, source: "imageUrls", valueType: request.referenceField === "imageUrls" ? "array" : "string" });
    if (request.lastReferenceField) fields.push({ target: request.lastReferenceField, source: "imageUrls", valueType: "string" });
    if (request.videoField) fields.push({ target: request.videoField, source: "videoUrls", valueType: request.videoField === "videoUrls" ? "array" : "string" });
    if (request.audioField) fields.push({ target: request.audioField, source: "audioUrls", valueType: "array" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }
  if (request.type === "aspect-resolution-image") {
    fields.push({ target: "aspectRatio", source: "aspectRatio", valueType: "string" });
    fields.push({ target: "resolution", source: "imageResolution", valueType: "string" });
    if (request.quality !== undefined) fields.push({ target: "quality", source: "imageQuality", valueType: "string" });
    if (request.referenceField) fields.push({ target: request.referenceField, source: "imageUrls", valueType: "array" });
    fields.push(...extraLiteralFields(request.extra));
    return fields;
  }
  if (request.type === "youchuan-image") {
    if (request.aspectField) fields.push({ target: request.aspectField, source: "aspectRatio", valueType: "string" });
    if (request.qualityField) fields.push({ target: request.qualityField, source: "imageQuality", valueType: "string" });
    if (request.referenceField) fields.push({ target: request.referenceField, source: "imageUrls", valueType: "string" });
    fields.push(...extraLiteralFields(request.extra));
  }
  return fields;
}

function runningHubPayloadMappingLogic(request: RunningHubStandardRequest): ProviderPayloadMappingDescriptor["logic"] {
  const logic: Array<NonNullable<ProviderPayloadMappingDescriptor["logic"]>[number]> = ["mediaUpload"];
  if (request.type === "mapped-fields") {
    if (request.fields.some(field => field.source === "durationSeconds")) logic.push("durationCoercion");
    if (request.fields.some(field => field.source === "imageResolution")) logic.push("dimensionDerivation");
    if (request.fields.some(field => field.source === "imageUrls" || field.source === "videoUrls" || field.source === "audioUrls")) {
      logic.push("referenceRouting");
    }
    return logic;
  }
  if (
    request.type === "prompt-dimensions" ||
    request.type === "node-dimensions" ||
    request.type === "aspect-resolution-image"
  ) {
    logic.push("dimensionDerivation");
  }
  if (
    request.type === "hailuo-video" ||
    request.type === "seedance-video" ||
    request.type === "aspect-resolution-video" ||
    request.type === "image-reference-video"
  ) {
    logic.push("durationCoercion");
  }
  if (request.type === "image-reference-video") logic.push("referenceRouting");
  return logic;
}

function extraLiteralFields(extra: Record<string, unknown> | undefined): ProviderPayloadFieldMappingDescriptor[] {
  if (!extra) return [];
  return Object.entries(extra).flatMap(([target, literal]) =>
    isJsonValue(literal) ? [{ target, source: "literal", literal } satisfies ProviderPayloadFieldMappingDescriptor] : [],
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
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
  const referenceCount =
    referenceMediaUrls.imageUrls.length + referenceMediaUrls.videoUrls.length + referenceMediaUrls.audioUrls.length;
  validateRunningHubStandardReferenceCount(model, referenceCount);
  validateRunningHubStandardReferenceMediaCounts(model, {
    image: referenceMediaUrls.imageUrls.length,
    video: referenceMediaUrls.videoUrls.length,
    audio: referenceMediaUrls.audioUrls.length,
  });

  switch (model.request.type) {
    case "mapped-fields": {
      return buildMappedFieldsBody(model.request.fields, input, referenceMediaUrls, model.label);
    }
    case "prompt-dimensions": {
      return {
        prompt: input.prompt,
        ...(model.request.dimensionMode === "resolution"
          ? readResolutionField(
              model.request.resolutionField,
              input.imageResolution,
              model.resolutionOptions,
              model.label,
            )
          : readDimensions(input.imageResolution)),
        ...model.request.extra,
        ...(model.request.referenceField ? { [model.request.referenceField]: referenceMediaUrls.imageUrls } : {}),
      };
    }
    case "grok-image": {
      return {
        model: model.request.model,
        prompt: input.prompt,
        ...readResolutionField(
          model.request.aspectField,
          input.imageResolution,
          model.request.aspectRatioOptions,
          model.label,
        ),
        ...(model.request.referenceField ? { [model.request.referenceField]: referenceMediaUrls.imageUrls[0] } : {}),
      };
    }
    case "node-dimensions": {
      const dimensions = readDimensions(input.imageResolution) ?? { width: 1024, height: 1024 };
      return {
        [model.request.promptField]: input.prompt,
        ...(model.request.widthField ? { [model.request.widthField]: dimensions.width } : {}),
        ...(model.request.heightField ? { [model.request.heightField]: dimensions.height } : {}),
        ...model.request.extra,
      };
    }
    case "hailuo-video": {
      return {
        prompt: input.prompt,
        enablePromptExpansion: true,
        duration: readHailuoDuration(input.durationSeconds),
        ...(model.request.requiresReference
          ? { firstImageUrl: referenceMediaUrls.imageUrls[0], lastImageUrl: referenceMediaUrls.imageUrls[1] }
          : {}),
      };
    }
    case "seedance-video": {
      return {
        prompt: input.prompt,
        resolution: input.resolutionName ?? "720p",
        duration: readDuration(input.durationSeconds, model.request.durations, model.label),
        [model.request.aspectField]:
          input.aspectRatio === "auto" || input.aspectRatio === undefined ? "adaptive" : input.aspectRatio,
        ...model.request.extra,
      };
    }
    case "aspect-resolution-video": {
      return {
        prompt: input.prompt,
        resolution: input.resolutionName ?? "720p",
        duration: readDurationValue(input.durationSeconds, model.request.durations, model.label, model.request.durationValueType),
        [model.request.aspectField]:
          input.aspectRatio === "auto" || input.aspectRatio === undefined ? "adaptive" : input.aspectRatio,
        ...model.request.extra,
      };
    }
      case "image-reference-video": {
        return {
          prompt: input.prompt,
          ...(model.request.omitResolution ? {} : { resolution: input.resolutionName ?? "720p" }),
          ...(model.request.durations
            ? { duration: readDurationValue(input.durationSeconds, model.request.durations, model.label, model.request.durationValueType) }
            : {}),
        ...(model.request.aspectField
          ? {
              [model.request.aspectField]:
                input.aspectRatio === "auto" || input.aspectRatio === undefined ? "adaptive" : input.aspectRatio,
            }
          : {}),
          ...readVideoReferenceFields(
            model.request.referenceField,
            model.request.referenceValue,
            model.request.lastReferenceField,
            model.request.videoField,
            model.request.audioField,
          referenceMediaUrls,
        ),
        ...model.request.extra,
      };
    }
      case "aspect-resolution-image": {
        return {
          prompt: input.prompt,
          aspectRatio:
            input.aspectRatio === "auto" || input.aspectRatio === undefined
              ? model.request.aspectRatioFallback ?? "1:1"
              : input.aspectRatio,
          resolution: readImageResolutionTier(input.imageResolution, model.request.resolution),
        ...readImageQuality(input.imageQuality, model.request.quality),
        ...(model.request.referenceField ? { [model.request.referenceField]: referenceMediaUrls.imageUrls } : {}),
        ...model.request.extra,
      };
    }
    case "youchuan-image": {
      const catalog = getRunningHubYouchuanCatalog(model.model);
      return {
        prompt: input.prompt,
        ...(model.request.aspectField && input.aspectRatio && input.aspectRatio !== "auto"
          ? { [model.request.aspectField]: input.aspectRatio }
          : {}),
        ...(model.request.referenceField && referenceMediaUrls.imageUrls[0]
          ? { [model.request.referenceField]: referenceMediaUrls.imageUrls[0] }
          : {}),
        ...model.request.extra,
        ...readYouchuanAdvancedSettings(input.youchuan, catalog),
        ...(model.request.qualityField && input.imageQuality && input.imageQuality !== "auto"
          ? { [model.request.qualityField]: input.imageQuality }
          : {}),
      };
    }
  }
}

function buildMappedFieldsBody(
  fields: readonly RunningHubMappedField[],
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
  field: RunningHubMappedField,
  input: RunningHubStandardRequestInput,
  referenceMediaUrls: { imageUrls: string[]; videoUrls: string[]; audioUrls: string[] },
  label: string,
): unknown {
  if (field.source === "literal") return field.literal;
  if (field.source === "imageUrls" || field.source === "videoUrls" || field.source === "audioUrls") {
    const values = referenceMediaUrls[field.source];
    return field.valueType === "array" ? values : values[field.index ?? 0];
  }
  const scalarField = field as RunningHubMappedScalarField;
  const value = readMappedScalarSource(scalarField, input, label);
  if (value === undefined || (scalarField.omitAuto === true && value === "auto")) return scalarField.defaultValue;
  return value;
}

function readMappedScalarSource(
  field: RunningHubMappedScalarField,
  input: RunningHubStandardRequestInput,
  label: string,
): string | number | boolean | undefined {
  if (field.source === "prompt") return input.prompt;
  if (field.source === "aspectRatio") return input.aspectRatio === "auto" || input.aspectRatio === undefined
    ? field.defaultValue
    : input.aspectRatio;
  if (field.source === "imageResolution") {
    const value = input.imageResolution;
    if (!value || value === "auto") return readMappedDefaultValue(field);
    if (field.allowedValues && !field.allowedValues.includes(value)) {
      throw new Error(`${label} ${field.target} must be ${field.allowedValues.join(", ")}`);
    }
    const dimensions = readDimensions(value);
    if (dimensions && field.target === "width") return dimensions.width;
    if (dimensions && field.target === "height") return dimensions.height;
    if (field.valueType === "number") return Number(value);
    return value;
  }
  if (field.source === "imageQuality") return input.imageQuality && input.imageQuality !== "auto"
    ? input.imageQuality
    : readMappedDefaultValue(field);
  if (field.source === "resolutionName") {
    const value = input.resolutionName;
    if (!value || value === "auto") return readMappedDefaultValue(field);
    if (field.allowedValues && !field.allowedValues.includes(value)) {
      throw new Error(`${label} ${field.target} must be ${field.allowedValues.join(", ")}`);
    }
    return value;
  }
  const value = input.durationSeconds;
  if (!value || value === "auto") return readMappedDefaultValue(field);
  if (field.allowedValues && !field.allowedValues.includes(value)) {
    throw new Error(`${label} duration must be ${field.allowedValues.join(", ")}`);
  }
  return field.durationValueType === "number" ? Number(value) : value;
}

function readMappedDefaultValue(field: RunningHubMappedScalarField): string | number | boolean | undefined {
  if (field.defaultValue === undefined) return undefined;
  if (field.durationValueType === "number" || field.valueType === "number" || field.target === "width" || field.target === "height") {
    return Number(field.defaultValue);
  }
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

function readResolutionField(
  field: string | undefined,
  value: string | undefined,
  allowedValues: readonly string[] | undefined,
  label: string,
): Record<string, string> {
  if (!field || !value || value === "auto") return {};
  if (!allowedValues?.includes(value)) {
    throw new Error(`${label} resolution must be ${allowedValues?.join(", ") ?? "configured"}`);
  }
  return { [field]: value };
}

function readImageResolutionTier(value: string | undefined, fallback: string): string {
  if (!value || value === "auto") return fallback;
  const normalized = value.toLowerCase();
  if (normalized === "1k" || normalized === "2k" || normalized === "4k" || normalized === "8k") return normalized;

  const dimensions = readDimensions(value);
  if (!dimensions) return fallback;
  const longSide = Math.max(dimensions.width, dimensions.height);
  if (longSide >= 3200) return "4k";
  if (longSide >= 1900) return "2k";
  return "1k";
}

function readImageQuality(value: string | undefined, fallback: string | undefined): Record<string, string> {
  if (fallback === undefined) return {};
  if (value && value !== "auto") return { quality: value };
  return { quality: fallback };
}

function readHailuoDuration(value: string | undefined): string {
  if (value === undefined) return "6";
  if (value === "6" || value === "10") return value;
  throw new Error("RunningHub Hailuo 02 Standard duration must be 6 or 10 seconds");
}

function readDuration(value: string | undefined, allowedValues: readonly string[], label: string): string {
  if (value === undefined) return allowedValues[0] ?? "5";
  if (allowedValues.includes(value)) return value;
  throw new Error(`${label} duration must be ${allowedValues.join(", ")} seconds`);
}

function readDurationValue(
  value: string | undefined,
  allowedValues: readonly string[],
  label: string,
  valueType: "string" | "number" = "string",
): string | number {
  const duration = readDuration(value, allowedValues, label);
  return valueType === "number" ? Number(duration) : duration;
}

function readVideoReferenceFields(
  referenceField: "imageUrls" | "imageUrl" | "firstFrameUrl" | "firstImageUrl",
  referenceValue: "single" | "array" | undefined,
  lastReferenceField: "lastFrameUrl" | "lastImageUrl" | undefined,
  videoField: "videoUrls" | "videoUrl" | undefined,
  audioField: "audioUrls" | undefined,
  referenceMediaUrls: { imageUrls: string[]; videoUrls: string[]; audioUrls: string[] },
): Record<string, unknown> {
  const imageFields =
    referenceField === "imageUrls" || referenceValue === "array"
      ? { [referenceField]: referenceMediaUrls.imageUrls }
      : {
          [referenceField]: referenceMediaUrls.imageUrls[0],
          ...(lastReferenceField && referenceMediaUrls.imageUrls[1]
            ? { [lastReferenceField]: referenceMediaUrls.imageUrls[1] }
            : {}),
        };
  const videoFields =
    videoField && referenceMediaUrls.videoUrls.length > 0
      ? { [videoField]: videoField === "videoUrls" ? referenceMediaUrls.videoUrls : referenceMediaUrls.videoUrls[0] }
      : {};
  const audioFields =
    audioField && referenceMediaUrls.audioUrls.length > 0 ? { [audioField]: referenceMediaUrls.audioUrls } : {};
  return {
    ...imageFields,
    ...videoFields,
    ...audioFields,
  };
}
