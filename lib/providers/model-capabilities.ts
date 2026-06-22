import { t } from "@/lib/i18n-core";
import { mediaReferenceLabel, type MediaReferenceType } from "../media-references";

export type ModelParameterGroup = "core" | "references" | "advanced" | "provider";
export type ModelParameterKind = "number" | "boolean" | "enum" | "text" | "reference";
export type ModelReferenceRole =
  | "content"
  | "style"
  | "object"
  | "firstFrame"
  | "lastFrame"
  | "reference"
  | "voice"
  | "audioGuide"
  | "multimodal";
export type ModelParameterScalarValue = string | number | boolean;
export type ModelParameterValue =
  | ModelParameterScalarValue
  | ModelReferenceParameterValue[]
  | undefined;
export type ModelParameterValues = Record<string, ModelParameterValue>;
export type ModelReferenceDelivery = "rawDataUri" | "uploadedUrl" | "fileName" | "openAiMultipart" | "providerNative";
export type ModelPricingUnit = "request" | "second" | "token" | "credit";
export type ModelPricingSource = "reviewedSnapshot" | "manualProvisional" | "providerRuntime";
export type ModelPricingStatus = "priced" | "unpriced";
export type ModelPricingUnavailableReason = "unverified" | "notApplicable" | "providerRuntime";
export type ModelPricingDimensionCalculation = "multiplyBySeconds";
export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface ModelReferenceParameterValue {
  url: string;
  type: MediaReferenceType;
  role?: string;
}

interface ModelParameterDescriptorBase {
  key: string;
  kind: ModelParameterKind;
  label: string;
  group: ModelParameterGroup;
  providerField?: string;
  required?: boolean;
  affectsPricing?: boolean;
  ui?: {
    compactLabel?: string;
    control?: "slider" | "toggle" | "segmented" | "select" | "input" | "textarea" | "referenceSlot";
  };
}

export interface ModelNumberParameterDescriptor extends ModelParameterDescriptorBase {
  kind: "number";
  defaultValue: number;
  min: number;
  max: number;
  step: number;
}

export interface ModelBooleanParameterDescriptor extends ModelParameterDescriptorBase {
  kind: "boolean";
  defaultValue: boolean;
}

export interface ModelEnumParameterDescriptor extends ModelParameterDescriptorBase {
  kind: "enum";
  defaultValue?: string;
  options: readonly { value: string; label: string }[];
}

export interface ModelTextParameterDescriptor extends ModelParameterDescriptorBase {
  kind: "text";
  defaultValue?: string;
  maxLength?: number;
}

export interface ModelReferenceParameterDescriptor extends ModelParameterDescriptorBase {
  kind: "reference";
  delivery: ModelReferenceDelivery;
  mediaTypes: readonly MediaReferenceType[];
  minCount: number;
  maxCount: number;
  role: ModelReferenceRole;
}

export type ModelParameterDescriptor =
  | ModelNumberParameterDescriptor
  | ModelBooleanParameterDescriptor
  | ModelEnumParameterDescriptor
  | ModelTextParameterDescriptor
  | ModelReferenceParameterDescriptor;

export interface ModelInputModalityProfile {
  text?: {
    required: boolean;
    maxLength?: number;
    promptField?: string;
  };
  images?: ModelMediaInputProfile;
  videos?: ModelMediaInputProfile;
  audio?: ModelMediaInputProfile;
  mixed?: {
    maxTotalCount?: number;
    allowedCombinations?: readonly string[];
  };
}

export interface ModelMediaInputProfile {
  minCount: number;
  maxCount: number;
  roles?: readonly ModelReferenceRole[];
  acceptedMimeTypes?: readonly string[];
  delivery: ModelReferenceDelivery;
}

export interface ModelPricingDimensionDescriptor {
  key: string;
  calculation?: ModelPricingDimensionCalculation;
  routeToModel?: boolean;
}

export interface ModelPricingOverrideDescriptor {
  match: readonly {
    dimension: string;
    value: string;
  }[];
  price?: number;
  dimensionPrices?: {
    dimension: string;
    values: readonly {
      value: string;
      price: number;
    }[];
  };
}

export interface ModelPricedProfile {
  status: "priced";
  lookupKey: string;
  price: number;
  unit: ModelPricingUnit;
  displayUnit: string;
  dimensions: readonly ModelPricingDimensionDescriptor[];
  overrides?: readonly ModelPricingOverrideDescriptor[];
  source: ModelPricingSource;
}

