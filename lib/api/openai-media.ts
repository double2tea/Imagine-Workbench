import { z } from "zod";
import { isRunningHubWorkflowAudioTarget } from "../audio-generation-routing";
import { generateAudioOperation } from "../providers/audio";
import { editImage, generateImage } from "../providers/image";
import { parseProviderModel, ProviderModelParseError, type AiProvider } from "../providers/model-catalog";
import type { ImageEditOperation, MimoAsrLanguage } from "../providers/types";
import { optionalText, parseDataUri, resolveProviderConfig } from "../providers/utils";
import { audioOperationApiError } from "./audio-errors";
import { apiErrorResponse, badRequest, requireApiText } from "./errors";
import { assertOpenAiCompatibleGatewayAccess } from "./openai-auth";

const IMAGE_EDIT_OPERATIONS = new Set<ImageEditOperation>(["redraw", "erase", "outpaint", "cutout"]);
const TRANSCRIPTION_LANGUAGES = new Set<MimoAsrLanguage>(["auto", "zh", "en"]);

const imageGenerationSchema = z.object({
  model: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  n: z.number().int().min(1).optional(),
  quality: z.string().trim().min(1).optional(),
  response_format: z.enum(["url", "b64_json"]).optional(),
  size: z.string().trim().min(1).optional(),
}).strict();

const speechSchema = z.object({
  input: z.string().trim().min(1),
  instructions: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1),
  response_format: z.string().trim().min(1).optional(),
  voice: z.string().trim().min(1).optional(),
}).strict();

const IMAGE_EDIT_FORM_FIELDS = new Set(["image", "image[]", "mask", "model", "n", "operation", "prompt", "quality", "response_format", "size"]);
const TRANSCRIPTION_FORM_FIELDS = new Set(["file", "language", "model", "prompt", "response_format"]);

type ImageResponseFormat = "url" | "b64_json";
type SpeechFormat = "wav" | "pcm16";

export async function postOpenAiImageGenerations(req: Request): Promise<Response> {
  try {
    const gatewayKey = assertOpenAiCompatibleGatewayAccess(req);
    const body = imageGenerationSchema.parse(await req.json());
    if (body.n !== undefined && body.n !== 1) {
      throw badRequest("/v1/images/generations supports n=1 only", "unsupported_image_count");
    }

    const parsed = parseProviderModel(body.model, "12ai");
    assertImmediateOpenAiImageTarget(parsed.provider, parsed.async, "/v1/images/generations");
    const config = resolveProviderConfig(req, parsed.provider, { ignoredBearerToken: gatewayKey });
    const imageResolution = body.size ?? "1024x1024";
    const result = await generateImage(config, {
      prompt: body.prompt,
      model: parsed.model,
      aspectRatio: imageSizeAspectRatio(imageResolution),
      imageResolution,
      imageQuality: body.quality,
      referenceImages: [],
      async: parsed.async,
    });

    if (result.operationName) {
      throw badRequest(
        "Async image models are not supported by /v1/images/generations; use /api/media/generate-image",
        "unsupported_async_image_model",
      );
    }
    if (!result.imageUrl) {
      throw badRequest("Image response did not include image data", "missing_image_result");
    }

    return Response.json(await openAiImageResponse(result.imageUrl, body.response_format ?? "b64_json"));
  } catch (error) {
    return openAiMediaErrorResponse(error, "Failed to generate image");
  }
}

export async function postOpenAiImageEdits(req: Request): Promise<Response> {
  try {
    const gatewayKey = assertOpenAiCompatibleGatewayAccess(req);
    const form = await req.formData();
    assertAllowedFormFields(form, IMAGE_EDIT_FORM_FIELDS);
    const modelValue = readFormText(form, "model");
    const operation = readImageEditOperation(form.get("operation"));
    const prompt = optionalText(form.get("prompt"));
    validateImageEditPrompt(operation, prompt);
    const n = readOptionalPositiveInteger(form.get("n"), "n");
    if (n !== undefined && n !== 1) {
      throw badRequest("/v1/images/edits supports n=1 only", "unsupported_image_count");
    }

    const parsed = parseProviderModel(modelValue, "12ai");
    assertImmediateOpenAiImageTarget(parsed.provider, parsed.async, "/v1/images/edits");
    const config = resolveProviderConfig(req, parsed.provider, { ignoredBearerToken: gatewayKey });
    const images = await readRequiredImageEditDataUris(form);
    const mask = await readOptionalFileDataUri(form, "mask", "image/png");
    const imageResolution = readOptionalFormText(form, "size") ?? "1024x1024";
    const result = await editImage(config, {
      operation,
      prompt,
      model: parsed.model,
      image: { dataUri: images[0] },
      ...(mask ? { mask: { dataUri: mask } } : {}),
      ...(images.length > 1 ? { guides: images.slice(1).map(dataUri => ({ dataUri })) } : {}),
      imageResolution,
      imageQuality: readOptionalFormText(form, "quality"),
    });

    if (!result.imageUrl) {
      throw badRequest("Image edit response did not include image data", "missing_image_result");
    }

    return Response.json(await openAiImageResponse(result.imageUrl, readImageResponseFormat(form.get("response_format"))));
  } catch (error) {
    return openAiMediaErrorResponse(error, "Failed to edit image");
  }
}

