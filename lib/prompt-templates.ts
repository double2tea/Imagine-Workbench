export type PromptTemplateCategoryId = "view" | "storyboard" | "character" | "product" | "lighting" | "custom";

export type PromptTemplateApplyMode = "insert" | "replace";

export interface PromptTemplateSlashCommand {
  end: number;
  search: string;
  start: number;
}

export interface PromptTemplateCategory {
  id: PromptTemplateCategoryId;
  label: string;
}

export interface PromptTemplate {
  id: string;
  category: PromptTemplateCategoryId;
  title: string;
  scene: string;
  positivePrompt: string;
  negativePrompt?: string;
  parameterHint?: string;
}

export const PROMPT_TEMPLATE_CATEGORIES: PromptTemplateCategory[] = [
  { id: "view", label: "视角" },
  { id: "storyboard", label: "分镜" },
  { id: "character", label: "角色" },
  { id: "product", label: "产品" },
  { id: "lighting", label: "光影" },
  { id: "custom", label: "自定义" },
];

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "view-close-editorial",
    category: "view",
    title: "近景编辑感",
    scene: "人物、产品、细节特写",
    positivePrompt:
      "close-up editorial composition, clear subject hierarchy, natural depth of field, crisp focal detail, restrained background, polished commercial photography",
    negativePrompt: "low resolution, blurry subject, cluttered background, distorted details",
    parameterHint: "适合 1:1、4:3 或 3:4",
  },
  {
    id: "view-wide-establishing",
    category: "view",
    title: "宽幅环境镜头",
    scene: "空间、场景、世界观建立",
    positivePrompt:
      "wide establishing shot, strong foreground midground background layering, readable spatial depth, atmospheric perspective, cinematic but natural composition",
    negativePrompt: "flat composition, empty frame, overcropped subject, messy horizon",
    parameterHint: "适合 16:9、21:9",
  },
  {
    id: "view-dynamic-low-angle",
    category: "view",
    title: "低机位动势",
    scene: "英雄感、动作、产品冲击力",
    positivePrompt:
      "dynamic low-angle composition, strong perspective lines, subject feels powerful and close to camera, controlled motion energy, readable silhouette, dramatic foreground scale",
    negativePrompt: "weak pose, flat perspective, awkward distortion, unclear silhouette",
    parameterHint: "适合 3:4、4:5、16:9",
  },
  {
    id: "view-top-down-layout",
    category: "view",
    title: "俯拍陈列",
    scene: "食物、桌面、道具、产品组合",
    positivePrompt:
      "top-down flat lay composition, carefully arranged objects, balanced spacing, clean negative space, precise material detail, editorial still-life styling",
    negativePrompt: "messy arrangement, overlapping clutter, uneven spacing, warped objects",
    parameterHint: "适合 1:1、4:3",
  },
  {
    id: "storyboard-keyframe",
    category: "storyboard",
    title: "关键帧分镜",
    scene: "视频画面、广告分镜、故事节点",
    positivePrompt:
      "single storyboard keyframe, decisive action moment, clear character intent, readable camera angle, production-ready visual direction, concise visual storytelling",
    negativePrompt: "unclear action, inconsistent perspective, unreadable staging",
  },
  {
    id: "storyboard-three-beat",
    category: "storyboard",
    title: "三段式分镜",
    scene: "短视频、广告、剧情推进",
    positivePrompt:
      "three-panel storyboard layout, panel 1 establishing context, panel 2 clear action escalation, panel 3 emotional or product payoff, consistent character and environment, readable cinematic staging",
    negativePrompt: "random panels, inconsistent character, unclear sequence, crowded captions",
    parameterHint: "适合 16:9 或横向画面",
  },
  {
    id: "storyboard-camera-move",
    category: "storyboard",
    title: "镜头运动规划",
    scene: "图生视频、镜头提示、动态画面",
    positivePrompt:
      "cinematic camera movement plan, slow push-in toward the subject, subtle parallax between foreground and background, natural environmental motion, stable subject identity, filmic timing",
    negativePrompt: "shaky camera, chaotic movement, subject morphing, inconsistent background",
    parameterHint: "适合视频生成提示词",
  },
  {
    id: "character-consistency",
    category: "character",
    title: "角色一致性",
    scene: "角色设定、IP 延展、多图统一",
    positivePrompt:
      "consistent character design, recognizable face and silhouette, stable costume details, coherent color accents, expressive pose, clean character reference style",
    negativePrompt: "different face, inconsistent outfit, extra limbs, unstable identity",
  },
  {
    id: "character-turnaround",
    category: "character",
    title: "角色三视图",
    scene: "设定集、建模参考、IP 角色",
    positivePrompt:
      "character turnaround sheet, front view side view and back view, same character identity, consistent proportions, clean neutral pose, readable costume construction, plain background",
    negativePrompt: "different outfits per view, inconsistent anatomy, perspective mismatch, busy background",
    parameterHint: "适合 16:9、4:3",
  },
  {
    id: "character-expression-sheet",
    category: "character",
    title: "表情设定表",
    scene: "角色表情、漫画、动画资产",
    positivePrompt:
      "character expression sheet, same character face across multiple expressions, happy serious surprised angry thoughtful, clean layout, consistent lighting and style",
    negativePrompt: "different identities, inconsistent face shape, random costumes, unreadable layout",
    parameterHint: "适合 1:1、4:3",
  },
  {
    id: "product-hero",
    category: "product",
    title: "产品主视觉",
    scene: "电商、海报、品牌展示",
    positivePrompt:
      "premium product hero shot, product clearly visible, accurate material texture, controlled studio lighting, subtle reflections, clean commercial layout, high-end advertising finish",
    negativePrompt: "warped logo, unreadable text, dirty surface, cheap lighting, distracting props",
    parameterHint: "需要文字时优先选择文本能力更强的图像模型",
  },
  {
    id: "product-packshot-clean",
    category: "product",
    title: "干净白底产品",
    scene: "电商主图、详情页、商品图",
    positivePrompt:
      "clean ecommerce packshot, product centered, accurate shape and material, soft contact shadow, white or very light background, no distracting props, high-detail commercial finish",
    negativePrompt: "busy background, extra objects, distorted label, low quality reflections, cropped product",
    parameterHint: "适合 1:1、4:3",
  },
  {
    id: "product-lifestyle-context",
    category: "product",
    title: "生活方式场景",
    scene: "品牌氛围、社媒、电商场景图",
    positivePrompt:
      "lifestyle product scene, product naturally used in context, believable human-scale environment, tasteful props, clear brand mood, warm but controlled commercial photography",
    negativePrompt: "product hidden, unrelated props, fake-looking scene, cluttered composition",
    parameterHint: "适合 4:5、16:9",
  },
  {
    id: "lighting-soft-studio",
    category: "lighting",
    title: "柔和棚拍光",
    scene: "肖像、产品、静物",
    positivePrompt:
      "soft studio lighting, large diffused key light, gentle fill light, smooth shadow transition, accurate color, refined highlights, professional photography finish",
    negativePrompt: "harsh flash, overexposure, crushed shadows, muddy color",
  },
  {
    id: "lighting-cinematic-night",
    category: "lighting",
    title: "电影夜景光",
    scene: "人物、街景、科幻、情绪画面",
    positivePrompt:
      "cinematic night lighting, motivated practical lights, soft rim light, controlled contrast, subtle haze, rich dark tones with readable subject detail, film still atmosphere",
    negativePrompt: "black crushed details, noisy shadows, random neon, overexposed highlights",
    parameterHint: "适合 16:9、21:9",
  },
  {
    id: "lighting-golden-hour",
    category: "lighting",
    title: "黄金时刻",
    scene: "户外、人像、旅行、温暖情绪",
    positivePrompt:
      "golden hour lighting, warm low-angle sunlight, soft long shadows, gentle atmospheric glow, natural skin tones or material color, calm cinematic warmth",
    negativePrompt: "flat noon light, oversaturated orange, harsh shadows, washed-out detail",
  },
  {
    id: "custom-structured-brief",
    category: "custom",
    title: "结构化创意简报",
    scene: "把想法整理成可生成描述",
    positivePrompt:
      "Subject: [主体]\nContext: [场景]\nComposition: [构图]\nLighting: [光线]\nStyle: [视觉方向]\nDetails: [关键细节]\nOutput goal: [希望生成的结果]",
    negativePrompt: "unclear subject, inconsistent style, low quality output",
  },
  {
    id: "custom-text-poster-brief",
    category: "custom",
    title: "文字海报简报",
    scene: "海报、信息图、活动视觉",
    positivePrompt:
      "Poster type: [海报类型]\nMain text: [必须准确出现的文字]\nSub text: [辅助文字]\nSubject: [主体]\nLayout: [文字和主体的位置]\nStyle: [平面/摄影/插画/电影感]\nColor system: [主色与辅助色]\nReadability: crisp typography, clear hierarchy, no misspelled text",
    negativePrompt: "misspelled text, unreadable typography, random letters, cluttered layout",
    parameterHint: "文字较多时优先选择文本能力更强的图像模型",
  },
  {
    id: "custom-reference-remix",
    category: "custom",
    title: "参考图再创作",
    scene: "图生图、风格延续、主体保持",
    positivePrompt:
      "Keep from reference: [要保持的主体/构图/配色]\nChange: [要变化的部分]\nStyle direction: [目标风格]\nComposition: [画面结构]\nQuality target: coherent identity, stable details, natural lighting, production-ready finish",
    negativePrompt: "identity drift, inconsistent structure, unwanted object changes, low fidelity to reference",
  },
];

