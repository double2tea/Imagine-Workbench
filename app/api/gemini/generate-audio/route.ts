import { NextRequest, NextResponse } from "next/server";
import { mediaReferenceLabel, mediaReferenceTypeFromBase64DataUri, type MediaReferenceType } from "@/lib/media-references";
import { generateAudio } from "@/lib/providers/audio";
import { parseProviderModel } from "@/lib/providers/model-catalog";
import type {
  ReferenceMedia,
  RunningHubTaskBindingDelivery,
  RunningHubTaskBindingSource,
  RunningHubTaskBindingValueType,
  RunningHubTaskNodeBinding,
} from "@/lib/providers/types";
import { optionalText, resolveProviderConfig } from "@/lib/providers/utils";
import { getReferenceMediaPayloadError, REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES } from "@/lib/reference-images";

export const runtime = "edge";

interface GenerateAudioBody {
  model?: unknown;
  prompt?: unknown;
  referenceMedia?: unknown;
  runningHubAccessPassword?: unknown;
  runningHubNodeInfoList?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const bodySizeError = getRequestBodySizeError(req);
    if (bodySizeError) return NextResponse.json({ error: bodySizeError }, { status: 413 });

    const body = (await req.json()) as GenerateAudioBody;
    const modelValue = optionalText(body.model) ?? "";
    const parsed = parseProviderModel(modelValue, "runninghub");
    const referenceMedia = readReferenceMedia(body.referenceMedia);
    const formatError = getReferenceMediaFormatError(referenceMedia);
    if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });
    const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 413 });

    const config = resolveProviderConfig(req, parsed.provider);
    const result = await generateAudio(config, {
      prompt: optionalText(body.prompt) ?? "",
      model: parsed.model,
      referenceMedia,
      runningHubAccessPassword: optionalText(body.runningHubAccessPassword),
      runningHubNodeInfoList: readRunningHubNodeInfoList(body.runningHubNodeInfoList),
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate audio";
    console.error("Audio generation route error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getRequestBodySizeError(req: NextRequest): string | null {
  const contentLength = req.headers.get("content-length");
  if (!contentLength) return null;

  const bytes = Number(contentLength);
  if (!Number.isFinite(bytes) || bytes <= REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) return null;
  return "参考媒体请求体过大，请压缩或减少参考媒体后重试";
}

function readReferenceMedia(referenceMedia: unknown): ReferenceMedia[] {
  if (!Array.isArray(referenceMedia)) return [];
  return referenceMedia.map(readReferenceMediaValue).filter((reference): reference is ReferenceMedia => reference !== null);
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
  const acceptedTypes: MediaReferenceType[] = ["image", "video", "audio"];
  for (const reference of referenceMedia) {
    const actualType = mediaReferenceTypeFromBase64DataUri(reference.dataUri);
    if (!actualType) return "Audio reference media must be data:image/*, data:video/* or data:audio/* base64 data URIs";
    if (!acceptedTypes.includes(actualType)) return `音频生成不支持${mediaReferenceLabel(actualType)}输入`;
  }
  return null;
}

function readRunningHubNodeInfoList(value: unknown): RunningHubTaskNodeBinding[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(readRunningHubNodeInfoBinding).filter((binding): binding is RunningHubTaskNodeBinding => binding !== null);
}

function readRunningHubNodeInfoBinding(value: unknown): RunningHubTaskNodeBinding | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const nodeId = optionalText(record.nodeId);
  const fieldName = optionalText(record.fieldName);
  if (!nodeId || !fieldName) return null;
  return {
    nodeId,
    fieldName,
    label: optionalText(record.label),
    source: readBindingSource(record.source),
    value: optionalText(record.value),
    valueType: readBindingValueType(record.valueType),
    enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
    required: typeof record.required === "boolean" ? record.required : undefined,
    referenceIndex: readReferenceIndex(record.referenceIndex),
    referenceType: record.referenceType === "video" || record.referenceType === "audio" ? record.referenceType : "image",
    deliveryMode: readBindingDelivery(record.deliveryMode),
  };
}

function readBindingSource(value: unknown): RunningHubTaskBindingSource {
  if (value === "prompt" || value === "reference" || value === "randomSeed") return value;
  return "literal";
}

function readBindingValueType(value: unknown): RunningHubTaskBindingValueType | undefined {
  if (
    value === "text" ||
    value === "number" ||
    value === "boolean" ||
    value === "image" ||
    value === "video" ||
    value === "audio" ||
    value === "raw"
  ) {
    return value;
  }
  return undefined;
}

function readBindingDelivery(value: unknown): RunningHubTaskBindingDelivery {
  if (value === "url" || value === "fileName") return value;
  return "raw";
}

function readReferenceIndex(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}
