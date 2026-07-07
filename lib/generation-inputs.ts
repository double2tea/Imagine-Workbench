import type {
  GenerationReferenceMediaSnapshot,
  GenerationRequestSnapshot,
} from "./db";
import { getGenerationReferenceMedia } from "./db";
import type { CinematicProfile } from "./cinematic-controls";
import type {
  MediaReferenceRole,
  MediaReferenceType,
} from "./media-references";
import type {
  ModelKind,
  VideoReferenceMode,
} from "./providers/model-catalog";
import type { ModelParameterValues } from "./providers/model-capabilities";
import {
  getModelCapability,
  MODEL_CAPABILITY_CATALOG_VERSION,
} from "./providers/model-catalog";
import type { AiProvider } from "./providers/registry";
import type { CalculatedModelPrice } from "./providers/pricing";
import {
  buildGenerationModelPriceOptions,
  calculateModelPrice,
} from "./providers/pricing";
import type {
  RunningHubTaskNodeBinding,
  RunningHubYouchuanAdvancedSettings,
} from "./providers/types";
import type { PromptTemplate } from "./prompt-templates";
import type { GenerationTaskSourceSurface } from "./generation-tasks";

export type GenerationInputKind = Exclude<ModelKind, "chat">;

export interface GenerationInputPromptTemplate {
  id: string;
  category: PromptTemplate["category"];
  title: string;
  negativePrompt?: string;
}

export interface GenerationInputPrompt {
  text: string;
  template?: GenerationInputPromptTemplate;
}

export interface GenerationInputSource {
  surface: GenerationTaskSourceSurface;
  boardId?: string;
  boardNodeId?: string;
  resultStackKey?: string;
}

export interface GenerationInputReference {
  url: string;
  type: MediaReferenceType;
  role?: MediaReferenceRole;
  sourceAssetId?: string;
  sourceBoardNodeId?: string;
}

export interface GenerationInputMask {
  originalUrl: string;
  maskUrl?: string;
  operation?: string;
}

export interface GenerationInputModelControls {
  aspectRatio?: string;
  imageResolution?: string;
  imageQuality?: string;
  thinkingLevel?: string;
  cinematicProfile?: CinematicProfile;
  videoDurationSeconds?: string;
  videoPreset?: string;
  videoReferenceMode?: Extract<VideoReferenceMode, "reference" | "firstLast">;
  videoResolution?: string;
  audioFormat?: string;
  audioMode?: GenerationRequestSnapshot["audioMode"];
  parameterValues?: ModelParameterValues;
  audioStylePrompt?: string;
  asrLanguage?: GenerationRequestSnapshot["asrLanguage"];
  optimizeTextPreview?: boolean;
  voiceProfileId?: string;
}

export interface GenerationInputProviderSettings {
  runningHubAccessPasswordPresent?: boolean;
  runningHubNodeInfoList?: RunningHubTaskNodeBinding[];
  runningHubYouchuan?: RunningHubYouchuanAdvancedSettings;
}

export interface GenerationInputPricingHint {
  price: number;
  unit: string;
  totalPrice: number;
  isCalculated: boolean;
  detail?: string;
}

export interface GenerationInputSnapshot {
  version: 1;
  capabilityCatalogVersion: string;
  kind: GenerationInputKind;
  provider: AiProvider;
  model: string;
  modelValue: string;
  prompt: GenerationInputPrompt;
  source: GenerationInputSource;
  references: GenerationInputReference[];
  modelControls: GenerationInputModelControls;
  providerSettings?: GenerationInputProviderSettings;
  mask?: GenerationInputMask;
  pricing?: GenerationInputPricingHint;
}

export interface CreateGenerationInputSnapshotInput {
  kind: GenerationInputKind;
  model: string;
  prompt: GenerationInputPrompt;
  source: GenerationInputSource;
  references?: readonly GenerationInputReference[];
  modelControls?: GenerationInputModelControls;
  providerSettings?: GenerationInputProviderSettings;
  mask?: GenerationInputMask;
  pricing?: GenerationInputPricingHint;
}

export interface GenerationInputSnapshotFromRequestInput {
  kind: GenerationInputKind;
  request: GenerationRequestSnapshot;
  source: GenerationInputSource;
  promptTemplate?: PromptTemplate;
  mask?: GenerationInputMask;
}

