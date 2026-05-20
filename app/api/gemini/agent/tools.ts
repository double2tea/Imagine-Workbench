import { MODEL_CAPABILITIES, type ModelKind, type ProviderModelCapability } from "@/lib/providers/model-catalog";
import type { ToolDefinition } from "@/lib/providers/types";

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "query_models",
      description:
        "查询当前可用的生成模型及其参数能力。传入 kind 过滤：image（图像生成）、video（视频生成）、chat（对话）。" +
        "不传则返回全部。返回每个模型的 ID、提供商、宽高比、输出尺寸、思考级别、是否异步、是否支持参考图。",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["image", "video", "chat"],
            description: "模型类别过滤，不传返回全部",
          },
        },
        required: [],
      },
    },
  },
];

function formatCapabilities(c: ProviderModelCapability): Record<string, unknown> {
  return {
    value: c.value,
    provider: c.provider,
    model: c.model,
    kind: c.kind,
    async: c.supportsAsync,
    supportsReferences: c.supportsReferences,
    aspectRatios: c.aspectRatios.map(a => a.value),
    sizes: c.sizes.map(s => s.value),
    thinkingLevels: c.thinkingLevels.map(t => t.value),
  };
}

export function getAgentTools(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

export function executeToolCall(name: string, args: string): string {
  switch (name) {
    case "query_models": {
      const parsed = JSON.parse(args) as { kind?: string };
      const kind = parsed.kind as ModelKind | undefined;
      const filtered =
        kind
          ? MODEL_CAPABILITIES.filter(c => c.kind === kind)
          : MODEL_CAPABILITIES;
      return JSON.stringify(filtered.map(formatCapabilities));
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
