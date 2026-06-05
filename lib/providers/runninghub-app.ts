import { getJson, isRecord } from "./utils";
import type { ProviderConfig } from "./types";

export interface RunningHubAiAppNodeInfo {
  nodeId: string;
  nodeName?: string;
  fieldName: string;
  fieldValue?: string;
  fieldType?: string;
  fieldData?: string;
  description?: string;
  descriptionEn?: string;
}

export interface RunningHubAiAppSchema {
  webappId: string;
  name?: string;
  nodeInfoList: RunningHubAiAppNodeInfo[];
}

interface RunningHubAiAppDemoResponse {
  code?: number;
  msg?: string;
  data?: unknown;
}

export async function fetchRunningHubAiAppSchema(
  config: ProviderConfig,
  webappId: string,
): Promise<RunningHubAiAppSchema> {
  if (!config.apiKey) throw new Error("RunningHub API key is required");
  const params = new URLSearchParams({ apiKey: config.apiKey, webappId });
  const response = await getJson<RunningHubAiAppDemoResponse>(
    `${config.baseUrl}/api/webapp/apiCallDemo?${params.toString()}`,
    config,
  );
  if (response.code !== undefined && response.code !== 0) {
    throw new Error(response.msg ?? "RunningHub AI App schema request failed");
  }
  const nodeInfoList = readNodeInfoList(response.data);
  if (nodeInfoList.length === 0) {
    throw new Error("RunningHub AI App schema response did not include nodeInfoList");
  }
  return { webappId, name: readAppName(response.data), nodeInfoList };
}

function readAppName(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const name = readString(value.webappName) ?? readString(value.appName) ?? readString(value.name) ?? readString(value.title);
  if (name?.trim()) return name.trim();
  const webapp = isRecord(value.webapp) ? readAppName(value.webapp) : undefined;
  if (webapp) return webapp;
  const app = isRecord(value.app) ? readAppName(value.app) : undefined;
  if (app) return app;
  return undefined;
}

function readNodeInfoList(value: unknown): RunningHubAiAppNodeInfo[] {
  const direct = findNodeInfoList(value);
  if (direct) return direct;
  if (isRecord(value) && typeof value.curl === "string") {
    for (const objectText of extractJsonObjects(value.curl)) {
      try {
        const parsed = JSON.parse(objectText) as unknown;
        const found = findNodeInfoList(parsed);
        if (found) return found;
      } catch {
        // Continue scanning the curl string for the request JSON body.
      }
    }
  }
  return [];
}

function findNodeInfoList(value: unknown): RunningHubAiAppNodeInfo[] | null {
  if (Array.isArray(value)) return readNodeInfoArray(value);
  if (!isRecord(value)) return null;
  if (Array.isArray(value.nodeInfoList)) return readNodeInfoArray(value.nodeInfoList);
  if (isRecord(value.data)) return findNodeInfoList(value.data);
  if (isRecord(value.config)) return findNodeInfoList(value.config);
  return null;
}

function readNodeInfoArray(values: unknown[]): RunningHubAiAppNodeInfo[] {
  return values.map(readNodeInfo).filter((item): item is RunningHubAiAppNodeInfo => item !== null);
}

function readNodeInfo(value: unknown): RunningHubAiAppNodeInfo | null {
  if (!isRecord(value)) return null;
  const nodeId = readString(value.nodeId);
  const fieldName = readString(value.fieldName);
  if (!nodeId || !fieldName) return null;
  return {
    nodeId,
    fieldName,
    nodeName: readString(value.nodeName),
    fieldValue: readString(value.fieldValue),
    fieldType: readString(value.fieldType),
    fieldData: readString(value.fieldData),
    description: readString(value.description),
    descriptionEn: readString(value.descriptionEn),
  };
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
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
