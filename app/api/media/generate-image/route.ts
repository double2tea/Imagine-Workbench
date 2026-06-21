import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiErrorResponse, requireApiText } from "@/lib/api/errors";
import { assertPublicHttpUrl } from "@/lib/api/url-safety";
import { DEFAULT_IMAGE_MODEL, getImageModelCapabilities, getImageResolutionOptions, getModelCapability, parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { ModelCapabilityValidationError, validateInputModalityReferences } from "@/lib/providers/model-capabilities";
import { generateImage } from "@/lib/providers/image";
import {
  isRunningHubTaskTarget,
  readRunningHubNodeInfoList,
  resolveRunningHubNodeInfoListForModel,
  runningHubResolvedNodeInfoAllowsEmptyPrompt,
} from "@/lib/providers/runninghub-node-info";
import { dataUriToBlob, optionalText, resolveProviderConfig } from "@/lib/providers/utils";
import { getRunningHubYouchuanCatalog } from "@/lib/providers/runninghub";
import { mediaReferenceTypeFromBase64DataUri } from "@/lib/media-references";
import type { ReferenceMedia, RunningHubYouchuanAdvancedSettings } from "@/lib/providers/types";
import { REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES, getReferenceImagePayloadError, getReferenceMediaPayloadError } from "@/lib/reference-images";

export const runtime = "edge";

interface GenerateImageBody {
  prompt?: unknown;
  model?: unknown;
  aspectRatio?: unknown;
  imageResolution?: unknown;
  imageQuality?: unknown;
  thinkingLevel?: unknown;
  runningHubAccessPassword?: unknown;
  runningHubNodeInfoList?: unknown;
  runningHubYouchuan?: unknown;
  referenceImage?: unknown;
  referenceImages?: unknown;
  referenceMedia?: unknown;
}

class ImageRequestValidationError extends Error {}

export async function POST(req: NextRequest) {
  try {
    const bodySizeError = getRequestBodySizeError(req);
    if (bodySizeError) return NextResponse.json({ error: bodySizeError }, { status: 413 });

    const body = (await req.json()) as GenerateImageBody;
    const modelValue = optionalText(body.model) ?? DEFAULT_IMAGE_MODEL;
    const parsed = parseProviderModel(modelValue, "12ai");
    const isRunningHubImageTask = parsed.provider === "runninghub" && isRunningHubTaskTarget(parsed.model, "image");
    const modelCapability = isRunningHubImageTask ? null : getModelCapability(modelValue, "image");
    const config = resolveProviderConfig(req, parsed.provider);
    const requestImageResolution = optionalText(body.imageResolution);
    const aspectRatio = customImageSizeAspectRatio(requestImageResolution) ?? optionalText(body.aspectRatio) ?? "1:1";
    const imageResolution = isRunningHubImageTask ? requestImageResolution ?? "auto" : resolveImageResolution(modelValue, aspectRatio, requestImageResolution);
    const imageQuality = isRunningHubImageTask ? optionalText(body.imageQuality) : resolveImageQuality(modelValue, optionalText(body.imageQuality));
    const legacyReferenceImages = readReferenceImages(body.referenceImages, body.referenceImage);
    const referenceMedia = readReferenceMedia(body.referenceMedia, legacyReferenceImages);
    const referenceImages = referenceMedia
      .filter(reference => reference.type === "image")
      .map(reference => reference.dataUri);
    const runningHubYouchuan = isRunningHubImageTask ? undefined : readRunningHubYouchuanAdvancedSettings(body.runningHubYouchuan, parsed.model);
    const explicitRunningHubNodeInfoList = readRunningHubNodeInfoList(body.runningHubNodeInfoList);
    const runningHubNodeInfo = resolveRunningHubNodeInfoListForModel(parsed.model, explicitRunningHubNodeInfoList);
    const formatError = getReferenceMediaFormatError(referenceMedia);
    if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });
    const payloadError = isRunningHubImageTask
      ? getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri))
      : getReferenceImagePayloadError([...referenceImages, ...runningHubYouchuanReferenceImages(runningHubYouchuan)]);
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 413 });
    if (modelCapability) validateInputModalityReferences(modelCapability.inputModalities, referenceMedia);

    const allowsEmptyPrompt = runningHubResolvedNodeInfoAllowsEmptyPrompt(parsed.model, "image", runningHubNodeInfo);
    const result = await generateImage(config, {
      prompt: allowsEmptyPrompt ? optionalText(body.prompt) ?? "" : requireApiText(body.prompt, "Prompt"),
      model: parsed.model,
      aspectRatio,
      imageResolution,
      imageQuality,
      thinkingLevel: optionalText(body.thinkingLevel),
      referenceImages: referenceImages.map(dataUri => ({ dataUri })),
      referenceMedia,
      async: parsed.async,
      runningHubAccessPassword: optionalText(body.runningHubAccessPassword),
      runningHubNodeInfoList: runningHubNodeInfo.nodeInfoList,
      runningHubYouchuan,
    });

    const imageUrls = result.imageUrls ?? (result.imageUrl ? [result.imageUrl] : []);
    if (imageUrls.length > 1) return imageUrlsJsonResponse(imageUrls, result.source);
    const imageUrl = imageUrls[0];

    if (imageUrl?.startsWith("data:")) {
      const blob = dataUriToBlob(imageUrl);
      return new Response(blob, {
        headers: {
          "Content-Type": blob.type || "image/png",
          "Cache-Control": "no-store",
          "x-image-source": result.source,
        },
      });
    }
    if (imageUrl?.startsWith("http://") || imageUrl?.startsWith("https://")) {
      return imageUrlResponse(imageUrl, result.source);
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate image";
    if (err instanceof ImageRequestValidationError || err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (err instanceof ModelCapabilityValidationError) {
      return NextResponse.json({ error: message, code: "invalid_reference_media" }, { status: 400 });
    }
    const response = apiErrorResponse(err, "Failed to generate image");
    if (response.status >= 500 && !(err instanceof ApiError)) console.error("Image generation route error:", err);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function readRunningHubYouchuanAdvancedSettings(value: unknown, model: string): RunningHubYouchuanAdvancedSettings | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ImageRequestValidationError("runningHubYouchuan must be an object");
  const catalog = getRunningHubYouchuanCatalog(model);
  if (!catalog) throw new ImageRequestValidationError("runningHubYouchuan is only supported for Youchuan image models");
  const allowedFields = new Set<keyof RunningHubYouchuanAdvancedSettings>([
    ...catalog.numericParams.map(param => param.field),
    ...catalog.booleanParams.map(param => param.field),
    ...catalog.referenceParams.map(param => param.field),
  ]);
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field as keyof RunningHubYouchuanAdvancedSettings)) {
      throw new ImageRequestValidationError(`runningHubYouchuan.${field} is not supported for this Youchuan model`);
    }
  }
  const settings: Partial<RunningHubYouchuanAdvancedSettings> = {};
  for (const param of catalog.numericParams) {
    Object.assign(settings, {
      [param.field]:
        value[param.field] === undefined
          ? param.defaultValue
          : readNumberInRange(value, param.field, param.min, param.max),
    });
  }
  for (const param of catalog.booleanParams) {
    Object.assign(settings, {
      [param.field]:
        value[param.field] === undefined
          ? param.defaultValue
          : readBooleanField(value, param.field),
    });
  }
  for (const param of catalog.referenceParams) {
    Object.assign(settings, readOptionalImageReferenceField(value, param.field));
  }
  if (
    typeof settings.chaos !== "number" ||
    typeof settings.stylize !== "number" ||
    typeof settings.raw !== "boolean" ||
    typeof settings.iw !== "number" ||
    typeof settings.sw !== "number"
  ) {
    throw new ImageRequestValidationError("runningHubYouchuan is missing required Youchuan parameters");
  }
  return settings as RunningHubYouchuanAdvancedSettings;
}

