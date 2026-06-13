import { runningHubYouchuanParameterDescriptors } from "../runninghub-youchuan";
import { unpricedModel, type ModelInputModalityProfile, type ModelParameterDescriptor, type ModelPricingProfile } from "../model-capabilities";
import type { ModelCapabilityCatalogDocument, ModelCapabilityCatalogEntry, ParameterOption } from "../model-catalog";
import { RUNNINGHUB_STANDARD_OPTION_PROFILES } from "./runninghub-standard-option-profiles";
import { RUNNINGHUB_STANDARD_PRICING } from "./runninghub-standard-pricing";
import {
  RUNNINGHUB_STANDARD_MODELS,
  runningHubStandardPayloadMappingSource,
  type RunningHubStandardModelSource,
} from "./runninghub-standard-source";

const GENERATED_SOURCE = "runninghub-standard";

export interface GeneratedRunningHubCatalogEntry extends ModelCapabilityCatalogEntry {
  generated: {
    source: typeof GENERATED_SOURCE;
  };
}

interface RunningHubOptionProfile {
  aspectRatios?: readonly ParameterOption[];
  durations?: readonly ParameterOption[];
  presets?: readonly ParameterOption[];
  qualityLevels?: readonly ParameterOption[];
  resolutions?: readonly ParameterOption[];
  sizes?: readonly ParameterOption[];
}

export function generateRunningHubStandardCatalogEntries(): GeneratedRunningHubCatalogEntry[] {
  return RUNNINGHUB_STANDARD_MODELS.map(generateRunningHubStandardCatalogEntry);
}

export function generateModelCapabilityCatalog(
  catalog: ModelCapabilityCatalogDocument,
): ModelCapabilityCatalogDocument {
  const generatedByValue = new Map(generateRunningHubStandardCatalogEntries().map(entry => [entry.value, entry]));
  const emitted = new Set<string>();
  const entries = catalog.entries.flatMap(entry => {
    if (!isRunningHubStandardCatalogEntry(entry)) return [entry];
    const generated = generatedByValue.get(entry.value);
    if (!generated) return [];
    emitted.add(generated.value);
    return [generated];
  });
  for (const entry of generatedByValue.values()) {
    if (!emitted.has(entry.value)) entries.push(entry);
  }
  return {
    ...catalog,
    entries,
  };
}

export function isRunningHubStandardCatalogEntry(entry: ModelCapabilityCatalogEntry): boolean {
  return entry.provider === "runninghub" && entry.model.startsWith("api:/openapi/v2/");
}

function generateRunningHubStandardCatalogEntry(
  model: RunningHubStandardModelSource,
): GeneratedRunningHubCatalogEntry {
  if (model.kind === "image") return imageEntry(model);
  if (model.kind === "video") return videoEntry(model);
  return audioEntry(model);
}

function baseEntry(model: RunningHubStandardModelSource) {
  const pricingByModel: Record<string, ModelPricingProfile> = RUNNINGHUB_STANDARD_PRICING;
  return {
    generated: { source: GENERATED_SOURCE as typeof GENERATED_SOURCE },
    value: `runninghub:${model.model}`,
    label: model.label,
    provider: "runninghub",
    model: model.model,
    listed: model.listed,
    supportsAsync: false,
    supportsReferences: model.supportsReferences,
    inputModalities: runningHubInputModalities(model),
    parameterDescriptors: model.kind === "image" ? [...runningHubYouchuanParameterDescriptors(model.model)] : [],
    pricing: pricingByModel[model.model] ?? unpricedModel("unverified"),
    payloadMapping: runningHubStandardPayloadMappingSource(model),
    minReferenceImages: model.minReferenceImages,
    maxReferenceImages: model.maxReferenceImages,
    referenceMediaTypes: model.referenceMediaTypes ? [...model.referenceMediaTypes] : undefined,
  };
}

function imageEntry(model: RunningHubStandardModelSource): GeneratedRunningHubCatalogEntry {
  const profile = runningHubOptionProfile(model);
  return {
    ...baseEntry(model),
    kind: "image",
    aspectRatios: [...(profile.aspectRatios ?? [])],
    sizes: [...(profile.sizes ?? [])],
    thinkingLevels: [],
    qualityLevels: [...(profile.qualityLevels ?? [])],
    resolutions: [],
    durations: [],
    presets: [],
    audioModes: [],
    audioOutputKinds: [],
    videoReferenceMode: "none",
    videoReferenceModes: [],
  };
}