export interface ModelUnpricedProfile {
  status: "unpriced";
  reason: ModelPricingUnavailableReason;
  source?: ModelPricingSource;
}

export type ModelPricingProfile = ModelPricedProfile | ModelUnpricedProfile;

export interface ProviderPayloadFieldMappingDescriptor {
  target: string;
  source:
    | "prompt"
    | "aspectRatio"
    | "imageResolution"
    | "imageQuality"
    | "resolutionName"
    | "durationSeconds"
    | "referenceUrls"
    | "imageUrls"
    | "videoUrls"
    | "audioUrls"
    | "literal";
  valueType?: "string" | "number" | "boolean" | "array" | "object";
  literal?: JsonValue;
  defaultValue?: string | number | boolean;
  omitAuto?: boolean;
  allowedValues?: readonly string[];
  index?: number;
  dimensionAxis?: "width" | "height";
  durationValueType?: "string" | "number";
}

export interface ProviderPayloadMappingDescriptor {
  provider: string;
  endpoint: string;
  operation:
    | "promptDimensions"
    | "singleReference"
    | "referenceArray"
    | "groupedReferences"
    | "firstLastFrames"
    | "nodeFields"
    | "providerSpecific";
  fields: readonly ProviderPayloadFieldMappingDescriptor[];
  logic?: readonly ("durationCoercion" | "dimensionDerivation" | "referenceRouting" | "mediaUpload")[];
  referenceRoutes?: {
    imageToImage?: string;
    imageToVideo?: string;
    firstLast?: string;
    reference?: string;
  };
}

export class ModelCapabilityValidationError extends Error {}

export function pricedModel(
  input: Omit<ModelPricedProfile, "status">,
): ModelPricingProfile {
  return { status: "priced", ...input };
}

export function unpricedModel(reason: ModelPricingUnavailableReason, source?: ModelPricingSource): ModelPricingProfile {
  return source ? { status: "unpriced", reason, source } : { status: "unpriced", reason };
}

export function modelHasKnownPricing(profile: ModelPricingProfile): profile is ModelPricedProfile {
  return profile.status === "priced";
}

export function referenceParameterDescriptors(
  descriptors: readonly ModelParameterDescriptor[],
): ModelReferenceParameterDescriptor[] {
  return descriptors.filter((descriptor): descriptor is ModelReferenceParameterDescriptor => descriptor.kind === "reference");
}

export function inputModalitiesReferenceMediaTypes(profile: ModelInputModalityProfile): MediaReferenceType[] {
  const types: MediaReferenceType[] = [];
  if (profile.images) types.push("image");
  if (profile.videos) types.push("video");
  if (profile.audio) types.push("audio");
  return types;
}

export function inputModalitiesReferenceCountRange(profile: ModelInputModalityProfile): {
  minCount: number;
  maxCount: number;
} {
  const mediaProfiles = [profile.images, profile.videos, profile.audio].filter(
    (item): item is ModelMediaInputProfile => item !== undefined,
  );
  if (mediaProfiles.length === 0) return { minCount: 0, maxCount: 0 };
  return {
    minCount: mediaProfiles.reduce((total, item) => total + item.minCount, 0),
    maxCount: profile.mixed?.maxTotalCount ?? mediaProfiles.reduce((total, item) => total + item.maxCount, 0),
  };
}

export function validateInputModalityReferences(
  profile: ModelInputModalityProfile,
  references: readonly { type: MediaReferenceType }[],
): void {
  const acceptedTypes = inputModalitiesReferenceMediaTypes(profile);
  const unsupported = references.find(reference => !acceptedTypes.includes(reference.type));
  if (unsupported) throw new ModelCapabilityValidationError(t("common.notices.currentInputNotSupportMediaReference", { type: mediaReferenceLabel(unsupported.type) }));

  const range = inputModalitiesReferenceCountRange(profile);
  if (references.length < range.minCount) {
    throw new ModelCapabilityValidationError(t("common.notices.imageModelNeedMinReferences", { min: range.minCount }));
  }
  if (references.length > range.maxCount) {
    throw new ModelCapabilityValidationError(t("common.notices.currentModelReferenceRange", { min: range.minCount, max: range.maxCount }));
  }

  validateInputModalityTypeCount("image", profile.images, references, profile.mixed !== undefined);
  validateInputModalityTypeCount("video", profile.videos, references, profile.mixed !== undefined);
  validateInputModalityTypeCount("audio", profile.audio, references, profile.mixed !== undefined);
}

