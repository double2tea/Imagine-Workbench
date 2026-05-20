export interface VisualPreset {
  id: string;
  name: string;
  emoji: string;
  promptSuffix: string;
  negativePrompt?: string;
}

export const VISUAL_PRESETS: VisualPreset[] = [
  {
    id: "cinematic-film",
    name: "电影胶片",
    emoji: "🎬",
    promptSuffix: "cinematic film style, captured on 35mm stock, soft key lighting, dramatic backlight, warm shadows, award-winning cinematography, f/2.0 aperture, slight grain texture",
    negativePrompt: "low resolution, poorly drawn hands, duplicate, low quality, cartoon, illustration, drawing"
  },
  {
    id: "cyberpunk",
    name: "赛博朋克",
    emoji: "🌆",
    promptSuffix: "cyberpunk futuristic aesthetic, neon glowing violet and teal color palette, dark atmospheric streets, rain puddle reflections, volumetric fog, holographic ads in background",
    negativePrompt: "daylight, natural lighting, rustic, serene, sunny, warm colors"
  },
  {
    id: "studio-portrait",
    name: "棚拍肖像",
    emoji: "👤",
    promptSuffix: "minimalist high-fashion studio portrait, clean solid background, flawless octane render, Rembrandt studio lighting, sharp focus on eyes, editorial photography, 85mm lens, glamorous mood",
    negativePrompt: "noisy background, distorted face, bad anatomy, flat lighting, casual"
  },
  {
    id: "retro-anime",
    name: "复古动漫",
    emoji: "🇯🇵",
    promptSuffix: "vintage 1990s anime aesthetic, hand-drawn cel shaded illustration, atmospheric color grading, aesthetic nostalgic style, Studio Ghibli vibes, hand-painted watercolor background",
    negativePrompt: "photorealistic, 3D render, real life, low quality, digital painting"
  },
  {
    id: "cybernetic-mech",
    name: "科幻机甲",
    emoji: "🤖",
    promptSuffix: "mecha sci-fi concept art, highly detailed metallic armor plates, glowing power cells, dark industrial hangar background, dramatic high-contrast key lights, architectural tech-vibe",
    negativePrompt: "organic, medieval, vintage, historical, low detail"
  },
  {
    id: "watercolor-dream",
    name: "梦幻水彩",
    emoji: "🎨",
    promptSuffix: "delicate watercolor painting, artistic splatters, wet-on-wet blend techniques, pastel color scheme, dreamy atmosphere, elegant organic textures, hand-painted masterwork",
    negativePrompt: "photo, render, neon, dark, cyber, sharp lines, mechanical"
  },
  {
    id: "claymation",
    name: "黏土定格",
    emoji: "🧸",
    promptSuffix: "cute 3D claymation puppet, stop-motion style, miniature world, rich plasticine texture, cute rounded proportions, studio softbox lighting",
    negativePrompt: "flat drawing, human, realism, photography, sleek, sharp metal"
  }
];
