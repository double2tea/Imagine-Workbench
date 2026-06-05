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

interface ProviderPriceEntry {
  /** Substring matched against model ID path (after `api:/openapi/v2/`) */
  pathMatch: string;
  price: number;
  unit: string;
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

/**
 * RunningHub model price entries, keyed by model path substring.
 * Mapped from the SKU list fetched from RunningHub's pricing API.
 */
const RUNNINGHUB_PRICES: ProviderPriceEntry[] = [
  // --- GPT Image 2 ---
  { pathMatch: "rhart-image-g-2-official/text-to-image", price: 0.06, unit: "次" },
  { pathMatch: "rhart-image-g-2-official/image-to-image", price: 0.19, unit: "次" },
  { pathMatch: "rhart-image-g-2/text-to-image", price: 0.10, unit: "次" },
  { pathMatch: "rhart-image-g-2/image-to-image", price: 0.10, unit: "次" },

  // --- Jimeng 4.6 ---
  { pathMatch: "bytedance/jimeng-4.6/text-to-image", price: 0.17, unit: "张" },
  { pathMatch: "bytedance/jimeng-4.6/image-to-image", price: 0.17, unit: "张" },

  // --- Gemini Pro (low price channel) ---
  { pathMatch: "rhart-image-n-pro/text-to-image", price: 0.40, unit: "次" },
  { pathMatch: "rhart-image-n-pro/edit", price: 0.40, unit: "次" },

  // --- Gemini Pro Official ---
  { pathMatch: "rhart-image-n-pro-official/text-to-image", price: 0.80, unit: "次" },
  { pathMatch: "rhart-image-n-pro-official/edit", price: 0.80, unit: "次" },
  { pathMatch: "rhart-image-n-pro-official/text-to-image-ultra", price: 0.98, unit: "次" },
  { pathMatch: "rhart-image-n-pro-official/edit-ultra", price: 0.98, unit: "次" },

  // --- Gemini Flash Official ---
  { pathMatch: "rhart-image-n-g31-flash-official/text-to-image", price: 0.14, unit: "张" },
  { pathMatch: "rhart-image-n-g31-flash-official/image-to-image", price: 0.14, unit: "张" },

  // --- Gemini Flash (channel/low price) ---
  { pathMatch: "rhart-image-n-g31-flash/text-to-image", price: 0.08, unit: "次" },
  { pathMatch: "rhart-image-n-g31-flash/image-to-image", price: 0.08, unit: "次" },

  // --- Youchuan ---
  { pathMatch: "youchuan/text-to-image-v81", price: 0.54, unit: "次" },

  // --- Veo 3.1 Fast Official ---
  { pathMatch: "rhart-video-v3.1-fast-official/reference-to-video", price: 4.03, unit: "次" },
  { pathMatch: "rhart-video-v3.1-fast-official/text-to-video", price: 2.35, unit: "次" },
  { pathMatch: "rhart-video-v3.1-fast-official/image-to-video", price: 2.35, unit: "次" },
  { pathMatch: "rhart-video-v3.1-fast/start-end-to-video", price: 1.50, unit: "次" },
  { pathMatch: "rhart-video-v3.1-fast/text-to-video", price: 1.50, unit: "次" },
  { pathMatch: "rhart-video-v3.1-fast/image-to-video", price: 1.50, unit: "次" },

  // --- Veo 3.1 Lite Official ---
  { pathMatch: "rhart-video-v3.1-lite-official/text-to-video", price: 0.32, unit: "秒" },
  { pathMatch: "rhart-video-v3.1-lite-official/image-to-video", price: 0.32, unit: "秒" },
  { pathMatch: "rhart-video-v3.1-lite-official/start-end-to-video", price: 2.52, unit: "次" },

  // --- Veo 3.1 Pro Official ---
  { pathMatch: "rhart-video-v3.1-pro-official/reference-to-video", price: 9.40, unit: "次" },
  { pathMatch: "rhart-video-v3.1-pro-official/text-to-video", price: 4.70, unit: "次" },
  { pathMatch: "rhart-video-v3.1-pro-official/image-to-video", price: 4.70, unit: "次" },
  { pathMatch: "rhart-video-v3.1-pro/start-end-to-video", price: 0.90, unit: "次" },
  { pathMatch: "rhart-video-v3.1-pro/text-to-video", price: 0.90, unit: "次" },
];

const KNOWN_PROVIDERS_WITH_PRICING = ["runninghub"];

export function getModelPrice(provider: string, modelId: string): ModelPrice | null {
  if (!KNOWN_PROVIDERS_WITH_PRICING.includes(provider)) return null;

  // Match longest substring first (most specific match wins)
  const sorted = [...RUNNINGHUB_PRICES].sort(
    (a, b) => b.pathMatch.length - a.pathMatch.length,
  );
  for (const entry of sorted) {
    if (modelId.includes(entry.pathMatch)) return { price: entry.price, unit: entry.unit };
  }
  return null;
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
  const base = getModelPrice(provider, effectiveModelId);
  if (!base) return null;

  if (base.unit === "秒" && options?.duration) {
    const seconds = parseFloat(options.duration);
    if (!isNaN(seconds) && seconds > 0) {
      return {
        ...base,
        totalPrice: base.price * seconds,
        isCalculated: true,
        detail: `¥${formatPriceValue(base.price)}/${base.unit} × ${seconds}s`,
      };
    }
  }
  return { ...base, totalPrice: base.price, isCalculated: false };
}

export function formatPriceValue(value: number): string {
  return value < 1 ? value.toFixed(2) : value.toFixed(2).replace(/\.?0+$/, "");
}

function resolveEffectivePriceModelId(provider: string, modelId: string, options: ModelPriceOptions | undefined): string {
  if (provider !== "runninghub") return modelId;
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
