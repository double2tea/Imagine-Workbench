export type { AiProvider } from "./registry";
import type { AiProvider } from "./registry";
import modelCapabilityCatalogJson from "./catalog/data/model-capabilities.json";
import { PROVIDER_KEYS, isProviderKey } from "./registry";
import {
  getRunningHubStandardModel,
  runningHubStandardPayloadMapping,
  runningHubYouchuanParameterDescriptors,
  runningHubYouchuanQualityValues,
  runningHubYouchuanSettingsFromParameterValues,
  runningHubYouchuanSettingsToParameterValues,
  type RunningHubStandardModel,
} from "./runninghub";
import {
  referenceParameterDescriptors,
  defaultCapabilityParameterValues,
  inputModalitiesReferenceCountRange,
  inputModalitiesReferenceMediaTypes,
  unpricedModel,
  type ModelInputModalityProfile,
  type ModelParameterDescriptor,
  type ModelParameterValues,
  type ModelPricingProfile,
  type ModelReferenceParameterDescriptor,
  type ProviderPayloadMappingDescriptor,
} from "./model-capabilities";
import type { RunningHubYouchuanAdvancedSettings } from "./types";
import type { MediaReferenceType } from "@/lib/media-references";

export interface ModelOption {
  value: string;
  label: string;
}

export interface ParameterOption {
  value: string;
  label: string;
}

export interface ImageModelCapabilities {
  aspectRatios: ParameterOption[];
  resolutions: ParameterOption[];
  qualities: ParameterOption[];
  thinkingLevels: ParameterOption[];
  parameterDescriptors: ModelParameterDescriptor[];
  referenceSlots: ModelReferenceParameterDescriptor[];
  maxReferenceImages: number;
  minReferenceImages: number;
  referenceMediaTypes: MediaReferenceType[];
}

export interface VideoModelCapabilities {
  sizes: ParameterOption[];
  resolutions: ParameterOption[];
  durations: ParameterOption[];
  presets: ParameterOption[];
  parameterDescriptors: ModelParameterDescriptor[];
  referenceSlots: ModelReferenceParameterDescriptor[];
  referenceMode: VideoReferenceMode;
  referenceModes: VideoReferenceMode[];
  maxReferenceImages: number;
  minReferenceImages: number;
  referenceMediaTypes: MediaReferenceType[];
}

export interface AudioModelCapabilities {
  modes: AudioOperationMode[];
  outputKinds: AudioOutputKind[];
  defaultMode: AudioOperationMode;
  formats: ParameterOption[];
  durations: ParameterOption[];
  parameterDescriptors: ModelParameterDescriptor[];
  referenceSlots: ModelReferenceParameterDescriptor[];
  maxReferenceMedia: number;
  minReferenceMedia: number;
  referenceMediaTypes: MediaReferenceType[];
}

export type ModelKind = "chat" | "image" | "video" | "audio";
export type AudioOperationMode = "tts" | "voice_design" | "voice_clone" | "music" | "sfx" | "asr";
export type AudioOutputKind = "audio" | "voice_profile" | "transcript";
export type VideoReferenceMode = "none" | "reference" | "firstLast";

export interface ProviderModelCapability {
  value: string;
  label: string;
  provider: AiProvider;
  model: string;
  kind: ModelKind;
  listed?: boolean;
  supportsAsync: boolean;
  supportsReferences: boolean;
  aspectRatios: ParameterOption[];
  sizes: ParameterOption[];
  thinkingLevels: ParameterOption[];
  qualityLevels: ParameterOption[];
  resolutions: ParameterOption[];
  durations: ParameterOption[];
  presets: ParameterOption[];
  audioModes: AudioOperationMode[];
  audioOutputKinds: AudioOutputKind[];
  audioDefaultMode?: AudioOperationMode;
  videoReferenceMode: VideoReferenceMode;
  videoReferenceModes: VideoReferenceMode[];
  inputModalities: ModelInputModalityProfile;
  parameterDescriptors: ModelParameterDescriptor[];
  referenceSlots: ModelReferenceParameterDescriptor[];
  pricing: ModelPricingProfile;
  payloadMapping?: ProviderPayloadMappingDescriptor;
  maxReferenceImages: number;
  minReferenceImages: number;
  referenceMediaTypes: MediaReferenceType[];
}

export interface ModelCapabilityCatalogDocument {
  version: string;
  source: string;
  entries: ProviderModelCapability[];
}

const MODEL_CAPABILITY_CATALOG = modelCapabilityCatalogJson as unknown as ModelCapabilityCatalogDocument;
export const MODEL_CAPABILITY_CATALOG_VERSION = MODEL_CAPABILITY_CATALOG.version;

export const DEFAULT_IMAGE_MODEL = "12ai:gemini-3.1-flash-image-preview";
export const DEFAULT_VIDEO_MODEL = "12ai:veo_3_1-fast";
export const DEFAULT_AUDIO_MODEL = "mimo:mimo-v2.5-tts";
export const DEFAULT_CHAT_MODEL = "12ai:gemini-3.1-flash-lite-preview";
/** @deprecated Agent no longer auto-switches models; alias kept for existing imports/tests. */
export const DEFAULT_VISION_CHAT_MODEL = DEFAULT_CHAT_MODEL;

function imageResolutionOption(value: string): ParameterOption {
  return { value, label: getImageResolutionLabel(value) };
}

function getImageResolutionLabel(value: string): string {
  if (value === "auto") return "Auto";
  if (value === "custom") return "自定义尺寸";
  if (value === "512px") return "512p";
  if (value === "1K" || value === "2K" || value === "4K") return value;

  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return value;

  const width = Number(match[1]);
  const height = Number(match[2]);
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);

  if (longSide >= 3200 || shortSide >= 2160) return "4K";
  if (longSide >= 2500) return "2.5K";
  if (longSide >= 1900) return "2K";
  if (shortSide >= 900) return "1K";
  if (shortSide >= 700) return "720p";
  if (shortSide >= 500) return "512p";
  return `${shortSide}p`;
}

