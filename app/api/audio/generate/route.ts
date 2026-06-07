import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mediaReferenceLabel, mediaReferenceTypeFromBase64DataUri, type MediaReferenceType } from "@/lib/media-references";
import { generateAudioOperation } from "@/lib/providers/audio";
import { parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { readRunningHubNodeInfoList } from "@/lib/providers/runninghub-node-info";
import type { ReferenceMedia } from "@/lib/providers/types";
import { optionalText, requireText, resolveProviderConfig } from "@/lib/providers/utils";
import { getReferenceMediaPayloadError, REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES } from "@/lib/reference-images";

export const runtime = "edge";

const audioGenerateBodySchema = z.object({
  asrLanguage: z.enum(["auto", "zh", "en"]).optional(),
  model: z.string().trim().min(1),
  prompt: z.string().optional(),
  mode: z.enum(["tts", "voice_design", "voice_clone", "music", "sfx", "asr"]),
  format: z.string().trim().min(1).optional(),
  stylePrompt: z.string().trim().min(1).optional(),
  voice: z.string().trim().min(1).optional(),
  voiceProfileId: z.string().trim().min(1).optional(),
  voiceCloneConsentAccepted: z.boolean().optional(),
  optimizeTextPreview: z.boolean().optional(),
  referenceMedia: z.unknown().optional(),
  runningHubAccessPassword: z.unknown().optional(),
  runningHubNodeInfoList: z.unknown().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const bodySizeError = getRequestBodySizeError(req);
    if (bodySizeError) return NextResponse.json({ error: bodySizeError }, { status: 413 });

    const body = audioGenerateBodySchema.parse(await req.json());
    if (body.mode === "voice_clone" && body.voiceCloneConsentAccepted !== true) {
      return NextResponse.json({ error: "音色克隆需要先确认参考音频授权" }, { status: 400 });
    }
    if (body.voiceProfileId) {
      return NextResponse.json({ error: "Voice profile IDs must be resolved before calling audio generation" }, { status: 400 });
    }
    const parsed = parseProviderModel(body.model, "runninghub");
    if (parsed.provider !== "runninghub" && parsed.provider !== "mimo") {
      return NextResponse.json({ error: `${parsed.provider} audio operation is not supported yet` }, { status: 400 });
    }

    const referenceMedia = readReferenceMedia(body.referenceMedia);
    const formatError = getReferenceMediaFormatError(referenceMedia);
    if (formatError) return NextResponse.json({ error: formatError }, { status: 400 });
    const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
    if (payloadError) return NextResponse.json({ error: payloadError }, { status: 413 });

    const runningHubNodeInfoList = readRunningHubNodeInfoList(body.runningHubNodeInfoList);
    const config = resolveProviderConfig(req, parsed.provider);
    const result = await generateAudioOperation(config, {
      mode: body.mode,
      prompt: body.mode === "asr" || runningHubNodeInfoList ? optionalText(body.prompt) ?? "" : requireText(body.prompt, "Prompt"),
      model: parsed.model,
      referenceMedia,
      asrLanguage: body.asrLanguage,
      format: body.format,
      stylePrompt: body.stylePrompt,
      voice: body.voice,
      voiceCloneConsentAccepted: body.voiceCloneConsentAccepted,
      optimizeTextPreview: body.optimizeTextPreview,
      runningHubAccessPassword: optionalText(body.runningHubAccessPassword),
      runningHubNodeInfoList,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate audio";
    if (err instanceof z.ZodError || err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("Audio operation route error:", err);
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
