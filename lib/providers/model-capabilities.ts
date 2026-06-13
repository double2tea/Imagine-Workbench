import type { MediaReferenceType } from "@/lib/media-references";

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

export interface ModelPricingProfile {
  lookupKey: string;
  unit: "request" | "second" | "token" | "credit";
  dimensions: readonly {
    key: string;
    calculation?: "multiplyBySeconds";
    routeToModel?: boolean;
  }[];
  source: "reviewedSnapshot" | "manualProvisional" | "providerRuntime";
}

export class ModelCapabilityValidationError extends Error {}

export function referenceParameterDescriptors(
  descriptors: readonly ModelParameterDescriptor[],
): ModelReferenceParameterDescriptor[] {
  return descriptors.filter((descriptor): descriptor is ModelReferenceParameterDescriptor => descriptor.kind === "reference");
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