const GPT_IMAGE_SIZES: ParameterOption[] = [
  imageResolutionOption("auto"),
  imageResolutionOption("512x512"),
  imageResolutionOption("1024x1024"),
  imageResolutionOption("1536x1024"),
  imageResolutionOption("1024x1536"),
  imageResolutionOption("1792x1008"),
  imageResolutionOption("1008x1792"),
  imageResolutionOption("1792x1024"),
  imageResolutionOption("1024x1792"),
  imageResolutionOption("2048x1536"),
  imageResolutionOption("1536x2048"),
  imageResolutionOption("2048x2048"),
  imageResolutionOption("2304x1728"),
  imageResolutionOption("1728x2304"),
  imageResolutionOption("2880x2880"),
  imageResolutionOption("2048x1024"),
  imageResolutionOption("1024x2048"),
  imageResolutionOption("2560x1280"),
  imageResolutionOption("1280x2560"),
  imageResolutionOption("3840x1920"),
  imageResolutionOption("1920x3840"),
  imageResolutionOption("2048x1152"),
  imageResolutionOption("2560x1440"),
  imageResolutionOption("1440x2560"),
  imageResolutionOption("2496x1664"),
  imageResolutionOption("1664x2496"),
  imageResolutionOption("3504x2336"),
  imageResolutionOption("2336x3504"),
  imageResolutionOption("3264x2448"),
  imageResolutionOption("2448x3264"),
  imageResolutionOption("3840x2160"),
  imageResolutionOption("2160x3840"),
  imageResolutionOption("custom"),
];

const GPT_IMAGE_RATIOS: ParameterOption[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "2:1", label: "2:1 Panorama" },
  { value: "1:2", label: "1:2 Portrait" },
  { value: "3:2", label: "3:2 Landscape" },
  { value: "2:3", label: "2:3 Portrait" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "7:4", label: "7:4 Landscape" },
  { value: "4:7", label: "4:7 Portrait" },
  { value: "16:9", label: "16:9 Cinema" },
  { value: "9:16", label: "9:16 Vertical" },
];

const GROK_IMAGE_SIZES: ParameterOption[] = [
  imageResolutionOption("1280x720"),
  imageResolutionOption("720x1280"),
  imageResolutionOption("1792x1024"),
  imageResolutionOption("1024x1792"),
  imageResolutionOption("1024x1024"),
];

const GROK_IMAGE_RATIOS: ParameterOption[] = [
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Vertical" },
  { value: "7:4", label: "7:4 Landscape" },
  { value: "4:7", label: "4:7 Portrait" },
  { value: "1:1", label: "1:1 Square" },
];

const GPT_QUALITY_OPTIONS: ParameterOption[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const RUNNINGHUB_GPT_IMAGE_CHANNEL_RATIOS: ParameterOption[] = [
  { value: "empty", label: "Auto" },
  { value: "3:2", label: "3:2 Landscape" },
  { value: "1:1", label: "1:1 Square" },
  { value: "2:3", label: "2:3 Portrait" },
  { value: "5:4", label: "5:4 Landscape" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "16:9", label: "16:9 Cinema" },
  { value: "9:16", label: "9:16 Vertical" },
  { value: "21:9", label: "21:9 Wide" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "4:3", label: "4:3 Landscape" },
];

const RUNNINGHUB_GPT_IMAGE_OFFICIAL_RATIOS: ParameterOption[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "1:2", label: "1:2 Portrait" },
  { value: "2:1", label: "2:1 Landscape" },
  { value: "1:3", label: "1:3 Portrait" },
  { value: "3:1", label: "3:1 Landscape" },
  { value: "2:3", label: "2:3 Portrait" },
  { value: "3:2", label: "3:2 Landscape" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "5:4", label: "5:4 Landscape" },
  { value: "9:16", label: "9:16 Vertical" },
  { value: "21:9", label: "21:9 Wide" },
  { value: "9:21", label: "9:21 Portrait" },
  { value: "16:9", label: "16:9 Cinema" },
];

const RUNNINGHUB_GPT_IMAGE_RESOLUTIONS: ParameterOption[] = [
  { value: "1k", label: "1K" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
];

const RUNNINGHUB_GPT_QUALITY_OPTIONS: ParameterOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const RUNNINGHUB_GEMINI_FLASH_IMAGE_RATIOS: ParameterOption[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "16:9", label: "16:9 Cinema" },
  { value: "9:16", label: "9:16 Vertical" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "3:2", label: "3:2 Landscape" },
  { value: "2:3", label: "2:3 Portrait" },
  { value: "5:4", label: "5:4 Landscape" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "21:9", label: "21:9 Wide" },
  { value: "1:4", label: "1:4 Portrait" },
  { value: "4:1", label: "4:1 Landscape" },
  { value: "1:8", label: "1:8 Portrait" },
  { value: "8:1", label: "8:1 Landscape" },
];

const RUNNINGHUB_GEMINI_PRO_IMAGE_RATIOS: ParameterOption[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "16:9", label: "16:9 Cinema" },
  { value: "9:16", label: "9:16 Vertical" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "3:2", label: "3:2 Landscape" },
  { value: "2:3", label: "2:3 Portrait" },
  { value: "5:4", label: "5:4 Landscape" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "21:9", label: "21:9 Wide" },
];

const RUNNINGHUB_GEMINI_IMAGE_RESOLUTIONS: ParameterOption[] = [
  { value: "1k", label: "1K" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
];

const RUNNINGHUB_YOUCHUAN_V81_IMAGE_RATIOS: ParameterOption[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "3:2", label: "3:2 Landscape" },
  { value: "16:9", label: "16:9 Cinema" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "2:3", label: "2:3 Portrait" },
  { value: "9:16", label: "9:16 Vertical" },
];

const RUNNINGHUB_GEMINI_ULTRA_IMAGE_RESOLUTIONS: ParameterOption[] = [
  { value: "4k", label: "4K" },
  { value: "8k", label: "8K" },
];

