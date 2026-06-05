import { tryParseProviderModel, type AiProvider } from "../providers/model-catalog";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MIN_SUBSTRING_KEY_LENGTH = 10;
const MIN_TOKEN_OVERLAP_SCORE = 0.5;

interface OpenRouterModelArchitecture {
  input_modalities?: string[];
}

interface OpenRouterModelRecord {
  id: string;
  canonical_slug: string;
  architecture?: OpenRouterModelArchitecture;
}

interface OpenRouterModelsResponse {
  data?: unknown[];
}

export interface OpenRouterInputSupport {
  audio: boolean;
  image: boolean;
  video: boolean;
}

interface OpenRouterInputSupportIndexEntry {
  inputSupport: OpenRouterInputSupport;
  supportsVision: boolean;
  openRouterId: string;
}

let cachedIndex: Map<string, OpenRouterInputSupportIndexEntry> | null = null;
let cachedAt = 0;

export function normalizeOpenRouterModelKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOpenRouterModel(value: unknown): OpenRouterModelRecord | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const canonicalSlug = typeof value.canonical_slug === "string" ? value.canonical_slug : "";
  if (!id || !canonicalSlug) return null;

  const architecture = isRecord(value.architecture)
    ? {
        input_modalities: Array.isArray(value.architecture.input_modalities)
          ? value.architecture.input_modalities.filter((item): item is string => typeof item === "string")
          : undefined,
      }
    : undefined;

  return { id, canonical_slug: canonicalSlug, architecture };
}

export function openRouterModelSupportsImageInput(model: OpenRouterModelRecord): boolean {
  return openRouterModelInputSupport(model).image;
}

export function openRouterModelInputSupport(model: OpenRouterModelRecord): OpenRouterInputSupport {
  const modalities = new Set(model.architecture?.input_modalities ?? []);
  return {
    audio: modalities.has("audio"),
    image: modalities.has("image"),
    video: modalities.has("video"),
  };
}

function registerInputSupportKey(
  index: Map<string, OpenRouterInputSupportIndexEntry>,
  rawKey: string,
  inputSupport: OpenRouterInputSupport,
  openRouterId: string,
): void {
  const key = normalizeOpenRouterModelKey(rawKey);
  if (!key) return;

  const supportsVision = inputSupport.image;
  const existing = index.get(key);
  if (!existing) {
    index.set(key, { inputSupport, supportsVision, openRouterId });
    return;
  }

  const mergedSupport = {
    audio: existing.inputSupport.audio || inputSupport.audio,
    image: existing.inputSupport.image || inputSupport.image,
    video: existing.inputSupport.video || inputSupport.video,
  };
  index.set(key, {
    inputSupport: mergedSupport,
    supportsVision: mergedSupport.image,
    openRouterId: supportsVision ? openRouterId : existing.openRouterId,
  });
}

export function buildOpenRouterInputSupportIndex(
  models: OpenRouterModelRecord[],
): Map<string, OpenRouterInputSupportIndexEntry> {
  const index = new Map<string, OpenRouterInputSupportIndexEntry>();

  for (const model of models) {
    const inputSupport = openRouterModelInputSupport(model);
    const slugTail = model.id.includes("/") ? model.id.split("/").pop() ?? model.id : model.id;

    registerInputSupportKey(index, model.id, inputSupport, model.id);
    registerInputSupportKey(index, model.canonical_slug, inputSupport, model.id);
    registerInputSupportKey(index, slugTail, inputSupport, model.id);
  }

  return index;
}

export function buildOpenRouterVisionIndex(
  models: OpenRouterModelRecord[],
): Map<string, OpenRouterInputSupportIndexEntry> {
  return buildOpenRouterInputSupportIndex(models);
}

function tokenizeModelKey(key: string): Set<string> {
  return new Set(
    key
      .split("-")
      .map(token => token.trim())
      .filter(token => token.length >= 2 || /^\d+$/.test(token)),
  );
}

