import {
  getOptionalModelCapability,
  type ProviderModelCapability,
} from "./model-catalog";
import {
  modelHasKnownPricing,
  type ModelPricedProfile,
} from "./model-capabilities";
import { getRunningHubStandardModel, resolveRunningHubStandardModelForReferenceMedia } from "./runninghub";

export interface ModelPrice {
  /** Exact or estimated price in CNY */
  price: number;
  /** Unit label, e.g. "次", "张", "秒" */
  unit: string;
}

export interface CalculatedModelPrice extends ModelPrice {
  /** Total calculated price after applying factor (e.g., seconds × unit price) */
  totalPrice: number;
  /** Whether this price was calculated from a variable unit with duration */
  isCalculated: boolean;
  /** Optional short explanation for dynamic calculations */
  detail?: string;
}

export type PriceReferenceType = "image" | "video" | "audio";
export type PriceVideoReferenceMode = "reference" | "firstLast" | "none";

export interface ModelPriceOptions {
  duration?: string;
  imageQuality?: string;
  referenceTypes?: readonly PriceReferenceType[];
  resolution?: string;
  thinkingLevel?: string;
  videoReferenceMode?: PriceVideoReferenceMode;
  videoResolution?: string;
}

export type GenerationModelPriceKind = "image" | "video" | "audio";

export interface GenerationModelPriceInput {
  kind: GenerationModelPriceKind;
  duration?: string;
  imageQuality?: string;
  referenceTypes?: readonly PriceReferenceType[];
  resolution?: string;
  thinkingLevel?: string;
  videoReferenceMode?: PriceVideoReferenceMode;
  videoResolution?: string;
}

export function buildGenerationModelPriceOptions(input: GenerationModelPriceInput): ModelPriceOptions {
  if (input.kind === "image") {
    return {
      imageQuality: input.imageQuality,
      resolution: input.resolution,
      thinkingLevel: input.thinkingLevel,
    };
  }
  if (input.kind === "video") {
    return {
      duration: input.duration,
      referenceTypes: input.referenceTypes,
      videoReferenceMode: input.videoReferenceMode,
      videoResolution: input.videoResolution,
    };
  }
  return {};
}

const SHOW_PRICE_KEY = "imagine_show_price";
export const PRICE_SETTING_CHANGE_EVENT = "imagine_show_price_change";

export function getShowPriceSetting(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(SHOW_PRICE_KEY) !== "false";
}

export function setShowPriceSetting(value: boolean): void {
  localStorage.setItem(SHOW_PRICE_KEY, String(value));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PRICE_SETTING_CHANGE_EVENT));
  }
}

export function getModelPrice(provider: string, modelId: string): ModelPrice | null {
  const profile = getKnownPricingProfile(provider, modelId);
  if (!profile) return null;
  return { price: profile.price, unit: profile.displayUnit };
}

/**
 * Calculate model price with optional parameters like duration or resolution.
 * For per-second units and known duration, returns total price.
 * Falls back to unit-price display when duration is unknown or irrelevant.
 */
export function calculateModelPrice(
  provider: string,
  modelId: string,
  options?: ModelPriceOptions,
): CalculatedModelPrice | null {
  const effectiveModelId = resolveEffectivePriceModelId(provider, modelId, options);
  const profile = getKnownPricingProfile(provider, effectiveModelId);
  if (!profile) return null;
  const resolvedBase = {
    price: resolveOptionPriceOverride(profile, options) ?? profile.price,
    unit: profile.displayUnit,
  };

  if (profile.dimensions.some(dimension => dimension.calculation === "multiplyBySeconds") && options?.duration) {
    const seconds = parseFloat(options.duration);
    if (!isNaN(seconds) && seconds > 0) {
      return {
        ...resolvedBase,
        totalPrice: resolvedBase.price * seconds,
        isCalculated: true,
        detail: `¥${formatPriceValue(resolvedBase.price)}/${resolvedBase.unit} × ${seconds}s`,
      };
    }
  }
  return { ...resolvedBase, totalPrice: resolvedBase.price, isCalculated: false };
}

export function formatPriceValue(value: number): string {
  return value < 1 ? value.toFixed(2) : value.toFixed(2).replace(/\.?0+$/, "");
}

function resolveEffectivePriceModelId(provider: string, modelId: string, options: ModelPriceOptions | undefined): string {
  const profile = getKnownPricingProfile(provider, modelId);
  if (!profile?.dimensions.some(dimension => dimension.routeToModel)) return modelId;

  const references = options?.referenceTypes ?? [];
  if (references.length === 0 || options?.videoReferenceMode === "none") return modelId;

  const runningHubModelId = modelId.startsWith("runninghub:")
    ? modelId.slice("runninghub:".length)
    : modelId;
  const standardModel = getRunningHubStandardModel(runningHubModelId, "video");
  if (!standardModel) return modelId;

  const routedModel = resolveRunningHubStandardModelForReferenceMedia(
    standardModel,
    references.map(type => ({ type })),
    options?.videoReferenceMode === "reference" || options?.videoReferenceMode === "firstLast"
      ? options.videoReferenceMode
      : undefined,
  );
  return `runninghub:${routedModel.model}`;
}

function resolveOptionPriceOverride(
  profile: ModelPricedProfile,
  options: ModelPriceOptions | undefined,
): number | null {
  for (const override of profile.overrides ?? []) {
    const matches = override.match.every(match => {
      const value = readPriceDimensionOption(match.dimension, options);
      return value !== undefined && value.toLowerCase() === match.value.toLowerCase();
    });
    if (!matches) continue;
    if (override.dimensionPrices) {
      const value = readPriceDimensionOption(override.dimensionPrices.dimension, options);
      const price = override.dimensionPrices.values.find(item => item.value === value)?.price;
      if (price !== undefined) return price;
    }
    if (override.price !== undefined) return override.price;
  }
  return null;
}

function getKnownPricingProfile(provider: string, modelId: string): ModelPricedProfile | null {
  const capability = getPriceCapability(provider, modelId);
  if (!capability || !modelHasKnownPricing(capability.pricing)) return null;
  return capability.pricing;
}

function getPriceCapability(provider: string, modelId: string): ProviderModelCapability | undefined {
  const modelValue = modelId.startsWith(`${provider}:`) || modelId.startsWith("12ai-async:")
    ? modelId
    : `${provider}:${modelId}`;
  const capability = getOptionalModelCapability(modelValue);
  return capability?.provider === provider ? capability : undefined;
}

function readPriceDimensionOption(key: string, options: ModelPriceOptions | undefined): string | undefined {
  if (!options) return undefined;
  if (key === "duration") return options.duration;
  if (key === "imageQuality") return options.imageQuality;
  if (key === "resolution") return options.resolution;
  if (key === "thinkingLevel") return options.thinkingLevel;
  if (key === "videoReferenceMode") return options.videoReferenceMode;
  if (key === "videoResolution") return options.videoResolution;
  if (key === "referenceTypes") return options.referenceTypes?.join(",");
  return undefined;
}