const VEO_31_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto (source/default)" },
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Vertical" },
];

const RUNNINGHUB_VIDEOX_15_SIZES: ParameterOption[] = [
  { value: "2:3", label: "2:3 Portrait" },
  { value: "3:2", label: "3:2 Landscape" },
  { value: "1:1", label: "1:1 Square" },
  { value: "16:9", label: "16:9 Cinema" },
  { value: "9:16", label: "9:16 Vertical" },
];

const VEO_31_VIDEO_RESOLUTIONS: ParameterOption[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];

const SEEDANCE_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto (adaptive)" },
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Vertical" },
  { value: "1:1", label: "1:1 Square" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "21:9", label: "21:9 Wide" },
];

const SEEDANCE_VIDEO_RESOLUTIONS: ParameterOption[] = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];

const RUNNINGHUB_SEEDANCE_VIDEO_RESOLUTIONS: ParameterOption[] = [
  ...SEEDANCE_VIDEO_RESOLUTIONS,
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
];

const HAILUO_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto" },
];

const TWELVE_AI_OMNI_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto (source/default)" },
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Vertical" },
];

const OMNI_FLASH_VIDEO_RESOLUTIONS: ParameterOption[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "4k", label: "4K" },
];

const AUTO_ASPECT_RATIO: ParameterOption[] = [
  { value: "auto", label: "Auto" },
];

const AUTO_IMAGE_SIZES: ParameterOption[] = [
  imageResolutionOption("auto"),
];

const MODELSCOPE_IMAGE_SIZES: ParameterOption[] = [
  imageResolutionOption("1024x1024"),
  imageResolutionOption("1328x1328"),
  imageResolutionOption("1664x928"),
  imageResolutionOption("928x1664"),
  imageResolutionOption("1472x1104"),
  imageResolutionOption("1104x1472"),
  imageResolutionOption("1584x1056"),
  imageResolutionOption("1056x1584"),
];

const DOCUMENTED_IMAGE_SIZE_RATIOS: Record<string, string> = {
  "1664x928": "16:9",
  "928x1664": "9:16",
  "1472x1104": "4:3",
  "1104x1472": "3:4",
  "1584x1056": "3:2",
  "1056x1584": "2:3",
};

const RUNNINGHUB_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto" },
  { value: "1280x720", label: "1280x720" },
  { value: "720x1280", label: "720x1280" },
  { value: "1024x1024", label: "1024x1024" },
];

const RUNNINGHUB_IMAGE_SIZES: ParameterOption[] = RUNNINGHUB_VIDEO_SIZES.map(option =>
  imageResolutionOption(option.value),
);

const OPEN_DIMENSION_IMAGE_SIZES: ParameterOption[] = [
  imageResolutionOption("auto"),
  imageResolutionOption("1024x1024"),
  imageResolutionOption("1280x720"),
  imageResolutionOption("720x1280"),
  imageResolutionOption("1536x1024"),
  imageResolutionOption("1024x1536"),
  imageResolutionOption("1536x1536"),
  imageResolutionOption("2048x2048"),
  imageResolutionOption("custom"),
];

const AGNES_IMAGE_SIZE_RATIOS: Record<string, string> = {
  "1024x768": "4:3",
  "768x1024": "3:4",
  "1152x768": "3:2",
  "768x1152": "2:3",
};

export const MODEL_CAPABILITIES: ProviderModelCapability[] = readModelCapabilityCatalog(MODEL_CAPABILITY_CATALOG);

export const IMAGE_MODEL_OPTIONS = buildProviderOptionsRecord("image", false);
export const VIDEO_MODEL_OPTIONS = buildProviderOptionsRecord("video", true);
export const AUDIO_MODEL_OPTIONS = buildProviderOptionsRecord("audio", true);
export const CHAT_MODEL_OPTIONS = buildProviderOptionsRecord("chat", true);

export function getModelCapability(value: string, kind?: ModelKind): ProviderModelCapability {
  const parsed = parseProviderModel(value, "12ai");
  const capability = findModelCapability(parsed.provider, parsed.model, parsed.async, kind);
  if (!capability && parsed.provider === "runninghub") {
    return runningHubVirtualCapability(parsed.model, kind);
  }
  if (!capability && parsed.provider === "modelscope" && kind === "image") {
    return modelScopeVirtualImageCapability(parsed.model);
  }
  if (!capability) {
    throw new Error(`Unknown provider model capability: ${value}`);
  }
  return capability;
}

export function getOptionalModelCapability(value: string, kind?: ModelKind): ProviderModelCapability | undefined {
  const parsed = tryParseProviderModel(value, "12ai");
  if (!parsed) return undefined;
  const capability = findModelCapability(parsed.provider, parsed.model, parsed.async, kind);
  if (capability) return capability;
  if (kind === "audio" && parsed.provider !== "mimo") return customMimoAudioCapability(parsed.provider, parsed.model);
  if (parsed.provider === "runninghub" && kind !== "chat") return runningHubVirtualCapability(parsed.model, kind);
  if (parsed.provider === "modelscope" && kind === "image") return modelScopeVirtualImageCapability(parsed.model);
  return undefined;
}

function findModelCapability(
  provider: AiProvider,
  model: string,
  supportsAsync: boolean,
  kind?: ModelKind,
): ProviderModelCapability | undefined {
  return MODEL_CAPABILITIES.find(
    item =>
      item.provider === provider &&
      item.model === model &&
      item.supportsAsync === supportsAsync &&
      (kind === undefined || item.kind === kind),
  );
}

export function getModelCapabilities(kind?: ModelKind, provider?: AiProvider): ProviderModelCapability[] {
  return MODEL_CAPABILITIES.filter(
    capability =>
      (kind === undefined || capability.kind === kind) && (provider === undefined || capability.provider === provider),
  );
}

