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

function readModelId(value: unknown, provider: AiProvider, kind: ModelKindFilter): ModelOption[] {
  if (!isRecord(value) || typeof value.id !== "string") return [];
  if (!matchesKind(value.id, kind)) return [];
  return [
    {
      value: formatProviderModel(provider, value.id),
      label: `${getProviderMeta(provider).label} ${value.id}`,
    },
  ];
}

function matchesKind(model: string, kind: ModelKindFilter): boolean {
  if (kind === "all") return true;
  if (kind === "chat") return isAgentCompatibleModelId(model);
  const lower = model.toLowerCase();
  if (kind === "video") {
    return lower.includes("video") || lower.includes("veo");
  }
  return lower.includes("image") || lower.includes("imagen") || lower.includes("imagine");
}

function dedupeOptions(options: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}
