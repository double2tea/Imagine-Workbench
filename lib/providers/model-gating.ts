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
  if (kind === "all") return isKnownMediaModel(option.value) || !isMediaLookingModelId(parsed.model);
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

function isMediaLookingModelId(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    lower.includes("image") ||
    lower.includes("imagen") ||
    lower.includes("imagine") ||
    lower.includes("text-to-image") ||
    lower.includes("-to-image") ||
    lower.includes("video") ||
    lower.includes("veo") ||
    lower.includes("-to-video") ||
    lower.includes("tts") ||
    lower.includes("audio") ||
    lower.includes("voice") ||
    lower.includes("speech") ||
    lower.includes("asr")
  );
}