export function getListedModelCapabilities(kind?: ModelKind, provider?: AiProvider): ProviderModelCapability[] {
  return getModelCapabilities(kind, provider).filter(capability => capability.listed !== false);
}

export function supportsAsyncImageGeneration(value: string): boolean {
  const parsed = parseProviderModel(value, "12ai");
  return MODEL_CAPABILITIES.some(
    capability =>
      capability.kind === "image" &&
      capability.provider === parsed.provider &&
      capability.model === parsed.model &&
      capability.supportsAsync,
  );
}

export function resolveAsyncImageModelValue(value: string, referenceCount: number): string | null {
  const parsed = parseProviderModel(value, "12ai");
  if (parsed.async) return value;
  const capability = MODEL_CAPABILITIES.find(
    item =>
      item.kind === "image" &&
      item.provider === parsed.provider &&
      item.model === parsed.model &&
      item.supportsAsync,
  );
  if (!capability) return null;
  const referenceRange = inputModalitiesReferenceCountRange(capability.inputModalities);
  return referenceCount <= referenceRange.maxCount ? capability.value : null;
}

export function formatProviderModel(provider: AiProvider, model: string): string {
  return `${provider}:${model}`;
}

export function isAgentCompatibleModelId(model: string): boolean {
  const lower = model.toLowerCase();
  if (lower.includes("image")) return false;
  if (lower.includes("imagen")) return false;
  if (lower.includes("imagine")) return false;
  if (lower.includes("video")) return false;
  if (lower.includes("veo")) return false;
  if (lower.includes("omni_flash")) return false;
  if (lower.includes("tts")) return false;
  if (lower.includes("audio")) return false;
  if (lower.includes("embedding")) return false;
  return true;
}

export function isMimoWorkbenchTtsModel(value: string): boolean {
  const parsed = tryParseProviderModel(value, "12ai");
  return parsed?.provider === "mimo" && (
    parsed.model === "mimo-v2.5-tts" ||
    parsed.model === "mimo-v2.5-tts-voicedesign" ||
    parsed.model === "mimo-v2.5-tts-voiceclone"
  );
}

export function getImageModelCapabilities(value: string): ImageModelCapabilities {
  const capability = getKnownCapability(value, "image");
  if (capability) {
    return {
      aspectRatios: capability.aspectRatios.length > 0 ? capability.aspectRatios : aspectRatiosFromSizes(capability.sizes),
      resolutions: capability.sizes,
      qualities: capability.qualityLevels,
      thinkingLevels: capability.thinkingLevels,
      parameterDescriptors: capability.parameterDescriptors,
      referenceSlots: capability.referenceSlots,
      maxReferenceImages: capability.maxReferenceImages,
      minReferenceImages: capability.minReferenceImages,
      referenceMediaTypes: capability.referenceMediaTypes,
    };
  }
  return {
    aspectRatios: GPT_IMAGE_RATIOS,
    resolutions: GPT_IMAGE_SIZES,
    qualities: GPT_QUALITY_OPTIONS,
    thinkingLevels: [],
    parameterDescriptors: [],
    referenceSlots: [],
    maxReferenceImages: 0,
    minReferenceImages: 0,
    referenceMediaTypes: [],
  };
}

export function imageParameterValuesFromLegacy(
  model: string,
  legacy: { runningHubYouchuan?: RunningHubYouchuanAdvancedSettings },
): ModelParameterValues {
  const descriptors = getImageModelCapabilities(model).parameterDescriptors;
  if (descriptors.length === 0) return {};
  const parsed = tryParseProviderModel(model, "12ai");
  if (parsed?.provider === "runninghub") {
    return runningHubYouchuanSettingsToParameterValues(parsed.model, legacy.runningHubYouchuan);
  }
  return defaultCapabilityParameterValues(descriptors);
}

export function imageParameterValuesToRunningHubYouchuan(
  model: string,
  values: ModelParameterValues,
): RunningHubYouchuanAdvancedSettings | undefined {
  const parsed = tryParseProviderModel(model, "12ai");
  if (parsed?.provider !== "runninghub") return undefined;
  return runningHubYouchuanSettingsFromParameterValues(parsed.model, values);
}

export function getImageResolutionOptions(value: string, aspectRatio: string): ParameterOption[] {
  const capability = getKnownCapability(value, "image");
  if (!capability) {
    return GPT_IMAGE_SIZES.filter(option => {
      if (option.value === "auto" || option.value === "custom") return true;
      return getPixelSizeAspectRatio(option.value) === aspectRatio;
    });
  }
  if (!capability.sizes.some(option => isPixelSize(option.value))) return capability.sizes;

  return capability.sizes.filter(option => {
    if (option.value === "auto" || option.value === "custom") return true;
    return getPixelSizeAspectRatio(option.value) === aspectRatio;
  });
}

export function getImageAspectRatioFromResolution(resolution: string): string | null {
  return getPixelSizeAspectRatio(resolution);
}

export function getVideoModelCapabilities(value: string): VideoModelCapabilities {
  const capability = getKnownCapability(value, "video");
  return {
    sizes: capability?.sizes ?? VEO_31_VIDEO_SIZES,
    resolutions: capability?.resolutions ?? [],
    durations: capability?.durations ?? [],
    presets: capability?.presets ?? [],
    parameterDescriptors: capability?.parameterDescriptors ?? [],
    referenceSlots: capability?.referenceSlots ?? [],
    referenceMode: capability?.videoReferenceMode ?? "none",
    referenceModes: capability?.videoReferenceModes ?? [],
    maxReferenceImages: capability?.maxReferenceImages ?? 0,
    minReferenceImages: capability?.minReferenceImages ?? 0,
    referenceMediaTypes: capability?.referenceMediaTypes ?? [],
  };
}

