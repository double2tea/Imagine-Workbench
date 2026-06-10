import type { MimoAsrInput, MimoAsrResult, ProviderConfig } from "./types";
import { isRecord, openAiCompatibleUrl, postJson, requireText } from "./utils";

export const MIMO_ASR_MODEL = "mimo-v2.5-asr";
const MIMO_ASR_MAX_BASE64_LENGTH = 10 * 1024 * 1024;
const MIMO_ASR_AUDIO_MIME_TYPES = new Set(["audio/wav", "audio/mpeg", "audio/mp3"]);

interface MimoAsrResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function generateMimoAsr(
  config: ProviderConfig,
  input: MimoAsrInput,
): Promise<MimoAsrResult> {
  const audio = requireText(input.audio, "MiMo ASR reference audio");
  assertMimoAsrAudioMime(audio);
  const response = await postJson<MimoAsrResponse>(openAiCompatibleUrl(config.baseUrl, "/v1/chat/completions"), config, {
    model: MIMO_ASR_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "input_audio",
            input_audio: {
              data: audio,
            },
          },
        ],
      },
    ],
    asr_options: {
      language: input.language ?? "auto",
    },
    stream: false,
  });

  return {
    model: MIMO_ASR_MODEL,
    transcript: readTranscript(response),
  };
}

function assertMimoAsrAudioMime(audio: string): void {
  const match = audio.match(/^data:([^;,]+);base64,(.*)$/i);
  if (!match) {
    throw new Error("MiMo ASR reference audio must be a base64 data URI");
  }
  const mimeType = match[1].toLowerCase();
  if (!mimeType || !MIMO_ASR_AUDIO_MIME_TYPES.has(mimeType)) {
    throw new Error("MiMo ASR supports wav or mp3 audio references only");
  }
  const base64Payload = match[2];
  if (base64Payload.length === 0) {
    throw new Error("MiMo ASR reference audio payload is required");
  }
  if (base64Payload.length > MIMO_ASR_MAX_BASE64_LENGTH) {
    throw new Error("MiMo ASR reference audio base64 payload exceeds 10MB");
  }
}

function readTranscript(response: MimoAsrResponse): string {
  const choice = response.choices?.[0];
  if (!isRecord(choice)) {
    throw new Error("MiMo ASR response did not include choices");
  }
  const message = choice.message;
  if (!isRecord(message) || typeof message.content !== "string" || message.content.trim().length === 0) {
    throw new Error("MiMo ASR response did not include transcript text");
  }
  return message.content.trim();
}
