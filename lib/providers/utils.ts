import { ApiError } from "../api/errors";
import type { AiProvider } from "./model-catalog";
import type { ProviderConfig, ProviderMediaType } from "./types";
import {
  getProviderCredentialMeta,
  getProviderMeta,
  isKnownProvider,
  isProviderKey,
  MIMO_TOKEN_PLAN_DEFAULT_BASE_URL,
  resolveProviderApiKey,
  resolveProviderBaseUrl,
  resolveProviderVideoBaseUrl,
  type ProviderCredentialScope,
} from "./registry";

export function requireText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export interface ResolveProviderConfigOptions {
  apiKeyOverride?: string;
  baseUrlOverride?: string;
  credentialScope?: ProviderCredentialScope;
  ignoredBearerToken?: string;
  providerLabelOverride?: string;
}

export function resolveProviderConfig(
  req: Request,
  provider: AiProvider,
  options: ResolveProviderConfigOptions = {},
): ProviderConfig {
  const credentialScope = options.credentialScope ?? "default";
  const requestKey = readProviderRequestApiKey(req, options);
  const headerBaseUrl = trimCredential(req.headers.get(providerBaseUrlHeaderName(credentialScope)) ?? "");
  if (headerBaseUrl && !requestKey) {
    throw new ApiError(
      400,
      "provider_base_url_requires_request_api_key",
      `${providerBaseUrlHeaderName(credentialScope)} requires ${providerApiKeyHeaderName(credentialScope)} or a provider Authorization bearer token`,
    );
  }
  const providerLabel = optionalText(req.headers.get("x-ai-provider-label")) ?? optionalText(options.providerLabelOverride);
  const envKey = trimCredential(resolveProviderApiKey(provider, credentialScope));
  const overrideKey = trimCredential(options.apiKeyOverride ?? "");
  const overrideBaseUrl = trimCredential(options.baseUrlOverride ?? "");
  const configuredBaseUrl = headerBaseUrl || overrideBaseUrl || trimCredential(resolveProviderBaseUrl(provider, credentialScope));
  const videoBaseUrl = credentialScope === "default"
    ? resolveProviderVideoBaseUrl(provider) || configuredBaseUrl
    : configuredBaseUrl;

  const apiKey = requestKey || overrideKey || envKey;
  if (!isKnownProvider(provider) && !apiKey) {
    throw new Error(`${providerLabel ?? provider} API key is required.`);
  }
  if (!isKnownProvider(provider) && !configuredBaseUrl) {
    throw new Error(`${providerLabel ?? provider} Base URL is required.`);
  }
  if (isKnownProvider(provider) && !apiKey) {
    const meta = getProviderMeta(provider);
    const credentialMeta = getProviderCredentialMeta(provider, credentialScope);
    const label = credentialScope === "audio" ? `${meta.label} audio` : meta.label;
    throw new Error(`${label} API key is required. Set ${credentialMeta.envApiKey} or provide a custom API key.`);
  }
  const resolvedBaseUrl = resolveProviderRequestBaseUrl(provider, apiKey, configuredBaseUrl);

  return {
    provider,
    providerLabel,
    apiKey,
    baseUrl: resolvedBaseUrl,
    videoBaseUrl: trimTrailingSlash(videoBaseUrl),
  };
}

export function readProviderRequestApiKey(req: Request, options: ResolveProviderConfigOptions = {}): string {
  const credentialScope = options.credentialScope ?? "default";
  const headerKey = trimCredential(req.headers.get(providerApiKeyHeaderName(credentialScope)) ?? "");
  if (headerKey) return headerKey;
  if (credentialScope === "audio") return "";
  const rawBearerKey = readBearerToken(req.headers.get("authorization"));
  return rawBearerKey && rawBearerKey !== options.ignoredBearerToken ? trimCredential(rawBearerKey) : "";
}

export function authHeaders(config: ProviderConfig): HeadersInit {
  if (!config.apiKey) return {};
  if (config.provider === "mimo") return { "api-key": config.apiKey };
  return { Authorization: `Bearer ${config.apiKey}` };
}

export async function postJson<T>(url: string, config: ProviderConfig, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(config),
    },
    body: JSON.stringify(body),
    signal: config.signal,
  });
  return parseJsonResponse<T>(res);
}

