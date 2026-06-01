import { formatProviderModel, isAgentCompatibleModelId, type AiProvider, type ModelOption } from "./model-catalog";
import { getProviderMeta } from "./registry";
import type { ProviderConfig } from "./types";
import { getJson, isRecord } from "./utils";

export type ModelKindFilter = "chat" | "image" | "video" | "all";

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

  const response = await getJson<OpenAiModelsResponse>(`${config.baseUrl}/v1/models`, config);
  if (!Array.isArray(response.data)) {
    throw new Error("Model list response did not include a data array");
  }

  const options = response.data.flatMap(item => readModelId(item, config.provider, kind));
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
  const options = rawModels.flatMap(item => readModelId(item, config.provider, kind));
  return dedupeOptions(options.length > 0 ? options : staticProviderModels(config.provider, kind));
}

async function listRunningHubModels(config: ProviderConfig, kind: ModelKindFilter): Promise<ModelOption[]> {
  if (kind === "chat") {
    throw new Error("RunningHub does not expose chat models");
  }
  return staticProviderModels(config.provider, kind);
}

function staticProviderModels(provider: AiProvider, kind: ModelKindFilter): ModelOption[] {
  const options = [
    { value: "modelscope:Qwen/Qwen-Image", label: "ModelScope Qwen Image" },
    { value: "modelscope:Qwen/Qwen-Image-Edit", label: "ModelScope Qwen Image Edit" },
    { value: "runninghub:ai-app-image:<webappId>", label: "RunningHub AI App Image" },
    { value: "runninghub:ai-app-video:<webappId>", label: "RunningHub AI App Video" },
    { value: "runninghub:workflow-image:<workflowId>", label: "RunningHub Workflow Image" },
    { value: "runninghub:workflow-video:<workflowId>", label: "RunningHub Workflow Video" },
  ].filter(option => parseOptionProvider(option.value) === provider);

  return options.filter(option => matchesKind(option.value, kind));
}

function parseOptionProvider(value: string): AiProvider | null {
  const separator = value.indexOf(":");
  if (separator === -1) return null;
  const provider = value.slice(0, separator);
  return provider === "modelscope" || provider === "runninghub" ? provider : null;
}

function readModelId(value: unknown, provider: AiProvider, kind: ModelKindFilter): ModelOption[] {
  if (!isRecord(value)) return [];
  const id = readModelValue(value);
  if (!id || !matchesKind(id, kind)) return [];
  return [
    {
      value: formatProviderModel(provider, id),
      label: `${getProviderMeta(provider).label} ${id}`,
    },
  ];
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
