import type { AiProvider } from "./model-catalog";
import type { ProviderConfig } from "./types";

const DEFAULT_12AI_BASE_URL = "https://cdn.12ai.org";
const DEFAULT_12AI_VIDEO_BASE_URL = "https://new.12ai.org";
const DEFAULT_GROK_BASE_URL = "http://localhost:8000";

export function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function resolveProviderConfig(req: Request, provider: AiProvider): ProviderConfig {
  const headerKey = req.headers.get("x-ai-api-key") ?? "";
  const headerBaseUrl = req.headers.get("x-ai-base-url") ?? "";

  const envKey =
    provider === "12ai"
      ? process.env.TWELVE_AI_API_KEY ?? process.env.AI_API_KEY ?? ""
      : process.env.GROK2API_API_KEY ?? process.env.AI_API_KEY ?? "";

  const baseUrl =
    headerBaseUrl ||
    (provider === "12ai"
      ? process.env.TWELVE_AI_BASE_URL ?? DEFAULT_12AI_BASE_URL
      : process.env.GROK2API_BASE_URL ?? DEFAULT_GROK_BASE_URL);

  const videoBaseUrl =
    provider === "12ai"
      ? process.env.TWELVE_AI_VIDEO_BASE_URL ?? DEFAULT_12AI_VIDEO_BASE_URL
      : baseUrl;

  const apiKey = headerKey || envKey;
  if (provider === "12ai" && !apiKey) {
    throw new Error("12AI API key is required. Set TWELVE_AI_API_KEY or provide a custom API key.");
  }

  return {
    provider,
    apiKey,
    baseUrl: trimTrailingSlash(baseUrl),
    videoBaseUrl: trimTrailingSlash(videoBaseUrl),
  };
}

export function authHeaders(config: ProviderConfig): HeadersInit {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

export async function postJson<T>(url: string, config: ProviderConfig, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(config),
    },
    body: JSON.stringify(body),
  });
  return parseJsonResponse<T>(res);
}

export async function getJson<T>(url: string, config: ProviderConfig): Promise<T> {
  const res = await fetch(url, {
    headers: authHeaders(config),
  });
  return parseJsonResponse<T>(res);
}

export async function postForm<T>(url: string, config: ProviderConfig, form: FormData): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(config),
    body: form,
  });
  return parseJsonResponse<T>(res);
}

export function dataUriToBlob(dataUri: string): Blob {
  const parsed = parseDataUri(dataUri);
  const binary = atob(parsed.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: parsed.mimeType });
}

export function parseDataUri(dataUri: string): { mimeType: string; base64: string } {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Reference images must be data URI base64 strings");
  }
  return { mimeType: match[1], base64: match[2] };
}

export function aspectRatioToOpenAiSize(aspectRatio: string): string {
  if (aspectRatio === "auto" || /^\d+x\d+$/.test(aspectRatio)) return aspectRatio;
  if (aspectRatio === "16:9") return "1792x1024";
  if (aspectRatio === "9:16") return "1024x1792";
  if (aspectRatio === "4:3") return "1536x1024";
  if (aspectRatio === "3:4") return "1024x1536";
  return "1024x1024";
}

export function aspectRatioToVideoSize(aspectRatio: string, provider: AiProvider): string | undefined {
  if (aspectRatio === "auto") return undefined;
  if (/^\d+x\d+$/.test(aspectRatio)) return aspectRatio;
  if (provider === "grok2api") {
    if (aspectRatio === "9:16") return "720x1280";
    if (aspectRatio === "1:1") return "1024x1024";
    return "1280x720";
  }

  if (aspectRatio === "9:16") return "720x1280";
  if (aspectRatio === "1:1") return "1024x1024";
  return "1280x720";
}

export function mediaOperationName(provider: AiProvider, mediaType: "image" | "video", id: string): string {
  return `${provider}:${mediaType}:${id}`;
}

export function parseMediaOperationName(operationName: string): {
  provider: AiProvider;
  mediaType: "image" | "video";
  id: string;
} {
  const parts = operationName.split(":");
  if (parts.length < 3) {
    throw new Error("Unsupported media operation name");
  }
  const provider = parts[0];
  const mediaType = parts[1];
  if ((provider !== "12ai" && provider !== "grok2api") || (mediaType !== "image" && mediaType !== "video")) {
    throw new Error("Unsupported media operation name");
  }
  return { provider, mediaType, id: parts.slice(2).join(":") };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : {};
  if (!res.ok) {
    throw new Error(readErrorMessage(data) ?? `HTTP ${res.status}`);
  }
  return data as T;
}

function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const error = value.error;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof value.message === "string") return value.message;
  return undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