function readNumberInRange(record: Record<string, unknown>, field: keyof RunningHubYouchuanAdvancedSettings, min: number, max: number): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ImageRequestValidationError(`runningHubYouchuan.${field} must be a number from ${min} to ${max}`);
  }
  return value;
}

function readBooleanField(record: Record<string, unknown>, field: keyof RunningHubYouchuanAdvancedSettings): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new ImageRequestValidationError(`runningHubYouchuan.${field} must be a boolean`);
  }
  return value;
}

function readOptionalImageReferenceField(
  record: Record<string, unknown>,
  field: "sref" | "oref",
): Partial<Pick<RunningHubYouchuanAdvancedSettings, "sref" | "oref">> {
  const value = record[field];
  if (value === undefined) return {};
  if (typeof value !== "string" || value.length === 0) {
    throw new ImageRequestValidationError(`runningHubYouchuan.${field} must be an image URL or data URI`);
  }
  if (!value.startsWith("data:image/") && !value.startsWith("http://") && !value.startsWith("https://")) {
    throw new ImageRequestValidationError(`runningHubYouchuan.${field} must be an image URL or data URI`);
  }
  return { [field]: value };
}

function runningHubYouchuanReferenceImages(settings: RunningHubYouchuanAdvancedSettings | undefined): string[] {
  return [settings?.sref, settings?.oref].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function imageUrlResponse(imageUrl: string, source: string): Promise<Response> {
  const response = await fetch(assertPublicHttpUrl(imageUrl, "unsafe_image_result_url"));
  if (!response.ok) {
    throw new Error(`Image result download failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") ?? "image/png";
  if (!contentType.startsWith("image/")) {
    throw new Error("Image result is not an image response");
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "x-image-source": source,
    },
  });
}

async function imageUrlsJsonResponse(imageUrls: string[], source: string): Promise<Response> {
  const localizedImageUrls: string[] = [];
  for (const imageUrl of imageUrls) {
    localizedImageUrls.push(await localizeImageResultUrl(imageUrl));
  }
  return NextResponse.json({
    imageUrl: localizedImageUrls[0],
    imageUrls: localizedImageUrls,
    source,
  });
}

async function localizeImageResultUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) return imageUrl;
  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    throw new Error("Image result URL format is not supported");
  }

  const response = await fetch(assertPublicHttpUrl(imageUrl, "unsafe_image_result_url"));
  if (!response.ok) {
    throw new Error(`Image result download failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") ?? "image/png";
  if (!contentType.startsWith("image/")) {
    throw new Error("Image result is not an image response");
  }

  return `data:${contentType};base64,${arrayBufferToBase64(await response.arrayBuffer())}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
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
  return "Reference image request body is too large, please compress or remove reference images and retry";
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

function readReferenceMedia(referenceMedia: unknown, fallbackImages: string[]): ReferenceMedia[] {
  if (Array.isArray(referenceMedia) && referenceMedia.length > 0) {
    return referenceMedia.map(readReferenceMediaValue).filter((reference): reference is ReferenceMedia => reference !== null);
  }
  return fallbackImages.map(dataUri => ({ dataUri, type: "image" }));
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
    if (!actualType) return "Reference media must be data:image/*, data:video/* or data:audio/* base64 data URIs";
  }
  return null;
}
