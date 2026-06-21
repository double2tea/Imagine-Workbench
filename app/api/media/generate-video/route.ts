import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireApiText } from "@/lib/api/errors";
import { DEFAULT_VIDEO_MODEL, getModelCapability, parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { ModelCapabilityValidationError, validateInputModalityReferences } from "@/lib/providers/model-capabilities";
import { generateVideo } from "@/lib/providers/video";
import {
  isRunningHubTaskTarget,
  readRunningHubNodeInfoList,
  resolveRunningHubNodeInfoListForModel,
  runningHubResolvedNodeInfoAllowsEmptyPrompt,
} from "@/lib/providers/runninghub-node-info";
import { optionalText, resolveProviderConfig } from "@/lib/providers/utils";
import { mediaReferenceTypeFromBase64DataUri } from "@/lib/media-references";
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
  runningHubAccessPassword?: unknown;
  runningHubNodeInfoList?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const bodySizeError = getRequestBodySizeError(req);
    if (bodySizeError) return NextResponse.json({ error: bodySizeError }, { status: 413 });

    const body = (await req.json()) as GenerateVideoBody;
    const modelValue = optionalText(body.model) ?? DEFAULT_VIDEO_MODEL;
    const parsed = parseProviderModel(modelValue, "12ai");
    const config = resolveProviderConfig(req, parsed.provider);
    const isRunningHubVideoTask = parsed.provider === "runninghub" && isRunningHubTaskTarget(parsed.model, "video");
    const modelCapability = isRunningHubVideoTask ? null : getModelCapability(modelValue, "video");
    const referenceMedia = readReferenceMedia(body.referenceMedia, body.images, body.image, body.lastFrame);
    const explicitRunningHubNodeInfoList = readRunningHubNodeInfoList(body.runningHubNodeInfoList);
    const runningHubNodeInfo = resolveRunningHubNodeInfoListForModel(parsed.model, explicitRunningHubNodeInfoList);
    const formatError = getReferenceMediaFormatError(referenceMedia);
    if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });
    const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 413 });
    if (modelCapability) validateInputModalityReferences(modelCapability.inputModalities, referenceMedia);

    const allowsEmptyPrompt = runningHubResolvedNodeInfoAllowsEmptyPrompt(parsed.model, "video", runningHubNodeInfo);
    const result = await generateVideo(config, {
      prompt: allowsEmptyPrompt ? optionalText(body.prompt) ?? "" : requireApiText(body.prompt, "Prompt"),
      model: parsed.model,
      aspectRatio: optionalText(body.aspectRatio) ?? "16:9",
      durationSeconds: optionalText(body.durationSeconds),
      preset: optionalText(body.preset),
      referenceMode: readReferenceMode(body.referenceMode),
      resolutionName: optionalText(body.resolutionName),
      referenceMedia,
      runningHubAccessPassword: optionalText(body.runningHubAccessPassword),
      runningHubNodeInfoList: runningHubNodeInfo.nodeInfoList,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate video";
    console.error("Generate video endpoint failed:", err);
    if (err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message, code: "invalid_provider_model" }, { status: 400 });
    }
    if (err instanceof ModelCapabilityValidationError) {
      return NextResponse.json({ error: message, code: "invalid_reference_media" }, { status: 400 });
    }
    if (message.includes("No available channel")) {
      return NextResponse.json({ error: message, code: "provider_unavailable" }, { status: 503 });
    }
    const response = apiErrorResponse(err, "Failed to generate video");
    return NextResponse.json(response.body, { status: response.status });
  }
}

function readReferenceMode(value: unknown): "reference" | "firstLast" | undefined {
  return value === "reference" || value === "firstLast" ? value : undefined;
}

function getRequestBodySizeError(req: NextRequest): string | null {
  const contentLength = req.headers.get("content-length");
  if (!contentLength) return null;

  const bytes = Number(contentLength);
  if (!Number.isFinite(bytes) || bytes <= REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) return null;
  return "Reference media request body is too large, please compress or remove reference media and retry";
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

function getReferenceMediaFormatError(referenceMedia: ReferenceMedia[]): string | null {
  for (const reference of referenceMedia) {
    const actualType = mediaReferenceTypeFromBase64DataUri(reference.dataUri);
    if (!actualType) return "Video reference media must be data:image/*, data:video/* or data:audio/* base64 data URIs";
  }
  return null;
}
