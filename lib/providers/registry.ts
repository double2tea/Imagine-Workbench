export interface ProviderMeta {
  key: string;
  label: string;
  envApiKey: string;
  envBaseUrl: string;
  envVideoBaseUrl?: string;
  defaultBaseUrl: string;
  defaultVideoBaseUrl: string;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsChat: boolean;
}

export const PROVIDER_REGISTRY = [
  {
    key: "12ai",
    label: "12AI",
    envApiKey: "TWELVE_AI_API_KEY",
    envBaseUrl: "TWELVE_AI_BASE_URL",
    envVideoBaseUrl: "TWELVE_AI_VIDEO_BASE_URL",
    defaultBaseUrl: "https://cdn.12ai.org",
    defaultVideoBaseUrl: "https://new.12ai.org",
    supportsImage: true,
    supportsVideo: true,
    supportsChat: true,
  },
  {
    key: "grok2api",
    label: "Grok2API",
    envApiKey: "GROK2API_API_KEY",
    envBaseUrl: "GROK2API_BASE_URL",
    defaultBaseUrl: "http://localhost:8000",
    defaultVideoBaseUrl: "http://localhost:8000",
    supportsImage: true,
    supportsVideo: true,
    supportsChat: true,
  },
  {
    key: "xstx",
    label: "星途",
    envApiKey: "XSTX_API_KEY",
    envBaseUrl: "XSTX_BASE_URL",
    defaultBaseUrl: "https://api.xstx.info",
    defaultVideoBaseUrl: "https://api.xstx.info",
    supportsImage: false,
    supportsVideo: false,
    supportsChat: true,
  },
] as const;

export type AiProvider = (typeof PROVIDER_REGISTRY)[number]["key"];
export const PROVIDER_KEYS: readonly AiProvider[] = PROVIDER_REGISTRY.map(p => p.key);
const META_BY_KEY = new Map<string, ProviderMeta>(PROVIDER_REGISTRY.map(p => [p.key, p as ProviderMeta]));

export function getProviderMeta(provider: AiProvider): ProviderMeta {
  const meta = META_BY_KEY.get(provider);
  if (!meta) throw new Error(`Unknown provider: ${provider}`);
  return meta;
}

export function isKnownProvider(value: string): value is AiProvider {
  return META_BY_KEY.has(value);
}

export function resolveProviderApiKey(provider: AiProvider): string {
  const meta = getProviderMeta(provider);
  return readEnv(meta.envApiKey) ?? readEnv("AI_API_KEY") ?? "";
}

export function resolveProviderBaseUrl(provider: AiProvider): string {
  const meta = getProviderMeta(provider);
  return readEnv(meta.envBaseUrl) ?? meta.defaultBaseUrl;
}

export function resolveProviderVideoBaseUrl(provider: AiProvider): string {
  const meta = getProviderMeta(provider);
  return (
    readEnv(meta.envVideoBaseUrl ?? "") ??
    meta.defaultVideoBaseUrl
  );
}

function readEnv(name: string): string | undefined {
  if (!name) return undefined;
  const value = process.env[name];
  return value ? value : undefined;
}