export function defaultCapabilityParameterValues(
  descriptors: readonly ModelParameterDescriptor[],
): ModelParameterValues {
  const values: ModelParameterValues = {};
  for (const descriptor of descriptors) {
    if (descriptor.kind === "number" || descriptor.kind === "boolean") {
      values[descriptor.key] = descriptor.defaultValue;
    } else if ((descriptor.kind === "enum" || descriptor.kind === "text") && descriptor.defaultValue !== undefined) {
      values[descriptor.key] = descriptor.defaultValue;
    }
  }
  return values;
}

export function pruneCapabilityParameterValues(
  descriptors: readonly ModelParameterDescriptor[],
  values: ModelParameterValues,
): ModelParameterValues {
  const allowedKeys = new Set(descriptors.map(descriptor => descriptor.key));
  const next: ModelParameterValues = {};
  for (const [key, value] of Object.entries(values)) {
    if (allowedKeys.has(key) && value !== undefined) next[key] = value;
  }
  return next;
}

export function validateCapabilityParameterValues(
  descriptors: readonly ModelParameterDescriptor[],
  values: ModelParameterValues,
): ModelParameterValues {
  const descriptorByKey = new Map(descriptors.map(descriptor => [descriptor.key, descriptor]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (!descriptorByKey.has(key)) throw new ModelCapabilityValidationError(`${key} is not supported by this model`);
  }

  const validated: ModelParameterValues = {};
  for (const descriptor of descriptors) {
    const value = values[descriptor.key];
    if (value === undefined) {
      if (descriptor.required === true) throw new ModelCapabilityValidationError(`${descriptor.key} is required`);
      continue;
    }
    validated[descriptor.key] = validateCapabilityParameterValue(descriptor, value);
  }
  return validated;
}

function validateCapabilityParameterValue(
  descriptor: ModelParameterDescriptor,
  value: Exclude<ModelParameterValue, undefined>,
): Exclude<ModelParameterValue, undefined> {
  if (descriptor.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < descriptor.min || value > descriptor.max) {
      throw new ModelCapabilityValidationError(`${descriptor.key} must be a number from ${descriptor.min} to ${descriptor.max}`);
    }
    return value;
  }
  if (descriptor.kind === "boolean") {
    if (typeof value !== "boolean") throw new ModelCapabilityValidationError(`${descriptor.key} must be a boolean`);
    return value;
  }
  if (descriptor.kind === "enum") {
    if (typeof value !== "string" || !descriptor.options.some(option => option.value === value)) {
      throw new ModelCapabilityValidationError(`${descriptor.key} must be one of the declared options`);
    }
    return value;
  }
  if (descriptor.kind === "text") {
    if (typeof value !== "string") throw new ModelCapabilityValidationError(`${descriptor.key} must be a string`);
    if (descriptor.maxLength !== undefined && value.length > descriptor.maxLength) {
      throw new ModelCapabilityValidationError(`${descriptor.key} exceeds ${descriptor.maxLength} characters`);
    }
    return value;
  }
  if (!Array.isArray(value)) throw new ModelCapabilityValidationError(`${descriptor.key} must be a reference array`);
  if (value.length < descriptor.minCount || value.length > descriptor.maxCount) {
    throw new ModelCapabilityValidationError(`${descriptor.key} must contain ${descriptor.minCount}-${descriptor.maxCount} references`);
  }
  for (const item of value) {
    if (!isReferenceParameterValue(item)) throw new ModelCapabilityValidationError(`${descriptor.key} contains an invalid reference`);
    if (!descriptor.mediaTypes.includes(item.type)) {
      throw new ModelCapabilityValidationError(`${descriptor.key} does not support ${item.type} references`);
    }
  }
  return value;
}

function isReferenceParameterValue(value: unknown): value is ModelReferenceParameterValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.url === "string" &&
    (record.type === "image" || record.type === "video" || record.type === "audio") &&
    (record.role === undefined || typeof record.role === "string");
}

function validateInputModalityTypeCount(
  type: MediaReferenceType,
  profile: ModelMediaInputProfile | undefined,
  references: readonly { type: MediaReferenceType }[],
  mixed: boolean,
): void {
  if (!profile) return;
  const count = references.filter(reference => reference.type === type).length;
  const minCount = mixed ? 0 : profile.minCount;
  if (count < minCount || count > profile.maxCount) {
    throw new ModelCapabilityValidationError(t("common.notices.imageModelMaxReferences", { max: profile.maxCount }));
  }
}