/** Shared token ratio — tolerates different provider suffixes/versions on the same model family. */
export function scoreOpenRouterModelTokenOverlap(left: string, right: string): number {
  const leftTokens = tokenizeModelKey(left);
  const rightTokens = tokenizeModelKey(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

export function lookupOpenRouterInputSupport(
  index: Map<string, OpenRouterInputSupportIndexEntry>,
  modelValue: string,
  fallbackProvider: AiProvider = "12ai",
): OpenRouterInputSupportIndexEntry | null {
  const parsed = tryParseProviderModel(modelValue, fallbackProvider);
  const fallbackModel = modelValue.includes(":") ? modelValue.slice(modelValue.indexOf(":") + 1) : modelValue;
  const normalized = normalizeOpenRouterModelKey(parsed?.model ?? fallbackModel);
  if (!normalized) return null;

  const direct = index.get(normalized);
  if (direct) return direct;

  let bestSubstring: { entry: OpenRouterInputSupportIndexEntry; score: number } | null = null;
  let bestTokenOverlap: { entry: OpenRouterInputSupportIndexEntry; score: number } | null = null;

  for (const [key, entry] of index) {
    if (key.length >= MIN_SUBSTRING_KEY_LENGTH || normalized.length >= MIN_SUBSTRING_KEY_LENGTH) {
      if (normalized.includes(key) || key.includes(normalized)) {
        const score = Math.min(normalized.length, key.length);
        if (!bestSubstring || score > bestSubstring.score) {
          bestSubstring = { entry, score };
        }
      }
    }

    const overlap = scoreOpenRouterModelTokenOverlap(normalized, key);
    if (overlap >= MIN_TOKEN_OVERLAP_SCORE && (!bestTokenOverlap || overlap > bestTokenOverlap.score)) {
      bestTokenOverlap = { entry, score: overlap };
    }
  }

  return bestSubstring?.entry ?? bestTokenOverlap?.entry ?? null;
}

export function lookupOpenRouterVisionSupport(
  index: Map<string, OpenRouterInputSupportIndexEntry>,
  modelValue: string,
  fallbackProvider: AiProvider = "12ai",
): { supportsVision: boolean; openRouterId: string } | null {
  const match = lookupOpenRouterInputSupport(index, modelValue, fallbackProvider);
  return match ? { supportsVision: match.supportsVision, openRouterId: match.openRouterId } : null;
}

async function fetchOpenRouterModelCatalog(): Promise<OpenRouterModelRecord[]> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OpenRouter models request failed (${response.status})`);
  }

  const payload = await response.json() as OpenRouterModelsResponse;
  if (!Array.isArray(payload.data)) {
    throw new Error("OpenRouter models response did not include a data array");
  }

  return payload.data
    .map(readOpenRouterModel)
    .filter((model): model is OpenRouterModelRecord => model !== null);
}

async function getOpenRouterInputSupportIndex(): Promise<Map<string, OpenRouterInputSupportIndexEntry> | null> {
  const now = Date.now();
  if (cachedIndex && now - cachedAt < CACHE_TTL_MS) {
    return cachedIndex;
  }

  try {
    const models = await fetchOpenRouterModelCatalog();
    cachedIndex = buildOpenRouterInputSupportIndex(models);
    cachedAt = now;
    return cachedIndex;
  } catch (error) {
    console.warn("OpenRouter input support index refresh failed:", error);
    return cachedIndex;
  }
}

/** Returns null when OpenRouter catalog is unavailable or model cannot be matched. */
export async function getOpenRouterInputSupport(modelValue: string): Promise<OpenRouterInputSupport | null> {
  const index = await getOpenRouterInputSupportIndex();
  if (!index) return null;

  const match = lookupOpenRouterInputSupport(index, modelValue);
  return match?.inputSupport ?? null;
}

/** Returns null when OpenRouter catalog is unavailable or model cannot be matched. */
export async function getOpenRouterVisionSupport(modelValue: string): Promise<boolean | null> {
  const inputSupport = await getOpenRouterInputSupport(modelValue);
  return inputSupport?.image ?? null;
}

export function resetOpenRouterVisionCacheForTests(): void {
  cachedIndex = null;
  cachedAt = 0;
}