export function getAudioModelCapabilities(value: string): AudioModelCapabilities {
  const capability = getKnownCapability(value, "audio");
  const modes = capability?.audioModes ?? ["tts"];
  return {
    modes,
    outputKinds: capability?.audioOutputKinds ?? ["audio"],
    defaultMode: capability?.audioDefaultMode ?? modes[0] ?? "tts",
    formats: capability?.presets ?? [],
    durations: capability?.durations ?? [],
    parameterDescriptors: capability?.parameterDescriptors ?? [],
    referenceSlots: capability?.referenceSlots ?? [],
    maxReferenceMedia: capability?.maxReferenceImages ?? 0,
    minReferenceMedia: capability?.minReferenceImages ?? 0,
    referenceMediaTypes: capability?.referenceMediaTypes ?? [],
  };
}

export class ProviderModelParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderModelParseError";
  }
}

export function parseProviderModel(value: string, fallbackProvider: AiProvider): {
  provider: AiProvider;
  model: string;
  async: boolean;
} {
  if (value.startsWith("12ai-async:")) {
    return { provider: "12ai", model: value.slice("12ai-async:".length), async: true };
  }

  const separator = value.indexOf(":");
  if (separator === -1) {
    return { provider: fallbackProvider, model: value, async: false };
  }

  const provider = value.slice(0, separator);
  const model = value.slice(separator + 1);
  if (isProviderKey(provider)) {
    return { provider, model, async: false };
  }

  throw new ProviderModelParseError(`Invalid provider prefix "${provider}" in model "${value}"`);
}

export function tryParseProviderModel(
  value: string,
  fallbackProvider: AiProvider,
): ReturnType<typeof parseProviderModel> | null {
  try {
    return parseProviderModel(value, fallbackProvider);
  } catch (error) {
    if (error instanceof ProviderModelParseError) return null;
    throw error;
  }
}

interface CapabilityInput {
  value: string;
  label: string;
  provider: AiProvider;
  model: string;
  listed?: boolean;
  inputModalities?: ModelInputModalityProfile;
  parameterDescriptors?: ModelParameterDescriptor[];
  pricing?: ModelPricingProfile;
  payloadMapping?: ProviderPayloadMappingDescriptor;
}

interface ImageCapabilityInput extends CapabilityInput {
  supportsAsync: boolean;
  supportsReferences: boolean;
  aspectRatios?: ParameterOption[];
  sizes?: ParameterOption[];
  thinkingLevels?: ParameterOption[];
  qualityLevels?: ParameterOption[];
  maxReferenceImages?: number;
  minReferenceImages?: number;
  referenceMediaTypes?: MediaReferenceType[];
}

interface VideoCapabilityInput extends CapabilityInput {
  supportsReferences: boolean;
  sizes: ParameterOption[];
  resolutions?: ParameterOption[];
  durations?: ParameterOption[];
  presets?: ParameterOption[];
  videoReferenceMode: VideoReferenceMode;
  videoReferenceModes?: VideoReferenceMode[];
  maxReferenceImages: number;
  minReferenceImages: number;
  referenceMediaTypes?: MediaReferenceType[];
}

function imageInputModalities(input: ImageCapabilityInput): ModelInputModalityProfile {
  if (!input.supportsReferences) return { text: { required: true } };
  return {
    text: { required: true },
    images: {
      minCount: input.minReferenceImages ?? 0,
      maxCount: input.maxReferenceImages ?? 4,
      roles: ["content", "style", "object"],
      delivery: "providerNative",
    },
  };
}

function videoInputModalities(input: VideoCapabilityInput): ModelInputModalityProfile {
  if (!input.supportsReferences) return { text: { required: true } };
  const referenceMediaTypes = input.referenceMediaTypes ?? ["image"];
  return {
    text: { required: true },
    images: referenceMediaTypes.includes("image")
      ? {
          minCount: input.minReferenceImages,
          maxCount: input.maxReferenceImages,
          roles: input.videoReferenceMode === "firstLast" ? ["firstFrame", "lastFrame"] : ["reference"],
          delivery: "providerNative",
        }
      : undefined,
    videos: referenceMediaTypes.includes("video")
      ? {
          minCount: 0,
          maxCount: input.maxReferenceImages,
          roles: ["reference"],
          delivery: "providerNative",
        }
      : undefined,
    audio: referenceMediaTypes.includes("audio")
      ? {
          minCount: 0,
          maxCount: input.maxReferenceImages,
          roles: ["audioGuide"],
          delivery: "providerNative",
        }
      : undefined,
    mixed: referenceMediaTypes.length > 1 ? { maxTotalCount: input.maxReferenceImages } : undefined,
  };
}

function imageCapability(input: ImageCapabilityInput): ProviderModelCapability {
  const parameterDescriptors = input.parameterDescriptors ?? [];
  const inputModalities = input.inputModalities ?? imageInputModalities(input);
  const referenceRange = inputModalitiesReferenceCountRange(inputModalities);
  const referenceMediaTypes = input.supportsReferences ? input.referenceMediaTypes ?? inputModalitiesReferenceMediaTypes(inputModalities) : [];
  return {
    value: input.value,
    label: input.label,
    provider: input.provider,
    model: input.model,
    kind: "image",
    listed: input.listed,
    supportsAsync: input.supportsAsync,
    supportsReferences: input.supportsReferences,
    aspectRatios: input.aspectRatios ?? [],
    sizes: input.sizes ?? [],
    thinkingLevels: input.thinkingLevels ?? [],
    qualityLevels: input.qualityLevels ?? [],
    resolutions: [],
    durations: [],
    presets: [],
    audioModes: [],
    audioOutputKinds: [],
    videoReferenceMode: "none",
    videoReferenceModes: [],
    inputModalities,
    parameterDescriptors,
    referenceSlots: referenceParameterDescriptors(parameterDescriptors),
    pricing: input.pricing ?? unpricedModel("unverified"),
    payloadMapping: input.payloadMapping,
    maxReferenceImages: input.supportsReferences ? input.maxReferenceImages ?? referenceRange.maxCount : 0,
    minReferenceImages: input.supportsReferences ? input.minReferenceImages ?? referenceRange.minCount : 0,
    referenceMediaTypes,
  };
}

