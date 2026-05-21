export type { AiProvider } from "./registry";
import type { AiProvider } from "./registry";
import { PROVIDER_KEYS, isKnownProvider } from "./registry";

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
  imageSizes: ParameterOption[];
  thinkingLevels: ParameterOption[];
}

export interface VideoModelCapabilities {
  sizes: ParameterOption[];
  referenceMode: VideoReferenceMode;
  maxReferenceImages: number;
  minReferenceImages: number;
}

export type ModelKind = "chat" | "image" | "video";
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
  videoReferenceMode: VideoReferenceMode;
  maxReferenceImages: number;
  minReferenceImages: number;
}

export const DEFAULT_IMAGE_MODEL = "12ai:gemini-3.1-flash-image-preview";
export const DEFAULT_VIDEO_MODEL = "12ai:veo_3_1-fast";
export const DEFAULT_CHAT_MODEL = "12ai:gemini-3.1-flash-lite-preview";
export const DEFAULT_VISION_CHAT_MODEL = "12ai:gemini-3.1-flash-lite-preview";

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

const GPT_IMAGE_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "1024x1024" },
  { value: "1536x1024", label: "1536x1024 Landscape" },
  { value: "1024x1536", label: "1024x1536 Portrait" },
  { value: "2048x2048", label: "2048x2048" },
  { value: "2048x1152", label: "2048x1152 16:9" },
  { value: "2560x1440", label: "2560x1440 2.5K" },
  { value: "1440x2560", label: "1440x2560 2.5K Vertical" },
  { value: "3840x2160", label: "3840x2160 4K" },
  { value: "2160x3840", label: "2160x3840 4K Vertical" },
  { value: "custom", label: "Custom WxH" },
];

const GROK_IMAGE_SIZES: ParameterOption[] = [
  { value: "1280x720", label: "1280x720" },
  { value: "720x1280", label: "720x1280" },
  { value: "1792x1024", label: "1792x1024" },
  { value: "1024x1792", label: "1024x1792" },
  { value: "1024x1024", label: "1024x1024" },
];

const GEMINI_31_IMAGE_SIZES: ParameterOption[] = [
  { value: "512px", label: "512px Preview" },
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

const THINKING_LEVELS: ParameterOption[] = [
  { value: "minimal", label: "Minimal" },
  { value: "high", label: "High" },
];

const GROK_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto (keep source)" },
  { value: "720x1280", label: "720x1280 Vertical" },
  { value: "1280x720", label: "1280x720 Landscape" },
  { value: "1024x1024", label: "1024x1024 Square" },
  { value: "1024x1792", label: "1024x1792 Portrait" },
  { value: "1792x1024", label: "1792x1024 Landscape" },
];

const TWELVE_AI_VIDEO_SIZES: ParameterOption[] = [
  { value: "auto", label: "Auto (source/default)" },
  { value: "1280x720", label: "1280x720 720p" },
  { value: "720x1280", label: "720x1280 Vertical" },
  { value: "1920x1080", label: "1920x1080 1080p" },
  { value: "1080x1920", label: "1080x1920 Vertical" },
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
    supportsReferences: true,
    sizes: GROK_IMAGE_SIZES,
  }),
  imageCapability({
    value: "grok2api:grok-imagine-image",
    label: "Grok2API Imagine Image",
    provider: "grok2api",
    model: "grok-imagine-image",
    supportsAsync: false,
    supportsReferences: true,
    sizes: GROK_IMAGE_SIZES,
  }),
  imageCapability({
    value: "grok2api:grok-imagine-image-pro",
    label: "Grok2API Imagine Image Pro",
    provider: "grok2api",
    model: "grok-imagine-image-pro",
    supportsAsync: false,
    supportsReferences: true,
    sizes: GROK_IMAGE_SIZES,
  }),
  imageCapability({
    value: "grok2api:grok-imagine-image-edit",
    label: "Grok2API Image Edit",
    provider: "grok2api",
    model: "grok-imagine-image-edit",
    supportsAsync: false,
    supportsReferences: true,
    sizes: [{ value: "1024x1024", label: "1024x1024" }],
  }),
  videoCapability({
    value: "12ai:veo_3_1-fast",
    label: "12AI Veo 3.1 Fast Reference",
    provider: "12ai",
    model: "veo_3_1-fast",
    supportsReferences: true,
    sizes: TWELVE_AI_VIDEO_SIZES,
    videoReferenceMode: "reference",
    maxReferenceImages: 3,
    minReferenceImages: 0,
  }),
  videoCapability({
    value: "12ai:veo_3_1-fast-fl",
    label: "12AI Veo 3.1 First/Last Frame",
    provider: "12ai",
    model: "veo_3_1-fast-fl",
    supportsReferences: true,
    sizes: TWELVE_AI_VIDEO_SIZES,
    videoReferenceMode: "firstLast",
    maxReferenceImages: 2,
    minReferenceImages: 1,
  }),
  videoCapability({
    value: "grok2api:grok-imagine-video",
    label: "Grok2API Imagine Video",
    provider: "grok2api",
    model: "grok-imagine-video",
    supportsReferences: true,
    sizes: GROK_VIDEO_SIZES,
    videoReferenceMode: "reference",
    maxReferenceImages: 7,
    minReferenceImages: 0,
  }),
  chatCapability({
    value: "12ai:gemini-3.1-flash-lite-preview",
    label: "12AI Gemini 3.1 Flash Lite Vision",
    provider: "12ai",
    model: "gemini-3.1-flash-lite-preview",
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
    sizes: GPT_IMAGE_SIZES.filter(s => s.value !== "3840x2160" && s.value !== "2160x3840"),
  }),
  imageCapability({
    value: "xstx:gpt-image-2-4k",
    label: "星途 GPT Image 2 (4K)",
    provider: "xstx",
    model: "gpt-image-2-4k",
    supportsAsync: false,
    supportsReferences: true,
    sizes: GPT_IMAGE_SIZES,
  }),
];

