import type {
  RunningHubTaskBindingDelivery,
  RunningHubTaskBindingSource,
  RunningHubTaskBindingValueType,
  RunningHubTaskNodeBinding,
} from "./types";
import { optionalText } from "./utils";

export function readRunningHubNodeInfoList(value: unknown): RunningHubTaskNodeBinding[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(readRunningHubNodeInfoBinding).filter((binding): binding is RunningHubTaskNodeBinding => binding !== null);
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
