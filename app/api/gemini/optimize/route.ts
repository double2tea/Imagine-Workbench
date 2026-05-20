import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const customKey = req.headers.get("x-gemini-api-key") || undefined;
    const ai = getGeminiClient(customKey);

    const systemInstruction = 
      "You are an expert prompt engineer for cutting-edge AI image and video models (like Imagen 3, Stable Diffusion XL, Midjourney, Veo). " +
      "Your task is to take a simple, short prompt and expand it into a masterful, high-fidelity description. " +
      "Describe the visual subject in rich detail, the style (e.g., editorial portrait, digital concept art, analog film), " +
      "the precise lighting (e.g., soft key light, dramatic chiaroscuro, high-contrast cyberpunk lighting), " +
      "the photographic or cinematic attributes (e.g., shot on 35mm, 85mm lens, f/1.8, cinematic depth of field, slow-motion grain), " +
      "and the color palette (e.g., muted earth tones, neon-saturated, high-contrast monochrome). " +
      "Do not use generic hype words like 'photorealistic', 'ultra realistic', 'hyperdetailed', or '8K'. " +
      "Deliver ONLY the revised, expanded prompt itself in English, with absolutely no preamble, tags, bullet points or surrounding conversational filler.";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Prompt to expand: "${prompt}"`,
      config: {
        systemInstruction,
        temperature: 0.85,
      },
    });

    const optimized = response.text?.trim() || prompt;
    return NextResponse.json({ optimized });
  } catch (err: any) {
    console.error("Error in prompt optimization:", err);
    return NextResponse.json({ error: err.message || "Failed to optimize prompt" }, { status: 500 });
  }
}