export async function postOpenAiAudioSpeech(req: Request): Promise<Response> {
  try {
    const gatewayKey = assertOpenAiCompatibleGatewayAccess(req);
    const body = speechSchema.parse(await req.json());
    const parsed = parseProviderModel(body.model, "mimo");
    if (isRunningHubWorkflowAudioTarget(body.model)) {
      throw badRequest(
        "RunningHub workflow audio is not supported by /v1/audio/speech; use /api/media/generate-audio-workflow",
        "unsupported_workflow_audio",
      );
    }

    const config = resolveProviderConfig(req, parsed.provider, { ignoredBearerToken: gatewayKey });
    const result = await generateAudioOperation(config, {
      mode: "tts",
      prompt: body.input,
      model: parsed.model,
      referenceMedia: [],
      format: readSpeechFormat(body.response_format),
      stylePrompt: body.instructions,
      voice: body.voice,
    });
    if (result.type !== "direct" || result.outputKind !== "audio") {
      throw badRequest("Audio speech response did not include audio data", "missing_audio_result");
    }

    return new Response(base64ToArrayBuffer(result.audioBase64), {
      headers: {
        "Content-Type": result.mimeType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return openAiAudioErrorResponse(error, "Failed to generate speech");
  }
}

export async function postOpenAiAudioTranscriptions(req: Request): Promise<Response> {
  try {
    const gatewayKey = assertOpenAiCompatibleGatewayAccess(req);
    const form = await req.formData();
    assertAllowedFormFields(form, TRANSCRIPTION_FORM_FIELDS);
    const modelValue = readFormText(form, "model");
    const parsed = parseProviderModel(modelValue, "mimo");
    if (isRunningHubWorkflowAudioTarget(modelValue)) {
      throw badRequest(
        "RunningHub workflow audio is not supported by /v1/audio/transcriptions; use /api/media/generate-audio-workflow",
        "unsupported_workflow_audio",
      );
    }
    const responseFormat = readOptionalFormText(form, "response_format");
    if (responseFormat && responseFormat !== "json") {
      throw badRequest("/v1/audio/transcriptions supports response_format=json only", "unsupported_transcription_format");
    }

    const config = resolveProviderConfig(req, parsed.provider, { ignoredBearerToken: gatewayKey });
    const audio = await readRequiredFileDataUri(form, "file", "audio/mpeg");
    const result = await generateAudioOperation(config, {
      mode: "asr",
      prompt: readOptionalFormText(form, "prompt") ?? "",
      model: parsed.model,
      referenceMedia: [{ dataUri: audio, type: "audio" }],
      asrLanguage: readTranscriptionLanguage(form.get("language")),
    });
    if (result.type !== "direct" || result.outputKind !== "transcript") {
      throw badRequest("Audio transcription response did not include transcript text", "missing_transcript_result");
    }

    return Response.json({ text: result.transcript });
  } catch (error) {
    return openAiAudioErrorResponse(error, "Failed to transcribe audio");
  }
}

function openAiMediaErrorResponse(error: unknown, fallbackMessage: string): Response {
  if (error instanceof z.ZodError) {
    return Response.json({ error: error.message, code: "invalid_request" }, { status: 400 });
  }
  if (error instanceof ProviderModelParseError) {
    return Response.json({ error: error.message, code: "invalid_provider_model" }, { status: 400 });
  }
  const response = apiErrorResponse(error, fallbackMessage);
  if (response.status >= 500) console.error("OpenAI-compatible media route error:", error);
  return Response.json(response.body, { status: response.status });
}

function openAiAudioErrorResponse(error: unknown, fallbackMessage: string): Response {
  return openAiMediaErrorResponse(audioOperationApiError(error) ?? error, fallbackMessage);
}

async function openAiImageResponse(imageUrl: string, responseFormat: ImageResponseFormat): Promise<{
  created: number;
  data: Array<{ b64_json: string } | { url: string }>;
}> {
  if (responseFormat === "url") {
    return {
      created: Math.floor(Date.now() / 1000),
      data: [{ url: imageUrl }],
    };
  }

  return {
    created: Math.floor(Date.now() / 1000),
    data: [{ b64_json: await imageUrlToBase64(imageUrl) }],
  };
}

async function imageUrlToBase64(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith("data:")) return parseDataUri(imageUrl).base64;
  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    throw badRequest("Image result is not a supported URL", "unsupported_image_url");
  }

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Image result download failed with HTTP ${response.status}`);
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error("Image result URL did not return an image");
  return arrayBufferToBase64(await response.arrayBuffer());
}

function readImageResponseFormat(value: FormDataEntryValue | null): ImageResponseFormat {
  if (value === null) return "b64_json";
  if (value === "url" || value === "b64_json") return value;
  throw badRequest("Unsupported image response_format", "unsupported_image_response_format");
}

function assertImmediateOpenAiImageTarget(provider: AiProvider, async: boolean, routeName: string): void {
  if (async || provider === "modelscope" || provider === "runninghub") {
    throw badRequest(
      `${routeName} supports immediate OpenAI-compatible image targets only; use /api/media/generate-image for async or workflow image generation`,
      "unsupported_async_image_model",
    );
  }
}

function readSpeechFormat(value: string | undefined): SpeechFormat {
  if (value === undefined || value === "wav") return "wav";
  if (value === "pcm16") return "pcm16";
  throw badRequest("/v1/audio/speech supports response_format wav or pcm16 only", "unsupported_speech_format");
}

function readTranscriptionLanguage(value: FormDataEntryValue | null): MimoAsrLanguage | undefined {
  if (value === null || value === "") return undefined;
  if (typeof value === "string" && TRANSCRIPTION_LANGUAGES.has(value as MimoAsrLanguage)) {
    return value as MimoAsrLanguage;
  }
  throw badRequest("/v1/audio/transcriptions supports language auto, zh, or en only", "unsupported_transcription_language");
}

function readImageEditOperation(value: FormDataEntryValue | null): ImageEditOperation {
  if (value === null || value === "") return "redraw";
  if (typeof value === "string" && IMAGE_EDIT_OPERATIONS.has(value as ImageEditOperation)) {
    return value as ImageEditOperation;
  }
  throw badRequest("Unsupported image edit operation", "unsupported_image_edit_operation");
}

function validateImageEditPrompt(operation: ImageEditOperation, prompt: string | undefined): void {
  if ((operation === "redraw" || operation === "outpaint") && !prompt) {
    throw badRequest("prompt is required for this image edit operation", "missing_required_field");
  }
}

function readFormText(form: FormData, fieldName: string): string {
  return requireApiText(form.get(fieldName), fieldName);
}

function readOptionalFormText(form: FormData, fieldName: string): string | undefined {
  return optionalText(form.get(fieldName));
}

function readOptionalPositiveInteger(value: FormDataEntryValue | null, fieldName: string): number | undefined {
  if (value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw badRequest(`${fieldName} must be a positive integer`, "invalid_integer");
  }
  return Number(value);
}

function assertAllowedFormFields(form: FormData, allowedFields: Set<string>): void {
  for (const fieldName of form.keys()) {
    if (!allowedFields.has(fieldName)) {
      throw badRequest(`Unsupported form field: ${fieldName}`, "unsupported_form_field");
    }
  }
}

async function readRequiredFileDataUri(form: FormData, fieldName: string, fallbackMimeType: string): Promise<string> {
  const values = form.getAll(fieldName);
  if (values.length !== 1) throw badRequest(`${fieldName} must contain exactly one file`, "invalid_file_count");
  return formValueToDataUri(values[0], fieldName, fallbackMimeType);
}

async function readOptionalFileDataUri(form: FormData, fieldName: string, fallbackMimeType: string): Promise<string | undefined> {
  const values = form.getAll(fieldName);
  if (values.length === 0) return undefined;
  if (values.length !== 1) throw badRequest(`${fieldName} must contain exactly one file`, "invalid_file_count");
  return formValueToDataUri(values[0], fieldName, fallbackMimeType);
}

async function readRequiredImageEditDataUris(form: FormData): Promise<string[]> {
  const values = [...form.getAll("image"), ...form.getAll("image[]")];
  if (values.length === 0) throw badRequest("image must contain at least one file", "missing_required_field");
  return Promise.all(values.map((value, index) => formValueToDataUri(value, `image[${index}]`, "image/png")));
}

async function formValueToDataUri(value: FormDataEntryValue, fieldName: string, fallbackMimeType: string): Promise<string> {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return value;
    throw badRequest(`${fieldName} must be a file or base64 data URI`, "invalid_file");
  }
  const mimeType = value.type || fallbackMimeType;
  return `data:${mimeType};base64,${arrayBufferToBase64(await value.arrayBuffer())}`;
}

function imageSizeAspectRatio(size: string): string {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) return "1:1";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return "1:1";
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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}
