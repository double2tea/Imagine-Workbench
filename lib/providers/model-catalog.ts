export type { AiProvider } from "./registry";
import type { AiProvider } from "./registry";
import { PROVIDER_KEYS, isKnownProvider } from "./registry";
import { RUNNINGHUB_DEFAULT_LLM_MODEL, RUNNINGHUB_STANDARD_MODELS, type RunningHubStandardModel } from "./runninghub";
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
  maxReferenceImages: number;
  minReferenceImages: number;
  referenceMediaTypes: MediaReferenceType[];
}

export interface VideoModelCapabilities {
  sizes: ParameterOption[];
  resolutions: ParameterOption[];
  durations: ParameterOption[];
  presets: ParameterOption[];
  referenceMode: VideoReferenceMode;
  referenceModes: VideoReferenceMode[];
  maxReferenceImages: number;
  minReferenceImages: number;
  referenceMediaTypes: MediaReferenceType[];
}

export interface AudioModelCapabilities {
  formats: ParameterOption[];
  durations: ParameterOption[];
  maxReferenceMedia: number;
  minReferenceMedia: number;
  referenceMediaTypes: MediaReferenceType[];
}

export type ModelKind = "chat" | "image" | "video" | "audio";
export type VideoReferenceMode = "none" | "reference" | "firstLast";

export interface ProviderModelCapability {
  value: string;
  label: string;
  provider: AiProvider;
  model: string;
  kind: ModelKind;
  supportsAsync: boolean;
  supportsReferences: boolean;
  aspectRatios: ParameterOption[];
  sizes: ParameterOption[];
  thinkingLevels: ParameterOption[];
  qualityLevels: ParameterOption[];
  resolutions: ParameterOption[];
  durations: ParameterOption[];
  presets: ParameterOption[];
  videoReferenceMode: VideoReferenceMode;
  videoReferenceModes: VideoReferenceMode[];
  maxReferenceImages: number;
  minReferenceImages: number;
  referenceMediaTypes: MediaReferenceType[];
}

export const DEFAULT_IMAGE_MODEL = "12ai:gemini-3.1-flash-image-preview";
export const DEFAULT_VIDEO_MODEL = "12ai:veo_3_1-fast";
export const DEFAULT_CHAT_MODEL = "12ai:gemini-3.1-flash-lite-preview";
/** @deprecated Agent no longer auto-switches models; alias kept for existing imports/tests. */
export const DEFAULT_VISION_CHAT_MODEL = DEFAULT_CHAT_MODEL;

const GEMINI_25_RATIOS: ParameterOption[] = [
  { value: "1:1", label: "1:1 Square" },
  { value: "2:3", label: "2:3 Portrait" },
  { value: "3:2", label: "3:2 Landscape" },
  { value: "3:4", label: "3:4 Portrait" },
  { value: "4:3", label: "4:3 Landscape" },
  { value: "4:5", label: "4:5 Social" },
  { value: "5:4", label: "5:4 Landscape" },
  { value: "9:16", label: "9:16 Vertical" },
  { value: "16:9", label: "16:9 Cinema" },
  { value: "21:9", label: "21:9 Wide" },
];

const GEMINI_31_EXTRA_RATIOS: ParameterOption[] = [
  { value: "1:4", label: "1:4 Tall Strip" },
  { value: "1:8", label: "1:8 Ultra Tall" },
  { value: "4:1", label: "4:1 Banner" },
  { value: "8:1", label: "8:1 Ultra Wide" },
];

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

const GEMINI_31_IMAGE_SIZES: ParameterOption[] = [
  imageResolutionOption("512px"),
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
];

const GEMINI_PRO_IMAGE_SIZES: ParameterOption[] = [
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
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

const RUNNINGHUB_GEMINI_ULTRA_IMAGE_RESOLUTIONS: ParameterOption[] = [
  { value: "4k", label: "4K" },
  { value: "8k", label: "8K" },
];

const THINKING_LEVELS: ParameterOption[] = [
  { value: "minimal", label: "Minimal" },
  { value: "high", label: "High" },
];

const GROK_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto" },
  { value: "720x1280", label: "9:16 Vertical" },
  { value: "1280x720", label: "16:9 Landscape" },
  { value: "1024x1024", label: "1:1 Square" },
  { value: "1024x1792", label: "4:7 Portrait" },
  { value: "1792x1024", label: "7:4 Landscape" },
];