export function openAiCompatibleUrl(baseUrl: string, path: `/v1/${string}`): string {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  if (normalizedBaseUrl.endsWith("/v1")) return `${normalizedBaseUrl}${path.slice(3)}`;
  if (normalizedBaseUrl.endsWith("/api/v3")) return `${normalizedBaseUrl}${path.slice(3)}`;
  return `${normalizedBaseUrl}${path}`;
}

export async function getJson<T>(url: string, config: ProviderConfig): Promise<T> {
  const res = await fetch(url, {
    headers: authHeaders(config),
    signal: config.signal,
  });
  return parseJsonResponse<T>(res);
}

export async function deleteJson<T>(url: string, config: ProviderConfig): Promise<T> {
  const res = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(config),
    signal: config.signal,
  });
  return parseJsonResponse<T>(res);
}

export async function postForm<T>(url: string, config: ProviderConfig, form: FormData): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(config),
    body: form,
    signal: config.signal,
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
  const prefix = "data:";
  const marker = ";base64,";
  if (!dataUri.startsWith(prefix)) {
    throw new Error("Reference images must be data URI base64 strings");
  }
  const markerIndex = dataUri.indexOf(marker, prefix.length);
  const base64Start = markerIndex + marker.length;
  if (
    markerIndex <= prefix.length ||
    dataUri.slice(prefix.length, markerIndex).includes(";") ||
    base64Start >= dataUri.length
  ) {
    throw new Error("Reference images must be data URI base64 strings");
  }
  return {
    mimeType: dataUri.slice(prefix.length, markerIndex),
    base64: dataUri.slice(base64Start),
  };
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

export function mediaOperationName(provider: AiProvider, mediaType: ProviderMediaType, id: string): string {
  return `${provider}:${mediaType}:${id}`;
}

export function parseMediaOperationName(operationName: string): {
  provider: AiProvider;
  mediaType: ProviderMediaType;
  id: string;
} {
  const parts = operationName.split(":");
  if (parts.length < 3) {
    throw new Error("Unsupported media operation name");
  }
  const provider = parts[0];
  const mediaType = parts[1];
  if (!isProviderKey(provider) || (mediaType !== "image" && mediaType !== "video" && mediaType !== "audio")) {
    throw new Error("Unsupported media operation name");
  }
  return { provider, mediaType, id: parts.slice(2).join(":") };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function trimCredential(value: string): string {
  return value.trim();
}

function providerApiKeyHeaderName(scope: ProviderCredentialScope): string {
  return scope === "audio" ? "x-ai-audio-api-key" : "x-ai-api-key";
}

function providerBaseUrlHeaderName(scope: ProviderCredentialScope): string {
  return scope === "audio" ? "x-ai-audio-base-url" : "x-ai-base-url";
}

function readBearerToken(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return undefined;
  return trimmed.slice(7).trim() || undefined;
}

function isMimoTokenPlanKey(apiKey: string): boolean {
  return apiKey.startsWith("tp-");
}

function resolveProviderRequestBaseUrl(provider: AiProvider, apiKey: string, baseUrl: string): string {
  const resolvedBaseUrl = trimTrailingSlash(baseUrl);
  if (provider !== "mimo" || !isMimoTokenPlanKey(apiKey) || isMimoTokenPlanBaseUrl(resolvedBaseUrl)) {
    return resolvedBaseUrl;
  }
  return MIMO_TOKEN_PLAN_DEFAULT_BASE_URL;
}

function isMimoTokenPlanBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).host;
    return host.startsWith("token-plan-") && host.endsWith(".xiaomimimo.com");
  } catch {
    return false;
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = parseProviderResponseBody(text);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      providerErrorCode(res.status),
      readErrorMessage(data) ?? `HTTP ${res.status}`,
      { providerStatus: res.status },
    );
  }
  return data as T;
}

export function parseProviderResponseBody(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.trim() || "Invalid JSON response" };
  }
}

function readErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const error = value.error;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof value.message === "string") return value.message;
  return undefined;
}

function providerErrorCode(status: number): string {
  if (status === 429) return "provider_rate_limited";
  return "provider_request_failed";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
