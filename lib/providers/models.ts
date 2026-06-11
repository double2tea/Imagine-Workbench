import { formatProviderModel, getModelCapabilities, isAgentCompatibleModelId, type AiProvider, type ModelOption } from "./model-catalog";
import { getProviderMeta } from "./registry";
import { RUNNINGHUB_DEFAULT_LLM_MODEL, RUNNINGHUB_STANDARD_MODELS, runningHubLlmBaseUrl } from "./runninghub";
import type { ProviderConfig } from "./types";
import { getJson, isRecord, openAiCompatibleUrl } from "./utils";

export type ModelKindFilter = "chat" | "image" | "video" | "audio" | "all";

interface OpenAiModelsResponse {
  data?: unknown[];
}

export async function listAgentModels(config: ProviderConfig): Promise<ModelOption[]> {
  return listProviderModels(config, "chat");
}

export async function listProviderModels(config: ProviderConfig, kind: ModelKindFilter): Promise<ModelOption[]> {
  if (config.provider === "runninghub") {
    return listRunningHubModels(config, kind);
  }
  if (config.provider === "modelscope") {
    return listModelScopeModels(config, kind);
  }
  if (config.provider === "agnes") {
    return listStaticProviderModels(config.provider, kind);
  }
  if (config.provider === "mimo") {
    return listStaticProviderModels(config.provider, kind);
  }

  const response = await getJson<OpenAiModelsResponse>(openAiCompatibleUrl(config.baseUrl, "/v1/models"), config);
  if (!Array.isArray(response.data)) {
    throw new Error("Model list response did not include a data array");
  }

  const options = response.data.flatMap(item => readModelId(item, config.provider, kind, providerLabel(config)));
  if (options.length === 0) {
    throw new Error(`No ${kind === "all" ? "" : `${kind} `}models were found in provider model list`);
  }

  return dedupeOptions(options);
}

async function listModelScopeModels(config: ProviderConfig, kind: ModelKindFilter): Promise<ModelOption[]> {
  const response = await getJson<OpenAiModelsResponse>("https://modelscope.cn/openapi/v1/models", config);
  const rawModels = Array.isArray(response.data)
    ? response.data
    : isRecord(response) && Array.isArray(response.Models)
      ? response.Models
      : isRecord(response) && Array.isArray(response.models)
        ? response.models
        : [];
  const options = rawModels.flatMap(item => readModelId(item, config.provider, kind, providerLabel(config)));
  return dedupeOptions(options.length > 0 ? options : listStaticProviderModels(config.provider, kind));
}

async function listRunningHubModels(config: ProviderConfig, kind: ModelKindFilter): Promise<ModelOption[]> {
  if (kind === "chat") {
    return listRunningHubChatModels(config);
  }
  if (kind === "all") {
    return dedupeOptions([
      ...(await listRunningHubChatModels(config)),
      ...listStaticProviderModels(config.provider, kind),
    ]);
  }
  return listStaticProviderModels(config.provider, kind);
}

async function listRunningHubChatModels(config: ProviderConfig): Promise<ModelOption[]> {
  const response = await getJson<OpenAiModelsResponse>(`${runningHubLlmBaseUrl(config.baseUrl)}/v1/models`, config);
  if (!Array.isArray(response.data)) {
    throw new Error("RunningHub LLM model list response did not include a data array");
  }
  const options = response.data.flatMap(item => readModelId(item, config.provider, "chat", providerLabel(config)));
  if (options.length === 0) {
    throw new Error("No RunningHub LLM chat models were found in provider model list");
  }
  return dedupeOptions(options);
}

export function listStaticProviderModels(provider: AiProvider, kind: ModelKindFilter): ModelOption[] {
  if (provider === "runninghub") return runningHubStaticModels(kind);
  if (provider === "modelscope") return modelScopeStaticModels(kind);

  return getModelCapabilities(kind === "all" ? undefined : kind, provider).map(capability => ({
    value: capability.value,
    label: capability.label,
  }));
}

function modelScopeStaticModels(kind: ModelKindFilter): ModelOption[] {
  return getModelCapabilities(kind === "all" ? undefined : kind, "modelscope").map(capability => ({
    value: capability.value,
    label: capability.label,
  }));
}

function runningHubStaticModels(kind: ModelKindFilter): ModelOption[] {
  const chatModels = [
    {
      value: formatProviderModel("runninghub", RUNNINGHUB_DEFAULT_LLM_MODEL),
      label: "RunningHub Qwen 3.7 Max",
      kind: "chat",
    },
  ];
  if (kind === "chat") return chatModels.map(model => ({ value: model.value, label: model.label }));
  const standardModels = RUNNINGHUB_STANDARD_MODELS
    .filter(model => model.listed !== false)
    .filter(model => kind === "all" || model.kind === kind)
    .map(model => ({
      value: formatProviderModel("runninghub", model.model),
      label: model.label,
    }));
  const virtualModels = [
    { value: "runninghub:ai-app-image:<webappId>", label: "RunningHub AI App Image", kind: "image" },
    { value: "runninghub:ai-app-video:<webappId>", label: "RunningHub AI App Video", kind: "video" },
    { value: "runninghub:workflow-image:<workflowId>", label: "RunningHub Workflow Image", kind: "image" },
    { value: "runninghub:workflow-video:<workflowId>", label: "RunningHub Workflow Video", kind: "video" },
  ].filter(model => kind === "all" || model.kind === kind);
  return [
    ...(kind === "all" ? chatModels.map(model => ({ value: model.value, label: model.label })) : []),
    ...standardModels,
    ...virtualModels.map(model => ({ value: model.value, label: model.label })),
  ];
}

function readModelId(value: unknown, provider: AiProvider, kind: ModelKindFilter, label: string): ModelOption[] {
  if (!isRecord(value)) return [];
  const id = readModelValue(value);
  if (!id || !matchesKind(id, kind)) return [];
  return [
    {
      value: formatProviderModel(provider, id),
      label: `${label} ${id}`,
    },
  ];
}

function providerLabel(config: ProviderConfig): string {
  return config.providerLabel ?? getProviderMeta(config.provider).label;
}

function readModelValue(value: Record<string, unknown>): string | undefined {
  const candidates = [value.id, value.name, value.model_id, value.modelId, value.Path, value.path];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
}

function matchesKind(model: string, kind: ModelKindFilter): boolean {
  if (kind === "all") return true;
  if (kind === "chat") return isAgentCompatibleModelId(model);
  const lower = model.toLowerCase();
  if (kind === "video") {
    return lower.includes("video") || lower.includes("veo") || lower.includes("-to-video") || lower.includes("omni_flash");
  }
  if (kind === "audio") {
    return lower.includes("audio") || lower.includes("tts") || lower.includes("voice") || lower.includes("speech") || lower.includes("asr");
  }
  return lower.includes("image") || lower.includes("imagen") || lower.includes("imagine") || lower.includes("text-to-image");
}

function dedupeOptions(options: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}
