import { NextRequest, NextResponse } from "next/server";
import { getVideoModelCapabilities, parseProviderModel } from "@/lib/providers/model-catalog";
import { generateVideo } from "@/lib/providers/video";
import { optionalText, requireText, resolveProviderConfig } from "@/lib/providers/utils";
import { REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES, getReferenceImagePayloadError } from "@/lib/reference-images";

export const runtime = "edge";

interface GenerateVideoBody {
  prompt?: unknown;
  model?: unknown;
  aspectRatio?: unknown;
  durationSeconds?: unknown;
  preset?: unknown;
  resolutionName?: unknown;
  image?: unknown;
  lastFrame?: unknown;
  images?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const bodySizeError = getRequestBodySizeError(req);
    if (bodySizeError) return NextResponse.json({ error: bodySizeError }, { status: 413 });

    const body = (await req.json()) as GenerateVideoBody;
    const modelValue = optionalText(body.model) ?? "12ai:veo_3_1-fast";
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);
    const capability = getVideoModelCapabilities(modelValue);
    const referenceImages = readReferenceImages(body.images, body.image, body.lastFrame);
    const payloadError = getReferenceImagePayloadError(referenceImages);
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 413 });
    validateReferenceCount(referenceImages.length, capability.minReferenceImages, capability.maxReferenceImages);

    const result = await generateVideo(config, {
      prompt: requireText(body.prompt, "Prompt"),
      model: parsed.model,
      aspectRatio: optionalText(body.aspectRatio) ?? "16:9",
      durationSeconds: optionalText(body.durationSeconds),
      preset: optionalText(body.preset),
      resolutionName: optionalText(body.resolutionName),
      referenceImages: referenceImages.map(dataUri => ({ dataUri })),
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate video";
    console.error("Generate video endpoint failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getRequestBodySizeError(req: NextRequest): string | null {
  const contentLength = req.headers.get("content-length");
  if (!contentLength) return null;

  const bytes = Number(contentLength);
  if (!Number.isFinite(bytes) || bytes <= REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) return null;
  return "参考图请求体过大，请压缩或减少参考图后重试";
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
