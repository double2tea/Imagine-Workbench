import { NextRequest, NextResponse } from "next/server";
import { parseProviderModel } from "@/lib/providers/model-catalog";
import { generateImage } from "@/lib/providers/image";
import { optionalText, requireText, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface GenerateImageBody {
  prompt?: unknown;
  model?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
  thinkingLevel?: unknown;
  referenceImage?: unknown;
  referenceImages?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateImageBody;
    const modelValue = optionalText(body.model) ?? "12ai:gemini-3.1-flash-image-preview";
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);
    const referenceImages = readReferenceImages(body.referenceImages, body.referenceImage);

    const result = await generateImage(config, {
      prompt: requireText(body.prompt, "Prompt"),
      model: parsed.model,
      aspectRatio: optionalText(body.aspectRatio) ?? "1:1",
      imageSize: optionalText(body.imageSize) ?? "1K",
      thinkingLevel: optionalText(body.thinkingLevel),
      referenceImages: referenceImages.map(dataUri => ({ dataUri })),
      async: parsed.async,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate image";
    console.error("Image generation route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readReferenceImages(referenceImages: unknown, referenceImage: unknown): string[] {
  if (Array.isArray(referenceImages)) {
    return referenceImages.filter((value): value is string => typeof value === "string" && value.length > 0);
  }
  if (typeof referenceImage === "string" && referenceImage.length > 0) {
    return [referenceImage];
  }
  return [];
}