export const IMAGE_MODEL_OPTIONS = buildProviderOptionsRecord("image", false);
export const VIDEO_MODEL_OPTIONS = buildProviderOptionsRecord("video", true);
export const CHAT_MODEL_OPTIONS = buildProviderOptionsRecord("chat", true);

export function getChatModelOptions(provider: AiProvider): ModelOption[] {
  return CHAT_MODEL_OPTIONS[provider];
}

export function getModelCapability(value: string, kind?: ModelKind): ProviderModelCapability {
  const parsed = parseProviderModel(value, "12ai");
  const capability = MODEL_CAPABILITIES.find(
    item =>
      item.provider === parsed.provider &&
      item.model === parsed.model &&
      item.supportsAsync === parsed.async &&
      (kind === undefined || item.kind === kind),
  );
  if (!capability) {
    throw new Error(`Unknown provider model capability: ${value}`);
  }
  return capability;
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
  if (lower.includes("tts")) return false;
  if (lower.includes("audio")) return false;
  if (lower.includes("embedding")) return false;
  return true;
}

export function getImageModelCapabilities(value: string): ImageModelCapabilities {
  const capability = getKnownCapability(value, "image");
  if (capability) {
    return {
      aspectRatios: capability.aspectRatios.length > 0 ? capability.aspectRatios : capability.sizes,
      imageSizes: legacyImageSizeOptions(capability),
      thinkingLevels: capability.thinkingLevels,
    };
  }
  return {
    aspectRatios: GEMINI_25_RATIOS,
    imageSizes: [],
    thinkingLevels: [],
  };
}

export function getVideoModelCapabilities(value: string): VideoModelCapabilities {
  const capability = getKnownCapability(value, "video");
  return {
    sizes: capability?.sizes ?? TWELVE_AI_VIDEO_SIZES,
    referenceMode: capability?.videoReferenceMode ?? "reference",
    maxReferenceImages: capability?.maxReferenceImages ?? 3,
    minReferenceImages: capability?.minReferenceImages ?? 0,
  };
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

  return { provider: fallbackProvider, model: value, async: false };
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
}

interface VideoCapabilityInput extends CapabilityInput {
  supportsReferences: boolean;
  sizes: ParameterOption[];
  videoReferenceMode: VideoReferenceMode;
  maxReferenceImages: number;
  minReferenceImages: number;
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
    videoReferenceMode: "none",
    maxReferenceImages: 0,
    minReferenceImages: 0,
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
    videoReferenceMode: input.videoReferenceMode,
    maxReferenceImages: input.maxReferenceImages,
    minReferenceImages: input.minReferenceImages,
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
    videoReferenceMode: "none",
    maxReferenceImages: 0,
    minReferenceImages: 0,
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
  return MODEL_CAPABILITIES.find(
    capability =>
      capability.provider === parsed.provider &&
      capability.model === parsed.model &&
      capability.supportsAsync === parsed.async &&
      capability.kind === kind,
  );
}

function legacyImageSizeOptions(capability: ProviderModelCapability): ParameterOption[] {
  if (capability.qualityLevels.length > 0) return capability.qualityLevels;
  if (capability.provider === "grok2api") return [];
  return capability.sizes;
}
