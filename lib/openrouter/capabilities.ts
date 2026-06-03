import { parseProviderModel, type AiProvider } from "../providers/model-catalog";

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

interface VisionIndexEntry {
  supportsVision: boolean;
  openRouterId: string;
}

let cachedIndex: Map<string, VisionIndexEntry> | null = null;
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
  return model.architecture?.input_modalities?.includes("image") ?? false;
}

function registerVisionKey(
  index: Map<string, VisionIndexEntry>,
  rawKey: string,
  supportsVision: boolean,
  openRouterId: string,
): void {
  const key = normalizeOpenRouterModelKey(rawKey);
  if (!key) return;

  const existing = index.get(key);
  if (!existing) {
    index.set(key, { supportsVision, openRouterId });
    return;
  }

  if (supportsVision) {
    index.set(key, { supportsVision: true, openRouterId });
  }
}

export function buildOpenRouterVisionIndex(models: OpenRouterModelRecord[]): Map<string, VisionIndexEntry> {
  const index = new Map<string, VisionIndexEntry>();

  for (const model of models) {
    const supportsVision = openRouterModelSupportsImageInput(model);
    const slugTail = model.id.includes("/") ? model.id.split("/").pop() ?? model.id : model.id;

    registerVisionKey(index, model.id, supportsVision, model.id);
    registerVisionKey(index, model.canonical_slug, supportsVision, model.id);
    registerVisionKey(index, slugTail, supportsVision, model.id);
  }

  return index;
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

export function lookupOpenRouterVisionSupport(
  index: Map<string, VisionIndexEntry>,
  modelValue: string,
  fallbackProvider: AiProvider = "12ai",
): { supportsVision: boolean; openRouterId: string } | null {
  const parsed = parseProviderModel(modelValue, fallbackProvider);
  const normalized = normalizeOpenRouterModelKey(parsed.model);
  if (!normalized) return null;

  const direct = index.get(normalized);
  if (direct) return direct;

  let bestSubstring: { entry: VisionIndexEntry; score: number } | null = null;
  let bestTokenOverlap: { entry: VisionIndexEntry; score: number } | null = null;

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

async function getOpenRouterVisionIndex(): Promise<Map<string, VisionIndexEntry> | null> {
  const now = Date.now();
  if (cachedIndex && now - cachedAt < CACHE_TTL_MS) {
    return cachedIndex;
  }

  try {
    const models = await fetchOpenRouterModelCatalog();
    cachedIndex = buildOpenRouterVisionIndex(models);
    cachedAt = now;
    return cachedIndex;
  } catch (error) {
    console.warn("OpenRouter vision index refresh failed:", error);
    return cachedIndex;
  }
}

/** Returns null when OpenRouter catalog is unavailable or model cannot be matched. */
export async function getOpenRouterVisionSupport(modelValue: string): Promise<boolean | null> {
  const index = await getOpenRouterVisionIndex();
  if (!index) return null;

  const match = lookupOpenRouterVisionSupport(index, modelValue);
  return match?.supportsVision ?? null;
}

export function resetOpenRouterVisionCacheForTests(): void {
  cachedIndex = null;
  cachedAt = 0;
}