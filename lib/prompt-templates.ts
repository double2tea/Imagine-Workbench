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
    id: "storyboard-keyframe",
    category: "storyboard",
    title: "关键帧分镜",
    scene: "视频画面、广告分镜、故事节点",
    positivePrompt:
      "single storyboard keyframe, decisive action moment, clear character intent, readable camera angle, production-ready visual direction, concise visual storytelling",
    negativePrompt: "unclear action, inconsistent perspective, unreadable staging",
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
    id: "lighting-soft-studio",
    category: "lighting",
    title: "柔和棚拍光",
    scene: "肖像、产品、静物",
    positivePrompt:
      "soft studio lighting, large diffused key light, gentle fill light, smooth shadow transition, accurate color, refined highlights, professional photography finish",
    negativePrompt: "harsh flash, overexposure, crushed shadows, muddy color",
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
