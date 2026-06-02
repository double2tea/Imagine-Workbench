import { NextRequest, NextResponse } from "next/server";
import { getImageModelCapabilities, getImageResolutionOptions, parseProviderModel } from "@/lib/providers/model-catalog";
import { generateImage } from "@/lib/providers/image";
import { dataUriToBlob, optionalText, requireText, resolveProviderConfig } from "@/lib/providers/utils";
import { REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES, getReferenceImagePayloadError } from "@/lib/reference-images";

export const runtime = "edge";

interface GenerateImageBody {
  prompt?: unknown;
  model?: unknown;
  aspectRatio?: unknown;
  imageResolution?: unknown;
  imageQuality?: unknown;
  thinkingLevel?: unknown;
  referenceImage?: unknown;
  referenceImages?: unknown;
}

class ImageRequestValidationError extends Error {}

export async function POST(req: NextRequest) {
  try {
    const bodySizeError = getRequestBodySizeError(req);
    if (bodySizeError) return NextResponse.json({ error: bodySizeError }, { status: 413 });

    const body = (await req.json()) as GenerateImageBody;
    const modelValue = optionalText(body.model) ?? "12ai:gemini-3.1-flash-image-preview";
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);
    const requestImageResolution = optionalText(body.imageResolution);
    const aspectRatio = customImageSizeAspectRatio(requestImageResolution) ?? optionalText(body.aspectRatio) ?? "1:1";
    const imageResolution = resolveImageResolution(modelValue, aspectRatio, requestImageResolution);
    const imageQuality = resolveImageQuality(modelValue, optionalText(body.imageQuality));
    const referenceImages = readReferenceImages(body.referenceImages, body.referenceImage);
    const payloadError = getReferenceImagePayloadError(referenceImages);
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 413 });

    const result = await generateImage(config, {
      prompt: requireText(body.prompt, "Prompt"),
      model: parsed.model,
      aspectRatio,
      imageResolution,
      imageQuality,
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
    if (result.imageUrl?.startsWith("http://") || result.imageUrl?.startsWith("https://")) {
      return imageUrlResponse(result.imageUrl, result.source);
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate image";
    if (err instanceof ImageRequestValidationError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Image generation route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function imageUrlResponse(imageUrl: string, source: string): Promise<Response> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`图片结果下载失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") ?? "image/png";
  if (!contentType.startsWith("image/")) {
    throw new Error("图片结果不是图片响应");
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "x-image-source": source,
    },
  });
}

function resolveImageResolution(modelValue: string, aspectRatio: string, imageResolution: string | undefined): string {
  const options = getImageResolutionOptions(modelValue, aspectRatio);
  if (options.length === 0) return imageResolution ?? "auto";
  if (!imageResolution) {
    throw new ImageRequestValidationError("imageResolution is required for this image model");
  }
  if (options.some(option => option.value === imageResolution)) return imageResolution;
  if (options.some(option => option.value === "custom") && isValidCustomImageResolution(imageResolution, aspectRatio)) {
    return imageResolution;
  }
  throw new ImageRequestValidationError(`Unsupported imageResolution "${imageResolution}" for aspectRatio "${aspectRatio}"`);
}

function resolveImageQuality(modelValue: string, imageQuality: string | undefined): string | undefined {
  if (!imageQuality) return undefined;
  const capabilities = getImageModelCapabilities(modelValue);
  if (capabilities.qualities.some(option => option.value === imageQuality)) return imageQuality;
  throw new ImageRequestValidationError(`Unsupported imageQuality "${imageQuality}" for this image model`);
}

function isValidCustomImageResolution(value: string, aspectRatio: string): boolean {
  const match = value.match(/^(\d+)x(\d+)$/);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width > 3840 || height > 3840) return false;
  if (width % 16 !== 0 || height % 16 !== 0) return false;
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (longSide / shortSide > 3) return false;
  const pixels = width * height;
  return pixels >= 655360 && pixels <= 8294400 && pixelSizeAspectRatio(width, height) === aspectRatio;
}

function customImageSizeAspectRatio(value: string | undefined): string | null {
  if (!value || !/^\d+x\d+$/.test(value)) return null;
  const [widthText, heightText] = value.split("x");
  const width = Number(widthText);
  const height = Number(heightText);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  return pixelSizeAspectRatio(width, height);
}

function pixelSizeAspectRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = a;
  let right = b;
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left;
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
