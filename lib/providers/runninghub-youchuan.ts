import {
  defaultCapabilityParameterValues,
  pruneCapabilityParameterValues,
  validateCapabilityParameterValues,
  type ModelParameterDescriptor,
  type ModelParameterValues,
} from "./model-capabilities";
import type { RunningHubYouchuanAdvancedSettings } from "./types";

const RUNNINGHUB_PROVIDER_PREFIX = "runninghub:";
const RUNNINGHUB_YOUCHUAN_MODEL_MARKER = "/openapi/v2/youchuan/text-to-image";

export const RUNNINGHUB_YOUCHUAN_ADVANCED_DEFAULTS = {
  chaos: 0,
  stylize: 0,
  raw: false,
  iw: 1,
  sw: 100,
  hd: false,
} satisfies RunningHubYouchuanAdvancedSettings;

export type RunningHubYouchuanNumericField = Extract<keyof RunningHubYouchuanAdvancedSettings, "chaos" | "stylize" | "iw" | "sw" | "weird" | "ow">;
export type RunningHubYouchuanBooleanField = Extract<keyof RunningHubYouchuanAdvancedSettings, "raw" | "tile" | "hd">;
export type RunningHubYouchuanReferenceField = Extract<keyof RunningHubYouchuanAdvancedSettings, "sref" | "oref">;

