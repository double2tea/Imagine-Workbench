import { NextRequest, NextResponse } from "next/server";
import { parseProviderModel } from "@/lib/providers/model-catalog";
import { generateImage } from "@/lib/providers/image";
import { dataUriToBlob, optionalText, requireText, resolveProviderConfig } from "@/lib/providers/utils";
import { REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES, getReferenceImagePayloadError } from "@/lib/reference-images";

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
    const bodySizeError = getRequestBodySizeError(req);
    if (bodySizeError) return NextResponse.json({ error: bodySizeError }, { status: 413 });

    const body = (await req.json()) as GenerateImageBody;
    const modelValue = optionalText(body.model) ?? "12ai:gemini-3.1-flash-image-preview";
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);
    const referenceImages = readReferenceImages(body.referenceImages, body.referenceImage);
    const payloadError = getReferenceImagePayloadError(referenceImages);
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 413 });

    const result = await generateImage(config, {
      prompt: requireText(body.prompt, "Prompt"),
      model: parsed.model,
      aspectRatio: optionalText(body.aspectRatio) ?? "1:1",
      imageSize: optionalText(body.imageSize) ?? "1K",
      thinkingLevel: optionalText(body.thinkingLevel),
      referenceImages: referenceImages.map(dataUri => ({ dataUri })),
      async: parsed.async,
    });

    if (result.imageUrl?.startsWith("data:")) {
      const blob = dataUriToBlob(result.imageUrl);
      return new Response(blob, {
        headers: {
          "Content-Type": blob.type || "image/png",
          "Cache-Control": "no-store",
          "x-image-source": result.source,
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate image";
    console.error("Image generation route error:", err);
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

function readReferenceImages(referenceImages: unknown, referenceImage: unknown): string[] {
  if (Array.isArray(referenceImages)) {
    return referenceImages.filter((value): value is string => typeof value === "string" && value.length > 0);
  }
  if (typeof referenceImage === "string" && referenceImage.length > 0) {
    return [referenceImage];
  }
  return [];
}
