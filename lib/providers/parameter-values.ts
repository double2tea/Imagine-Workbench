import {
  ModelCapabilityValidationError,
  type ModelParameterValue,
  type ModelParameterValues,
} from "./model-capabilities";

export function readModelParameterValues(value: unknown): ModelParameterValues {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ModelCapabilityValidationError("parameterValues must be an object");
  }

  const values: ModelParameterValues = {};
  for (const [key, item] of Object.entries(value)) {
    if (!isModelParameterValue(item)) {
      throw new ModelCapabilityValidationError(`${key} contains an invalid parameter value`);
    }
    values[key] = item;
  }
  return values;
}

function isModelParameterValue(value: unknown): value is ModelParameterValue {
  if (value === undefined) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  if (!Array.isArray(value)) return false;
  return value.every(isModelReferenceParameterValue);
}

function isModelReferenceParameterValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.url === "string" &&
    (record.type === "image" || record.type === "video" || record.type === "audio") &&
    (record.role === undefined || typeof record.role === "string");
}
