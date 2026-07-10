import { t } from "@/lib/i18n-core";
import type {
  BoardAssetType,
  BoardRunningHubBindingDelivery,
  BoardRunningHubBindingOption,
  BoardRunningHubBindingSource,
  BoardRunningHubBindingValueType,
  BoardRunningHubNodeInfoBinding,
} from "./types";

export interface RunningHubBindingReadiness {
  draftCount: number;
  enabledCount: number;
  missingCount: number;
  requiredCount: number;
  referenceCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createRunningHubBindingId(): string {
  return `rh_bind_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createDefaultRunningHubBinding(): BoardRunningHubNodeInfoBinding {
  return {
    id: createRunningHubBindingId(),
    nodeId: "",
    fieldName: "",
    label: t("board.runninghub.bindings.newField"),
    source: "prompt",
    value: "",
    valueType: "text",
    enabled: true,
    required: false,
    deliveryMode: "raw",
  };
}

export function normalizePersistedRunningHubBindings(
  bindings: unknown[],
  createId: () => string = createRunningHubBindingId,
): BoardRunningHubNodeInfoBinding[] {
  return bindings.filter(isRecord).map(binding => ({
    id: optionalString(binding, "id") ?? createId(),
    nodeId: optionalString(binding, "nodeId") ?? "",
    nodeName: optionalString(binding, "nodeName"),
    fieldName: optionalString(binding, "fieldName") ?? "",
    fieldData: optionalString(binding, "fieldData"),
    description: optionalString(binding, "description"),
    descriptionEn: optionalString(binding, "descriptionEn"),
    label: optionalString(binding, "label"),
    source: readPersistedSource(binding.source),
    value: optionalString(binding, "value") ?? "",
    valueType: readPersistedValueType(binding.valueType),
    options: readPersistedOptions(binding.options),
    enabled: typeof binding.enabled === "boolean" ? binding.enabled : true,
    required: typeof binding.required === "boolean" ? binding.required : undefined,
    referenceIndex: typeof binding.referenceIndex === "number" && Number.isInteger(binding.referenceIndex) && binding.referenceIndex >= 0
      ? binding.referenceIndex
      : undefined,
    referenceType: binding.referenceType === "video" || binding.referenceType === "audio" ? binding.referenceType : "image",
    deliveryMode: readPersistedDelivery(binding.deliveryMode),
  }));
}

function readPersistedSource(value: unknown): BoardRunningHubBindingSource {
  return value === "prompt" || value === "reference" || value === "randomSeed" ? value : "literal";
}

function readPersistedDelivery(value: unknown): BoardRunningHubBindingDelivery {
  return value === "url" || value === "fileName" ? value : "raw";
}

function readPersistedValueType(value: unknown): BoardRunningHubBindingValueType | undefined {
  return value === "text" || value === "number" || value === "boolean" || value === "image" || value === "video" || value === "audio" || value === "raw"
    ? value
    : undefined;
}

function readPersistedOptions(value: unknown): BoardRunningHubBindingOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value.filter(isRecord).flatMap(option => {
    const optionValue = optionalString(option, "value");
    const label = optionalString(option, "label");
    return optionValue && label ? [{ label, value: optionValue, description: optionalString(option, "description") }] : [];
  });
  return options.length > 0 ? options : undefined;
}

export function analyzeRunningHubBindings(
  bindings: BoardRunningHubNodeInfoBinding[],
  prompt: string,
  referenceCount: number,
): RunningHubBindingReadiness {
  const active = bindings.filter(binding => binding.enabled !== false);
  const draftCount = active.filter(binding => !hasRunningHubBindingIdentity(binding)).length;
  const configured = active.filter(hasRunningHubBindingIdentity);
  const missingCount = configured.filter(binding => isRunningHubBindingMissing(binding, prompt, referenceCount)).length;
  return {
    draftCount,
    enabledCount: configured.length,
    missingCount,
    requiredCount: configured.filter(binding => binding.required === true).length,
    referenceCount: configured.filter(binding => binding.source === "reference").length,
  };
}

export function hasRunningHubBindingIdentity(binding: BoardRunningHubNodeInfoBinding): boolean {
  return binding.nodeId.trim().length > 0 && binding.fieldName.trim().length > 0;
}

export function isRunningHubBindingMissing(
  binding: BoardRunningHubNodeInfoBinding,
  prompt: string,
  referenceCount: number,
): boolean {
  if (binding.enabled === false) return false;
  if (!hasRunningHubBindingIdentity(binding)) return false;
  if (binding.source === "literal" && binding.required === true && !binding.value.trim()) return true;
  if (binding.source === "prompt" && binding.required === true && !prompt.trim()) return true;
  if (binding.source === "reference" && binding.required === true) {
    return (binding.referenceIndex ?? 0) >= referenceCount;
  }
  return false;
}

export function parseRunningHubBindingsFromJsonText(text: string): BoardRunningHubNodeInfoBinding[] {
  const parsed = parseRunningHubSourceText(text);
  const fields = readRunningHubFieldArray(parsed);
  if (!fields) throw new Error(t("board.runninghub.missingNodeInfoList"));
  const bindings = fields.map(readRunningHubBindingFromField).filter((binding): binding is BoardRunningHubNodeInfoBinding => binding !== null);
  if (bindings.length === 0) throw new Error(t("board.runninghub.fillRealId"));
  return bindings;
}

export function readRunningHubTargetIdFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/(?:ai-detail|workflow|webapp|webappId|workflowId)[/:=?#&]+(\d{12,})/i);
  if (urlMatch?.[1]) return urlMatch[1];
  const numberMatch = trimmed.match(/^\d{12,}$/);
  return numberMatch ? numberMatch[0] : null;
}

function parseRunningHubSourceText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const objects = extractJsonObjects(trimmed);
    for (const objectText of objects) {
      try {
        const parsed = JSON.parse(objectText) as unknown;
        if (readRunningHubFieldArray(parsed)) return parsed;
      } catch {
        // keep looking for a JSON object that actually contains fields
      }
    }
  }
  throw new Error(t("board.runninghub.fillRealWorkflowId"));
}

function readRunningHubFieldArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  if (Array.isArray(value.nodeInfoList)) return value.nodeInfoList;
  if (Array.isArray(value.fields)) return value.fields;
  if (isRecord(value.data)) return readRunningHubFieldArray(value.data);
  if (isRecord(value.config)) return readRunningHubFieldArray(value.config);
  return null;
}

function readRunningHubBindingFromField(value: unknown): BoardRunningHubNodeInfoBinding | null {
  if (!isRecord(value)) return null;
  const nodeId = optionalString(value, "nodeId");
  const fieldName = optionalString(value, "fieldName");
  if (!nodeId || !fieldName) return null;
  const valueType = readValueType(value, fieldName);
  const source = defaultSourceForField(value, fieldName, valueType);
  const options = readFieldOptions(value);
  const fieldValue = optionalString(value, "value") ?? optionalString(value, "fieldValue") ?? "";
  return {
    id: createRunningHubBindingId(),
    nodeId,
    nodeName: optionalString(value, "nodeName"),
    fieldName,
    fieldData: optionalString(value, "fieldData"),
    description: optionalString(value, "description"),
    descriptionEn: optionalString(value, "descriptionEn"),
    label: optionalString(value, "label") ?? optionalString(value, "title") ?? optionalString(value, "description") ?? fieldName,
    source,
    value: fieldValue || (options[0]?.value ?? ""),
    valueType,
    options: options.length > 0 ? options : undefined,
    enabled: value.enabled === false ? false : true,
    required: value.required === true || shouldRequireField(source, valueType, fieldValue),
    referenceIndex: source === "reference" ? readReferenceIndex(value) : undefined,
    referenceType: mediaTypeFromValueType(valueType),
    deliveryMode: defaultDeliveryForField(value, valueType),
  };
}

function readValueType(record: Record<string, unknown>, fieldName: string): BoardRunningHubBindingValueType {
  const rawType = (optionalString(record, "valueType") ?? optionalString(record, "fieldType") ?? "").toLowerCase();
  if (rawType === "image") return "image";
  if (rawType === "video") return "video";
  if (rawType === "audio") return "audio";
  if (rawType === "number" || rawType === "float" || rawType === "int" || rawType === "integer" || rawType === "slider") return "number";
  if (rawType === "boolean" || rawType === "bool") return "boolean";
  const name = fieldName.toLowerCase();
  if (/image|img|mask|png|jpg|jpeg|webp/.test(name)) return "image";
  if (/video|mp4|webm|mov/.test(name)) return "video";
  if (/audio|wav|mp3|voice|sound/.test(name)) return "audio";
  if (/seed|steps|width|height|count|number|cfg|scale|duration/.test(name)) return "number";
  return "text";
}

function defaultSourceForField(
  record: Record<string, unknown>,
  fieldName: string,
  valueType: BoardRunningHubBindingValueType,
): BoardRunningHubBindingSource {
  const rawSource = optionalString(record, "source");
  if (rawSource === "literal" || rawSource === "prompt" || rawSource === "reference" || rawSource === "randomSeed") return rawSource;
  if (valueType === "image" || valueType === "video" || valueType === "audio") return "reference";
  if (record.random_enabled === true || fieldName.toLowerCase() === "seed") return "randomSeed";
  const description = (optionalString(record, "description") ?? optionalString(record, "descriptionEn") ?? "").toLowerCase();
  if (/prompt|caption/.test(fieldName.toLowerCase()) || /提示词|文本|prompt|caption/.test(description)) return "prompt";
  return "literal";
}

function defaultDeliveryForField(
  record: Record<string, unknown>,
  valueType: BoardRunningHubBindingValueType,
): BoardRunningHubBindingDelivery {
  const rawDelivery = optionalString(record, "deliveryMode");
  if (rawDelivery === "url" || rawDelivery === "fileName" || rawDelivery === "raw") return rawDelivery;
  return valueType === "image" || valueType === "video" || valueType === "audio" ? "fileName" : "raw";
}

function readReferenceIndex(record: Record<string, unknown>): number | undefined {
  const value = record.referenceIndex ?? record.imageOrder;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function mediaTypeFromValueType(valueType: BoardRunningHubBindingValueType): BoardAssetType | undefined {
  if (valueType === "image" || valueType === "video" || valueType === "audio") return valueType;
  return undefined;
}

function shouldRequireField(source: BoardRunningHubBindingSource, valueType: BoardRunningHubBindingValueType, fieldValue: string): boolean {
  if (source === "reference") return true;
  if (source === "prompt" && !fieldValue.trim()) return true;
  return false;
}

function readFieldOptions(record: Record<string, unknown>): BoardRunningHubBindingOption[] {
  const fieldData = optionalString(record, "fieldData");
  if (!fieldData) return [];
  try {
    const parsed = JSON.parse(fieldData) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(readFieldOption).filter((option): option is BoardRunningHubBindingOption => option !== null);
  } catch {
    return [];
  }
}

function readFieldOption(value: unknown): BoardRunningHubBindingOption | null {
  if (!isRecord(value)) return null;
  if (typeof value.default === "string") return null;
  const optionValue = optionalString(value, "index") ?? optionalString(value, "value") ?? optionalString(value, "name");
  if (!optionValue) return null;
  return {
    label: optionalString(value, "name") ?? optionValue,
    value: optionValue,
    description: optionalString(value, "description"),
  };
}

function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}