export function applyPromptTemplateText(
  currentPrompt: string,
  templatePrompt: string,
  mode: PromptTemplateApplyMode,
): string {
  const nextPrompt = templatePrompt.trim();
  if (mode === "replace" || !currentPrompt.trim()) return nextPrompt;
  return `${currentPrompt.trim()}\n\n${nextPrompt}`;
}

export function insertPromptTemplateText(
  currentPrompt: string,
  templatePrompt: string,
  selectionStart: number,
  selectionEnd: number,
): { prompt: string; caret: number } {
  const nextPrompt = templatePrompt.trim();
  const before = currentPrompt.slice(0, selectionStart);
  const after = currentPrompt.slice(selectionEnd);
  const prefix = before && !before.endsWith("\n") ? `${before}\n\n` : before;
  const suffix = after && !after.startsWith("\n") ? `\n\n${after}` : after;
  const prompt = `${prefix}${nextPrompt}${suffix}`;
  return { prompt, caret: prefix.length + nextPrompt.length };
}

export function detectPromptTemplateSlashCommand(value: string, caret: number): PromptTemplateSlashCommand | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(^|\s)\/([^\s/]*)$/);
  if (!match) return null;
  const search = match[2] ?? "";
  return {
    end: caret,
    search,
    start: beforeCaret.length - search.length - 1,
  };
}