function videoCapability(input: VideoCapabilityInput): ProviderModelCapability {
  const parameterDescriptors = input.parameterDescriptors ?? [];
  const inputModalities = input.inputModalities ?? videoInputModalities(input);
  const referenceMediaTypes = input.supportsReferences ? input.referenceMediaTypes ?? inputModalitiesReferenceMediaTypes(inputModalities) : [];
  return {
    value: input.value,
    label: input.label,
    provider: input.provider,
    model: input.model,
    kind: "video",
    listed: input.listed,
    supportsAsync: false,
    supportsReferences: input.supportsReferences,
    aspectRatios: [],
    sizes: input.sizes,
    thinkingLevels: [],
    qualityLevels: [],
    resolutions: input.resolutions ?? [],
    durations: input.durations ?? [],
    presets: input.presets ?? [],
    audioModes: [],
    audioOutputKinds: [],
    videoReferenceMode: input.videoReferenceMode,
    videoReferenceModes: input.videoReferenceModes ?? (input.videoReferenceMode === "none" ? [] : [input.videoReferenceMode]),
    inputModalities,
    parameterDescriptors,
    referenceSlots: referenceParameterDescriptors(parameterDescriptors),
    pricing: input.pricing ?? unpricedModel("unverified"),
    payloadMapping: input.payloadMapping,
    maxReferenceImages: input.maxReferenceImages,
    minReferenceImages: input.minReferenceImages,
    referenceMediaTypes,
  };
}

