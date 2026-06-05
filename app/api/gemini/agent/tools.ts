import { z } from "zod";
import type { AgentBoardContext } from "@/lib/agent-context";
import { PROMPT_TEMPLATES } from "@/lib/prompt-templates";
import { AGENT_BOARD_ACTION_TYPES, AGENT_WORKBENCH_ACTION_TYPES } from "@/lib/agent-actions";
import { MODEL_CAPABILITIES, type ModelKind, type ProviderModelCapability } from "@/lib/providers/model-catalog";
import type { ToolDefinition } from "@/lib/providers/types";
import { SKILL_REGISTRY } from "./skills";

// -- Tool argument schemas (zod, for runtime validation only) --

const queryModelsSchema = z.object({
  kind: z.enum(["image", "video", "audio", "chat"]).optional(),
});

const getAgentCapabilitiesSchema = z.object({
  topic: z.enum(["summary", "actions", "tools", "context", "media"]).optional(),
});

const getSkillInfoSchema = z.object({
  name: z.string(),
});

const getGalleryAssetsSchema = z.object({
  type: z.enum(["image", "video", "audio"]).optional(),
  search: z.string().optional(),
});

const getPromptBlueprintSchema = z.object({
  category: z.enum([
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
    "screenplay-draft",
    "script-analysis",
    "shot-breakdown",
    "storyboard-board-patch",
  ]),
});

const getPromptTemplatesSchema = z.object({
  category: z.enum(["view", "storyboard", "character", "product", "lighting", "custom"]).optional(),
  search: z.string().optional(),
});

const getBoardContextSchema = z.object({
  scope: z.enum(["summary", "full"]).optional(),
});

const getConnectedContextSchema = z.object({
  nodeId: z.string().optional(),
});

// -- Tool definitions (JSON Schema hand-written for OpenAI compatibility) --

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "query_models",
      description:
        "按需查询当前可用的模型及参数能力。kind 过滤：image / video / audio / chat，不传返回全部。" +
        "返回模型 ID、提供商、尺寸/比例、质量、思考级别、视频时长、参考媒体类型和数量限制。",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["image", "video", "audio", "chat"],
            description: "模型类别过滤，不传返回全部",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_agent_capabilities",
      description:
        "回答用户询问 Agent 能力、可执行动作、可用工具、上下文读取方式或媒体输入能力时调用。" +
        "返回 Agent 的能力边界、渐进式上下文策略、动作类型和工具列表。",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: ["summary", "actions", "tools", "context", "media"],
            description: "只查询某类能力；不传返回摘要",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_skill_info",
      description: "查询某项技能的完整描述、适用场景和示例。在决定激活哪些技能时调用此工具，而非猜测。",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "技能名称，如 PromptEngineer、ImageGenerator",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_gallery_assets",
      description:
        "按需查询当前工作区已生成的图像/视频/音频资产。可按类型过滤或按 prompt 关键词搜索。" +
        "返回匹配项的 ID、类型、宽高比、prompt 摘要。用于引用历史资产做编辑或视频合成。",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["image", "video", "audio"],
            description: "按类型过滤",
          },
          search: {
            type: "string",
            description: "在 prompt 文本中搜索关键词",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_prompt_blueprint",
      description:
        "获取特定使用场景的结构化提示词蓝图。返回该场景的推荐风格、结构化 JSON 模板字段、和构图建议。" +
        "在用户需要生成特定类别图像（头像、海报、信息图等）但 PromptEngineer 技能描述不足以指导时调用。",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
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
              "screenplay-draft",
              "script-analysis",
              "shot-breakdown",
              "storyboard-board-patch",
            ],
            description: "目标使用场景类别",
          },
        },
        required: ["category"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_prompt_templates",
      description:
        "查询用户界面通用提示词模板库。可按模板类别或关键词过滤，返回模板标题、场景、正向提示词、反向提示词和参数提示。",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["view", "storyboard", "character", "product", "lighting", "custom"],
            description: "模板类别，不传返回全部",
          },
          search: {
            type: "string",
            description: "按标题、场景、提示词关键词搜索",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_board_context",
      description:
        "读取当前画板上下文。用于理解节点、连线、选中节点、生成节点参数和资产关系。仅当当前 surface 是 board 时有效。",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            enum: ["summary", "full"],
            description: "summary 返回计数与选中项；full 返回节点和连线摘要",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_connected_context",
      description:
        "读取某个画板节点的上下游连接上下文。不传 nodeId 时读取当前选中节点。用于判断 prompt/reference/result/agent-context 连线。",
      parameters: {
        type: "object",
        properties: {
          nodeId: {
            type: "string",
            description: "画板节点 ID；不传使用 selectedNodeId",
          },
        },
        additionalProperties: false,
      },
    },
  },
];

