export interface ProviderMeta {
  key: string;
  label: string;
  envApiKey: string;
  envBaseUrl: string;
  envVideoBaseUrl?: string;
  defaultBaseUrl: string;
  defaultVideoBaseUrl: string;
  apiKeyPlaceholder: string;
  credentialHint?: string;
  endpointInfo?: string[];
  registerUrl?: string;
  hasEditableBaseUrl: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
  supportsChat: boolean;
}

export const MIMO_TOKEN_PLAN_DEFAULT_BASE_URL = "https://token-plan-cn.xiaomimimo.com/v1";

export const PROVIDER_REGISTRY = [
  {
    key: "12ai",
    label: "12AI",
    envApiKey: "TWELVE_AI_API_KEY",
    envBaseUrl: "TWELVE_AI_BASE_URL",
    envVideoBaseUrl: "TWELVE_AI_VIDEO_BASE_URL",
    defaultBaseUrl: "https://cdn.12ai.org",
    defaultVideoBaseUrl: "https://new.12ai.org",
    apiKeyPlaceholder: "sk_your_12ai_key",
    registerUrl: "https://new.12ai.org/register?aff=PYE8",
    hasEditableBaseUrl: false,
    supportsImage: true,
    supportsVideo: true,
    supportsAudio: false,
    supportsChat: true,
  },
  {
    key: "grok2api",
    label: "Grok2API",
    envApiKey: "GROK2API_API_KEY",
    envBaseUrl: "GROK2API_BASE_URL",
    defaultBaseUrl: "http://localhost:8000",
    defaultVideoBaseUrl: "http://localhost:8000",
    apiKeyPlaceholder: "your_grok2api_key",
    hasEditableBaseUrl: true,
    supportsImage: true,
    supportsVideo: true,
    supportsAudio: false,
    supportsChat: true,
  },
  {
    key: "xstx",
    label: "星途",
    envApiKey: "XSTX_API_KEY",
    envBaseUrl: "XSTX_BASE_URL",
    defaultBaseUrl: "https://api.xstx.info",
    defaultVideoBaseUrl: "https://api.xstx.info",
    apiKeyPlaceholder: "sk_your_xstx_key",
    registerUrl: "https://api.xstx.info/register?aff=fYXi",
    hasEditableBaseUrl: true,
    supportsImage: true,
    supportsVideo: false,
    supportsAudio: false,
    supportsChat: true,
  },
  {
    key: "agnes",
    label: "Agnes AI",
    envApiKey: "AGNES_AI_API_KEY",
    envBaseUrl: "AGNES_AI_BASE_URL",
    defaultBaseUrl: "https://apihub.agnes-ai.com",
    defaultVideoBaseUrl: "https://apihub.agnes-ai.com",
    apiKeyPlaceholder: "your_agnes_ai_key",
    registerUrl: "https://platform.agnes-ai.com/",
    hasEditableBaseUrl: true,
    supportsImage: true,
    supportsVideo: true,
    supportsAudio: false,
    supportsChat: true,
  },
  {
    key: "modelscope",
    label: "ModelScope",
    envApiKey: "MODELSCOPE_API_KEY",
    envBaseUrl: "MODELSCOPE_BASE_URL",
    defaultBaseUrl: "https://api-inference.modelscope.cn",
    defaultVideoBaseUrl: "https://api-inference.modelscope.cn",
    apiKeyPlaceholder: "ms_your_modelscope_token",
    registerUrl: "https://modelscope.cn/my/myaccesstoken",
    hasEditableBaseUrl: true,
    supportsImage: true,
    supportsVideo: false,
    supportsAudio: false,
    supportsChat: true,
  },
  {
    key: "runninghub",
    label: "RunningHub",
    envApiKey: "RUNNINGHUB_API_KEY",
    envBaseUrl: "RUNNINGHUB_BASE_URL",
    defaultBaseUrl: "https://www.runninghub.cn",
    defaultVideoBaseUrl: "https://www.runninghub.cn",
    apiKeyPlaceholder: "your_runninghub_api_key",
    registerUrl: "https://www.runninghub.cn/runninghub-api-doc-cn/doc-8287334",
    hasEditableBaseUrl: true,
    supportsImage: true,
    supportsVideo: true,
    supportsAudio: false,
    supportsChat: true,
  },
  {
    key: "mimo",
    label: "MiMo",
    envApiKey: "MIMO_API_KEY",
    envBaseUrl: "MIMO_BASE_URL",
    defaultBaseUrl: "https://api.xiaomimimo.com",
    defaultVideoBaseUrl: "https://api.xiaomimimo.com",
    apiKeyPlaceholder: "sk-... or tp-...",
    credentialHint: "sk- key 自动使用标准 API；tp- key 自动使用 Token Plan CN 端点。SGP/AMS Token Plan 可在 Base URL 填订阅页地址。",
    endpointInfo: [
      "Standard: https://api.xiaomimimo.com/v1",
      `Token Plan default: ${MIMO_TOKEN_PLAN_DEFAULT_BASE_URL}`,
    ],
    registerUrl: "https://platform.xiaomimimo.com",
    hasEditableBaseUrl: true,
    supportsImage: false,
    supportsVideo: false,
    supportsAudio: true,
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
