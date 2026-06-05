import { generateRunningHubMedia, getRunningHubMediaStatus, downloadRunningHubMedia } from "./image";
import type { GenerateAudioInput, GenerateAudioResult, MediaStatusResult, ProviderConfig } from "./types";

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
