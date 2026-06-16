import type {
  RunningHubTaskBindingDelivery,
  RunningHubTaskBindingSource,
  RunningHubTaskBindingValueType,
  RunningHubTaskNodeBinding,
} from "./types";
import { getRunningHubAppPreset } from "./runninghub";
import { optionalText } from "./utils";

export type RunningHubNodeInfoListSource = "explicit" | "preset" | "none";

export interface RunningHubResolvedNodeInfoList {
  nodeInfoList: RunningHubTaskNodeBinding[] | undefined;
  promptRequired: boolean | undefined;
  source: RunningHubNodeInfoListSource;
}

export function readRunningHubNodeInfoList(value: unknown): RunningHubTaskNodeBinding[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(readRunningHubNodeInfoBinding).filter((binding): binding is RunningHubTaskNodeBinding => binding !== null);
}

export function resolveRunningHubNodeInfoListForModel(
  model: string,
  explicitNodeInfoList: RunningHubTaskNodeBinding[] | undefined,
): RunningHubResolvedNodeInfoList {
  const preset = getRunningHubAppPreset(model);
  if (explicitNodeInfoList !== undefined && explicitNodeInfoList.length > 0) {
    return {
      nodeInfoList: explicitNodeInfoList.map(binding => ({ ...binding })),
      promptRequired: preset?.promptRequired,
      source: "explicit",
    };
  }
  if (preset) {
    return {
      nodeInfoList: preset.nodeInfoList.map(binding => ({ ...binding })),
      promptRequired: preset.promptRequired,
      source: "preset",
    };
  }
  if (explicitNodeInfoList !== undefined) {
    return {
      nodeInfoList: [],
      promptRequired: undefined,
      source: "explicit",
    };
  }
  return {
    nodeInfoList: undefined,
    promptRequired: undefined,
    source: "none",
  };
}

export function runningHubResolvedNodeInfoAllowsEmptyPrompt(
  model: string,
  mediaKind: "image" | "video" | "audio",
  resolution: RunningHubResolvedNodeInfoList,
): boolean {
  if (resolution.promptRequired !== undefined) return !resolution.promptRequired;
  return resolution.source === "explicit" && isRunningHubTaskTarget(model, mediaKind);
}

export function hasRunningHubPresetNodeInfoList(model: string): boolean {
  return runningHubPresetNodeInfoList(model).length > 0;
}

export function runningHubPresetNodeInfoList(model: string): RunningHubTaskNodeBinding[] {
  const preset = getRunningHubAppPreset(model);
  return preset ? preset.nodeInfoList.map(binding => ({ ...binding })) : [];
}

function readRunningHubNodeInfoBinding(value: unknown): RunningHubTaskNodeBinding | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const nodeId = optionalText(record.nodeId);
  const fieldName = optionalText(record.fieldName);
  if (!nodeId || !fieldName) return null;
  return {
    nodeId,
    fieldName,
    label: optionalText(record.label),
    source: readBindingSource(record.source),
    value: optionalText(record.value),
    valueType: readBindingValueType(record.valueType),
    enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
    required: typeof record.required === "boolean" ? record.required : undefined,
    referenceIndex: readReferenceIndex(record.referenceIndex),
    referenceType: record.referenceType === "video" || record.referenceType === "audio" ? record.referenceType : "image",
    deliveryMode: readBindingDelivery(record.deliveryMode),
  };
}

function readBindingSource(value: unknown): RunningHubTaskBindingSource {
  if (value === "prompt" || value === "reference" || value === "randomSeed") return value;
  return "literal";
}

function readBindingValueType(value: unknown): RunningHubTaskBindingValueType | undefined {
  if (
    value === "text" ||
    value === "number" ||
    value === "boolean" ||
    value === "image" ||
    value === "video" ||
    value === "audio" ||
    value === "raw"
  ) {
    return value;
  }
  return undefined;
}

function readBindingDelivery(value: unknown): RunningHubTaskBindingDelivery {
  if (value === "url" || value === "fileName") return value;
  return "raw";
}

function readReferenceIndex(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

export function isRunningHubTaskTarget(model: string, mediaKind: "image" | "video" | "audio"): boolean {
  const normalizedModel = model.startsWith("runninghub:") ? model.slice("runninghub:".length) : model;
  return normalizedModel.startsWith(`ai-app-${mediaKind}:`) || normalizedModel.startsWith(`workflow-${mediaKind}:`);
}
