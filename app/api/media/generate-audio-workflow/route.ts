import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { readBoundedJsonRequest } from "@/lib/api/request-body";
import { isRunningHubWorkflowAudioTarget } from "@/lib/audio-generation-routing";
import { mediaReferenceTypeFromBase64DataUri, type MediaReferenceType } from "@/lib/media-references";
import { getReferenceMediaPayloadError, REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES } from "@/lib/reference-images";
import { generateAudio } from "@/lib/providers/audio";
import { parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { readRunningHubNodeInfoList } from "@/lib/providers/runninghub-node-info";
import type { ReferenceMedia } from "@/lib/providers/types";
import { resolveProviderConfigForRequest, resolveRunningHubAccessPasswordForRequest } from "@/lib/providers/team-config";
import { optionalText } from "@/lib/providers/utils";

export const runtime = "nodejs";

interface GenerateAudioBody {
  model?: unknown;
  prompt?: unknown;
  referenceMedia?: unknown;
  runningHubAccessPassword?: unknown;
  runningHubNodeInfoList?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = await readBoundedJsonRequest(req, REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES) as GenerateAudioBody;
    const modelValue = requireApiText(body.model, "model");
    const parsed = parseProviderModel(modelValue, "runninghub");
    if (parsed.provider !== "runninghub") {
      throw badRequest(
        "Audio AI App generation currently supports RunningHub targets only",
        "invalid_audio_workflow_provider",
      );
    }

    const referenceMedia = readReferenceMedia(body.referenceMedia);
    const formatError = getReferenceMediaFormatError(referenceMedia);
    if (formatError) throw badRequest(formatError, "invalid_reference_media");
    const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
    if (payloadError) return NextResponse.json({ error: payloadError, code: "payload_too_large" }, { status: 413 });
    const runningHubNodeInfoList = readRunningHubNodeInfoList(body.runningHubNodeInfoList) ?? [];
    if (!isRunningHubWorkflowAudioTarget(modelValue, runningHubNodeInfoList)) {
      throw badRequest(
        "RunningHub workflow audio route requires runninghub:ai-app-audio:* or runninghub:workflow-audio:*",
        "invalid_audio_workflow_model",
      );
    }

    const config = await resolveProviderConfigForRequest(req, parsed.provider);
    const runningHubAccessPassword = await resolveRunningHubAccessPasswordForRequest(
      req,
      parsed.model,
      optionalText(body.runningHubAccessPassword),
    );
    const result = await generateAudio(config, {
      prompt: runningHubNodeInfoList.length > 0 ? optionalText(body.prompt) ?? "" : requireApiText(body.prompt, "Prompt"),
      model: parsed.model,
      referenceMedia,
      runningHubAccessPassword,
      runningHubNodeInfoList,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate RunningHub audio";
    if (err instanceof ProviderModelParseError) {
      return NextResponse.json({ error: message, code: "invalid_provider_model" }, { status: 400 });
    }
    const response = apiErrorResponse(err, "Failed to generate RunningHub audio");
    if (response.status >= 500) console.error("RunningHub audio generation route error:", err);
    return NextResponse.json(response.body, { status: response.status });
  }
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
    if (!actualType) return "RunningHub reference media must be data:image/*, data:video/* or data:audio/* base64 data URIs";
    if (!acceptedTypes.includes(actualType)) return `RunningHub audio app does not support ${actualType} input`;
  }
  return null;
}
