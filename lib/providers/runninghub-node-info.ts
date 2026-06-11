import type {
  RunningHubTaskBindingDelivery,
  RunningHubTaskBindingSource,
  RunningHubTaskBindingValueType,
  RunningHubTaskNodeBinding,
} from "./types";
import { RUNNINGHUB_CONTROL_IMAGE_APP_MODEL } from "./runninghub";
import { optionalText } from "./utils";

const RUNNINGHUB_PROVIDER_PREFIX = "runninghub:";

export function readRunningHubNodeInfoList(value: unknown): RunningHubTaskNodeBinding[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(readRunningHubNodeInfoBinding).filter((binding): binding is RunningHubTaskNodeBinding => binding !== null);
}

export function hasRunningHubPresetNodeInfoList(model: string): boolean {
  return normalizedRunningHubModel(model) === RUNNINGHUB_CONTROL_IMAGE_APP_MODEL;
}

export function runningHubPresetNodeInfoList(model: string): RunningHubTaskNodeBinding[] {
  if (!hasRunningHubPresetNodeInfoList(model)) return [];
  return [
    {
      nodeId: "252",
      fieldName: "image",
      label: "Control image",
      source: "reference",
      valueType: "image",
      required: true,
      referenceIndex: 0,
      referenceType: "image",
      deliveryMode: "fileName",
    },
  ];
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

function normalizedRunningHubModel(model: string): string {
  return model.startsWith(RUNNINGHUB_PROVIDER_PREFIX)
    ? model.slice(RUNNINGHUB_PROVIDER_PREFIX.length)
    : model;
}
