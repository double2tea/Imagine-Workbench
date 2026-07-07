import { ApiError } from "@/lib/api/errors";
import { parseProviderResponseBody, isRecord, parseDataUri, requireText } from "./utils";
import type { GenerateAudioOperationInput, ProviderConfig, ReferenceMedia } from "./types";

export const SEED_AUDIO_MODEL = "seed-audio-1.0";

type SeedAudioFormat = "wav" | "mp3" | "pcm" | "ogg_opus";
type SeedAudioSampleRate = 8000 | 16000 | 24000 | 32000 | 44100 | 48000;

interface SeedAudioAudioConfig {
  format: SeedAudioFormat;
  sample_rate?: SeedAudioSampleRate;
  speech_rate?: number;
  loudness_rate?: number;
  pitch_rate?: number;
  enable_subtitle?: boolean;
}

interface SeedAudioWatermarkMetadata {
  enable?: boolean;
  content_producer?: string;
  produce_id?: string;
  content_propagator?: string;
  propagate_id?: string;
}

interface SeedAudioWatermark {
  aigc_watermark?: boolean;
  aigc_metadata?: SeedAudioWatermarkMetadata;
}

interface SeedAudioReference {
  speaker?: string;
  audio_data?: string;
  image_data?: string;
}

interface SeedAudioRequest {
  model: typeof SEED_AUDIO_MODEL;
  text_prompt: string;
  references?: SeedAudioReference[];
  audio_config: SeedAudioAudioConfig;
  watermark?: SeedAudioWatermark;
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
const SEED_AUDIO_SUPPORTED_SAMPLE_RATES: readonly SeedAudioSampleRate[] = [8000, 16000, 24000, 32000, 44100, 48000];
const SEED_AUDIO_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;

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
    audio_config: seedAudioConfig(input, format),
  };
  const references = seedAudioReferences(input);
  if (references.length > 0) request.references = references;
  const watermark = seedAudioWatermark(input);
  if (watermark) request.watermark = watermark;

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
  const parsed = parseDataUri(reference.dataUri);
  if (base64ByteLength(parsed.base64) > SEED_AUDIO_REFERENCE_MAX_BYTES) {
    throw new ApiError(413, "payload_too_large", "Seed Audio reference media must be at most 10MB");
  }
  return parsed.base64;
}

function seedAudioConfig(input: GenerateAudioOperationInput, format: SeedAudioFormat): SeedAudioAudioConfig {
  const values = input.parameterValues ?? {};
  const config: SeedAudioAudioConfig = { format };
  const sampleRate = readSeedAudioSampleRate(values.sample_rate);
  if (sampleRate !== undefined) config.sample_rate = sampleRate;
  const speechRate = readSeedAudioNumber(values.speech_rate, "speech_rate", -50, 100);
  if (speechRate !== undefined) config.speech_rate = speechRate;
  const loudnessRate = readSeedAudioNumber(values.loudness_rate, "loudness_rate", -50, 100);
  if (loudnessRate !== undefined) config.loudness_rate = loudnessRate;
  const pitchRate = readSeedAudioNumber(values.pitch_rate, "pitch_rate", -12, 12);
  if (pitchRate !== undefined) config.pitch_rate = pitchRate;
  const enableSubtitle = readSeedAudioBoolean(values.enable_subtitle, "enable_subtitle");
  if (enableSubtitle !== undefined) config.enable_subtitle = enableSubtitle;
  return config;
}

function seedAudioWatermark(input: GenerateAudioOperationInput): SeedAudioWatermark | undefined {
  const values = input.parameterValues ?? {};
  const watermark: SeedAudioWatermark = {};
  const aigcWatermark = readSeedAudioBoolean(values.aigc_watermark, "aigc_watermark");
  if (aigcWatermark !== undefined) watermark.aigc_watermark = aigcWatermark;

  const metadata: SeedAudioWatermarkMetadata = {};
  const metadataEnabled = readSeedAudioBoolean(values.aigc_metadata_enable, "aigc_metadata_enable");
  if (metadataEnabled !== undefined) metadata.enable = metadataEnabled;
  const contentProducer = readSeedAudioText(values.aigc_metadata_content_producer, "aigc_metadata_content_producer");
  if (contentProducer) metadata.content_producer = contentProducer;
  const produceId = readSeedAudioText(values.aigc_metadata_produce_id, "aigc_metadata_produce_id");
  if (produceId) metadata.produce_id = produceId;
  const contentPropagator = readSeedAudioText(values.aigc_metadata_content_propagator, "aigc_metadata_content_propagator");
  if (contentPropagator) metadata.content_propagator = contentPropagator;
  const propagateId = readSeedAudioText(values.aigc_metadata_propagate_id, "aigc_metadata_propagate_id");
  if (propagateId) metadata.propagate_id = propagateId;
  if (Object.keys(metadata).length > 0) watermark.aigc_metadata = metadata;

  return Object.keys(watermark).length > 0 ? watermark : undefined;
}

function readSeedAudioSampleRate(value: unknown): SeedAudioSampleRate | undefined {
  if (value === undefined) return undefined;
  const rate = typeof value === "string" ? Number(value) : value;
  if (typeof rate === "number" && isSeedAudioSampleRate(rate)) return rate;
  throw new Error("Seed Audio sample_rate must be 8000, 16000, 24000, 32000, 44100, or 48000");
}

function isSeedAudioSampleRate(value: number): value is SeedAudioSampleRate {
  return SEED_AUDIO_SUPPORTED_SAMPLE_RATES.some(item => item === value);
}

function readSeedAudioNumber(value: unknown, field: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Seed Audio ${field} must be a number from ${min} to ${max}`);
  }
  return value;
}

function readSeedAudioBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  throw new Error(`Seed Audio ${field} must be a boolean`);
}

function readSeedAudioText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`Seed Audio ${field} must be a string`);
  return value.trim() || undefined;
}

function base64ByteLength(base64: string): number {
  const normalized = base64.replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
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
