import { getListedModelCapabilities, type AiProvider, type ModelOption } from "./model-catalog";
import { dynamicProviderModelOption } from "./model-gating";
import { getProviderMeta } from "./registry";
import {
  runningHubLlmBaseUrl,
} from "./runninghub";
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
  if (config.provider === "volcengine" && kind === "audio") {
    return listStaticProviderModels(config.provider, kind);
  }

  const options = await listOpenAiCompatibleModels(config, kind);
  if (config.provider === "volcengine" && kind === "all") {
    return dedupeOptions([...options, ...listStaticProviderModels(config.provider, "audio")]);
  }

  return options;
}

async function listOpenAiCompatibleModels(config: ProviderConfig, kind: ModelKindFilter): Promise<ModelOption[]> {
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

  return getListedModelCapabilities(kind === "all" ? undefined : kind, provider).map(capability => ({
    value: capability.value,
    label: capability.label,
  }));
}

function modelScopeStaticModels(kind: ModelKindFilter): ModelOption[] {
  return getListedModelCapabilities(kind === "all" ? undefined : kind, "modelscope").map(capability => ({
    value: capability.value,
    label: capability.label,
  }));
}

function runningHubStaticModels(kind: ModelKindFilter): ModelOption[] {
  return getListedModelCapabilities(kind === "all" ? undefined : kind, "runninghub")
    .map(capability => ({ value: capability.value, label: capability.label }));
}

function readModelId(value: unknown, provider: AiProvider, kind: ModelKindFilter, label: string): ModelOption[] {
  if (!isRecord(value)) return [];
  const id = readModelValue(value);
  if (!id) return [];
  const option = dynamicProviderModelOption(provider, id, kind, label);
  return option ? [option] : [];
}

function providerLabel(config: ProviderConfig): string {
  return config.providerLabel ?? getProviderMeta(config.provider).label;
}

function readModelValue(value: Record<string, unknown>): string | undefined {
  const candidates = [value.id, value.name, value.model_id, value.modelId, value.Path, value.path];
  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
}

function dedupeOptions(options: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}
