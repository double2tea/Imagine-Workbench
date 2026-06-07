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

export const AUDIO_MODE_LABELS: Record<AudioOperationMode, string> = {
  asr: "转写",
  music: "音乐",
  sfx: "音效",
  tts: "朗读",
  voice_clone: "克隆",
  voice_design: "设计音色",
};

export const ASR_LANGUAGE_OPTIONS: Array<{ label: string; value: "auto" | "zh" | "en" }> = [
  { value: "auto", label: "自动识别" },
  { value: "zh", label: "中文" },
  { value: "en", label: "英文" },
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

export function audioOperationMissingReferenceMessage(capabilities: AudioModelCapabilities): string {
  const labels = capabilities.referenceMediaTypes.map(mediaReferenceLabel).join(" / ");
  const referenceLabel = labels ? `${labels}参考` : "参考媒体";
  return `当前音频模式需要至少 ${capabilities.minReferenceMedia} 个${referenceLabel}`;
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
  if (!match) throw new Error(`没有支持 ${AUDIO_MODE_LABELS[requestedMode]} 的音频模型`);

  const model = match.value;
  return {
    capabilities: getAudioModelCapabilities(model),
    mode: requestedMode,
    model,
  };
}

function audioFunctionLabel(modelLabel: string, mode: AudioOperationMode, modeCount: number): string {
  if (modeCount === 1) return AUDIO_MODE_LABELS[mode];
  return `${AUDIO_MODE_LABELS[mode]} · ${modelLabel}`;
}

function readAudioOperationModeValue(value: string): AudioOperationMode | null {
  if (value === "tts" || value === "voice_design" || value === "voice_clone" || value === "music" || value === "sfx" || value === "asr") return value;
  return null;
}
