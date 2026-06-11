import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { assertPublicHttpUrl } from "@/lib/api/url-safety";
import { editImage } from "@/lib/providers/image";
import { parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { dataUriToBlob, optionalText, resolveProviderConfig } from "@/lib/providers/utils";
import { REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES, getReferenceImagePayloadError } from "@/lib/reference-images";
import type { ImageEditOperation } from "@/lib/providers/types";

export const runtime = "edge";

interface EditImageBody {
  operation?: unknown;
  model?: unknown;
  image?: unknown;
  mask?: unknown;
  guide?: unknown;
  prompt?: unknown;
  imageResolution?: unknown;
  imageQuality?: unknown;
}

class ImageEditRequestValidationError extends Error {}

const IMAGE_EDIT_OPERATIONS = new Set<ImageEditOperation>(["redraw", "erase", "outpaint", "cutout"]);

export async function POST(req: NextRequest) {
  try {
    const bodySizeError = getRequestBodySizeError(req);
    if (bodySizeError) return NextResponse.json({ error: bodySizeError }, { status: 413 });

    const body = (await req.json()) as EditImageBody;
    const operation = readOperation(body.operation);
    const modelValue = requireApiText(body.model, "model");
    const image = requireApiText(body.image, "image");
    const mask = optionalText(body.mask);
    const guide = optionalText(body.guide);
    const prompt = optionalText(body.prompt);
    validatePrompt(operation, prompt);

    const payloadError = getReferenceImagePayloadError([image, ...(mask ? [mask] : []), ...(guide ? [guide] : [])]);
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 413 });

    const parsed = parseProviderModel(modelValue, "12ai");
    if (parsed.provider === "runninghub") {
      throw badRequest(
        "RunningHub quick image edits require /api/media/generate-image with an image-to-image Standard Model, AI App, or workflow target",
        "unsupported_image_edit_provider",
      );
    }
    const config = resolveProviderConfig(req, parsed.provider);
    const result = await editImage(config, {
      operation,
      prompt,
      model: parsed.model,
      image: { dataUri: image },
      ...(mask ? { mask: { dataUri: mask } } : {}),
      ...(guide ? { guide: { dataUri: guide } } : {}),
      imageResolution: optionalText(body.imageResolution) ?? "auto",
      imageQuality: optionalText(body.imageQuality),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to edit image";
    if (error instanceof ImageEditRequestValidationError || error instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const response = apiErrorResponse(error, "Failed to edit image");
    if (response.status >= 500 && !(error instanceof ApiError)) console.error("Image edit route error:", error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

async function imageUrlResponse(imageUrl: string, source: string): Promise<Response> {
  const response = await fetch(assertPublicHttpUrl(imageUrl, "unsafe_image_result_url"));
  if (!response.ok) {
    throw new Error(`图片编辑结果下载失败：HTTP ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") ?? "image/png";
  if (!contentType.startsWith("image/")) {
    throw new Error("图片编辑结果不是图片响应");
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "x-image-source": source,
    },
  });
}

function readOperation(value: unknown): ImageEditOperation {
  if (typeof value === "string" && IMAGE_EDIT_OPERATIONS.has(value as ImageEditOperation)) {
    return value as ImageEditOperation;
  }
  throw new ImageEditRequestValidationError("Unsupported image edit operation");
}

function validatePrompt(operation: ImageEditOperation, prompt: string | undefined): void {
  if ((operation === "redraw" || operation === "outpaint") && !prompt) {
    throw new ImageEditRequestValidationError("prompt is required for this image edit operation");
  }
}

function getRequestBodySizeError(req: NextRequest): string | null {
  const contentLength = req.headers.get("content-length");
  if (!contentLength) return null;

  const bytes = Number(contentLength);
  if (!Number.isFinite(bytes) || bytes <= REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) return null;
  return "图片编辑请求体过大，请压缩图片后重试";
}
