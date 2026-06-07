import type { MimoAsrInput, MimoAsrResult, ProviderConfig } from "./types";
import { isRecord, openAiCompatibleUrl, postJson, requireText } from "./utils";

export const MIMO_ASR_MODEL = "mimo-v2.5-asr";

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
