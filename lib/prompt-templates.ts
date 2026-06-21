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
  { id: "view", label: "View" },
  { id: "storyboard", label: "Storyboard" },
  { id: "character", label: "Character" },
  { id: "product", label: "Product" },
  { id: "lighting", label: "Lighting" },
  { id: "custom", label: "Custom" },
];

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "view-close-editorial",
    category: "view",
    title: "Close-Up Editorial",
    scene: "Characters, products, detail close-ups",
    positivePrompt:
      "close-up editorial composition, clear subject hierarchy, natural depth of field, crisp focal detail, restrained background, polished commercial photography",
    negativePrompt: "low resolution, blurry subject, cluttered background, distorted details",
    parameterHint: "Best at 1:1, 4:3, or 3:4",
  },
  {
    id: "view-wide-establishing",
    category: "view",
    title: "Wide Establishing Shot",
    scene: "Spaces, scenes, world-building",
    positivePrompt:
      "wide establishing shot, strong foreground midground background layering, readable spatial depth, atmospheric perspective, cinematic but natural composition",
    negativePrompt: "flat composition, empty frame, overcropped subject, messy horizon",
    parameterHint: "Best at 16:9, 21:9",
  },
  {
    id: "view-dynamic-low-angle",
    category: "view",
    title: "Dynamic Low Angle",
    scene: "Heroic feel, action, product impact",
    positivePrompt:
      "dynamic low-angle composition, strong perspective lines, subject feels powerful and close to camera, controlled motion energy, readable silhouette, dramatic foreground scale",
    negativePrompt: "weak pose, flat perspective, awkward distortion, unclear silhouette",
    parameterHint: "Best at 3:4, 4:5, 16:9",
  },
  {
    id: "view-top-down-layout",
    category: "view",
    title: "Top-Down Flat Lay",
    scene: "Food, tabletops, props, product arrangements",
    positivePrompt:
      "top-down flat lay composition, carefully arranged objects, balanced spacing, clean negative space, precise material detail, editorial still-life styling",
    negativePrompt: "messy arrangement, overlapping clutter, uneven spacing, warped objects",
    parameterHint: "Best at 1:1, 4:3",
  },
  {
    id: "view-camera-contact-sheet",
    category: "view",
    title: "Multi-Angle Exploration",
    scene: "Camera angle exploration for the same subject",
    positivePrompt:
      "camera angle contact sheet, same subject shown from multiple cinematic viewpoints, consistent identity and environment, varied lens height and distance, clear composition options, production planning reference",
    negativePrompt: "different subjects, inconsistent environment, random style shifts, unreadable grid",
    parameterHint: "Best at 16:9, 4:3",
  },
  {
    id: "view-spatial-depth-rebuild",
    category: "view",
    title: "Spatial Depth Enhancement",
    scene: "Empty backgrounds, weak depth, scenes lacking layers",
    positivePrompt:
      "enhanced spatial depth, distinct foreground midground and background, believable scale cues, soft atmospheric separation, guided leading lines, subject remains clearly readable",
    negativePrompt: "flat backdrop, pasted-on subject, confusing scale, overcrowded background",
  },
  {
    id: "storyboard-keyframe",
    category: "storyboard",
    title: "Keyframe Storyboard",
    scene: "Video frames, ad storyboards, story beats",
    positivePrompt:
      "single storyboard keyframe, decisive action moment, clear character intent, readable camera angle, production-ready visual direction, concise visual storytelling",
    negativePrompt: "unclear action, inconsistent perspective, unreadable staging",
  },
  {
    id: "storyboard-three-beat",
    category: "storyboard",
    title: "Three-Beat Storyboard",
    scene: "Short videos, ads, narrative progression",
    positivePrompt:
      "three-panel storyboard layout, panel 1 establishing context, panel 2 clear action escalation, panel 3 emotional or product payoff, consistent character and environment, readable cinematic staging",
    negativePrompt: "random panels, inconsistent character, unclear sequence, crowded captions",
    parameterHint: "Best at 16:9 or landscape",
  },
  {
    id: "storyboard-camera-move",
    category: "storyboard",
    title: "Camera Move Planning",
    scene: "Image-to-video, camera prompts, dynamic scenes",
    positivePrompt:
      "cinematic camera movement plan, slow push-in toward the subject, subtle parallax between foreground and background, natural environmental motion, stable subject identity, filmic timing",
    negativePrompt: "shaky camera, chaotic movement, subject morphing, inconsistent background",
    parameterHint: "Best for video generation prompts",
  },
  {
    id: "storyboard-shot-grid",
    category: "storyboard",
    title: "Shot Comparison Grid",
    scene: "Quick comparison of composition, angles, and shot sizes",
    positivePrompt:
      "cinematic shot grid, nine compact storyboard frames exploring the same scene, varied shot sizes from wide medium to close-up, consistent subject continuity, clean readable staging, director planning board",
    negativePrompt: "unrelated panels, broken continuity, cluttered layout, inconsistent character design",
    parameterHint: "Best on a landscape canvas",
  },
  {
    id: "storyboard-action-continuity",
    category: "storyboard",
    title: "Action Continuity Board",
    scene: "Action breakdowns, transitions, video references",
    positivePrompt:
      "continuous action storyboard, sequential frames showing one motion from anticipation to execution to follow-through, consistent camera axis, readable pose progression, precise timing notes implied by the visuals",
    negativePrompt: "jump cuts without logic, impossible body motion, inconsistent props, unclear action direction",
    parameterHint: "Best at 16:9 or wide landscape",
  },
  {
    id: "storyboard-before-moment",
    category: "storyboard",
    title: "Before the Moment",
    scene: "Working backward from the current frame to what happened seconds earlier",
    positivePrompt:
      "pre-moment storyboard frame, infer what happened seconds before the current scene, coherent cause leading into the visible action, same location and subject identity, cinematic continuity",
    negativePrompt: "unrelated backstory, changed location, inconsistent subject, excessive text labels",
    parameterHint: "Useful for filling in video openings",
  },
  {
    id: "storyboard-after-moment",
    category: "storyboard",
    title: "After the Moment",
    scene: "Extending the current frame forward by a few seconds",
    positivePrompt:
      "next-moment storyboard frame, extend the current scene a few seconds forward, clear consequence of the action, consistent subject identity and environment, cinematic visual continuity",
    negativePrompt: "random outcome, changed style, subject identity drift, unclear progression",
    parameterHint: "Useful for filling in video endings",
  },
  {
    id: "storyboard-camera-orbit",
    category: "storyboard",
    title: "Orbital Camera Move",
    scene: "Product showcases, character reveals, spatial exploration",
    positivePrompt:
      "controlled orbit camera movement around the subject, stable focal target, smooth parallax across foreground and background, consistent lighting, elegant reveal of shape and environment",
    negativePrompt: "unstable camera, warped subject, broken perspective, chaotic background motion",
    parameterHint: "Best for video generation prompts",
  },
  {
    id: "storyboard-camera-follow",
    category: "storyboard",
    title: "Follow Camera Move",
    scene: "Character movement, product usage, action scenes",
    positivePrompt:
      "smooth tracking camera following the subject, steady screen direction, natural body or object motion, subtle background parallax, clear subject priority, cinematic pacing",
    negativePrompt: "shaky handheld chaos, subject slipping out of frame, motion smear, identity drift",
    parameterHint: "Best for video generation prompts",
  },
  {
    id: "character-consistency",
    category: "character",
    title: "Character Consistency",
    scene: "Character design, IP extension, multi-image consistency",
    positivePrompt:
      "consistent character design, recognizable face and silhouette, stable costume details, coherent color accents, expressive pose, clean character reference style",
    negativePrompt: "different face, inconsistent outfit, extra limbs, unstable identity",
  },
  {
    id: "character-turnaround",
    category: "character",
    title: "Character Turnaround Sheet",
    scene: "Design sheets, modeling references, IP characters",
    positivePrompt:
      "character turnaround sheet, front view side view and back view, same character identity, consistent proportions, clean neutral pose, readable costume construction, plain background",
    negativePrompt: "different outfits per view, inconsistent anatomy, perspective mismatch, busy background",
    parameterHint: "Best at 16:9, 4:3",
  },
  {
    id: "character-expression-sheet",
    category: "character",
    title: "Expression Sheet",
    scene: "Character expressions, comics, animation assets",
    positivePrompt:
      "character expression sheet, same character face across multiple expressions, happy serious surprised angry thoughtful, clean layout, consistent lighting and style",
    negativePrompt: "different identities, inconsistent face shape, random costumes, unreadable layout",
    parameterHint: "Best at 1:1, 4:3",
  },
  {
    id: "character-performance-shift",
    category: "character",
    title: "Performance Mood Shift",
    scene: "Keep the character, change the emotion and performance state",
    positivePrompt:
      "same character identity with a redesigned emotional performance, clear facial expression, body language aligned with the mood, consistent costume and lighting, believable acting nuance",
    negativePrompt: "different person, exaggerated cartoon emotion, mismatched pose, inconsistent costume details",
  },
  {
    id: "product-hero",
    category: "product",
    title: "Product Hero Shot",
    scene: "E-commerce, posters, brand showcases",
    positivePrompt:
      "premium product hero shot, product clearly visible, accurate material texture, controlled studio lighting, subtle reflections, clean commercial layout, high-end advertising finish",
    negativePrompt: "warped logo, unreadable text, dirty surface, cheap lighting, distracting props",
    parameterHint: "For text-heavy images, prefer an image model with stronger text capabilities",
  },
  {
    id: "product-packshot-clean",
    category: "product",
    title: "Clean White Background Product",
    scene: "E-commerce hero images, detail pages, product shots",
    positivePrompt:
      "clean ecommerce packshot, product centered, accurate shape and material, soft contact shadow, white or very light background, no distracting props, high-detail commercial finish",
    negativePrompt: "busy background, extra objects, distorted label, low quality reflections, cropped product",
    parameterHint: "Best at 1:1, 4:3",
  },
  {
    id: "product-lifestyle-context",
    category: "product",
    title: "Lifestyle Context",
    scene: "Brand mood, social media, e-commerce scene images",
    positivePrompt:
      "lifestyle product scene, product naturally used in context, believable human-scale environment, tasteful props, clear brand mood, warm but controlled commercial photography",
    negativePrompt: "product hidden, unrelated props, fake-looking scene, cluttered composition",
    parameterHint: "Best at 4:5, 16:9",
  },
  {
    id: "lighting-soft-studio",
    category: "lighting",
    title: "Soft Studio Light",
    scene: "Portraits, products, still life",
    positivePrompt:
      "soft studio lighting, large diffused key light, gentle fill light, smooth shadow transition, accurate color, refined highlights, professional photography finish",
    negativePrompt: "harsh flash, overexposure, crushed shadows, muddy color",
  },
  {
    id: "lighting-cinematic-night",
    category: "lighting",
    title: "Cinematic Night Light",
    scene: "Characters, street scenes, sci-fi, moody shots",
    positivePrompt:
      "cinematic night lighting, motivated practical lights, soft rim light, controlled contrast, subtle haze, rich dark tones with readable subject detail, film still atmosphere",
    negativePrompt: "black crushed details, noisy shadows, random neon, overexposed highlights",
    parameterHint: "Best at 16:9, 21:9",
  },
  {
    id: "lighting-golden-hour",
    category: "lighting",
    title: "Golden Hour",
    scene: "Outdoors, portraits, travel, warm moods",
    positivePrompt:
      "golden hour lighting, warm low-angle sunlight, soft long shadows, gentle atmospheric glow, natural skin tones or material color, calm cinematic warmth",
    negativePrompt: "flat noon light, oversaturated orange, harsh shadows, washed-out detail",
  },
  {
    id: "lighting-key-fill-rim",
    category: "lighting",
    title: "Three-Point Light Calibration",
    scene: "Characters, products, commercial studio shots",
    positivePrompt:
      "balanced three-point lighting, defined key light, subtle fill light, controlled rim light separating subject from background, clean highlight rolloff, professional studio clarity",
    negativePrompt: "flat lighting, uncontrolled spill, blown highlights, muddy shadows",
  },
  {
    id: "lighting-back-rim-glow",
    category: "lighting",
    title: "Back Rim Glow",
    scene: "Subject edges, product texture, atmospheric posters",
    positivePrompt:
      "motivated backlight and rim glow, luminous subject edges, readable silhouette, controlled lens bloom, subtle haze catching the light, cinematic separation from background",
    negativePrompt: "overexposed silhouette, washed-out subject, random glare, lost detail",
  },
  {
    id: "lighting-rembrandt-portrait",
    category: "lighting",
    title: "Rembrandt Portrait Light",
    scene: "Portraits, character design, dramatic shots",
    positivePrompt:
      "Rembrandt-inspired portrait lighting, angled key light creating a small cheek triangle, rich shadow modeling, natural skin texture, restrained background, painterly cinematic depth",
    negativePrompt: "flat face lighting, harsh flash, plastic skin, uneven eyes",
  },
  {
    id: "lighting-top-stage",
    category: "lighting",
    title: "Top Stage Light",
    scene: "Dramatic characters, stage, suspenseful atmosphere",
    positivePrompt:
      "dramatic overhead stage lighting, focused pool of light, sculpted shadows falling downward, strong mood isolation, subject readable within darkness, theatrical cinematic atmosphere",
    negativePrompt: "random spotlight, crushed subject detail, noisy darkness, unclear focal point",
  },
  {
    id: "lighting-high-key-clean",
    category: "lighting",
    title: "High-Key Clean Light",
    scene: "Beauty, baby care, fresh product visuals",
    positivePrompt:
      "high-key bright lighting, soft low-contrast shadows, clean whites, airy color palette, accurate material detail, polished commercial freshness",
    negativePrompt: "gray whites, harsh shadow edges, overexposed texture, dirty background",
  },
  {
    id: "lighting-flat-reference",
    category: "lighting",
    title: "Flat Reference Light",
    scene: "Design sheets, material references, reduced dramatic shadows",
    positivePrompt:
      "even flat reference lighting, minimal cast shadows, accurate color and material readability, neutral exposure, clear form description, practical design reference",
    negativePrompt: "dramatic contrast, color cast, deep shadow hiding details, glossy glare",
  },
  {
    id: "lighting-volumetric-beams",
    category: "lighting",
    title: "Volumetric Light Beams",
    scene: "Forests, window-side, stage, dusty atmospheres",
    positivePrompt:
      "volumetric light beams through visible air, subtle dust or mist catching the light, natural beam direction, readable subject silhouette, cinematic depth without overexposure",
    negativePrompt: "random light streaks, overexposed haze, hidden subject, artificial glow overlay",
  },
  {
    id: "custom-atmosphere-weather",
    category: "custom",
    title: "Weather Atmosphere Enhancement",
    scene: "Rain, snow, fog, dust — environmental mood effects",
    positivePrompt:
      "Atmosphere: [rain / snow / fog / dust / humid air]\nSubject: [subject]\nScene: [scene]\nEffect behavior: particles interact naturally with light, depth, surfaces and motion\nVisual goal: atmospheric enhancement without hiding the subject",
    negativePrompt: "effect covering the subject, random particles, fake overlay, low visibility",
  },
  {
    id: "custom-biome-glow",
    category: "custom",
    title: "Bioluminescence Effect",
    scene: "Fantasy, underwater, forest, sci-fi atmospheres",
    positivePrompt:
      "Environment: [environment]\nBioluminescent elements: [glowing plants / plankton / fungi / energy textures]\nLight behavior: soft organic glow, visible interaction with nearby surfaces, layered depth cues\nMood: mysterious but readable",
    negativePrompt: "random neon, overbright glow, noisy speckles, unreadable subject",
  },
  {
    id: "custom-surreal-afterimage",
    category: "custom",
    title: "Surreal Afterimage",
    scene: "Dreams, memory, surreal dynamic feel",
    positivePrompt:
      "Subject: [subject]\nSurreal motion idea: elongated afterimage, melting rhythm, dreamlike spatial distortion\nComposition: keep the subject recognizable while the surrounding forms bend with motion\nMood: poetic, uncanny, cinematic",
    negativePrompt: "unrecognizable subject, random deformation, messy abstraction, broken anatomy",
  },
  {
    id: "custom-structured-brief",
    category: "custom",
    title: "Structured Creative Brief",
    scene: "Organize ideas into generation-ready descriptions",
    positivePrompt:
      "Subject: [subject]\nContext: [scene or context]\nComposition: [composition]\nLighting: [lighting]\nStyle: [visual direction]\nDetails: [key details]\nOutput goal: [desired result]",
    negativePrompt: "unclear subject, inconsistent style, low quality output",
  },
  {
    id: "custom-text-poster-brief",
    category: "custom",
    title: "Text Poster Brief",
    scene: "Posters, infographics, event visuals",
    positivePrompt:
      "Poster type: [poster type]\nMain text: [exact text that must appear]\nSub text: [supporting text]\nSubject: [subject]\nLayout: [text and subject placement]\nStyle: [graphic / photographic / illustrated / cinematic]\nColor system: [primary and accent colors]\nReadability: crisp typography, clear hierarchy, no misspelled text",
    negativePrompt: "misspelled text, unreadable typography, random letters, cluttered layout",
    parameterHint: "For text-heavy designs, prefer an image model with stronger text capabilities",
  },
  {
    id: "custom-reference-remix",
    category: "custom",
    title: "Reference Remix",
    scene: "Image-to-image, style continuation, subject preservation",
    positivePrompt:
      "Keep from reference: [subject / composition / color palette to keep]\nChange: [elements to change]\nStyle direction: [target style]\nComposition: [image structure]\nQuality target: coherent identity, stable details, natural lighting, production-ready finish",
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
