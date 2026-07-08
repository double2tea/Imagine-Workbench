import {
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  normalizeProviderModelValue,
} from "@/lib/providers/model-catalog";

export type GenerationModelKind = "image" | "video" | "audio";

const DEFAULT_GENERATION_MODEL_STORAGE_KEYS: Record<GenerationModelKind, string> = {
  audio: "imagine_default_audio_model",
  image: "imagine_default_image_model",
  video: "imagine_default_video_model",
};

const FALLBACK_GENERATION_MODELS: Record<GenerationModelKind, string> = {
  audio: DEFAULT_AUDIO_MODEL,
  image: DEFAULT_IMAGE_MODEL,
  video: DEFAULT_VIDEO_MODEL,
};

export function readDefaultGenerationModel(kind: GenerationModelKind): string {
  if (typeof window === "undefined") return FALLBACK_GENERATION_MODELS[kind];
  const stored = window.localStorage.getItem(DEFAULT_GENERATION_MODEL_STORAGE_KEYS[kind]);
  return normalizeGenerationModel(kind, stored?.trim() || FALLBACK_GENERATION_MODELS[kind]);
}

export function persistDefaultGenerationModel(kind: GenerationModelKind, model: string): void {
  window.localStorage.setItem(DEFAULT_GENERATION_MODEL_STORAGE_KEYS[kind], normalizeGenerationModel(kind, model));
}

function normalizeGenerationModel(kind: GenerationModelKind, model: string): string {
  return kind === "audio" ? normalizeProviderModelValue(model) : model;
}