function videoEntry(model: RunningHubStandardModelSource): GeneratedRunningHubCatalogEntry {
  const profile = runningHubOptionProfile(model);
  return {
    ...baseEntry(model),
    kind: "video",
    aspectRatios: [],
    sizes: [...(profile.sizes ?? [])],
    thinkingLevels: [],
    qualityLevels: [],
    resolutions: [...(profile.resolutions ?? [])],
    durations: [...(profile.durations ?? [])],
    presets: [],
    audioModes: [],
    audioOutputKinds: [],
    videoReferenceMode: model.videoReferenceMode ?? (model.supportsReferences ? "reference" : "none"),
    videoReferenceModes: model.videoReferenceModes ? [...model.videoReferenceModes] : model.supportsReferences ? ["reference"] : [],
  };
}

function audioEntry(model: RunningHubStandardModelSource): GeneratedRunningHubCatalogEntry {
  const profile = runningHubOptionProfile(model);
  return {
    ...baseEntry(model),
    kind: "audio",
    aspectRatios: [],
    sizes: [],
    thinkingLevels: [],
    qualityLevels: [],
    resolutions: [],
    durations: [],
    presets: [...(profile.presets ?? [])],
    audioModes: [...(model.audioModes ?? ["tts"])],
    audioOutputKinds: ["audio"],
    audioDefaultMode: model.audioModes?.[0] ?? "tts",
    videoReferenceMode: "none",
    videoReferenceModes: [],
  };
}

function runningHubOptionProfile(model: RunningHubStandardModelSource): RunningHubOptionProfile {
  const profiles: Record<string, RunningHubOptionProfile> = RUNNINGHUB_STANDARD_OPTION_PROFILES;
  const profile = profiles[model.model];
  if (!profile) throw new Error(`RunningHub Standard option profile is missing for ${model.model}`);
  return profile;
}

function runningHubInputModalities(model: RunningHubStandardModelSource): ModelInputModalityProfile {
  if (!model.supportsReferences) return { text: { required: true } };
  if (model.kind === "image") {
    return {
      text: { required: true },
      images: { minCount: model.minReferenceImages, maxCount: model.maxReferenceImages, roles: ["content", "style", "object"], delivery: "uploadedUrl" },
    };
  }
  const referenceMediaTypes = model.referenceMediaTypes ?? (model.kind === "audio" ? [] : ["image"]);
  const imageCounts = model.referenceCounts?.images ?? { minCount: model.minReferenceImages, maxCount: model.maxReferenceImages };
  const videoCounts = model.referenceCounts?.videos ?? {
    minCount: !referenceMediaTypes.includes("image") && referenceMediaTypes.includes("video") ? model.minReferenceImages : 0,
    maxCount: model.maxReferenceImages,
  };
  const audioCounts = model.referenceCounts?.audio ?? {
    minCount: !referenceMediaTypes.includes("image") && !referenceMediaTypes.includes("video") && referenceMediaTypes.includes("audio") ? model.minReferenceImages : 0,
    maxCount: model.maxReferenceImages,
  };
  return {
    text: { required: true },
    images: referenceMediaTypes.includes("image")
      ? {
          minCount: imageCounts.minCount,
          maxCount: imageCounts.maxCount,
          roles: model.videoReferenceMode === "firstLast" ? ["firstFrame", "lastFrame"] : ["reference"],
          delivery: "uploadedUrl",
        }
      : undefined,
    videos: referenceMediaTypes.includes("video")
      ? { minCount: videoCounts.minCount, maxCount: videoCounts.maxCount, roles: ["reference"], delivery: "uploadedUrl" }
      : undefined,
    audio: referenceMediaTypes.includes("audio")
      ? { minCount: audioCounts.minCount, maxCount: audioCounts.maxCount, roles: model.kind === "audio" ? ["voice", "audioGuide"] : ["audioGuide"], delivery: "uploadedUrl" }
      : undefined,
    mixed: referenceMediaTypes.length > 1 ? { maxTotalCount: model.maxReferenceImages } : undefined,
  };
}

export function generatedRunningHubEntryCount(): number {
  return RUNNINGHUB_STANDARD_MODELS.length;
}

export function generatedRunningHubDescriptorCount(entries: readonly ModelCapabilityCatalogEntry[]): number {
  return entries.reduce((count, entry) => count + (entry.parameterDescriptors as readonly ModelParameterDescriptor[]).length, 0);
}
