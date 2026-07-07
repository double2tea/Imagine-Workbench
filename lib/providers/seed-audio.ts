import { ApiError } from "@/lib/api/errors";
import { parseProviderResponseBody, isRecord, parseDataUri, requireText } from "./utils";
import type { GenerateAudioOperationInput, ProviderConfig, ReferenceMedia } from "./types";

export const SEED_AUDIO_MODEL = "seed-audio-1.0";

type SeedAudioFormat = "wav" | "mp3" | "pcm" | "ogg_opus";

interface SeedAudioReference {
  speaker?: string;
  audio_data?: string;
  image_data?: string;
}

interface SeedAudioRequest {
  model: typeof SEED_AUDIO_MODEL;
  text_prompt: string;
  references?: SeedAudioReference[];
  audio_config: {
    format: SeedAudioFormat;
  };
}

interface SeedAudioResponse {
  audio?: string;
  code?: number | string;
  message?: string;
}

interface SeedAudioResult {
  audioBase64: string;
  format: SeedAudioFormat;
  model: typeof SEED_AUDIO_MODEL;
  mimeType: string;
}

const SEED_AUDIO_SUPPORTED_FORMATS: readonly SeedAudioFormat[] = ["wav", "mp3", "pcm", "ogg_opus"];

export async function generateSeedAudio(
  config: ProviderConfig,
  input: GenerateAudioOperationInput,
): Promise<SeedAudioResult> {
  if (input.model !== SEED_AUDIO_MODEL) {
    throw new Error(`Seed Audio model is not supported: ${input.model}`);
  }

  const format = readSeedAudioFormat(input.format);
  const request: SeedAudioRequest = {
    model: SEED_AUDIO_MODEL,
    text_prompt: requireText(input.prompt, "Seed Audio prompt"),
    audio_config: { format },
  };
  const references = seedAudioReferences(input);
  if (references.length > 0) request.references = references;

  const response = await postSeedAudioCreate(config, request);
  assertSeedAudioSuccess(response);

  return {
    audioBase64: readSeedAudioBase64(response),
    format,
    model: SEED_AUDIO_MODEL,
    mimeType: seedAudioMimeType(format),
  };
}

function seedAudioReferences(input: GenerateAudioOperationInput): SeedAudioReference[] {
  const imageReferences = input.referenceMedia.filter(reference => reference.type === "image");
  const audioReferences = input.referenceMedia.filter(reference => reference.type === "audio");
  if (input.referenceMedia.some(reference => reference.type === "video")) {
    throw new Error("Seed Audio does not support video references");
  }

  const speaker = input.voice?.trim();
  if (imageReferences.length > 0 && (audioReferences.length > 0 || speaker)) {
    throw new Error("Seed Audio image references cannot be mixed with audio references or speaker IDs");
  }
  if (imageReferences.length > 1) {
    throw new Error("Seed Audio supports at most one image reference");
  }
  if (imageReferences.length === 1) {
    return [{ image_data: referenceBase64(imageReferences[0]) }];
  }

  const references: SeedAudioReference[] = [];
  if (speaker) references.push({ speaker });
  for (const reference of audioReferences) {
    references.push({ audio_data: referenceBase64(reference) });
  }
  if (references.length > 3) {
    throw new Error("Seed Audio supports at most three audio references including speaker IDs");
  }
  if (input.mode === "voice_clone" && references.length === 0) {
    throw new Error("Seed Audio voice clone requires an audio reference or speaker ID");
  }
  return references;
}

function referenceBase64(reference: ReferenceMedia): string {
  return parseDataUri(reference.dataUri).base64;
}

async function postSeedAudioCreate(
  config: ProviderConfig,
  body: SeedAudioRequest,
): Promise<SeedAudioResponse> {
  const response = await fetch(`${trimTrailingSlash(config.baseUrl)}/api/v3/tts/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": config.apiKey,
      "X-Api-Request-Id": globalThis.crypto.randomUUID(),
    },
    body: JSON.stringify(body),
    signal: config.signal,
  });
  const text = await response.text();
  const data = parseProviderResponseBody(text);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      response.status === 429 ? "provider_rate_limited" : "provider_request_failed",
      readSeedAudioErrorMessage(data) ?? `HTTP ${response.status}`,
      { providerStatus: response.status },
    );
  }
  return readSeedAudioResponse(data);
}

function readSeedAudioResponse(value: unknown): SeedAudioResponse {
  if (!isRecord(value)) throw new Error("Seed Audio response was not an object");
  return {
    audio: typeof value.audio === "string" ? value.audio : undefined,
    code: typeof value.code === "number" || typeof value.code === "string" ? value.code : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

function assertSeedAudioSuccess(response: SeedAudioResponse): void {
  if (response.code === undefined || response.code === 0 || response.code === "0") return;
  throw new ApiError(502, "provider_request_failed", response.message ?? `Seed Audio request failed with code ${response.code}`);
}

function readSeedAudioBase64(response: SeedAudioResponse): string {
  if (!response.audio) throw new Error("Seed Audio response did not include audio data");
  return response.audio;
}

function readSeedAudioFormat(format: string | undefined): SeedAudioFormat {
  if (format === undefined) return "wav";
  if (isSeedAudioFormat(format)) return format;
  throw new Error("Seed Audio supports wav, mp3, pcm, or ogg_opus formats");
}

function isSeedAudioFormat(value: string): value is SeedAudioFormat {
  return SEED_AUDIO_SUPPORTED_FORMATS.some(item => item === value);
}

function seedAudioMimeType(format: SeedAudioFormat): string {
  if (format === "mp3") return "audio/mpeg";
  if (format === "pcm") return "audio/pcm";
  if (format === "ogg_opus") return "audio/ogg";
  return "audio/wav";
}

function readSeedAudioErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.message === "string") return value.message;
  if (typeof value.error === "string") return value.error;
  if (isRecord(value.error) && typeof value.error.message === "string") return value.error.message;
  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
