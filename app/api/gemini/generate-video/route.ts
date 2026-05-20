import { NextRequest, NextResponse } from "next/server";
import { getModelCapability, parseProviderModel } from "@/lib/providers/model-catalog";
import { generateVideo } from "@/lib/providers/video";
import { optionalText, requireText, resolveProviderConfig } from "@/lib/providers/utils";

export const runtime = "edge";

interface GenerateVideoBody {
  prompt?: unknown;
  model?: unknown;
  aspectRatio?: unknown;
  image?: unknown;
  lastFrame?: unknown;
  images?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateVideoBody;
    const modelValue = optionalText(body.model) ?? "12ai:veo_3_1-fast";
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);
    const capability = getModelCapability(modelValue, "video");
    const referenceImages = readReferenceImages(body.images, body.image, body.lastFrame);
    validateReferenceCount(referenceImages.length, capability.minReferenceImages, capability.maxReferenceImages);

    const result = await generateVideo(config, {
      prompt: requireText(body.prompt, "Prompt"),
      model: parsed.model,
      aspectRatio: optionalText(body.aspectRatio) ?? "16:9",
      referenceImages: referenceImages.map(dataUri => ({ dataUri })),
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate video";
    console.error("Generate video endpoint failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readReferenceImages(images: unknown, image: unknown, lastFrame: unknown): string[] {
  if (Array.isArray(images) && images.length > 0) {
    return images.filter((value): value is string => typeof value === "string" && value.length > 0);
  }

  const refs: string[] = [];
  if (typeof image === "string" && image.length > 0) refs.push(image);
  if (typeof lastFrame === "string" && lastFrame.length > 0) refs.push(lastFrame);
  return refs;
}

function validateReferenceCount(count: number, min: number, max: number): void {
  if (count < min) {
    throw new Error(`Selected video model requires at least ${min} reference image(s)`);
  }
  if (count > max) {
    throw new Error(`Selected video model supports at most ${max} reference image(s)`);
  }
}
