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
    id: "view-camera-contact-sheet",
    category: "view",
    title: "多机位探索",
    scene: "同一主体的镜头角度筛选",
    positivePrompt:
      "camera angle contact sheet, same subject shown from multiple cinematic viewpoints, consistent identity and environment, varied lens height and distance, clear composition options, production planning reference",
    negativePrompt: "different subjects, inconsistent environment, random style shifts, unreadable grid",
    parameterHint: "适合 16:9、4:3",
  },
  {
    id: "view-spatial-depth-rebuild",
    category: "view",
    title: "空间层次补强",
    scene: "背景空、纵深弱、场景缺层次",
    positivePrompt:
      "enhanced spatial depth, distinct foreground midground and background, believable scale cues, soft atmospheric separation, guided leading lines, subject remains clearly readable",
    negativePrompt: "flat backdrop, pasted-on subject, confusing scale, overcrowded background",
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
    id: "storyboard-shot-grid",
    category: "storyboard",
    title: "镜头组宫格",
    scene: "快速比较构图、机位、景别",
    positivePrompt:
      "cinematic shot grid, nine compact storyboard frames exploring the same scene, varied shot sizes from wide medium to close-up, consistent subject continuity, clean readable staging, director planning board",
    negativePrompt: "unrelated panels, broken continuity, cluttered layout, inconsistent character design",
    parameterHint: "适合横向画布",
  },
  {
    id: "storyboard-action-continuity",
    category: "storyboard",
    title: "连续动作分镜",
    scene: "动作拆解、转场、视频参考",
    positivePrompt:
      "continuous action storyboard, sequential frames showing one motion from anticipation to execution to follow-through, consistent camera axis, readable pose progression, precise timing notes implied by the visuals",
    negativePrompt: "jump cuts without logic, impossible body motion, inconsistent props, unclear action direction",
    parameterHint: "适合 16:9 或长横图",
  },
  {
    id: "storyboard-before-moment",
    category: "storyboard",
    title: "前因画面推演",
    scene: "从当前画面反推前几秒",
    positivePrompt:
      "pre-moment storyboard frame, infer what happened seconds before the current scene, coherent cause leading into the visible action, same location and subject identity, cinematic continuity",
    negativePrompt: "unrelated backstory, changed location, inconsistent subject, excessive text labels",
    parameterHint: "适合补齐视频开头",
  },
  {
    id: "storyboard-after-moment",
    category: "storyboard",
    title: "后续画面推演",
    scene: "从当前画面延展后几秒",
    positivePrompt:
      "next-moment storyboard frame, extend the current scene a few seconds forward, clear consequence of the action, consistent subject identity and environment, cinematic visual continuity",
    negativePrompt: "random outcome, changed style, subject identity drift, unclear progression",
    parameterHint: "适合补齐视频结尾",
  },
  {
    id: "storyboard-camera-orbit",
    category: "storyboard",
    title: "环绕运镜",
    scene: "产品展示、角色展示、空间揭示",
    positivePrompt:
      "controlled orbit camera movement around the subject, stable focal target, smooth parallax across foreground and background, consistent lighting, elegant reveal of shape and environment",
    negativePrompt: "unstable camera, warped subject, broken perspective, chaotic background motion",
    parameterHint: "适合视频生成提示词",
  },
  {
    id: "storyboard-camera-follow",
    category: "storyboard",
    title: "跟随运镜",
    scene: "人物移动、产品使用、动作场景",
    positivePrompt:
      "smooth tracking camera following the subject, steady screen direction, natural body or object motion, subtle background parallax, clear subject priority, cinematic pacing",
    negativePrompt: "shaky handheld chaos, subject slipping out of frame, motion smear, identity drift",
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
    id: "character-performance-shift",
    category: "character",
    title: "表演情绪重塑",
    scene: "保留角色，改变情绪与表演状态",
    positivePrompt:
      "same character identity with a redesigned emotional performance, clear facial expression, body language aligned with the mood, consistent costume and lighting, believable acting nuance",
    negativePrompt: "different person, exaggerated cartoon emotion, mismatched pose, inconsistent costume details",
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
    id: "lighting-key-fill-rim",
    category: "lighting",
    title: "三点光校准",
    scene: "人物、产品、商业棚拍",
    positivePrompt:
      "balanced three-point lighting, defined key light, subtle fill light, controlled rim light separating subject from background, clean highlight rolloff, professional studio clarity",
    negativePrompt: "flat lighting, uncontrolled spill, blown highlights, muddy shadows",
  },
  {
    id: "lighting-back-rim-glow",
    category: "lighting",
    title: "逆光轮廓",
    scene: "人物边缘、产品质感、氛围海报",
    positivePrompt:
      "motivated backlight and rim glow, luminous subject edges, readable silhouette, controlled lens bloom, subtle haze catching the light, cinematic separation from background",
    negativePrompt: "overexposed silhouette, washed-out subject, random glare, lost detail",
  },
  {
    id: "lighting-rembrandt-portrait",
    category: "lighting",
    title: "伦勃朗肖像光",
    scene: "人像、角色设定、戏剧感画面",
    positivePrompt:
      "Rembrandt-inspired portrait lighting, angled key light creating a small cheek triangle, rich shadow modeling, natural skin texture, restrained background, painterly cinematic depth",
    negativePrompt: "flat face lighting, harsh flash, plastic skin, uneven eyes",
  },
  {
    id: "lighting-top-stage",
    category: "lighting",
    title: "顶光舞台感",
    scene: "戏剧人物、舞台、悬疑氛围",
    positivePrompt:
      "dramatic overhead stage lighting, focused pool of light, sculpted shadows falling downward, strong mood isolation, subject readable within darkness, theatrical cinematic atmosphere",
    negativePrompt: "random spotlight, crushed subject detail, noisy darkness, unclear focal point",
  },
  {
    id: "lighting-high-key-clean",
    category: "lighting",
    title: "高调明亮光",
    scene: "美妆、母婴、清爽产品视觉",
    positivePrompt:
      "high-key bright lighting, soft low-contrast shadows, clean whites, airy color palette, accurate material detail, polished commercial freshness",
    negativePrompt: "gray whites, harsh shadow edges, overexposed texture, dirty background",
  },
  {
    id: "lighting-flat-reference",
    category: "lighting",
    title: "平光参考",
    scene: "设定图、材质参考、减少戏剧阴影",
    positivePrompt:
      "even flat reference lighting, minimal cast shadows, accurate color and material readability, neutral exposure, clear form description, practical design reference",
    negativePrompt: "dramatic contrast, color cast, deep shadow hiding details, glossy glare",
  },
  {
    id: "lighting-volumetric-beams",
    category: "lighting",
    title: "体积光束",
    scene: "森林、窗边、舞台、尘雾空间",
    positivePrompt:
      "volumetric light beams through visible air, subtle dust or mist catching the light, natural beam direction, readable subject silhouette, cinematic depth without overexposure",
    negativePrompt: "random light streaks, overexposed haze, hidden subject, artificial glow overlay",
  },
  {
    id: "custom-atmosphere-weather",
    category: "custom",
    title: "天气气氛增强",
    scene: "雨、雪、雾、沙尘等环境情绪",
    positivePrompt:
      "Atmosphere: [雨/雪/雾/沙尘/潮湿空气]\nSubject: [主体]\nScene: [场景]\nEffect behavior: particles interact naturally with light, depth, surfaces and motion\nVisual goal: atmospheric enhancement without hiding the subject",
    negativePrompt: "effect covering the subject, random particles, fake overlay, low visibility",
  },
  {
    id: "custom-biome-glow",
    category: "custom",
    title: "生物荧光场效",
    scene: "奇幻、海底、森林、科幻氛围",
    positivePrompt:
      "Environment: [环境]\nBioluminescent elements: [发光植物/浮游生物/菌类/能量纹理]\nLight behavior: soft organic glow, visible interaction with nearby surfaces, layered depth cues\nMood: mysterious but readable",
    negativePrompt: "random neon, overbright glow, noisy speckles, unreadable subject",
  },
  {
    id: "custom-surreal-afterimage",
    category: "custom",
    title: "超现实残影",
    scene: "梦境、记忆、超现实动态感",
    positivePrompt:
      "Subject: [主体]\nSurreal motion idea: elongated afterimage, melting rhythm, dreamlike spatial distortion\nComposition: keep the subject recognizable while the surrounding forms bend with motion\nMood: poetic, uncanny, cinematic",
    negativePrompt: "unrecognizable subject, random deformation, messy abstraction, broken anatomy",
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
