import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  generateMimoTts,
  generateMimoTtsVoiceClone,
  generateMimoTtsVoiceDesign,
  isMimoBuiltInVoice,
  MIMO_TTS_MODEL,
  MIMO_TTS_VOICE_CLONE_MODEL,
  MIMO_TTS_VOICE_DESIGN_MODEL,
} from "@/lib/providers/mimo-tts";
import type { MimoTtsInput } from "@/lib/providers/types";
import { resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

const MIMO_VOICE_CLONE_DATA_URI_PATTERN = /^data:audio\/(mpeg|mp3|wav);base64,/;
const MIMO_VOICE_CLONE_BASE64_MAX_LENGTH = 10 * 1024 * 1024;

const mimoTtsBodySchema = z.object({
  model: z.string().trim().min(1),
  text: z.string().trim().min(1),
  stylePrompt: z.string().trim().min(1).optional(),
  voice: z.string().trim().min(1).optional(),
  format: z.enum(["wav", "pcm16"]).optional(),
  optimizeTextPreview: z.boolean().optional(),
});

type MimoTtsBody = z.infer<typeof mimoTtsBodySchema>;

export async function POST(req: NextRequest) {
  try {
    const body = mimoTtsBodySchema.parse(await req.json());
    const config = resolveProviderConfig(req, "mimo");
    const result = await generateMimoTtsForModel(config, body);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate MiMo TTS";
    if (err instanceof z.ZodError || err instanceof MimoTtsRequestError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("MiMo TTS route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function generateMimoTtsForModel(config: ReturnType<typeof resolveProviderConfig>, body: MimoTtsBody) {
  if (body.model === MIMO_TTS_MODEL) {
    return generateMimoTts(config, builtInTtsInput(body));
  }
  if (body.model === MIMO_TTS_VOICE_DESIGN_MODEL) {
    return generateMimoTtsVoiceDesign(config, voiceDesignInput(body));
  }
  if (body.model === MIMO_TTS_VOICE_CLONE_MODEL) {
    return generateMimoTtsVoiceClone(config, voiceCloneInput(body));
  }
  throw new MimoTtsRequestError("Unsupported MiMo TTS model");
}

function builtInTtsInput(body: MimoTtsBody): MimoTtsInput {
  const voice = body.voice ?? "mimo_default";
  if (!isMimoBuiltInVoice(voice)) {
    throw new MimoTtsRequestError("MiMo built-in TTS voice must be a supported built-in voice ID");
  }
  return {
    text: body.text,
    stylePrompt: body.stylePrompt,
    voice,
    format: body.format,
  };
}

function voiceDesignInput(body: MimoTtsBody): MimoTtsInput {
  if (!body.stylePrompt) {
    throw new MimoTtsRequestError("MiMo voice design requires stylePrompt");
  }
  if (body.voice) {
    throw new MimoTtsRequestError("MiMo voice design does not accept voice");
  }
  return {
    text: body.text,
    stylePrompt: body.stylePrompt,
    format: body.format,
    optimizeTextPreview: body.optimizeTextPreview,
  };
}

function voiceCloneInput(body: MimoTtsBody): MimoTtsInput {
  if (!body.voice) {
    throw new MimoTtsRequestError("MiMo voice clone requires voice reference audio");
  }
  if (!MIMO_VOICE_CLONE_DATA_URI_PATTERN.test(body.voice)) {
    throw new MimoTtsRequestError("MiMo voice clone voice must be a data:audio/mpeg, data:audio/mp3, or data:audio/wav base64 URI");
  }
  const encodedAudio = body.voice.slice(body.voice.indexOf(",") + 1);
  if (encodedAudio.length > MIMO_VOICE_CLONE_BASE64_MAX_LENGTH) {
    throw new MimoTtsRequestError("MiMo voice clone reference audio exceeds 10MB base64 limit");
  }
  return {
    text: body.text,
    stylePrompt: body.stylePrompt,
    voice: body.voice,
    format: body.format,
  };
}

class MimoTtsRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MimoTtsRequestError";
  }
}
