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

const getPromptBlueprintSchema = z.object({
  category: z
    .enum([
      "portrait-avatar",
      "social-media-post",
      "infographic-edu-visual",
      "youtube-thumbnail",
      "comic-storyboard",
      "product-marketing",
      "ecommerce-main-image",
      "game-asset",
      "poster-flyer",
      "app-web-design",
    ])
    .describe("目标使用场景类别"),
});

// -- Tool definitions --

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "query_models",
      description:
        "查询当前可用的生成模型及参数能力。kind 过滤：image / video / chat，不传返回全部。" +
        "返回：模型 ID、提供商、宽高比列表、输出尺寸列表、思考级别、是否异步、是否支持参考图、视频参考模式与数量限制。",
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
  {
    type: "function",
    function: {
      name: "get_prompt_blueprint",
      description:
        "获取特定使用场景的结构化提示词蓝图。返回该场景的推荐风格、结构化 JSON 模板字段、和构图建议。" +
        "在用户需要生成特定类别图像（头像、海报、信息图等）但 PromptEngineer 技能描述不足以指导时调用。",
      parameters: zodToJsonSchema(getPromptBlueprintSchema),
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
    case "get_prompt_blueprint": {
      const { category } = getPromptBlueprintSchema.parse(JSON.parse(args));
      const bp = PROMPT_BLUEPRINTS[category];
      return JSON.stringify(bp);
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// -- Prompt blueprints --

interface PromptBlueprint {
  category: string;
  recommendedStyles: string[];
  structuredFields: string[];
  compositionTips: string;
  gptImage2Note?: string;
}

const PROMPT_BLUEPRINTS: Record<string, PromptBlueprint> = {
  "portrait-avatar": {
    category: "肖像/头像",
    recommendedStyles: ["摄影写实", "电影级/定帧", "3D渲染", "插画", "Q版/Chibi", "油画"],
    structuredFields: [
      "subject（主体描述：面部特征、发型、表情、着装）",
      "pose（姿态：正脸、侧脸、半身、全身）",
      "lighting（光线：Rembrandt、butterfly、rim light、natural window light）",
      "background（背景：studio灰色、户外模糊、纯色）",
      "camera（机位：85mm portrait lens, f/1.8, shallow depth of field）",
    ],
    compositionTips: "中长焦人像镜头视角，眼睛在画面上1/3处，背景虚化突出主体。多人像用photo booth grid结构。",
  },
  "social-media-post": {
    category: "社交媒体帖子",
    recommendedStyles: ["摄影写实", "电影级/定帧", "插画", "3D渲染", "极简主义"],
    structuredFields: [
      "type（类型：photo post / quote card / story frame）",
      "subject（主体：人物、场景或产品）",
      "mood（氛围：aspirational、cozy、energetic、minimal）",
      "overlay（叠加：文字标语、emoji、tag位置）",
      "aspectRatio（宽高比：1:1 feed / 4:5 portrait / 9:16 story）",
    ],
    compositionTips: "移动端优先构图，主体居中或三分线，留白给文字叠加。使用自然光和 lifestyle 场景增强真实感。",
  },
  "infographic-edu-visual": {
    category: "信息图/知识图解",
    recommendedStyles: ["插画", "3D渲染", "水彩", "极简主义", "等距视图", "素描/线稿"],
    structuredFields: [
      "type（类型：timeline / exploded view / map / comparison chart / process diagram）",
      "title（标题）",
      "style（风格：vintage parchment / clean modern / hand-drawn / dark tech）",
      "sections（分区：left sidebar labels, center diagram, right annotations）",
      "callouts（标注：数量、位置、文字内容）",
      "legend（图例：底部或右侧）",
    ],
    compositionTips: "用结构化 JSON 格式描述分区和标注。centerpiece 占画面主体，左右分栏放标签和注释。多语言文本直接写入对应字段。",
    gptImage2Note: "GPT Image 2 在此类别表现极佳，可直接渲染多语言文本和精确标注。",
  },
  "youtube-thumbnail": {
    category: "YouTube 缩略图",
    recommendedStyles: ["摄影写实", "电影级/定帧", "3D渲染", "插画"],
    structuredFields: [
      "subject（主体：人物表情夸张、动作戏剧化）",
      "expression（表情：surprised、intense、excited、scared）",
      "lighting（光线：high contrast、dramatic rim light、bold color gel）",
      "textOverlay（文字叠加：大号粗体标题，2-4词为佳）",
      "background（背景：模糊但可辨识的环境）",
    ],
    compositionTips: "16:9横构图，主体偏左或偏右留文字空间。高对比度、强色彩冲击。表情和动作要夸张、有 clickbait 感。",
  },
  "comic-storyboard": {
    category: "漫画/分镜",
    recommendedStyles: ["动漫/漫画", "插画", "素描/线稿", "漫画/图形小说"],
    structuredFields: [
      "type（类型：single illustration / multi-panel storyboard）",
      "panels（分格：每格动作描述、机位、对话）",
      "characters（角色：外观描述，保持跨格一致性）",
      "toning（色调：黑白网点、彩色、复古泛黄）",
      "sfx（特效字：拟声词位置和风格）",
    ],
    compositionTips: "多格分镜时描述每格的机位变化（wide establishing → medium action → close-up reaction）。用角色特征描述保持跨格一致性。",
    gptImage2Note: "GPT Image 2 在跨图像角色一致性方面表现突出，适合漫画/分镜。",
  },
  "product-marketing": {
    category: "产品营销",
    recommendedStyles: ["摄影写实", "电影级/定帧", "3D渲染", "极简主义"],
    structuredFields: [
      "type（类型：hero shot / lifestyle / editorial / exploded view）",
      "product（产品：外观、材质、角度）",
      "context（场景：使用场景或纯色背景）",
      "lighting（光线：studio key light、rim light for edges）",
      "branding（品牌：logo位置、配色方案）",
      "copy（文案：标题、副标题、CTA按钮）",
    ],
    compositionTips: "产品占画面60-70%，logo和文字分布在产品周围。使用故事性场景增加情感连接。",
  },
  "ecommerce-main-image": {
    category: "电商主图",
    recommendedStyles: ["摄影写实", "3D渲染", "极简主义"],
    structuredFields: [
      "product（产品：正面/45度角，清晰展示特征）",
      "background（背景：纯白 #FFFFFF 或浅灰 studio 背景）",
      "lighting（光线：均匀柔光，无硬阴影）",
      "scale（比例：产品占画面 80-85%）",
    ],
    compositionTips: "纯白或浅灰背景，产品居中45度角。均匀柔光消除阴影，展示材质和细节纹理。不要添加无关装饰。",
  },
  "game-asset": {
    category: "游戏资产",
    recommendedStyles: ["3D渲染", "插画", "等距视图", "像素艺术", "动漫/漫画"],
    structuredFields: [
      "type（类型：character concept / item icon / environment / sprite sheet）",
      "subject（主体：角色/物品描述、材质、比例）",
      "view（视角：front / side / isometric / top-down / turnaround）",
      "style（风格：fantasy / sci-fi / pixel / hand-painted / low-poly）",
    ],
    compositionTips: "角色概念用五视图（前/侧/后/3/4/特写）。物品用等距或 top-down。sprite sheet 描述帧序列排列。",
  },
  "poster-flyer": {
    category: "海报/传单",
    recommendedStyles: ["插画", "电影级/定帧", "3D渲染", "极简主义", "水墨/国风", "赛博朋克/科幻"],
    structuredFields: [
      "type（类型：movie poster / event flyer / promotional / propaganda）",
      "title（标题：大字、位置、字体风格）",
      "visual（主视觉：插图或照片风格）",
      "info（信息层级：日期、地点、参演者、票价等）",
      "colorScheme（配色：主导色+强调色）",
    ],
    compositionTips: "竖构图为主。标题在顶部或底部1/3处，主视觉居中。信息按重要程度梯度缩小字号。保持留白呼吸感。",
  },
  "app-web-design": {
    category: "App/网页设计",
    recommendedStyles: ["极简主义", "3D渲染", "等距视图", "插画"],
    structuredFields: [
      "type（类型：landing page / mobile app screen / dashboard / onboarding flow）",
      "device（设备框架：iPhone / MacBook / 无框）",
      "layout（布局：header / hero / features grid / footer）",
      "content（内容：各区域文字、图标、图片占位）",
      "style（风格：glassmorphism / neumorphism / flat / brutalist）",
    ],
    compositionTips: "设备框架包裹 UI 增加真实感。描述各区块的位置和内容。避免模糊占位符——给出真实文案。",
  },
};

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
    videoReferenceMode: c.videoReferenceMode,
    maxReferenceImages: c.maxReferenceImages,
    minReferenceImages: c.minReferenceImages,
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
