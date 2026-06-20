import { t as globalT, type TFunction } from "@/lib/i18n";
import { mediaReferenceLabel } from "./media-references";
import {
  getAudioModelCapabilities,
  getModelCapabilities,
  parseProviderModel,
  type AiProvider,
  type AudioModelCapabilities,
  type AudioOperationMode,
} from "./providers/model-catalog";

export type AudioFunctionValue = `${string}::${AudioOperationMode}`;

export interface AudioFunctionModelOption {
  label: string;
  value: string;
}

export interface AudioFunctionModelGroup {
  label: string;
  options: AudioFunctionModelOption[];
  provider: string;
}

export interface AudioProviderOption {
  label: string;
  value: AiProvider;
}

export interface AudioFunctionOption {
  label: string;
  mode: AudioOperationMode;
  model: string;
  provider: AiProvider;
  value: AudioFunctionValue;
}

export interface AudioFunctionSelection {
  capabilities: AudioModelCapabilities;
  mode: AudioOperationMode;
  model: string;
}

const AUDIO_MODE_LABELS_FALLBACK: Record<AudioOperationMode, string> = {
  asr: "Transcribe",
  music: "Music",
  sfx: "SFX",
  tts: "Text-to-Speech",
  voice_clone: "Voice Clone",
  voice_design: "Voice Design",
};

/** Get mode label via i18n. Falls back to Chinese constant when t is not provided. */
export function getAudioModeLabel(mode: AudioOperationMode, t?: TFunction): string {
  return (t ?? globalT)(`media.modeLabels.${mode}`) || (t ?? globalT)(`common.media.modeLabels.${mode}`) || AUDIO_MODE_LABELS_FALLBACK[mode];
}

/** Get ASR language options via i18n. Falls back to Chinese constants when t is not provided. */
export function getAsrLanguageOptions(t?: TFunction): Array<{ label: string; value: "auto" | "zh" | "en" }> {
  return ASR_LANGUAGE_OPTIONS.map(option => ({
    value: option.value,
    label: (t ?? globalT)(`media.asrLanguageOptions.${option.value}`) || option.label,
  }));
}

const ASR_LANGUAGE_OPTION_LABELS_FALLBACK: Record<"auto" | "zh" | "en", string> = {
  auto: "Auto Detect",
  zh: "Chinese",
  en: "English",
};

export const ASR_LANGUAGE_OPTIONS: Array<{ label: string; value: "auto" | "zh" | "en" }> = [
  { value: "auto", label: ASR_LANGUAGE_OPTION_LABELS_FALLBACK.auto },
  { value: "zh", label: ASR_LANGUAGE_OPTION_LABELS_FALLBACK.zh },
  { value: "en", label: ASR_LANGUAGE_OPTION_LABELS_FALLBACK.en },
];

export function audioOperationRequiresTextInput(mode: AudioOperationMode): boolean {
  return mode !== "asr";
}

export function audioOperationRequiresStylePrompt(mode: AudioOperationMode): boolean {
  return mode === "voice_design";
}

export function audioOperationFormatOptions(capabilities: AudioModelCapabilities): AudioModelCapabilities["formats"] {
  return capabilities.outputKinds.includes("audio") ? capabilities.formats : [];
}

export function readOptionalAudioFormat(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function audioOperationMissingReferenceMessage(capabilities: AudioModelCapabilities, t?: TFunction): string {
  const translator = t ?? globalT;
  const labels = capabilities.referenceMediaTypes.map(type => mediaReferenceLabel(type, translator)).join(" / ");
  const referenceLabel = labels || translator("media.referenceLabels.audio");
  return translator("media.missingReferenceMessage", { min: capabilities.minReferenceMedia, referenceLabel });
}

export function audioFunctionValue(model: string, mode: AudioOperationMode): AudioFunctionValue {
  return `${model}::${mode}`;
}

export function parseAudioFunctionValue(value: string): { model: string; mode: AudioOperationMode } | null {
  const separatorIndex = value.lastIndexOf("::");
  if (separatorIndex <= 0) return null;
  const model = value.slice(0, separatorIndex);
  const mode = readAudioOperationModeValue(value.slice(separatorIndex + 2));
  return mode ? { model, mode } : null;
}

export function audioProviderOptions(groups: AudioFunctionModelGroup[]): AudioProviderOption[] {
  return groups.flatMap(group => {
    const firstModel = group.options[0]?.value;
    if (!firstModel) return [];
    return [{ label: group.label, value: audioProviderFromModel(firstModel) }];
  });
}

export function audioProviderFromModel(model: string): AiProvider {
  return parseProviderModel(model, "12ai").provider;
}

export function audioFunctionOptionsForProvider(
  groups: AudioFunctionModelGroup[],
  provider: AiProvider,
  getCapabilities: (model: string) => AudioModelCapabilities,
): AudioFunctionOption[] {
  const group = groups.find(item => item.options.some(option => audioProviderFromModel(option.value) === provider));
  if (!group) return [];
  return group.options.flatMap(option => {
    const capabilities = getCapabilities(option.value);
    return capabilities.modes.map(mode => ({
      label: audioFunctionLabel(option.label, mode, capabilities.modes.length),
      mode,
      model: option.value,
      provider,
      value: audioFunctionValue(option.value, mode),
    }));
  });
}

export function resolveAudioFunctionSelection(input: {
  fallbackModel: string;
  mode?: AudioOperationMode;
  model?: string;
  t?: TFunction;
}): AudioFunctionSelection {
  const requestedModel = input.model ?? input.fallbackModel;
  const requestedMode = input.mode;
  const requestedCapabilities = getAudioModelCapabilities(requestedModel);
  if (!requestedMode) {
    return {
      capabilities: requestedCapabilities,
      mode: requestedCapabilities.defaultMode,
      model: requestedModel,
    };
  }
  if (requestedCapabilities.modes.includes(requestedMode)) {
    return { capabilities: requestedCapabilities, mode: requestedMode, model: requestedModel };
  }

  const provider = audioProviderFromModel(requestedModel);
  const providerMatch = getModelCapabilities("audio", provider).find(capability => capability.audioModes.includes(requestedMode));
  const match = providerMatch ?? getModelCapabilities("audio").find(capability => capability.audioModes.includes(requestedMode));
  const translator = input.t ?? globalT;
  if (!match) throw new Error(translator("media.noSupportingModelError", { mode: getAudioModeLabel(requestedMode, translator) }));

  const model = match.value;
  return {
    capabilities: getAudioModelCapabilities(model),
    mode: requestedMode,
    model,
  };
}

function audioFunctionLabel(modelLabel: string, mode: AudioOperationMode, modeCount: number): string {
  const modeLabel = getAudioModeLabel(mode);
  if (modeCount === 1) return modeLabel;
  return `${modeLabel} · ${modelLabel}`;
}

function readAudioOperationModeValue(value: string): AudioOperationMode | null {
  if (value === "tts" || value === "voice_design" || value === "voice_clone" || value === "music" || value === "sfx" || value === "asr") return value;
  return null;
}
