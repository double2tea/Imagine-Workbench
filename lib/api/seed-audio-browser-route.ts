import { z } from "zod";
import { audioOperationApiError } from "@/lib/api/audio-errors";
import { readBoundedJsonRequest } from "@/lib/api/request-body";
import { apiErrorResponse, badRequest, requireApiText } from "@/lib/api/errors";
import { isRunningHubWorkflowAudioTarget } from "@/lib/audio-generation-routing";
import { readOptionalAudioFormat } from "@/lib/audio-operation-rules";
import { mediaReferenceTypeFromBase64DataUri } from "@/lib/media-references";
import { ModelCapabilityValidationError, validateCapabilityParameterValues, validateInputModalityReferences } from "@/lib/providers/model-capabilities";
import { generateAudioOperation } from "@/lib/providers/audio";
import { AUDIO_OPERATION_MODES, getOptionalModelCapability, parseProviderModel, ProviderModelParseError } from "@/lib/providers/model-catalog";
import { readModelParameterValues } from "@/lib/providers/parameter-values";
import { readRunningHubNodeInfoList } from "@/lib/providers/runninghub-node-info";
import { isSeedAudioProviderModel } from "@/lib/providers/seed-audio";
import type { ReferenceMedia } from "@/lib/providers/types";
import { optionalText, resolveProviderConfig } from "@/lib/providers/utils";
import { getReferenceMediaPayloadError, REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES } from "@/lib/reference-images";

const seedAudioGenerateBodySchema = z.object({
  asrLanguage: z.enum(["auto", "zh", "en"]).optional(),
  model: z.string().trim().min(1),
  prompt: z.string().optional(),
  mode: z.enum(AUDIO_OPERATION_MODES),
  format: z.string().transform(readOptionalAudioFormat).optional(),
  stylePrompt: z.string().trim().min(1).optional(),
  voice: z.string().trim().min(1).optional(),
  voiceProfileId: z.string().trim().min(1).optional(),
  voiceCloneConsentAccepted: z.boolean().optional(),
  optimizeTextPreview: z.boolean().optional(),
  parameterValues: z.unknown().optional(),
  referenceMedia: z.unknown().optional(),
  runningHubAccessPassword: z.unknown().optional(),
  runningHubNodeInfoList: z.unknown().optional(),
});

export async function postBrowserSeedAudioOperation(req: Request): Promise<Response> {
  try {
    const body = seedAudioGenerateBodySchema.parse(await readBoundedJsonRequest(req, REFERENCE_IMAGE_REQUEST_BODY_MAX_BYTES));
    if (body.voiceProfileId) {
      throw badRequest("Voice profile IDs must be resolved before calling audio generation", "unresolved_voice_profile");
    }

    const parsed = parseProviderModel(body.model, "mimo");
    const runningHubNodeInfoList = readRunningHubNodeInfoList(body.runningHubNodeInfoList) ?? [];
    if (!isSeedAudioProviderModel(parsed.provider, parsed.model)) {
      throw badRequest("Seed Audio browser route requires volcengine:seed-audio-1.0", "invalid_seed_audio_model");
    }
    if (isRunningHubWorkflowAudioTarget(body.model, runningHubNodeInfoList) || runningHubNodeInfoList.length > 0) {
      throw badRequest("RunningHub workflow audio must use /api/media/generate-audio-workflow", "invalid_audio_route");
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
    const parameterValues = readAudioParameterValues(body.parameterValues, capability.parameterDescriptors);
    const payloadError = getReferenceMediaPayloadError(referenceMedia.map(reference => reference.dataUri));
    if (payloadError) return noStoreJson({ error: payloadError, code: "payload_too_large" }, 413);

    const config = resolveProviderConfig(req, parsed.provider, { credentialScope: "audio" });
    const result = await generateAudioOperation(config, {
      mode: body.mode,
      prompt: body.mode === "asr" ? optionalText(body.prompt) ?? "" : requireApiText(body.prompt, "Prompt"),
      model: parsed.model,
      referenceMedia,
      asrLanguage: body.asrLanguage,
      format: body.format,
      parameterValues,
      stylePrompt: body.stylePrompt,
      voice: body.voice,
      voiceCloneConsentAccepted: body.voiceCloneConsentAccepted,
      optimizeTextPreview: body.optimizeTextPreview,
      runningHubAccessPassword: optionalText(body.runningHubAccessPassword),
      runningHubNodeInfoList,
    });

    return noStoreJson(result);
  } catch (error) {
    return seedAudioErrorResponse(error);
  }
}

function seedAudioErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Failed to generate Seed Audio";
  if (error instanceof z.ZodError) {
    return noStoreJson({ error: message, code: "invalid_request" }, 400);
  }
  if (error instanceof ProviderModelParseError) {
    return noStoreJson({ error: message, code: "invalid_provider_model" }, 400);
  }
  if (error instanceof ModelCapabilityValidationError) {
    return noStoreJson({ error: message, code: "invalid_reference_media" }, 400);
  }
  const response = apiErrorResponse(audioOperationApiError(error) ?? error, "Failed to generate Seed Audio");
  if (response.status >= 500) console.error("Seed Audio browser route error:", error);
  return noStoreJson(response.body, response.status);
}

function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
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

function readAudioParameterValues(
  value: unknown,
  descriptors: Parameters<typeof validateCapabilityParameterValues>[0],
): ReturnType<typeof validateCapabilityParameterValues> {
  try {
    return validateCapabilityParameterValues(descriptors, readModelParameterValues(value));
  } catch (error) {
    if (error instanceof ModelCapabilityValidationError) {
      throw badRequest(error.message, "invalid_audio_parameter");
    }
    throw error;
  }
}