export interface RunningHubYouchuanNumericParam {
  field: RunningHubYouchuanNumericField;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface RunningHubYouchuanBooleanParam {
  field: RunningHubYouchuanBooleanField;
  label: string;
  defaultValue: boolean;
}

export interface RunningHubYouchuanReferenceParam {
  field: RunningHubYouchuanReferenceField;
  label: string;
}

export interface RunningHubYouchuanCatalog {
  qualityValues: readonly string[];
  numericParams: readonly RunningHubYouchuanNumericParam[];
  booleanParams: readonly RunningHubYouchuanBooleanParam[];
  referenceParams: readonly RunningHubYouchuanReferenceParam[];
}

const RUNNINGHUB_YOUCHUAN_COMMON_NUMERIC_PARAMS = [
  { field: "chaos", label: "Chaos", min: 0, max: 100, step: 1, defaultValue: 0 },
  { field: "stylize", label: "Stylize", min: 0, max: 1000, step: 1, defaultValue: 0 },
  { field: "iw", label: "图像权重", min: 0, max: 3, step: 0.1, defaultValue: 1 },
  { field: "sw", label: "风格权重", min: 0, max: 1000, step: 1, defaultValue: 100 },
] as const satisfies readonly RunningHubYouchuanNumericParam[];

export const RUNNINGHUB_YOUCHUAN_ADVANCED_LIMITS = {
  chaos: { min: 0, max: 100, step: 1 },
  stylize: { min: 0, max: 1000, step: 1 },
  iw: { min: 0, max: 3, step: 0.1 },
  sw: { min: 0, max: 1000, step: 1 },
  weird: { min: 0, max: 3000, step: 1 },
  ow: { min: 1, max: 1000, step: 1 },
} as const satisfies Record<RunningHubYouchuanNumericField, { min: number; max: number; step: number }>;

const RUNNINGHUB_YOUCHUAN_CATALOGS = {
  v7: {
    qualityValues: ["1", "2", "4"],
    numericParams: [
      ...RUNNINGHUB_YOUCHUAN_COMMON_NUMERIC_PARAMS,
      { field: "weird", label: "Weird", min: 0, max: 3000, step: 1, defaultValue: 0 },
      { field: "ow", label: "对象权重", min: 1, max: 1000, step: 1, defaultValue: 100 },
    ],
    booleanParams: [
      { field: "raw", label: "Raw", defaultValue: false },
      { field: "tile", label: "Tile", defaultValue: false },
    ],
    referenceParams: [
      { field: "sref", label: "风格参考图" },
      { field: "oref", label: "对象参考图" },
    ],
  },
  v81: {
    qualityValues: ["1", "4"],
    numericParams: RUNNINGHUB_YOUCHUAN_COMMON_NUMERIC_PARAMS,
    booleanParams: [
      { field: "raw", label: "Raw", defaultValue: false },
      { field: "hd", label: "2K", defaultValue: false },
    ],
    referenceParams: [
      { field: "sref", label: "风格参考图" },
    ],
  },
} as const satisfies Record<string, RunningHubYouchuanCatalog>;

export function isRunningHubYouchuanImageModel(model: string): boolean {
  return normalizeRunningHubModel(model).includes(RUNNINGHUB_YOUCHUAN_MODEL_MARKER);
}

export function getRunningHubYouchuanCatalog(model: string): RunningHubYouchuanCatalog | undefined {
  const normalized = normalizeRunningHubModel(model);
  if (normalized.includes("/openapi/v2/youchuan/text-to-image-v7")) return RUNNINGHUB_YOUCHUAN_CATALOGS.v7;
  if (normalized.includes("/openapi/v2/youchuan/text-to-image-v81")) return RUNNINGHUB_YOUCHUAN_CATALOGS.v81;
  return undefined;
}

export function runningHubYouchuanSupportsHd(model: string): boolean {
  return getRunningHubYouchuanCatalog(model)?.booleanParams.some(param => param.field === "hd") === true;
}

export function runningHubYouchuanQualityValues(model: string): readonly string[] {
  return getRunningHubYouchuanCatalog(model)?.qualityValues ?? [];
}

export function runningHubYouchuanParameterDescriptors(model: string): readonly ModelParameterDescriptor[] {
  const catalog = getRunningHubYouchuanCatalog(model);
  if (!catalog) return [];
  return [
    ...catalog.numericParams.map(param => ({
      key: runningHubYouchuanDescriptorKey(param.field),
      kind: "number" as const,
      label: param.label,
      group: "advanced" as const,
      providerField: param.field,
      min: param.min,
      max: param.max,
      step: param.step,
      defaultValue: param.defaultValue,
      ui: { control: "slider" as const },
    })),
    ...catalog.booleanParams.map(param => ({
      key: runningHubYouchuanDescriptorKey(param.field),
      kind: "boolean" as const,
      label: param.label,
      group: "advanced" as const,
      providerField: param.field,
      defaultValue: param.defaultValue,
      ui: { control: "toggle" as const },
    })),
    ...catalog.referenceParams.map(param => ({
      key: runningHubYouchuanDescriptorKey(param.field),
      kind: "reference" as const,
      label: param.label,
      group: "references" as const,
      providerField: param.field,
      mediaTypes: ["image"] as const,
      minCount: 0,
      maxCount: 1,
      role: param.field === "sref" ? "style" as const : "object" as const,
      delivery: "uploadedUrl" as const,
      ui: { control: "referenceSlot" as const },
    })),
  ];
}

export function runningHubYouchuanSettingsToParameterValues(
  model: string,
  settings: RunningHubYouchuanAdvancedSettings | undefined,
): ModelParameterValues {
  const descriptors = runningHubYouchuanParameterDescriptors(model);
  const values = defaultCapabilityParameterValues(descriptors);
  if (!settings) return values;
  for (const descriptor of descriptors) {
    const field = runningHubYouchuanFieldFromDescriptorKey(descriptor.key);
    if (!field) continue;
    const value = settings[field];
    if (value === undefined) continue;
    if (descriptor.kind === "reference") {
      if (typeof value === "string" && value.length > 0) {
        values[descriptor.key] = [{ url: value, type: "image", role: descriptor.role }];
      }
      continue;
    }
    values[descriptor.key] = value;
  }
  return values;
}

export function runningHubYouchuanSettingsFromParameterValues(
  model: string,
  values: ModelParameterValues,
): RunningHubYouchuanAdvancedSettings | undefined {
  const descriptors = runningHubYouchuanParameterDescriptors(model);
  if (descriptors.length === 0) return undefined;
  const validated = validateCapabilityParameterValues(
    descriptors,
    pruneCapabilityParameterValues(descriptors, {
      ...defaultCapabilityParameterValues(descriptors),
      ...values,
    }),
  );
  const next: Partial<RunningHubYouchuanAdvancedSettings> = {};
  for (const descriptor of descriptors) {
    const field = runningHubYouchuanFieldFromDescriptorKey(descriptor.key);
    if (!field) continue;
    const value = validated[descriptor.key];
    if (value === undefined) continue;
    if (descriptor.kind === "reference") {
      if (Array.isArray(value)) {
        const first = value[0];
        if (first?.url) Object.assign(next, { [field]: first.url });
      }
      continue;
    }
    if (descriptor.kind === "number" && typeof value === "number") {
      Object.assign(next, { [field]: value });
    }
    if (descriptor.kind === "boolean" && typeof value === "boolean") {
      Object.assign(next, { [field]: value });
    }
  }
  if (
    typeof next.chaos !== "number" ||
    typeof next.stylize !== "number" ||
    typeof next.raw !== "boolean" ||
    typeof next.iw !== "number" ||
    typeof next.sw !== "number"
  ) {
    throw new Error("RunningHub Youchuan required parameters are missing");
  }
  return next as RunningHubYouchuanAdvancedSettings;
}

export function normalizeRunningHubYouchuanSettingsForModel(
  model: string,
  settings: RunningHubYouchuanAdvancedSettings,
): RunningHubYouchuanAdvancedSettings {
  return runningHubYouchuanSettingsFromParameterValues(
    model,
    runningHubYouchuanSettingsToParameterValues(model, settings),
  ) ?? settings;
}

function runningHubYouchuanDescriptorKey(field: keyof RunningHubYouchuanAdvancedSettings): string {
  return `runninghub.youchuan.${field}`;
}

function runningHubYouchuanFieldFromDescriptorKey(key: string): keyof RunningHubYouchuanAdvancedSettings | undefined {
  if (!key.startsWith("runninghub.youchuan.")) return undefined;
  const field = key.slice("runninghub.youchuan.".length);
  if (
    field === "chaos" ||
    field === "stylize" ||
    field === "raw" ||
    field === "iw" ||
    field === "sw" ||
    field === "weird" ||
    field === "tile" ||
    field === "sref" ||
    field === "oref" ||
    field === "ow" ||
    field === "hd"
  ) {
    return field;
  }
  return undefined;
}

function normalizeRunningHubModel(model: string): string {
  return model.startsWith(RUNNINGHUB_PROVIDER_PREFIX)
    ? model.slice(RUNNINGHUB_PROVIDER_PREFIX.length)
    : model;
}
