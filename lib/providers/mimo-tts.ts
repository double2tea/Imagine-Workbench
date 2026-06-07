import type { MimoTtsFormat, MimoTtsInput, MimoTtsResult, ProviderConfig } from "./types";
import { isRecord, openAiCompatibleUrl, postJson, requireText } from "./utils";
import { MIMO_BUILT_IN_VOICES } from "./mimo-voices";

export const MIMO_TTS_MODEL = "mimo-v2.5-tts";
export const MIMO_TTS_VOICE_DESIGN_MODEL = "mimo-v2.5-tts-voicedesign";
export const MIMO_TTS_VOICE_CLONE_MODEL = "mimo-v2.5-tts-voiceclone";

type MimoTtsModel =
  | typeof MIMO_TTS_MODEL
  | typeof MIMO_TTS_VOICE_DESIGN_MODEL
  | typeof MIMO_TTS_VOICE_CLONE_MODEL;

interface MimoTtsRequestMessage {
  role: "user" | "assistant";
  content: string;
}

interface MimoTtsRequestAudio {
  format: MimoTtsFormat;
  voice?: string;
  optimize_text_preview?: boolean;
}

interface MimoTtsResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string;
      };
    };
  }>;
}

export function isMimoBuiltInVoice(value: string): value is (typeof MIMO_BUILT_IN_VOICES)[number] {
  return MIMO_BUILT_IN_VOICES.some(voice => voice === value);
}

export async function generateMimoTts(
  config: ProviderConfig,
  input: MimoTtsInput,
): Promise<MimoTtsResult> {
  const format = input.format ?? "wav";
  const voice = requireText(input.voice ?? "mimo_default", "MiMo built-in voice");
  if (!isMimoBuiltInVoice(voice)) {
    throw new Error("MiMo built-in voice is not supported");
  }

  return requestMimoTts(config, MIMO_TTS_MODEL, {
    messages: ttsMessages(input.stylePrompt ?? "", input.text),
    audio: { format, voice },
  });
}

export async function generateMimoTtsVoiceDesign(
  config: ProviderConfig,
  input: MimoTtsInput,
): Promise<MimoTtsResult> {
  const format = input.format ?? "wav";
  const stylePrompt = requireText(input.stylePrompt, "MiMo voice design prompt");
  return requestMimoTts(config, MIMO_TTS_VOICE_DESIGN_MODEL, {
    messages: ttsMessages(stylePrompt, input.text),
    audio: {
      format,
      ...(typeof input.optimizeTextPreview === "boolean" ? { optimize_text_preview: input.optimizeTextPreview } : {}),
    },
  });
}

export async function generateMimoTtsVoiceClone(
  config: ProviderConfig,
  input: MimoTtsInput,
): Promise<MimoTtsResult> {
  const format = input.format ?? "wav";
  const voice = requireText(input.voice, "MiMo voice clone reference audio");
  return requestMimoTts(config, MIMO_TTS_VOICE_CLONE_MODEL, {
    messages: ttsMessages(input.stylePrompt ?? "", input.text),
    audio: { format, voice },
  });
}

function ttsMessages(stylePrompt: string, text: string): MimoTtsRequestMessage[] {
  return [
    { role: "user", content: stylePrompt },
    { role: "assistant", content: requireText(text, "MiMo TTS text") },
  ];
}

async function requestMimoTts(
  config: ProviderConfig,
  model: MimoTtsModel,
  request: { messages: MimoTtsRequestMessage[]; audio: MimoTtsRequestAudio },
): Promise<MimoTtsResult> {
  const response = await postJson<MimoTtsResponse>(openAiCompatibleUrl(config.baseUrl, "/v1/chat/completions"), config, {
    model,
    messages: request.messages,
    audio: request.audio,
    stream: false,
  });

  const audioBase64 = readAudioBase64(response);
  const format = request.audio.format;
  return {
    audioBase64,
    format,
    model,
    mimeType: format === "wav" ? "audio/wav" : "audio/pcm",
    ...(format === "pcm16" ? { sampleRateHz: 24000 } : {}),
  };
}

function readAudioBase64(response: MimoTtsResponse): string {
  const choice = response.choices?.[0];
  if (!isRecord(choice)) {
    throw new Error("MiMo TTS response did not include choices");
  }
  const message = choice.message;
  if (!isRecord(message)) {
    throw new Error("MiMo TTS response did not include a message");
  }
  const audio = message.audio;
  if (!isRecord(audio) || typeof audio.data !== "string" || audio.data.length === 0) {
    throw new Error("MiMo TTS response did not include audio data");
  }
  return audio.data;
}
