import { generateRunningHubMedia, getRunningHubMediaStatus, downloadRunningHubMedia } from "./image";
import { generateMimoTts, generateMimoTtsVoiceDesign, MIMO_TTS_MODEL, MIMO_TTS_VOICE_DESIGN_MODEL } from "./mimo-tts";
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
  if (config.provider === "mimo") {
    if (input.referenceMedia.length > 0) {
      throw new Error("MiMo audio operation does not support reference media yet");
    }

    if (input.mode === "tts" && input.model === MIMO_TTS_MODEL) {
      const result = await generateMimoTts(config, {
        text: input.prompt,
        format: input.format === "pcm16" ? "pcm16" : "wav",
        stylePrompt: input.stylePrompt,
      });
      return {
        type: "direct",
        outputKind: "audio",
        source: "mimo",
        ...result,
      };
    }

    if (input.mode === "voice_design" && input.model === MIMO_TTS_VOICE_DESIGN_MODEL) {
      const result = await generateMimoTtsVoiceDesign(config, {
        text: input.prompt,
        format: input.format === "pcm16" ? "pcm16" : "wav",
        stylePrompt: input.stylePrompt,
      });
      return {
        type: "direct",
        outputKind: "audio",
        source: "mimo",
        ...result,
      };
    }

    throw new Error("MiMo audio operation currently supports built-in TTS and voice design only");
  }

  if (config.provider === "runninghub") {
    const result = await generateAudio(config, input);
    return {
      type: "async",
      outputKind: "audio",
      ...result,
    };
  }

  throw new Error(`${config.provider} audio operation is not supported yet`);
}

export async function getAudioStatus(config: ProviderConfig, taskId: string): Promise<MediaStatusResult> {
  if (config.provider !== "runninghub") {
    throw new Error(`${config.provider} audio status polling is not supported yet`);
  }
  return getRunningHubMediaStatus(config, "audio", taskId);
}

export async function downloadAudio(config: ProviderConfig, taskId: string): Promise<Response> {
  if (config.provider !== "runninghub") {
    throw new Error(`${config.provider} audio download is not supported yet`);
  }
  return downloadRunningHubMedia(config, "audio", taskId);
}