// -- Tool context (per-request dynamic data) --

export interface ToolContext {
  boardContext?: AgentBoardContext;
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
    case "get_agent_capabilities": {
      const { topic } = getAgentCapabilitiesSchema.parse(JSON.parse(args));
      return JSON.stringify(formatAgentCapabilities(topic ?? "summary"));
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
    case "get_prompt_templates": {
      const { category, search } = getPromptTemplatesSchema.parse(JSON.parse(args));
      const q = search?.trim().toLowerCase();
      const templates = PROMPT_TEMPLATES.filter(template => {
        if (category && template.category !== category) return false;
        if (!q) return true;
        return [
          template.title,
          template.scene,
          template.positivePrompt,
          template.negativePrompt ?? "",
          template.parameterHint ?? "",
        ].some(value => value.toLowerCase().includes(q));
      });
      return JSON.stringify(templates.slice(0, 12));
    }
    case "get_board_context": {
      const { scope } = getBoardContextSchema.parse(JSON.parse(args));
      if (!ctx.boardContext) return JSON.stringify({ error: "No board context in this request" });
      if (scope === "summary") {
        return JSON.stringify({
          boardId: ctx.boardContext.boardId,
          title: ctx.boardContext.title,
          selectedNodeId: ctx.boardContext.selectedNodeId,
          selectedEdgeId: ctx.boardContext.selectedEdgeId,
          nodeCount: ctx.boardContext.nodes.length,
          edgeCount: ctx.boardContext.edges.length,
          nodeKinds: countBy(ctx.boardContext.nodes.map(node => node.kind)),
        });
      }
      return JSON.stringify(ctx.boardContext);
    }
    case "get_connected_context": {
      const { nodeId } = getConnectedContextSchema.parse(JSON.parse(args));
      if (!ctx.boardContext) return JSON.stringify({ error: "No board context in this request" });
      const targetNodeId = nodeId ?? ctx.boardContext.selectedNodeId;
      if (!targetNodeId) return JSON.stringify({ error: "No node selected" });
      const edges = ctx.boardContext.edges.filter(edge => edge.from.nodeId === targetNodeId || edge.to.nodeId === targetNodeId);
      const connectedNodeIds = new Set(edges.flatMap(edge => [edge.from.nodeId, edge.to.nodeId]));
      return JSON.stringify({
        node: ctx.boardContext.nodes.find(node => node.id === targetNodeId) ?? null,
        connectedNodes: ctx.boardContext.nodes.filter(node => connectedNodeIds.has(node.id) && node.id !== targetNodeId),
        edges,
      });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function modelCountByKind(): Record<ModelKind, number> {
  return MODEL_CAPABILITIES.reduce<Record<ModelKind, number>>((acc, model) => {
    acc[model.kind] += 1;
    return acc;
  }, { audio: 0, chat: 0, image: 0, video: 0 });
}

function formatAgentCapabilities(topic: "summary" | "actions" | "tools" | "context" | "media"): Record<string, unknown> {
  const actions = {
    workbench: AGENT_WORKBENCH_ACTION_TYPES,
    board: AGENT_BOARD_ACTION_TYPES,
  };
  const tools = TOOL_DEFINITIONS.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
  }));
  const contextPolicy = {
    default: "Use the user's latest message plus lightweight counts only.",
    progressiveDisclosure: [
      "Call get_agent_capabilities when the user asks what the Agent can do.",
      "Call query_models before selecting or explaining model parameters.",
      "Call get_gallery_assets only when prior generated assets matter.",
      "Call get_board_context or get_connected_context only on board tasks that need node or edge details.",
      "Call prompt/template tools only for matching creative planning needs.",
    ],
  };
  const media = {
    chatReferences: ["image", "video", "audio"],
    imageGenerationReferences: ["image"],
    videoGenerationReferences: ["image", "video", "audio"],
    audioGenerationReferences: ["image", "video", "audio"],
  };

