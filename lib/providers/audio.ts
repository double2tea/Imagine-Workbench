import { t } from "@/lib/i18n";
import { generateRunningHubMedia, getRunningHubMediaStatus, downloadRunningHubMedia } from "./image";
import { getRunningHubStandardModel } from "./runninghub";
import {
  generateMimoTts,
  generateMimoTtsVoiceClone,
  generateMimoTtsVoiceDesign,
  MIMO_TTS_MODEL,
  MIMO_TTS_VOICE_CLONE_MODEL,
  MIMO_TTS_VOICE_DESIGN_MODEL,
} from "./mimo-tts";
import { generateMimoAsr, MIMO_ASR_MODEL } from "./mimo-asr";
import type {
  GenerateAudioInput,
  GenerateAudioOperationInput,
  GenerateAudioOperationResult,
  GenerateAudioResult,
  MediaStatusResult,
  ProviderConfig,
} from "./types";

export async function generateAudio(
  config: ProviderConfig,
  input: GenerateAudioInput,
): Promise<GenerateAudioResult> {
  if (config.provider !== "runninghub") {
    throw new Error(`${config.provider} audio generation is not supported yet`);
  }

  const result = await generateRunningHubMedia(
    config,
    {
      prompt: input.prompt,
      model: input.model,
      aspectRatio: "auto",
      imageResolution: "auto",
      referenceImages: input.referenceMedia.filter(reference => reference.type === "image"),
      referenceMedia: input.referenceMedia,
      runningHubAccessPassword: input.runningHubAccessPassword,
      runningHubNodeInfoList: input.runningHubNodeInfoList,
    },
    "audio",
  );
  if (!result.operationName) throw new Error("Audio response did not include an operation name");

  return {
    operationName: result.operationName,
    source: result.source,
  };
}

export async function generateAudioOperation(
  config: ProviderConfig,
  input: GenerateAudioOperationInput,
): Promise<GenerateAudioOperationResult> {
  if (input.mode === "voice_clone" && input.voiceCloneConsentAccepted !== true) {
    throw new Error(t("common.notices.voiceCloneNeedsConsent"));
  }
  if (input.voiceProfileId) {
    throw new Error("Voice profile IDs must be resolved before audio operation");
  }

  if (config.provider === "runninghub" && getRunningHubStandardModel(input.model, "audio")) {
    const result = await generateAudio(config, input);
    return {
      type: "async",
      outputKind: "audio",
      operationName: result.operationName,
      source: result.source,
    };
  }

  if (config.provider === "mimo" || isMimoCompatibleAudioModel(input.model)) {
    if (input.mode === "tts" && input.model === MIMO_TTS_MODEL) {
      if (input.referenceMedia.length > 0) {
        throw new Error("MiMo built-in TTS does not accept reference media");
      }
      const result = await generateMimoTts(config, {
        text: input.prompt,
        format: input.format === "pcm16" ? "pcm16" : "wav",
        stylePrompt: input.stylePrompt,
        voice: input.voice,
        optimizeTextPreview: input.optimizeTextPreview,
      });
      return {
        type: "direct",
        outputKind: "audio",
        source: config.provider,
        ...result,
      };
    }

    if (input.mode === "voice_design" && input.model === MIMO_TTS_VOICE_DESIGN_MODEL) {
      if (input.referenceMedia.length > 0) {
        throw new Error("MiMo voice design does not accept reference media");
      }
      const result = await generateMimoTtsVoiceDesign(config, {
        text: input.prompt,
        format: input.format === "pcm16" ? "pcm16" : "wav",
        stylePrompt: input.stylePrompt,
        optimizeTextPreview: input.optimizeTextPreview,
      });
      return {
        type: "direct",
        outputKind: "audio",
        source: config.provider,
        ...result,
      };
    }

    if (input.mode === "voice_clone" && input.model === MIMO_TTS_VOICE_CLONE_MODEL) {
      const audioReferences = input.referenceMedia.filter(reference => reference.type === "audio");
      if (audioReferences.length !== 1 || audioReferences.length !== input.referenceMedia.length) {
        throw new Error("MiMo voice clone requires exactly one audio reference");
      }
      const result = await generateMimoTtsVoiceClone(config, {
        text: input.prompt,
        format: input.format === "pcm16" ? "pcm16" : "wav",
        stylePrompt: input.stylePrompt,
        voice: audioReferences[0].dataUri,
        optimizeTextPreview: input.optimizeTextPreview,
      });
      return {
        type: "direct",
        outputKind: "audio",
        source: config.provider,
        ...result,
      };
    }

    if (input.mode === "asr" && input.model === MIMO_ASR_MODEL) {
      const audioReferences = input.referenceMedia.filter(reference => reference.type === "audio");
      if (audioReferences.length !== 1 || audioReferences.length !== input.referenceMedia.length) {
        throw new Error("MiMo ASR requires exactly one audio reference");
      }
      const result = await generateMimoAsr(config, {
        audio: audioReferences[0].dataUri,
        language: input.asrLanguage,
      });
      return {
        type: "direct",
        outputKind: "transcript",
        source: config.provider,
        ...result,
      };
    }

    throw new Error(`${config.provider} audio operation currently supports MiMo-compatible TTS, voice design, voice clone, and ASR models only`);
  }

  throw new Error(`${config.provider} audio operation is not supported yet`);
}

function isMimoCompatibleAudioModel(model: string): boolean {
  return model === MIMO_TTS_MODEL ||
    model === MIMO_TTS_VOICE_DESIGN_MODEL ||
    model === MIMO_TTS_VOICE_CLONE_MODEL ||
    model === MIMO_ASR_MODEL;
}

export async function getAudioStatus(config: ProviderConfig, taskId: string): Promise<MediaStatusResult> {
  if (config.provider !== "runninghub") {
    throw new Error(`${config.provider} audio status polling is not supported yet`);
  }
  return getRunningHubMediaStatus(config, "audio", taskId);
}

export async function downloadAudio(config: ProviderConfig, taskId: string, outputIndex = 0): Promise<Response> {
  if (config.provider !== "runninghub") {
    throw new Error(`${config.provider} audio download is not supported yet`);
  }
  return downloadRunningHubMedia(config, "audio", taskId, outputIndex);
}
