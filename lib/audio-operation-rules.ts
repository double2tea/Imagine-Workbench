import { mediaReferenceLabel } from "./media-references";
import type { AudioModelCapabilities, AudioOperationMode } from "./providers/model-catalog";

export function audioOperationRequiresTextInput(mode: AudioOperationMode): boolean {
  return mode !== "asr";
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