const GROK_VIDEO_RESOLUTIONS: ParameterOption[] = [
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
];

const GROK_VIDEO_DURATIONS: ParameterOption[] = [
  { value: "6", label: "6s" },
  { value: "10", label: "10s" },
  { value: "12", label: "12s" },
  { value: "16", label: "16s" },
  { value: "20", label: "20s" },
];

const GROK_VIDEO_PRESETS: ParameterOption[] = [
  { value: "normal", label: "Normal" },
  { value: "fun", label: "Fun" },
  { value: "spicy", label: "Spicy" },
  { value: "custom", label: "Custom" },
];

const VEO_31_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto (source/default)" },
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Vertical" },
];

const VEO_31_VIDEO_RESOLUTIONS: ParameterOption[] = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];

const VEO_31_VIDEO_DURATIONS: ParameterOption[] = [
  { value: "4", label: "4s" },
  { value: "6", label: "6s" },
  { value: "8", label: "8s" },
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

const OMNI_FLASH_VIDEO_DURATIONS: ParameterOption[] = [
  { value: "4", label: "4s" },
  { value: "6", label: "6s" },
  { value: "8", label: "8s" },
  { value: "10", label: "10s" },
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

const MODELSCOPE_CHAT_MODELS = [
  {
    model: "Qwen/Qwen3-235B-A22B",
    label: "ModelScope Qwen3 235B A22B",
  },
  {
    model: "Qwen/Qwen3-VL-235B-A22B-Instruct",
    label: "ModelScope Qwen3 VL 235B A22B Instruct",
  },
  {
    model: "MiniMax/MiniMax-M2.7:MiniMax",
    label: "ModelScope MiniMax M2.7",
  },
] as const;

type ModelScopeImageModel = {
  model: string;
  label: string;
  supportsReferences: boolean;
  maxReferenceImages?: number;
};

const MODELSCOPE_IMAGE_MODELS: readonly ModelScopeImageModel[] = [
  {
    model: "Tongyi-MAI/Z-Image-Turbo",
    label: "ModelScope Z-Image Turbo",
    supportsReferences: false,
  },
  {
    model: "Qwen/Qwen-Image-2512",
    label: "ModelScope Qwen Image 2512",
    supportsReferences: false,
  },
  {
    model: "Qwen/Qwen-Image-Edit-2511",
    label: "ModelScope Qwen Image Edit 2511",
    supportsReferences: true,
    maxReferenceImages: 4,
  },
  {
    model: "black-forest-labs/FLUX.2-klein-9B",
    label: "ModelScope FLUX.2 Klein 9B",
    supportsReferences: true,
    maxReferenceImages: 4,
  },
  {
    model: "Qwen/Qwen-Image",
    label: "ModelScope Qwen Image",
    supportsReferences: false,
  },
  {
    model: "Qwen/Qwen-Image-Edit",
    label: "ModelScope Qwen Image Edit",
    supportsReferences: true,
    maxReferenceImages: 4,
  },
] as const;

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

const AGNES_IMAGE_SIZES: ParameterOption[] = [
  imageResolutionOption("1024x1024"),
  imageResolutionOption("1024x768"),
  imageResolutionOption("768x1024"),
  imageResolutionOption("1152x768"),
  imageResolutionOption("768x1152"),
  imageResolutionOption("1280x720"),
  imageResolutionOption("720x1280"),
  imageResolutionOption("custom"),
];

const AGNES_IMAGE_SIZE_RATIOS: Record<string, string> = {
  "1024x768": "4:3",
  "768x1024": "3:4",
  "1152x768": "3:2",
  "768x1152": "2:3",
};

const AGNES_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto" },
  { value: "1152x768", label: "1152x768" },
  { value: "768x1152", label: "768x1152" },
  { value: "1280x720", label: "1280x720" },
  { value: "720x1280", label: "720x1280" },
];

export const MODEL_CAPABILITIES: ProviderModelCapability[] = [
  imageCapability({
    value: "12ai:gemini-3.1-flash-image-preview",
    label: "12AI Gemini 3.1 Flash Image",
    provider: "12ai",
    model: "gemini-3.1-flash-image-preview",
    supportsAsync: false,
    supportsReferences: true,
    aspectRatios: [...GEMINI_25_RATIOS, ...GEMINI_31_EXTRA_RATIOS],
    sizes: GEMINI_31_IMAGE_SIZES,
    thinkingLevels: THINKING_LEVELS,
  }),
  imageCapability({
    value: "12ai:gemini-3-pro-image-preview",
    label: "12AI Gemini 3 Pro Image",
    provider: "12ai",
    model: "gemini-3-pro-image-preview",
    supportsAsync: false,
    supportsReferences: true,
    aspectRatios: [...GEMINI_25_RATIOS, ...GEMINI_31_EXTRA_RATIOS],
    sizes: GEMINI_PRO_IMAGE_SIZES,
  }),
  imageCapability({
    value: "12ai:gemini-2.5-flash-image",
    label: "12AI Gemini 2.5 Flash Image",
    provider: "12ai",
    model: "gemini-2.5-flash-image",
    supportsAsync: false,
    supportsReferences: true,
    aspectRatios: GEMINI_25_RATIOS,
  }),
  imageCapability({
    value: "12ai:gpt-image-2",
    label: "12AI GPT Image 2",
    provider: "12ai",
    model: "gpt-image-2",
    supportsAsync: false,
    supportsReferences: true,
    aspectRatios: GPT_IMAGE_RATIOS,
    sizes: GPT_IMAGE_SIZES,
    qualityLevels: GPT_QUALITY_OPTIONS,
  }),
  imageCapability({
    value: "12ai-async:gpt-image-2",
    label: "12AI Async GPT Image 2",
    provider: "12ai",
    model: "gpt-image-2",
    supportsAsync: true,
    supportsReferences: false,
    aspectRatios: GPT_IMAGE_RATIOS,
    sizes: GPT_IMAGE_SIZES,
    qualityLevels: GPT_QUALITY_OPTIONS,
  }),
  imageCapability({
    value: "12ai-async:gemini-3.1-flash-image-preview",
    label: "12AI Async Gemini 3.1 Image",
    provider: "12ai",
    model: "gemini-3.1-flash-image-preview",
    supportsAsync: true,
    supportsReferences: true,
    aspectRatios: [...GEMINI_25_RATIOS, ...GEMINI_31_EXTRA_RATIOS],
    sizes: GEMINI_31_IMAGE_SIZES,
    thinkingLevels: THINKING_LEVELS,
  }),
  imageCapability({
    value: "12ai-async:gemini-2.5-flash-image",
    label: "12AI Async Gemini 2.5 Image",
    provider: "12ai",
    model: "gemini-2.5-flash-image",
    supportsAsync: true,
    supportsReferences: true,
    aspectRatios: GEMINI_25_RATIOS,
  }),
  imageCapability({
    value: "12ai-async:gemini-3-pro-image-preview",
    label: "12AI Async Gemini 3 Pro Image",
    provider: "12ai",
    model: "gemini-3-pro-image-preview",
    supportsAsync: true,
    supportsReferences: true,
    aspectRatios: [...GEMINI_25_RATIOS, ...GEMINI_31_EXTRA_RATIOS],
    sizes: GEMINI_PRO_IMAGE_SIZES,
  }),
  imageCapability({
    value: "grok2api:grok-imagine-image-lite",
    label: "Grok2API Imagine Image Lite",
    provider: "grok2api",
    model: "grok-imagine-image-lite",
    supportsAsync: false,
    supportsReferences: false,
    aspectRatios: GROK_IMAGE_RATIOS,
    sizes: GROK_IMAGE_SIZES,
  }),
  imageCapability({
    value: "grok2api:grok-imagine-image",
    label: "Grok2API Imagine Image",
    provider: "grok2api",
    model: "grok-imagine-image",
    supportsAsync: false,
    supportsReferences: false,
    aspectRatios: GROK_IMAGE_RATIOS,
    sizes: GROK_IMAGE_SIZES,
  }),
  imageCapability({
    value: "grok2api:grok-imagine-image-pro",
    label: "Grok2API Imagine Image Pro",
    provider: "grok2api",
    model: "grok-imagine-image-pro",
    supportsAsync: false,
    supportsReferences: false,
    aspectRatios: GROK_IMAGE_RATIOS,
    sizes: GROK_IMAGE_SIZES,
  }),
  imageCapability({
    value: "grok2api:grok-imagine-image-edit",
    label: "Grok2API Image Edit",
    provider: "grok2api",
    model: "grok-imagine-image-edit",
    supportsAsync: false,
    supportsReferences: true,
    aspectRatios: [{ value: "1:1", label: "1:1 Square" }],
    sizes: [imageResolutionOption("1024x1024")],
  }),
  videoCapability({
    value: "12ai:veo_3_1-fast",
    label: "12AI Veo 3.1 Fast Reference",
    provider: "12ai",
    model: "veo_3_1-fast",
    supportsReferences: true,
    sizes: VEO_31_VIDEO_SIZES,
    resolutions: VEO_31_VIDEO_RESOLUTIONS,
    durations: VEO_31_VIDEO_DURATIONS,
    videoReferenceMode: "reference",
    maxReferenceImages: 3,
    minReferenceImages: 0,
    referenceMediaTypes: ["image", "video"],
  }),
  videoCapability({
    value: "12ai:veo_3_1-fast-fl",
    label: "12AI Veo 3.1 First/Last Frame",
    provider: "12ai",
    model: "veo_3_1-fast-fl",
    supportsReferences: true,
    sizes: VEO_31_VIDEO_SIZES,
    resolutions: VEO_31_VIDEO_RESOLUTIONS,
    durations: VEO_31_VIDEO_DURATIONS,
    videoReferenceMode: "firstLast",
    maxReferenceImages: 2,
    minReferenceImages: 1,
    referenceMediaTypes: ["image", "video"],
  }),
  videoCapability({
    value: "12ai:omni_flash-10s",
    label: "12AI Omni Flash 10s",
    provider: "12ai",
    model: "omni_flash-10s",
    supportsReferences: true,
    sizes: TWELVE_AI_OMNI_VIDEO_SIZES,
    resolutions: OMNI_FLASH_VIDEO_RESOLUTIONS,
    durations: OMNI_FLASH_VIDEO_DURATIONS,
    videoReferenceMode: "reference",
    maxReferenceImages: 7,
    minReferenceImages: 0,
    referenceMediaTypes: ["image", "video"],
  }),
  videoCapability({
    value: "grok2api:grok-imagine-video",
    label: "Grok2API Imagine Video",
    provider: "grok2api",
    model: "grok-imagine-video",
    supportsReferences: true,
    sizes: GROK_VIDEO_SIZES,
    resolutions: GROK_VIDEO_RESOLUTIONS,
    durations: GROK_VIDEO_DURATIONS,
    presets: GROK_VIDEO_PRESETS,
    videoReferenceMode: "reference",
    maxReferenceImages: 7,
    minReferenceImages: 0,
    referenceMediaTypes: ["image", "video"],
  }),
  chatCapability({
    value: "12ai:gemini-3.1-flash-lite-preview",
    label: "12AI Gemini 3.1 Flash Lite Vision",
    provider: "12ai",
    model: "gemini-3.1-flash-lite-preview",
  }),
  ...MODELSCOPE_CHAT_MODELS.map(model =>
    chatCapability({
      value: formatProviderModel("modelscope", model.model),
      label: model.label,
      provider: "modelscope",
      model: model.model,
    }),
  ),
  chatCapability({
    value: formatProviderModel("runninghub", RUNNINGHUB_DEFAULT_LLM_MODEL),
    label: "RunningHub Qwen 3.7 Max",
    provider: "runninghub",
    model: RUNNINGHUB_DEFAULT_LLM_MODEL,
  }),
  chatCapability({
    value: "grok2api:grok-4.20-auto",
    label: "Grok2API Grok 4.20 Auto",
    provider: "grok2api",
    model: "grok-4.20-auto",
  }),
  chatCapability({
    value: "grok2api:grok-4.20-fast",
    label: "Grok2API Grok 4.20 Fast",
    provider: "grok2api",
    model: "grok-4.20-fast",
  }),
  chatCapability({
    value: "grok2api:grok-4.20-expert",
    label: "Grok2API Grok 4.20 Expert",
    provider: "grok2api",
    model: "grok-4.20-expert",
  }),
  chatCapability({
    value: "agnes:agnes-2.0-flash",
    label: "Agnes AI Agnes 2.0 Flash",
    provider: "agnes",
    model: "agnes-2.0-flash",
  }),
  chatCapability({
    value: "agnes:agnes-1.5-flash",
    label: "Agnes AI Agnes 1.5 Flash",
    provider: "agnes",
    model: "agnes-1.5-flash",
  }),
  imageCapability({
    value: "agnes:agnes-image-2.1-flash",
    label: "Agnes AI Image 2.1 Flash",
    provider: "agnes",
    model: "agnes-image-2.1-flash",
    supportsAsync: false,
    supportsReferences: true,
    aspectRatios: GPT_IMAGE_RATIOS,
    sizes: AGNES_IMAGE_SIZES,
  }),
  videoCapability({
    value: "agnes:agnes-video-v2.0",
    label: "Agnes AI Video V2.0",
    provider: "agnes",
    model: "agnes-video-v2.0",
    supportsReferences: true,
    sizes: AGNES_VIDEO_SIZES,
    videoReferenceMode: "reference",
    maxReferenceImages: 2,
    minReferenceImages: 0,
  }),
  chatCapability({
    value: "xstx:claude-opus-4-7",
    label: "星途 Claude Opus 4.7",
    provider: "xstx",
    model: "claude-opus-4-7",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-7-thinking",
    label: "星途 Claude Opus 4.7 Thinking",
    provider: "xstx",
    model: "claude-opus-4-7-thinking",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-7-liang",
    label: "星途 Claude Opus 4.7 Liang",
    provider: "xstx",
    model: "claude-opus-4-7-liang",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-6",
    label: "星途 Claude Opus 4.6",
    provider: "xstx",
    model: "claude-opus-4-6",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-6-thinking",
    label: "星途 Claude Opus 4.6 Thinking",
    provider: "xstx",
    model: "claude-opus-4-6-thinking",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-6-20260205",
    label: "星途 Claude Opus 4.6 20260205",
    provider: "xstx",
    model: "claude-opus-4-6-20260205",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-6-20260205-thinking",
    label: "星途 Claude Opus 4.6 20260205 Thinking",
    provider: "xstx",
    model: "claude-opus-4-6-20260205-thinking",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-5",
    label: "星途 Claude Opus 4.5",
    provider: "xstx",
    model: "claude-opus-4-5",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-5-thinking",
    label: "星途 Claude Opus 4.5 Thinking",
    provider: "xstx",
    model: "claude-opus-4-5-thinking",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-5-20251101",
    label: "星途 Claude Opus 4.5 20251101",
    provider: "xstx",
    model: "claude-opus-4-5-20251101",
  }),
  chatCapability({
    value: "xstx:claude-opus-4-5-20251101-thinking",
    label: "星途 Claude Opus 4.5 20251101 Thinking",
    provider: "xstx",
    model: "claude-opus-4-5-20251101-thinking",
  }),
  chatCapability({
    value: "xstx:claude-sonnet-4-6-20260217",
    label: "星途 Claude Sonnet 4.6 20260217",
    provider: "xstx",
    model: "claude-sonnet-4-6-20260217",
  }),
  chatCapability({
    value: "xstx:claude-sonnet-4-6-20260217-thinking",
    label: "星途 Claude Sonnet 4.6 20260217 Thinking",
    provider: "xstx",
    model: "claude-sonnet-4-6-20260217-thinking",
  }),
  chatCapability({
    value: "xstx:claude-sonnet-4-5",
    label: "星途 Claude Sonnet 4.5",
    provider: "xstx",
    model: "claude-sonnet-4-5",
  }),
  chatCapability({
    value: "xstx:claude-sonnet-4-5-thinking",
    label: "星途 Claude Sonnet 4.5 Thinking",
    provider: "xstx",
    model: "claude-sonnet-4-5-thinking",
  }),
  chatCapability({
    value: "xstx:claude-sonnet-4-5-20250929",
    label: "星途 Claude Sonnet 4.5 20250929",
    provider: "xstx",
    model: "claude-sonnet-4-5-20250929",
  }),
  chatCapability({
    value: "xstx:claude-sonnet-4-5-20250929-thinking",
    label: "星途 Claude Sonnet 4.5 20250929 Thinking",
    provider: "xstx",
    model: "claude-sonnet-4-5-20250929-thinking",
  }),
  chatCapability({
    value: "xstx:claude-haiku-4-5",
    label: "星途 Claude Haiku 4.5",
    provider: "xstx",
    model: "claude-haiku-4-5",
  }),
  chatCapability({
    value: "xstx:gpt-5.5-pro",
    label: "星途 GPT-5.5 Pro",
    provider: "xstx",
    model: "gpt-5.5-pro",
  }),
  chatCapability({
    value: "xstx:gpt-5.5",
    label: "星途 GPT-5.5",
    provider: "xstx",
    model: "gpt-5.5",
  }),
  chatCapability({
    value: "xstx:gpt-5.4",
    label: "星途 GPT-5.4",
    provider: "xstx",
    model: "gpt-5.4",
  }),
  chatCapability({
    value: "xstx:gpt-5.4-codex",
    label: "星途 GPT-5.4 Codex",
    provider: "xstx",
    model: "gpt-5.4-codex",
  }),
  chatCapability({
    value: "xstx:gemini-3.1-pro-high",
    label: "星途 Gemini 3.1 Pro High",
    provider: "xstx",
    model: "gemini-3.1-pro-high",
  }),
  chatCapability({
    value: "xstx:gemini-3.1-pro-preview",
    label: "星途 Gemini 3.1 Pro Preview",
    provider: "xstx",
    model: "gemini-3.1-pro-preview",
  }),
  chatCapability({
    value: "xstx:deepseek-v4-pro",
    label: "星途 DeepSeek V4 Pro",
    provider: "xstx",
    model: "deepseek-v4-pro",
  }),
  chatCapability({
    value: "xstx:deepseek-v4-flash",
    label: "星途 DeepSeek V4 Flash",
    provider: "xstx",
    model: "deepseek-v4-flash",
  }),
  imageCapability({
    value: "xstx:gpt-image-2",
    label: "星途 GPT Image 2",
    provider: "xstx",
    model: "gpt-image-2",
    supportsAsync: false,
    supportsReferences: true,
    aspectRatios: GPT_IMAGE_RATIOS,
    sizes: GPT_IMAGE_SIZES,
    qualityLevels: GPT_QUALITY_OPTIONS,
  }),
  imageCapability({
    value: "xstx:gpt-image-2-2k",
    label: "星途 GPT Image 2 (2K)",
    provider: "xstx",
    model: "gpt-image-2-2k",
    supportsAsync: false,
    supportsReferences: true,
    aspectRatios: GPT_IMAGE_RATIOS,
    sizes: GPT_IMAGE_SIZES.filter(s =>
      s.value !== "3840x2160" &&
      s.value !== "2160x3840" &&
      s.value !== "3840x1920" &&
      s.value !== "1920x3840"
    ),
  }),
  imageCapability({
    value: "xstx:gpt-image-2-4k",
    label: "星途 GPT Image 2 (4K)",
    provider: "xstx",
    model: "gpt-image-2-4k",
    supportsAsync: false,
    supportsReferences: true,
    aspectRatios: GPT_IMAGE_RATIOS,
    sizes: GPT_IMAGE_SIZES,
  }),
  ...MODELSCOPE_IMAGE_MODELS.map(model =>
    imageCapability({
      value: formatProviderModel("modelscope", model.model),
      label: model.label,
      provider: "modelscope",
      model: model.model,
      supportsAsync: true,
      supportsReferences: model.supportsReferences,
      maxReferenceImages: model.maxReferenceImages,
      sizes: MODELSCOPE_IMAGE_SIZES,
    }),
  ),
  ...RUNNINGHUB_STANDARD_MODELS.filter(model => model.listed !== false).map(model => {
    if (model.kind === "image") {
      const profile = runningHubImageParameterProfile(model);
      return imageCapability({
        value: formatProviderModel("runninghub", model.model),
        label: model.label,
        provider: "runninghub",
        model: model.model,
        supportsAsync: false,
        supportsReferences: model.supportsReferences,
        ...profile,
        maxReferenceImages: model.maxReferenceImages,
        minReferenceImages: model.minReferenceImages,
      });
    }

    const profile = runningHubVideoParameterProfile(model);
    return videoCapability({
      value: formatProviderModel("runninghub", model.model),
      label: model.label,
      provider: "runninghub",
      model: model.model,
      supportsReferences: model.supportsReferences,
      ...profile,
      videoReferenceMode: model.videoReferenceMode ?? (model.supportsReferences ? "reference" : "none"),
      videoReferenceModes: model.videoReferenceModes ? [...model.videoReferenceModes] : undefined,
      maxReferenceImages: model.maxReferenceImages,
      minReferenceImages: model.minReferenceImages,
      referenceMediaTypes: model.referenceMediaTypes ? [...model.referenceMediaTypes] : undefined,
    });
  }),
  imageCapability({
    value: "runninghub:ai-app-image:<webappId>",
    label: "RunningHub AI App Image",
    provider: "runninghub",
    model: "ai-app-image:<webappId>",
    supportsAsync: false,
    supportsReferences: true,
    sizes: RUNNINGHUB_IMAGE_SIZES,
  }),
  imageCapability({
    value: "runninghub:workflow-image:<workflowId>",
    label: "RunningHub Workflow Image",
    provider: "runninghub",
    model: "workflow-image:<workflowId>",
    supportsAsync: false,
    supportsReferences: true,
    sizes: RUNNINGHUB_IMAGE_SIZES,
  }),
  videoCapability({
    value: "runninghub:ai-app-video:<webappId>",
    label: "RunningHub AI App Video",
    provider: "runninghub",
    model: "ai-app-video:<webappId>",
    supportsReferences: true,
    sizes: RUNNINGHUB_VIDEO_SIZES,
    videoReferenceMode: "reference",
    maxReferenceImages: 9,
    minReferenceImages: 0,
    referenceMediaTypes: ["image", "video", "audio"],
  }),
  videoCapability({
    value: "runninghub:workflow-video:<workflowId>",
    label: "RunningHub Workflow Video",
    provider: "runninghub",
    model: "workflow-video:<workflowId>",
    supportsReferences: true,
    sizes: RUNNINGHUB_VIDEO_SIZES,
    videoReferenceMode: "reference",
    maxReferenceImages: 9,
    minReferenceImages: 0,
    referenceMediaTypes: ["image", "video", "audio"],
  }),
  audioCapability({
    value: "runninghub:ai-app-audio:<webappId>",
    label: "RunningHub AI App Audio",
    provider: "runninghub",
    model: "ai-app-audio:<webappId>",
    supportsReferences: true,
    maxReferenceMedia: 9,
    minReferenceMedia: 0,
    referenceMediaTypes: ["image", "video", "audio"],
  }),
  audioCapability({
    value: "runninghub:workflow-audio:<workflowId>",
    label: "RunningHub Workflow Audio",
    provider: "runninghub",
    model: "workflow-audio:<workflowId>",
    supportsReferences: true,
    maxReferenceMedia: 9,
    minReferenceMedia: 0,
    referenceMediaTypes: ["image", "video", "audio"],
  }),
];

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

export function getImageModelCapabilities(value: string): ImageModelCapabilities {
  const capability = getKnownCapability(value, "image");
  if (capability) {
    return {
      aspectRatios: capability.aspectRatios.length > 0 ? capability.aspectRatios : aspectRatiosFromSizes(capability.sizes),
      resolutions: capability.sizes,
      qualities: capability.qualityLevels,
      thinkingLevels: capability.thinkingLevels,
      maxReferenceImages: capability.maxReferenceImages,
      minReferenceImages: capability.minReferenceImages,
      referenceMediaTypes: capability.referenceMediaTypes,
    };
  }
  return {
    aspectRatios: GEMINI_25_RATIOS,
    resolutions: [],
    qualities: [],
    thinkingLevels: [],
    maxReferenceImages: 0,
    minReferenceImages: 0,
    referenceMediaTypes: [],
  };
}

export function getImageResolutionOptions(value: string, aspectRatio: string): ParameterOption[] {
  const capability = getKnownCapability(value, "image");
  if (!capability) return [];
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
    referenceMode: capability?.videoReferenceMode ?? "none",
    referenceModes: capability?.videoReferenceModes ?? [],
    maxReferenceImages: capability?.maxReferenceImages ?? 0,
    minReferenceImages: capability?.minReferenceImages ?? 0,
    referenceMediaTypes: capability?.referenceMediaTypes ?? [],
  };
}

