import {
  formatProviderModel,
  getOptionalModelCapability,
  isAgentCompatibleModelId,
  tryParseProviderModel,
  type AiProvider,
  type ModelKind,
  type ModelOption,
} from "./model-catalog";

export type DynamicModelKind = ModelKind | "all";

export function isSelectableModelOptionForKind(option: ModelOption, kind: DynamicModelKind): boolean {
  const parsed = tryParseProviderModel(option.value, "12ai");
  if (!parsed) return false;
  if (kind === "chat") return isSelectableChatModelId(parsed.model);
  if (kind === "all") return isSelectableChatModelId(parsed.model) || isKnownMediaModel(option.value);
  if (kind === "image" && parsed.async) return false;
  const capability = getOptionalModelCapability(option.value, kind);
  return capability !== undefined && capability.listed !== false;
}

export function dynamicProviderModelOption(
  provider: AiProvider,
  model: string,
  kind: DynamicModelKind,
  providerLabel: string,
): ModelOption | null {
  const value = formatProviderModel(provider, model);
  const option = { value, label: `${providerLabel} ${model}` };
  return isSelectableModelOptionForKind(option, kind) ? option : null;
}

function isSelectableChatModelId(model: string): boolean {
  return isAgentCompatibleModelId(model);
}

function isKnownMediaModel(value: string): boolean {
  return (
    isKnownListedMediaModel(value, "image") ||
    isKnownListedMediaModel(value, "video") ||
    isKnownListedMediaModel(value, "audio")
  );
}

function isKnownListedMediaModel(value: string, kind: Exclude<DynamicModelKind, "all" | "chat">): boolean {
  const capability = getOptionalModelCapability(value, kind);
  return capability !== undefined && capability.listed !== false;
}
