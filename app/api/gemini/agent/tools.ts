import { z } from "zod";
import { MODEL_CAPABILITIES, type ProviderModelCapability } from "@/lib/providers/model-catalog";
import type { ToolDefinition } from "@/lib/providers/types";
import { SKILL_REGISTRY } from "./skills";

// -- Tool argument schemas (zod) --

const queryModelsSchema = z.object({
  kind: z.enum(["image", "video", "chat"]).optional(),
});

const getSkillInfoSchema = z.object({
  name: z.string().describe("技能名称，如 PromptEngineer、ImageGenerator"),
});

const getGalleryAssetsSchema = z.object({
  type: z.enum(["image", "video"]).optional().describe("按类型过滤"),
  search: z.string().optional().describe("在 prompt 文本中搜索关键词"),
});

// -- Tool definitions --

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "query_models",
      description:
        "查询当前可用的生成模型及参数能力。kind 过滤：image / video / chat，不传返回全部。" +
        "返回：模型 ID、提供商、宽高比列表、输出尺寸列表、思考级别、是否异步、是否支持参考图。",
      parameters: zodToJsonSchema(queryModelsSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "get_skill_info",
      description:
        "查询某项技能的完整描述、适用场景和示例。在决定激活哪些技能时调用此工具，而非猜测。",
      parameters: zodToJsonSchema(getSkillInfoSchema),
    },
  },
  {
    type: "function",
    function: {
      name: "get_gallery_assets",
      description:
        "查询当前工作区已生成的图像/视频资产。可按类型过滤或按 prompt 关键词搜索。" +
        "返回匹配项的 ID、类型、宽高比、prompt 摘要。用于引用历史资产做编辑或视频合成。",
      parameters: zodToJsonSchema(getGalleryAssetsSchema),
    },
  },
];

// -- Tool context (per-request dynamic data) --

export interface ToolContext {
  galleryItems: Array<{
    id: string;
    type: string;
    prompt: string;
    aspectRatio: string;
  }>;
}

// -- Tool executor --

export function getAgentTools(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

export function executeToolCall(name: string, args: string, ctx: ToolContext): string {
  switch (name) {
    case "query_models": {
      const { kind } = queryModelsSchema.parse(JSON.parse(args));
      const filtered = kind
        ? MODEL_CAPABILITIES.filter(c => c.kind === kind)
        : MODEL_CAPABILITIES;
      return JSON.stringify(filtered.map(formatCapabilities));
    }
    case "get_skill_info": {
      const { name: skillName } = getSkillInfoSchema.parse(JSON.parse(args));
      const skill = SKILL_REGISTRY.find(
        s => s.name.toLowerCase() === skillName.toLowerCase(),
      );
      if (!skill) {
        return JSON.stringify({
          error: `Unknown skill: ${skillName}`,
          availableSkills: SKILL_REGISTRY.map(s => s.name),
        });
      }
      return JSON.stringify({
        name: skill.name,
        category: skill.category,
        description: skill.description,
        whenToUse: skill.whenToUse,
        examples: skill.examples,
      });
    }
    case "get_gallery_assets": {
      const { type, search } = getGalleryAssetsSchema.parse(JSON.parse(args));
      let items = ctx.galleryItems;
      if (type) items = items.filter(i => i.type === type);
      if (search) {
        const q = search.toLowerCase();
        items = items.filter(
          i => i.prompt.toLowerCase().includes(q) || i.id.includes(q),
        );
      }
      return JSON.stringify(
        items.slice(0, 20).map(i => ({
          id: i.id,
          type: i.type,
          aspectRatio: i.aspectRatio,
          prompt: i.prompt.slice(0, 80),
        })),
      );
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// -- Helpers --

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

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, def] of Object.entries(shape)) {
    const zodType = def instanceof z.ZodOptional ? def._def.innerType : def;
    const isOptional = def instanceof z.ZodOptional;

    if (zodType instanceof z.ZodString) {
      properties[key] = { type: "string", description: zodType.description ?? "" };
    } else if (zodType instanceof z.ZodEnum) {
      properties[key] = {
        type: "string",
        enum: Object.values(zodType._def.entries) as string[],
        description: zodType.description ?? "",
      };
    }

    if (!isOptional) required.push(key);
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