export function getAudioModelCapabilities(value: string): AudioModelCapabilities {
  const capability = getKnownCapability(value, "audio");
  return {
    formats: capability?.presets ?? [],
    durations: capability?.durations ?? [],
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
  if (isKnownProvider(provider)) {
    return { provider, model, async: false };
  }

  throw new ProviderModelParseError(`Unknown provider prefix "${provider}" in model "${value}"`);
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

interface AudioCapabilityInput extends CapabilityInput {
  supportsReferences: boolean;
  formats?: ParameterOption[];
  durations?: ParameterOption[];
  maxReferenceMedia: number;
  minReferenceMedia: number;
  referenceMediaTypes?: MediaReferenceType[];
}

function imageCapability(input: ImageCapabilityInput): ProviderModelCapability {
  return {
    value: input.value,
    label: input.label,
    provider: input.provider,
    model: input.model,
    kind: "image",
    supportsAsync: input.supportsAsync,
    supportsReferences: input.supportsReferences,
    aspectRatios: input.aspectRatios ?? [],
    sizes: input.sizes ?? [],
    thinkingLevels: input.thinkingLevels ?? [],
    qualityLevels: input.qualityLevels ?? [],
    resolutions: [],
    durations: [],
    presets: [],
    videoReferenceMode: "none",
    videoReferenceModes: [],
    maxReferenceImages: input.maxReferenceImages ?? 0,
    minReferenceImages: input.minReferenceImages ?? 0,
    referenceMediaTypes: input.supportsReferences ? input.referenceMediaTypes ?? ["image"] : [],
  };
}

function videoCapability(input: VideoCapabilityInput): ProviderModelCapability {
  return {
    value: input.value,
    label: input.label,
    provider: input.provider,
    model: input.model,
    kind: "video",
    supportsAsync: false,
    supportsReferences: input.supportsReferences,
    aspectRatios: [],
    sizes: input.sizes,
    thinkingLevels: [],
    qualityLevels: [],
    resolutions: input.resolutions ?? [],
    durations: input.durations ?? [],
    presets: input.presets ?? [],
    videoReferenceMode: input.videoReferenceMode,
    videoReferenceModes: input.videoReferenceModes ?? (input.videoReferenceMode === "none" ? [] : [input.videoReferenceMode]),
    maxReferenceImages: input.maxReferenceImages,
    minReferenceImages: input.minReferenceImages,
    referenceMediaTypes: input.supportsReferences ? input.referenceMediaTypes ?? ["image"] : [],
  };
}

function audioCapability(input: AudioCapabilityInput): ProviderModelCapability {
  return {
    value: input.value,
    label: input.label,
    provider: input.provider,
    model: input.model,
    kind: "audio",
    supportsAsync: false,
    supportsReferences: input.supportsReferences,
    aspectRatios: [],
    sizes: [],
    thinkingLevels: [],
    qualityLevels: [],
    resolutions: [],
    durations: input.durations ?? [],
    presets: input.formats ?? [],
    videoReferenceMode: "none",
    videoReferenceModes: [],
    maxReferenceImages: input.maxReferenceMedia,
    minReferenceImages: input.minReferenceMedia,
    referenceMediaTypes: input.supportsReferences ? input.referenceMediaTypes ?? ["audio"] : [],
  };
}

function chatCapability(input: CapabilityInput): ProviderModelCapability {
  return {
    value: input.value,
    label: input.label,
    provider: input.provider,
    model: input.model,
    kind: "chat",
    supportsAsync: false,
    supportsReferences: false,
    aspectRatios: [],
    sizes: [],
    thinkingLevels: [],
    qualityLevels: [],
    resolutions: [],
    durations: [],
    presets: [],
    videoReferenceMode: "none",
    videoReferenceModes: [],
    maxReferenceImages: 0,
    minReferenceImages: 0,
    referenceMediaTypes: [],
  };
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
        (!provider || capability.provider === provider) &&
        (includeAsync || !capability.supportsAsync),
    )
    .map(({ value, label }) => ({ value, label }));
}

function getKnownCapability(value: string, kind: ModelKind): ProviderModelCapability | undefined {
  const parsed = parseProviderModel(value, "12ai");
  const capability = findModelCapability(parsed.provider, parsed.model, parsed.async, kind);
  if (capability) return capability;
  if (parsed.provider === "runninghub" && kind !== "chat") return runningHubVirtualCapability(parsed.model, kind);
  if (parsed.provider === "modelscope" && kind === "image") return modelScopeVirtualImageCapability(parsed.model);
  return undefined;
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
  const isAudio = lower.includes("audio");
  const isVideo = lower.includes("video");
  const resolvedKind: ModelKind = kind ?? (isAudio ? "audio" : isVideo ? "video" : "image");
  if (resolvedKind === "audio") {
    return audioCapability({
      value: formatProviderModel("runninghub", model),
      label: `RunningHub ${model}`,
      provider: "runninghub",
      model,
      supportsReferences: true,
      maxReferenceMedia: 9,
      minReferenceMedia: 0,
      referenceMediaTypes: ["image", "video", "audio"],
    });
  }
  if (resolvedKind === "video") {
    return videoCapability({
      value: formatProviderModel("runninghub", model),
      label: `RunningHub ${model}`,
      provider: "runninghub",
      model,
      supportsReferences: true,
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
      maxReferenceImages: 9,
      sizes: RUNNINGHUB_IMAGE_SIZES,
    });
  }
  throw new Error(`RunningHub does not support ${resolvedKind} models`);
}