  if (topic === "actions") return { actions };
  if (topic === "tools") return { tools };
  if (topic === "context") return { contextPolicy };
  if (topic === "media") return { media };

  return {
    actions,
    contextPolicy,
    media,
    modelCounts: modelCountByKind(),
    tools,
  };
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
  "screenplay-draft": {
    category: "剧本草稿",
    recommendedStyles: ["短片剧本", "广告脚本", "分场剧本", "旁白驱动", "无对白视觉叙事"],
    structuredFields: [
      "title（片名或项目名）",
      "logline（一句话故事/广告承诺）",
      "characters（角色：姓名、外观、动机、视觉锚点）",
      "scenes（场景：地点、时间、动作、对白/旁白、情绪节奏）",
      "continuity（连续性：服装、道具、色彩、镜头母题）",
    ],
    compositionTips: "先写可拍摄动作，再写对白。每个场景保留明确地点、时间、角色状态和视觉锚点，方便继续拆分镜。",
  },
  "script-analysis": {
    category: "剧本分析",
    recommendedStyles: ["角色分析", "场景拆解", "视觉连续性", "节奏诊断", "制作清单"],
    structuredFields: [
      "premise（故事前提/广告目标）",
      "beats（关键情节点和情绪转折）",
      "characters（角色一致性要求）",
      "locations（场景和美术需求）",
      "shotCandidates（可拆分镜头候选）",
      "risks（叙事或视觉连续性风险）",
    ],
    compositionTips: "把抽象情绪转成可观察动作和画面。标出必须跨镜头保持一致的角色、服装、道具、色彩和光线。",
  },
  "shot-breakdown": {
    category: "分镜拆解",
    recommendedStyles: ["电影分镜", "广告 shot list", "图像提示词", "视频提示词", "批量生成计划"],
    structuredFields: [
      "scene（场景编号/名称）",
      "shot（镜号）",
      "beat（剧情 beat）",
      "framing（景别：wide / medium / close-up）",
      "camera（机位、镜头、运动）",
      "action（画面动作）",
      "dialogueOrVoiceover（对白/旁白）",
      "imagePrompt（静帧生成提示词）",
      "videoPrompt（可选视频运动提示词）",
    ],
    compositionTips: "每个镜头只表达一个清晰动作。imagePrompt 写静帧构图和视觉锚点；videoPrompt 写运动、节奏和镜头变化。",
  },
  "storyboard-board-patch": {
    category: "分镜画板补丁",
    recommendedStyles: ["Prompt 节点", "Image Generate 节点", "Video Generate 节点", "Note 节点", "批量 create-only"],
    structuredFields: [
      "boardPatch.title（计划标题）",
      "boardPatch.run（默认 false，用户明确要求才 true）",
      "shots（每个镜头的 scene/shot/beat/imagePrompt/videoPrompt）",
      "operations.create_node（创建 prompt / note / image-generate / video-generate / agent）",
      "operations.connect_ports（用 tempId 连接 prompt-out 到 prompt-in）",
      "operations.update_node（仅更新已有节点允许字段）",
    ],
    compositionTips: "每个 shot 优先生成一组 Prompt -> Image Generate。横向排列：Prompt x=120，Image x=520，Video x=920；不同 shot 按 y 间距 220 排列。大于 12 个 shot 时拆成后续批次。",
  },
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
    qualityLevels: c.qualityLevels.map(q => q.value),
    sizes: c.sizes.map(s => s.value),
    thinkingLevels: c.thinkingLevels.map(t => t.value),
    videoResolutions: c.kind === "video" ? c.resolutions.map(r => r.value) : [],
    videoDurations: c.kind === "video" ? c.durations.map(d => d.value) : [],
    videoPresets: c.kind === "video" ? c.presets.map(p => p.value) : [],
    videoReferenceMode: c.kind === "video" ? c.videoReferenceMode : "none",
    videoReferenceModes: c.kind === "video" ? c.videoReferenceModes : [],
    maxReferenceImages: c.maxReferenceImages,
    minReferenceImages: c.minReferenceImages,
    referenceMediaTypes: c.referenceMediaTypes,
  };
}
