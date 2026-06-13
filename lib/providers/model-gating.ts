import {
  formatProviderModel,
  getOptionalModelCapability,
  tryParseProviderModel,
  type AiProvider,
  type ModelKind,
  type ModelOption,
} from "./model-catalog";

export type DynamicModelKind = ModelKind | "all";

export function isSelectableModelOptionForKind(option: ModelOption, kind: DynamicModelKind): boolean {
  const parsed = tryParseProviderModel(option.value, "12ai");
  if (!parsed) return false;
  if (kind === "chat") return true;
  if (kind === "all") return true;
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
