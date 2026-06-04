import { NextRequest, NextResponse } from "next/server";
import { getVideoModelCapabilities, parseProviderModel } from "@/lib/providers/model-catalog";
import { generateVideo } from "@/lib/providers/video";
import { optionalText, requireText, resolveProviderConfig } from "@/lib/providers/utils";
import { mediaReferenceLabel, mediaReferenceTypeFromBase64DataUri, type MediaReferenceType } from "@/lib/media-references";
import { REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES, getReferenceMediaPayloadError } from "@/lib/reference-images";
import type { ReferenceMedia } from "@/lib/providers/types";

export const runtime = "edge";

interface GenerateVideoBody {
  prompt?: unknown;
  model?: unknown;
  aspectRatio?: unknown;
  durationSeconds?: unknown;
  preset?: unknown;
  referenceMode?: unknown;
  resolutionName?: unknown;
  image?: unknown;
  lastFrame?: unknown;
  images?: unknown;
  referenceMedia?: unknown;
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
    const referenceMedia = readReferenceMedia(body.referenceMedia, body.images, body.image, body.lastFrame);
    const formatError = getReferenceMediaFormatError(referenceMedia, capability.referenceMediaTypes);
    if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });
    const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 413 });
    validateReferenceCount(referenceMedia.length, capability.minReferenceImages, capability.maxReferenceImages);

    const result = await generateVideo(config, {
      prompt: requireText(body.prompt, "Prompt"),
      model: parsed.model,
      aspectRatio: optionalText(body.aspectRatio) ?? "16:9",
      durationSeconds: optionalText(body.durationSeconds),
      preset: optionalText(body.preset),
      referenceMode: readReferenceMode(body.referenceMode),
      resolutionName: optionalText(body.resolutionName),
      referenceMedia,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate video";
    console.error("Generate video endpoint failed:", err);
    return NextResponse.json({ error: message }, { status: videoErrorStatus(message) });
  }
}

function readReferenceMode(value: unknown): "reference" | "firstLast" | undefined {
  return value === "reference" || value === "firstLast" ? value : undefined;
}

function videoErrorStatus(message: string): number {
  if (message.includes("Video reference media must be data:image/*, data:video/* or data:audio/* base64 data URIs")) return 400;
  return message.includes("No available channel") ? 503 : 500;
}

function getRequestBodySizeError(req: NextRequest): string | null {
  const contentLength = req.headers.get("content-length");
  if (!contentLength) return null;

  const bytes = Number(contentLength);
  if (!Number.isFinite(bytes) || bytes <= REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) return null;
  return "参考媒体请求体过大，请压缩或减少参考媒体后重试";
}

function readReferenceMedia(referenceMedia: unknown, images: unknown, image: unknown, lastFrame: unknown): ReferenceMedia[] {
  if (Array.isArray(referenceMedia) && referenceMedia.length > 0) {
    return referenceMedia.map(readReferenceMediaValue).filter((reference): reference is ReferenceMedia => reference !== null);
  }

  if (Array.isArray(images) && images.length > 0) {
    return images
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map(readReferenceMediaItem);
  }

  const refs: string[] = [];
  if (typeof image === "string" && image.length > 0) refs.push(image);
  if (typeof lastFrame === "string" && lastFrame.length > 0) refs.push(lastFrame);
  return refs.map(readReferenceMediaItem);
}

function readReferenceMediaValue(value: unknown): ReferenceMedia | null {
  if (typeof value === "string" && value.length > 0) return readReferenceMediaItem(value);
  if (typeof value !== "object" || value === null || !("dataUri" in value)) return null;
  const dataUri = value.dataUri;
  if (typeof dataUri !== "string" || dataUri.length === 0) return null;
  return readReferenceMediaItem(dataUri);
}

function readReferenceMediaItem(dataUri: string): ReferenceMedia {
  const type = mediaReferenceTypeFromBase64DataUri(dataUri);
  if (!type) return { dataUri, type: "image" };
  return { dataUri, type };
}

function getReferenceMediaFormatError(referenceMedia: ReferenceMedia[], acceptedTypes: MediaReferenceType[]): string | null {
  for (const reference of referenceMedia) {
    const actualType = mediaReferenceTypeFromBase64DataUri(reference.dataUri);
    if (!actualType) return "Video reference media must be data:image/*, data:video/* or data:audio/* base64 data URIs";
    if (!acceptedTypes.includes(actualType)) return `当前视频模型不支持${mediaReferenceLabel(actualType)}输入`;
  }
  return null;
}

function validateReferenceCount(count: number, min: number, max: number): void {
  if (count < min) {
    throw new Error(`Selected video model requires at least ${min} reference image(s)`);
  }
  if (count > max) {
    throw new Error(`Selected video model supports at most ${max} reference image(s)`);
  }
}