export function generationInputSnapshotFromRequest(
  input: GenerationInputSnapshotFromRequestInput,
): GenerationInputSnapshot {
  const references = getGenerationReferenceMedia(input.request).map(generationInputReferenceFromRequest);
  const modelControls = generationInputModelControlsFromRequest(input.request);
  return createGenerationInputSnapshot({
    kind: input.kind,
    model: input.request.model,
    prompt: {
      text: input.request.prompt,
      ...(input.promptTemplate ? { template: generationInputPromptTemplate(input.promptTemplate) } : {}),
    },
    source: input.source,
    references,
    modelControls,
    providerSettings: generationInputProviderSettingsFromRequest(input.request),
    mask: input.mask,
    pricing: generationInputPricingHintFromRequest(input.kind, input.request, references),
  });
}

export function createGenerationInputSnapshot(
  input: CreateGenerationInputSnapshotInput,
): GenerationInputSnapshot {
  const capability = getModelCapability(input.model, input.kind);
  return {
    version: 1,
    capabilityCatalogVersion: MODEL_CAPABILITY_CATALOG_VERSION,
    kind: input.kind,
    provider: capability.provider,
    model: capability.model,
    modelValue: capability.value,
    prompt: input.prompt,
    source: input.source,
    references: [...(input.references ?? [])],
    modelControls: input.modelControls ?? {},
    ...(input.providerSettings ? { providerSettings: input.providerSettings } : {}),
    ...(input.mask ? { mask: input.mask } : {}),
    ...(input.pricing ? { pricing: input.pricing } : {}),
  };
}

export function generationInputModelControlsFromRequest(
  request: GenerationRequestSnapshot,
): GenerationInputModelControls {
  return {
    aspectRatio: request.aspectRatio,
    imageResolution: request.imageResolution,
    imageQuality: request.imageQuality,
    thinkingLevel: request.thinkingLevel,
    cinematicProfile: request.cinematicProfile,
    videoDurationSeconds: request.videoDurationSeconds,
    videoPreset: request.videoPreset,
    videoReferenceMode: request.videoReferenceMode,
    videoResolution: request.videoResolution,
    audioFormat: request.audioFormat,
    audioMode: request.audioMode,
    parameterValues: request.parameterValues,
    audioStylePrompt: request.audioStylePrompt,
    asrLanguage: request.asrLanguage,
    optimizeTextPreview: request.optimizeTextPreview,
    voiceProfileId: request.voiceProfileId,
  };
}

export function generationInputReferenceFromRequest(
  reference: GenerationReferenceMediaSnapshot,
): GenerationInputReference {
  return {
    url: reference.url,
    type: reference.type,
    role: reference.role,
  };
}

export function generationInputProviderSettingsFromRequest(
  request: GenerationRequestSnapshot,
): GenerationInputProviderSettings | undefined {
  const settings: GenerationInputProviderSettings = {
    ...(request.runningHubAccessPassword ? { runningHubAccessPasswordPresent: true } : {}),
    ...(request.runningHubNodeInfoList ? { runningHubNodeInfoList: request.runningHubNodeInfoList } : {}),
    ...(request.runningHubYouchuan ? { runningHubYouchuan: request.runningHubYouchuan } : {}),
  };
  return Object.keys(settings).length > 0 ? settings : undefined;
}

export function generationInputPricingHintFromRequest(
  kind: GenerationInputKind,
  request: GenerationRequestSnapshot,
  references: readonly GenerationInputReference[] = getGenerationReferenceMedia(request).map(generationInputReferenceFromRequest),
): GenerationInputPricingHint | undefined {
  const capability = getModelCapability(request.model, kind);
  const price = calculateModelPrice(
    capability.provider,
    capability.model,
    buildGenerationModelPriceOptions({
      kind,
      duration: request.videoDurationSeconds,
      imageQuality: request.imageQuality,
      referenceTypes: references.map(reference => reference.type),
      resolution: request.imageResolution,
      thinkingLevel: request.thinkingLevel,
      videoReferenceMode: request.videoReferenceMode,
      videoResolution: request.videoResolution,
    }),
  );
  return price ? generationInputPricingHint(price) : undefined;
}

export function generationInputPricingHint(price: CalculatedModelPrice): GenerationInputPricingHint {
  return {
    price: price.price,
    unit: price.unit,
    totalPrice: price.totalPrice,
    isCalculated: price.isCalculated,
    ...(price.detail ? { detail: price.detail } : {}),
  };
}

function generationInputPromptTemplate(template: PromptTemplate): GenerationInputPromptTemplate {
  return {
    id: template.id,
    category: template.category,
    title: template.title,
    negativePrompt: template.negativePrompt,
  };
}