export function readModelCapabilityCatalog(catalog: ModelCapabilityCatalogDocument): ProviderModelCapability[] {
  if (!isNonEmptyString(catalog.version)) throw new Error("Model capability catalog is missing a version");
  if (!Array.isArray(catalog.entries) || catalog.entries.length === 0) {
    throw new Error("Model capability catalog has no entries");
  }

  const seen = new Set<string>();
  for (const entry of catalog.entries) {
    if (!isNonEmptyString(entry.value)) throw new Error("Model capability catalog entry is missing value");
    if (!isNonEmptyString(entry.label)) throw new Error(`${entry.value} is missing label`);
    if (!isNonEmptyString(entry.provider) || !PROVIDER_KEYS.includes(entry.provider)) {
      throw new Error(`${entry.value} has invalid provider`);
    }
    if (!isNonEmptyString(entry.model)) throw new Error(`${entry.value} is missing model`);
    if (entry.kind !== "chat" && entry.kind !== "image" && entry.kind !== "video" && entry.kind !== "audio") {
      throw new Error(`${entry.value} has invalid kind`);
    }
    if (seen.has(entry.value)) throw new Error(`Duplicate model capability catalog entry: ${entry.value}`);
    seen.add(entry.value);
    if (!entry.inputModalities) throw new Error(`${entry.value} is missing inputModalities`);
    if (!Array.isArray(entry.parameterDescriptors)) throw new Error(`${entry.value} is missing parameterDescriptors`);
    if (!Array.isArray(entry.referenceSlots)) throw new Error(`${entry.value} is missing referenceSlots`);
    if (!referenceSlotsMatchDescriptors(entry)) throw new Error(`${entry.value} has mismatched referenceSlots`);
    validateCatalogPricing(entry);
    validateCatalogPayloadMapping(entry);
  }
  return catalog.entries;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function referenceSlotsMatchDescriptors(entry: ProviderModelCapability): boolean {
  return JSON.stringify(entry.referenceSlots) === JSON.stringify(referenceParameterDescriptors(entry.parameterDescriptors));
}

function validateCatalogPricing(entry: ProviderModelCapability): void {
  if (!entry.pricing) throw new Error(`${entry.value} is missing pricing`);
  if (entry.pricing.status === "unpriced") {
    if (!entry.pricing.reason) throw new Error(`${entry.value} is missing unpriced reason`);
    return;
  }
  if (entry.pricing.status !== "priced") throw new Error(`${entry.value} has invalid pricing status`);
  if (!isNonEmptyString(entry.pricing.lookupKey)) throw new Error(`${entry.value} priced entry is missing lookupKey`);
  if (typeof entry.pricing.price !== "number" || !Number.isFinite(entry.pricing.price) || entry.pricing.price < 0) {
    throw new Error(`${entry.value} priced entry has invalid price`);
  }
  if (!isNonEmptyString(entry.pricing.unit)) throw new Error(`${entry.value} priced entry is missing unit`);
  if (!isNonEmptyString(entry.pricing.displayUnit)) throw new Error(`${entry.value} priced entry is missing displayUnit`);
  if (!Array.isArray(entry.pricing.dimensions)) throw new Error(`${entry.value} priced entry is missing dimensions`);
  if (!isNonEmptyString(entry.pricing.source)) throw new Error(`${entry.value} priced entry is missing source`);
}

function validateCatalogPayloadMapping(entry: ProviderModelCapability): void {
  if (!entry.payloadMapping) return;
  if (entry.payloadMapping.provider !== entry.provider) {
    throw new Error(`${entry.value} payloadMapping provider does not match capability provider`);
  }
  if (!isNonEmptyString(entry.payloadMapping.endpoint)) {
    throw new Error(`${entry.value} payloadMapping is missing endpoint`);
  }
  if (!Array.isArray(entry.payloadMapping.fields)) {
    throw new Error(`${entry.value} payloadMapping is missing fields`);
  }
}

function buildProviderOptionsRecord(kind: ModelKind, includeAsync: boolean): Record<AiProvider, ModelOption[]> {
  const record = {} as Record<AiProvider, ModelOption[]>;
  for (const key of PROVIDER_KEYS) {
    record[key] = optionsForKind(kind, key, includeAsync);
  }
  return record;
}

function optionsForKind(kind: ModelKind, provider?: AiProvider, includeAsync = true): ModelOption[] {
  return MODEL_CAPABILITIES
    .filter(
      capability =>
      capability.kind === kind &&
        capability.listed !== false &&
        (!provider || capability.provider === provider) &&
        (includeAsync || !capability.supportsAsync),
    )
    .map(({ value, label }) => ({ value, label }));
}

function getKnownCapability(value: string, kind: ModelKind): ProviderModelCapability | undefined {
  const parsed = parseProviderModel(value, "12ai");
  const capability = findModelCapability(parsed.provider, parsed.model, parsed.async, kind);
  if (capability) return capability;
  if (kind === "audio" && parsed.provider !== "mimo") return customMimoAudioCapability(parsed.provider, parsed.model);
  if (parsed.provider === "runninghub" && kind !== "chat") return runningHubVirtualCapability(parsed.model, kind);
  if (parsed.provider === "modelscope" && kind === "image") return modelScopeVirtualImageCapability(parsed.model);
  return undefined;
}

function customMimoAudioCapability(provider: AiProvider, model: string): ProviderModelCapability | undefined {
  const mimoCapability = findModelCapability("mimo", model, false, "audio");
  if (!mimoCapability) return undefined;
  return {
    ...mimoCapability,
    value: formatProviderModel(provider, model),
    label: `${provider} ${model}`,
    provider,
  };
}

function modelScopeVirtualImageCapability(model: string): ProviderModelCapability {
  const supportsReferences = model.toLowerCase().includes("edit") || model.toLowerCase().includes("klein");
  return imageCapability({
    value: formatProviderModel("modelscope", model),
    label: `ModelScope ${model}`,
    provider: "modelscope",
    model,
    supportsAsync: true,
    supportsReferences,
    maxReferenceImages: supportsReferences ? 4 : undefined,
    sizes: MODELSCOPE_IMAGE_SIZES,
  });
}

function runningHubImageParameterProfile(
  model: RunningHubStandardModel,
): Pick<ImageCapabilityInput, "aspectRatios" | "qualityLevels" | "sizes"> {
  const lower = model.model.toLowerCase();
  if (lower.includes("rhart-image-g-2")) {
    const isOfficial = lower.includes("official");
    return {
      aspectRatios: isOfficial ? RUNNINGHUB_GPT_IMAGE_OFFICIAL_RATIOS : RUNNINGHUB_GPT_IMAGE_CHANNEL_RATIOS,
      qualityLevels: isOfficial ? RUNNINGHUB_GPT_QUALITY_OPTIONS : undefined,
      sizes: RUNNINGHUB_GPT_IMAGE_RESOLUTIONS,
    };
  }
  if (lower.includes("rhart-image-n-g31-flash")) {
    return {
      aspectRatios: RUNNINGHUB_GEMINI_FLASH_IMAGE_RATIOS,
      sizes: RUNNINGHUB_GEMINI_IMAGE_RESOLUTIONS,
    };
  }
  if (lower.includes("rhart-image-n-pro")) {
    return {
      aspectRatios: RUNNINGHUB_GEMINI_PRO_IMAGE_RATIOS,
      sizes: lower.includes("ultra") ? RUNNINGHUB_GEMINI_ULTRA_IMAGE_RESOLUTIONS : RUNNINGHUB_GEMINI_IMAGE_RESOLUTIONS,
    };
  }
  if (lower.includes("youchuan/text-to-image-v")) {
    return {
      aspectRatios: RUNNINGHUB_YOUCHUAN_V81_IMAGE_RATIOS,
      qualityLevels: youchuanQualityOptions(model.model),
      sizes: AUTO_IMAGE_SIZES,
    };
  }
  if (
    lower.includes("seedream") ||
    lower.includes("jimeng") ||
    lower.includes("z-image") ||
    lower.includes("f-2-dev")
  ) {
    return { sizes: OPEN_DIMENSION_IMAGE_SIZES };
  }
  if (lower.includes("rhart-image-g/")) {
    return { aspectRatios: GROK_IMAGE_RATIOS, sizes: GROK_IMAGE_SIZES };
  }
  return { aspectRatios: AUTO_ASPECT_RATIO, sizes: AUTO_IMAGE_SIZES };
}

function youchuanQualityOptions(model: string): ParameterOption[] {
  return runningHubYouchuanQualityValues(model).map(value => ({ value, label: `Quality ${value}` }));
}

function runningHubVideoParameterProfile(
  model: RunningHubStandardModel,
): Pick<VideoCapabilityInput, "durations" | "resolutions" | "sizes"> {
  const lower = model.model.toLowerCase();
  if (lower.includes("hailuo")) {
    return {
      durations: optionList(model.durationOptions),
      sizes: HAILUO_VIDEO_SIZES,
    };
  }
  if (lower.includes("seedance")) {
    return {
      durations: optionList(model.durationOptions),
      resolutions: optionList(model.resolutionOptions) ?? RUNNINGHUB_SEEDANCE_VIDEO_RESOLUTIONS,
      sizes: SEEDANCE_VIDEO_SIZES,
    };
  }
  if (lower.includes("gemini-omni-flash")) {
    return {
      durations: optionList(model.durationOptions),
      resolutions: optionList(model.resolutionOptions) ?? OMNI_FLASH_VIDEO_RESOLUTIONS,
      sizes: TWELVE_AI_OMNI_VIDEO_SIZES,
    };
  }
  if (lower.includes("rhart-video-g/")) {
    return {
      durations: optionList(model.durationOptions),
      resolutions: optionList(model.resolutionOptions),
      sizes: RUNNINGHUB_VIDEOX_15_SIZES,
    };
  }
  if (lower.includes("rhart-video-v3.1")) {
    return {
      durations: optionList(model.durationOptions),
      resolutions: optionList(model.resolutionOptions) ?? VEO_31_VIDEO_RESOLUTIONS,
      sizes: VEO_31_VIDEO_SIZES,
    };
  }
  return { sizes: RUNNINGHUB_VIDEO_SIZES };
}

function optionList(values: readonly string[] | undefined): ParameterOption[] | undefined {
  return values?.map(value => ({
    value,
    label: /^\d+$/.test(value) ? `${value}s` : value === "4k" ? "4K" : value,
  }));
}

function runningHubInputModalities(model: RunningHubStandardModel): ModelInputModalityProfile {
  if (!model.supportsReferences) return { text: { required: true } };
  if (model.kind === "image") {
    return {
      text: { required: true },
      images: {
        minCount: model.minReferenceImages,
        maxCount: model.maxReferenceImages,
        roles: ["content", "style", "object"],
        delivery: "uploadedUrl",
      },
    };
  }
  return {
    text: { required: true },
    images: {
      minCount: model.minReferenceImages,
      maxCount: model.maxReferenceImages,
      roles: model.videoReferenceMode === "firstLast" ? ["firstFrame", "lastFrame"] : ["reference"],
      delivery: "uploadedUrl",
    },
    videos: model.referenceMediaTypes?.includes("video")
      ? { minCount: 0, maxCount: model.maxReferenceImages, roles: ["reference"], delivery: "uploadedUrl" }
      : undefined,
    audio: model.referenceMediaTypes?.includes("audio")
      ? { minCount: 0, maxCount: model.maxReferenceImages, roles: ["audioGuide"], delivery: "uploadedUrl" }
      : undefined,
  };
}

function aspectRatiosFromSizes(sizes: ParameterOption[]): ParameterOption[] {
  const ratios = new Map<string, ParameterOption>();
  for (const size of sizes) {
    const ratio = getPixelSizeAspectRatio(size.value);
    if (ratio && !ratios.has(ratio)) {
      ratios.set(ratio, { value: ratio, label: ratio });
    }
  }
  return Array.from(ratios.values());
}

function getPixelSizeAspectRatio(value: string): string | null {
  const documentedRatio = DOCUMENTED_IMAGE_SIZE_RATIOS[value];
  if (documentedRatio) return documentedRatio;
  const agnesRatio = AGNES_IMAGE_SIZE_RATIOS[value];
  if (agnesRatio) return agnesRatio;

  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function isPixelSize(value: string): boolean {
  return /^\d+x\d+$/.test(value);
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = a;
  let right = b;
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
}

function runningHubVirtualCapability(model: string, kind?: ModelKind): ProviderModelCapability {
  const lower = model.toLowerCase();
  const isVideo = lower.includes("video");
  const resolvedKind: ModelKind = kind ?? (isVideo ? "video" : "image");
  if (resolvedKind === "image" || resolvedKind === "video") {
    const standardModel = getRunningHubStandardModel(model, resolvedKind);
    if (standardModel?.kind === "image") {
      const profile = runningHubImageParameterProfile(standardModel);
      return imageCapability({
        value: formatProviderModel("runninghub", standardModel.model),
        label: standardModel.label,
        provider: "runninghub",
        model: standardModel.model,
        supportsAsync: false,
        supportsReferences: standardModel.supportsReferences,
        ...profile,
        inputModalities: runningHubInputModalities(standardModel),
        parameterDescriptors: [...runningHubYouchuanParameterDescriptors(standardModel.model)],
        pricing: unpricedModel("unverified"),
        payloadMapping: runningHubStandardPayloadMapping(standardModel),
        maxReferenceImages: standardModel.maxReferenceImages,
        minReferenceImages: standardModel.minReferenceImages,
      });
    }
    if (standardModel?.kind === "video") {
      const profile = runningHubVideoParameterProfile(standardModel);
      return videoCapability({
        value: formatProviderModel("runninghub", standardModel.model),
        label: standardModel.label,
        provider: "runninghub",
        model: standardModel.model,
        supportsReferences: standardModel.supportsReferences,
        ...profile,
        inputModalities: runningHubInputModalities(standardModel),
        pricing: unpricedModel("unverified"),
        payloadMapping: runningHubStandardPayloadMapping(standardModel),
        videoReferenceMode: standardModel.videoReferenceMode ?? (standardModel.supportsReferences ? "reference" : "none"),
        videoReferenceModes: standardModel.videoReferenceModes ? [...standardModel.videoReferenceModes] : undefined,
        maxReferenceImages: standardModel.maxReferenceImages,
        minReferenceImages: standardModel.minReferenceImages,
        referenceMediaTypes: standardModel.referenceMediaTypes ? [...standardModel.referenceMediaTypes] : undefined,
      });
    }
  }
  if (resolvedKind === "video") {
    return videoCapability({
      value: formatProviderModel("runninghub", model),
      label: `RunningHub ${model}`,
      provider: "runninghub",
      model,
      supportsReferences: true,
      inputModalities: {
        text: { required: true },
        images: { minCount: 0, maxCount: 9, roles: ["reference"], delivery: "uploadedUrl" },
        videos: { minCount: 0, maxCount: 9, roles: ["reference"], delivery: "uploadedUrl" },
        audio: { minCount: 0, maxCount: 9, roles: ["audioGuide"], delivery: "uploadedUrl" },
      },
      sizes: RUNNINGHUB_VIDEO_SIZES,
      videoReferenceMode: "reference",
      maxReferenceImages: 9,
      minReferenceImages: 0,
      referenceMediaTypes: ["image", "video", "audio"],
    });
  }
  if (resolvedKind === "image") {
    return imageCapability({
      value: formatProviderModel("runninghub", model),
      label: `RunningHub ${model}`,
      provider: "runninghub",
      model,
      supportsAsync: false,
      supportsReferences: true,
      inputModalities: {
        text: { required: true },
        images: { minCount: 0, maxCount: 9, roles: ["content", "style", "object"], delivery: "uploadedUrl" },
      },
      parameterDescriptors: [...runningHubYouchuanParameterDescriptors(model)],
      maxReferenceImages: 9,
      sizes: RUNNINGHUB_IMAGE_SIZES,
    });
  }
  if (resolvedKind === "audio") {
    throw new Error("RunningHub audio is supported through AI App / Workflow targets, not generic audio model capabilities");
  }
  throw new Error(`RunningHub does not support ${resolvedKind} models`);
}
