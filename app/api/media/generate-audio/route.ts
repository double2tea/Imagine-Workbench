import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audioOperationApiError } from "@/lib/api/audio-errors";
import { apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { isRunningHubWorkflowAudioTarget } from "@/lib/audio-generation-routing";
import { readOptionalAudioFormat } from "@/lib/audio-operation-rules";
import { mediaReferenceTypeFromBase64DataUri } from "@/lib/media-references";
import { ModelCapabilityValidationError, validateInputModalityReferences } from "@/lib/providers/model-capabilities";
import { generateAudioOperation } from "@/lib/providers/audio";
import { getOptionalModelCapability, parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { readRunningHubNodeInfoList } from "@/lib/providers/runninghub-node-info";
import type { ReferenceMedia } from "@/lib/providers/types";
import { optionalText, resolveProviderConfig } from "@/lib/providers/utils";
import { getReferenceMediaPayloadError, REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES } from "@/lib/reference-images";

export const runtime = "edge";

const audioGenerateBodySchema = z.object({
  asrLanguage: z.enum(["auto", "zh", "en"]).optional(),
  model: z.string().trim().min(1),
  prompt: z.string().optional(),
  mode: z.enum(["tts", "voice_design", "voice_clone", "music", "sfx", "asr"]),
  format: z.string().transform(readOptionalAudioFormat).optional(),
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
    if (bodySizeError) return NextResponse.json({ error: bodySizeError, code: "payload_too_large" }, { status: 413 });

    const body = audioGenerateBodySchema.parse(await req.json());
    if (body.mode === "voice_clone" && body.voiceCloneConsentAccepted !== true) {
      throw badRequest("音色克隆需要先确认参考音频授权", "voice_clone_consent_required");
    }
    if (body.voiceProfileId) {
      throw badRequest("Voice profile IDs must be resolved before calling audio generation", "unresolved_voice_profile");
    }
    const parsed = parseProviderModel(body.model, "mimo");
    const runningHubNodeInfoList = readRunningHubNodeInfoList(body.runningHubNodeInfoList) ?? [];
    if (isRunningHubWorkflowAudioTarget(body.model, runningHubNodeInfoList) || runningHubNodeInfoList.length > 0) {
      throw badRequest(
        "RunningHub workflow audio must use /api/media/generate-audio-workflow",
        "invalid_audio_route",
      );
    }

    const referenceMedia = readReferenceMedia(body.referenceMedia);
    const capability = getOptionalModelCapability(body.model, "audio");
    if (!capability) throw badRequest("Unknown audio model capability", "invalid_audio_model");
    if (!capability.audioModes.includes(body.mode)) {
      throw badRequest("Selected audio model does not support this operation mode", "unsupported_audio_mode");
    }
    const formatError = getReferenceMediaFormatError(referenceMedia);
    if (formatError) throw badRequest(formatError, "invalid_reference_media");
    validateInputModalityReferences(capability.inputModalities, referenceMedia);
    const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
    if (payloadError) return NextResponse.json({ error: payloadError, code: "payload_too_large" }, { status: 413 });

    const config = resolveProviderConfig(req, parsed.provider);
    const result = await generateAudioOperation(config, {
      mode: body.mode,
      prompt: body.mode === "asr" ? optionalText(body.prompt) ?? "" : requireApiText(body.prompt, "Prompt"),
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
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: message, code: "invalid_request" }, { status: 400 });
    }
    if (err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message, code: "invalid_provider_model" }, { status: 400 });
    }
    if (err instanceof ModelCapabilityValidationError) {
      return NextResponse.json({ error: message, code: "invalid_reference_media" }, { status: 400 });
    }
    const response = apiErrorResponse(audioOperationApiError(err) ?? err, "Failed to generate audio");
    if (response.status >= 500) console.error("Audio operation route error:", err);
    return NextResponse.json(response.body, { status: response.status });
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
  for (const reference of referenceMedia) {
    const actualType = mediaReferenceTypeFromBase64DataUri(reference.dataUri);
    if (!actualType) return "Audio reference media must be data:image/*, data:video/* or data:audio/* base64 data URIs";
  }
  return null;
}
