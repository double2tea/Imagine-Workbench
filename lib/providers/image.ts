import type { AiProvider } from "./model-catalog";
import { isKnownProvider } from "./registry";
import {
  buildRunningHubStandardBody,
  getRunningHubStandardEndpoint,
  getRunningHubStandardModel,
  resolveRunningHubStandardModelForReferenceMedia,
  validateRunningHubStandardReferenceCount,
} from "./runninghub";
import type { EditImageInput, GenerateImageInput, GenerateImageResult, MediaStatusResult, ProviderConfig, ProviderMediaType, ReferenceMedia, RunningHubTaskNodeBinding } from "./types";
import { mediaReferenceFileExtension, mediaReferenceLabel, mediaReferenceTypeFromMime } from "../media-references";
import {
  dataUriToBlob,
  getJson,
  isRecord,
  mediaOperationName,
  openAiCompatibleUrl,
  parseProviderResponseBody,
  parseDataUri,
  postForm,
  postJson,
} from "./utils";

interface OpenAiImageResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  image_url?: string;
  url?: string;
}

interface AsyncImageCreateResponse {
  id?: string;
}

interface AsyncImageStatusResponse {
  status?: string;
  progress?: number;
  data?: Array<{ url?: string }>;
  outputs?: string[];
  error?: { message?: string } | string;
}

interface ModelScopeImageCreateResponse {
  task_id?: string;
  id?: string;
  images?: Array<{ url?: string }>;
  output_images?: string[];
  output?: {
    images?: Array<{ url?: string } | string>;
    output_images?: string[];
  };
}

interface ModelScopeImageStatusResponse extends ModelScopeImageCreateResponse {
  task_status?: string;
  status?: string;
  message?: string;
  detail?: string;
  error_info?: string;
  error?: { message?: string };
}

interface RunningHubCreateResponse {
  code?: number;
  msg?: string;
  message?: string;
  errorCode?: string;
  errorMessage?: string;
  result?: unknown;
  data?: unknown;
  id?: string | number;
  task?: unknown;
  taskId?: string | number;
  task_id?: string | number;
  taskID?: string | number;
  taskid?: string | number;
}

interface RunningHubQueryResponse {
  code?: number;
  msg?: string;
  errorCode?: string;
  data?: {
    status?: string;
    errorMessage?: string;
    errorCode?: string;
    results?: RunningHubMediaOutput[];
  };
  status?: string;
  errorMessage?: string;
  results?: RunningHubMediaOutput[];
}

interface RunningHubTaskOutputsResponse {
  code?: number;
  msg?: string;
  data?: RunningHubMediaOutput[] | { failedReason?: unknown } | null;
}

interface RunningHubUploadResponse {
  code?: number;
  msg?: string;
  message?: string;
  errorCode?: string;
  errorMessage?: string;
  data?: {
    download_url?: string;
    downloadUrl?: string;
    url?: string;
    fileUrl?: string;
    file_url?: string;
    filename?: string;
    fileName?: string;
  };
  download_url?: string;
  downloadUrl?: string;
  url?: string;
  fileUrl?: string;
  file_url?: string;
  filename?: string;
  fileName?: string;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
}

interface RunningHubMediaInput {
  prompt: string;
  model: string;
  aspectRatio?: string;
  imageResolution?: string;
  imageQuality?: string;
  resolutionName?: string;
  durationSeconds?: string;
  referenceMode?: "reference" | "firstLast";
  referenceImages: GenerateImageInput["referenceImages"];
  referenceMedia?: ReferenceMedia[];
  runningHubAccessPassword?: string;
  runningHubNodeInfoList?: RunningHubTaskNodeBinding[];
}

type RunningHubStatusMode = "standard" | "task-output";

interface RunningHubRequest {
  endpoint: string;
  body: Record<string, unknown>;
  statusMode: RunningHubStatusMode;
}

interface RunningHubMediaOutput {
  url?: string;
  fileUrl?: string;
  fileType?: string;
  outputType?: string;
}

interface RunningHubNodeInfo {
  nodeId: string;
  fieldName: string;
  fieldValue: unknown;
}

interface RunningHubTaskReferenceUpload {
  fileName?: string;
  raw: string;
  type: ReferenceMedia["type"];
  url: string;
}

const RUNNINGHUB_TASK_OUTPUT_PREFIX = "task-output:";
const ASYNC_IMAGE_SUCCESS_STATUSES = new Set(["complete", "completed", "partial_complete", "partial_completed", "succeeded", "success"]);
const ASYNC_IMAGE_FAILED_STATUSES = new Set(["failed", "failure", "canceled", "cancelled", "expired"]);
const MODELSCOPE_IMAGE_SUCCESS_STATUSES = new Set(["succeed", "success", "succeeded", "completed"]);
const MODELSCOPE_IMAGE_FAILED_STATUSES = new Set(["failed", "fail", "error", "canceled", "cancelled", "timeout", "revoked"]);

export async function generateImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
  if (!isKnownProvider(config.provider)) {
    if (input.async) throw new Error("Custom OpenAI-compatible providers do not support async image generation");
    return generateOpenAiCompatibleImage(config, input, config.provider);
  }
  if (config.provider === "modelscope") {
    return generateModelScopeImage(config, input);
  }
  if (config.provider === "runninghub") {
    return generateRunningHubMedia(config, input, "image");
  }
  if (config.provider === "agnes") {
    return generateAgnesImage(config, input);
  }
  if (config.provider === "grok2api") {
    return generateOpenAiCompatibleImage(config, input, "grok2api");
  }
  if (input.async) {
    return generate12AiAsyncImage(config, input);
  }
  if (input.model === "gpt-image-2" || input.model === "gpt-image-2-2k" || input.model === "gpt-image-2-4k") {
    return generateOpenAiCompatibleImage(config, input, config.provider);
  }
  return generate12AiGeminiImage(config, input);
}

export async function editImage(config: ProviderConfig, input: EditImageInput): Promise<GenerateImageResult> {
  if (!isKnownProvider(config.provider) || config.provider === "grok2api") {
    return editOpenAiCompatibleImageWithOperation(config, input, config.provider);
  }
  if (config.provider === "runninghub") {
    throw new Error("RunningHub quick image edits require a configured AI App or Standard Model mapping");
  }
  if (config.provider === "modelscope") {
    return generateModelScopeImage(config, editInputToGenerateInput(input));
  }
  if (config.provider === "agnes") {
    return generateAgnesImage(config, editInputToGenerateInput(input));
  }
  if (input.model === "gpt-image-2" || input.model === "gpt-image-2-2k" || input.model === "gpt-image-2-4k") {
    return editOpenAiCompatibleImageWithOperation(config, input, config.provider);
  }
  return generate12AiGeminiImage(config, editInputToGenerateInput(input));
}

export async function downloadImage(config: ProviderConfig, taskId: string): Promise<Response> {
  const status = await getAsyncImageStatus(config, taskId);
  if (!status.url) throw new Error("Image task is complete but did not expose an image URL");

  const res = await fetch(status.url);
  if (!res.ok) throw new Error(`Failed to download image: HTTP ${res.status}`);

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "image/png",
      "Content-Disposition": `inline; filename="image_${Date.now()}.png"`,
      "Cache-Control": "public, max-age=31536000",
    },
  });
}

function editInputToGenerateInput(input: EditImageInput): GenerateImageInput {
  return {
    prompt: buildImageEditPrompt(input),
    model: input.model,
    aspectRatio: "auto",
    imageResolution: input.imageResolution,
    imageQuality: input.imageQuality,
    referenceImages: [input.image, ...(input.mask ? [input.mask] : []), ...(input.guide ? [input.guide] : [])],
    async: false,
  };
}

function buildImageEditPrompt(input: EditImageInput): string {
  const userPrompt = input.prompt?.trim();
  if (input.operation === "redraw") {
    return [
      "The first input image is the source image to edit.",
      "The second input image, when provided, is a black and white mask only; it is not a style or content reference.",
      "The third input image, when provided, is the same source with a red overlay showing the exact edit region.",
      "Change only the white masked region and preserve the rest of the image.",
      userPrompt ? `Edit instruction: ${userPrompt}` : "Edit instruction: redraw the masked area naturally.",
    ].join("\n");
  }
  if (input.operation === "erase") {
    return [
      "The first input image is the source image to edit.",
      "The second input image, when provided, is a black and white mask only; it is not a style or content reference.",
      "The third input image, when provided, is the same source with a red overlay showing the exact erase region.",
      "Remove the white masked object or area and reconstruct the background naturally.",
      "Preserve the unmasked image exactly as much as possible.",
    ].join("\n");
  }
  if (input.operation === "outpaint") {
    return [
      "The first input image is the expanded source canvas to outpaint.",
      "The second input image, when provided, is a black and white mask only; white areas are the new canvas space to fill.",
      "The third input image, when provided, is the same canvas with a red overlay showing the expansion/edit region.",
      "Extend the scene naturally with matching perspective, lighting, texture, and camera style.",
      userPrompt ? `Outpaint instruction: ${userPrompt}` : "Outpaint instruction: continue the image beyond its original frame.",
    ].join("\n");
  }
  return [
    "Remove the background from the first image and keep the main subject.",
    "Return a clean cutout-style result with a transparent or plain neutral background if transparency is unavailable.",
    userPrompt ? `Subject guidance: ${userPrompt}` : "",
  ].filter(Boolean).join("\n");
}

export async function downloadRunningHubMedia(
  config: ProviderConfig,
  mediaType: ProviderMediaType,
  taskId: string,
): Promise<Response> {
  const status = await getRunningHubMediaStatus(config, mediaType, taskId);
  if (!status.url) throw new Error(`RunningHub ${mediaType} task is complete but did not expose a result URL`);

  const res = await fetch(status.url);
  if (!res.ok) throw new Error(`Failed to download RunningHub ${mediaType}: HTTP ${res.status}`);

  return new Response(res.body, {
    headers: {
      "Content-Type": runningHubDownloadContentType(res, mediaType),
      "Content-Disposition": `inline; filename="${mediaType}_${Date.now()}.${runningHubDownloadExtension(res, status.url, mediaType)}"`,
      "Cache-Control": "public, max-age=31536000",
    },
  });
}

function runningHubDownloadContentType(res: Response, mediaType: ProviderMediaType): string {
  return res.headers.get("Content-Type") ?? defaultRunningHubContentType(mediaType);
}

function runningHubDownloadExtension(res: Response, url: string, mediaType: ProviderMediaType): string {
  const contentType = res.headers.get("Content-Type");
  const contentTypeExtension = contentType ? extensionFromContentType(contentType) : null;
  if (contentTypeExtension) return contentTypeExtension;
  return extensionFromUrl(url, mediaType) ?? defaultRunningHubExtension(mediaType);
}

function extensionFromContentType(contentType: string): string | null {
  const mimeType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/aac") return "aac";
  if (mimeType === "audio/flac") return "flac";
  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") return "m4a";
  return null;
}

function extensionFromUrl(url: string, mediaType: ProviderMediaType): string | null {
  const pathname = new URL(url).pathname.toLowerCase();
  const match = pathname.match(/\.([a-z0-9]+)$/);
  const extension = match?.[1];
  if (!extension) return null;
  if (mediaType === "image" && (extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "webp")) return extension;
  if (mediaType === "video" && (extension === "mp4" || extension === "webm" || extension === "mov")) return extension;
  if (mediaType === "audio" && (extension === "mp3" || extension === "wav" || extension === "m4a" || extension === "aac" || extension === "ogg" || extension === "flac")) return extension;
  return null;
}

function defaultRunningHubContentType(mediaType: ProviderMediaType): string {
  if (mediaType === "image") return "image/png";
  if (mediaType === "audio") return "audio/mpeg";
  return "video/mp4";
}

function defaultRunningHubExtension(mediaType: ProviderMediaType): string {
  if (mediaType === "image") return "png";
  if (mediaType === "audio") return "mp3";
  return "mp4";
}

export async function getAsyncImageStatus(config: ProviderConfig, taskId: string): Promise<MediaStatusResult> {
  if (config.provider === "modelscope") {
    return getModelScopeImageStatus(config, taskId);
  }
  if (config.provider === "runninghub") {
    return getRunningHubMediaStatus(config, "image", taskId);
  }

  const taskPath: `/v1/task/${string}` = `/v1/task/${encodeURIComponent(taskId)}`;
  const response = await getJson<AsyncImageStatusResponse>(openAiCompatibleUrl(config.baseUrl, taskPath), config);
  const status = response.status?.toLowerCase() ?? "pending";

  if (ASYNC_IMAGE_SUCCESS_STATUSES.has(status)) {
    const url = read12AiAsyncImageUrl(response);
    if (!url) throw new Error("Async image task completed without an image URL");
    return {
      done: true,
      mediaType: "image",
      progress: 100,
      status,
      url,
    };
  }

  if (ASYNC_IMAGE_FAILED_STATUSES.has(status)) {
    return {
      done: true,
      mediaType: "image",
      progress: 100,
      status: "failed",
      errorMessage: read12AiAsyncImageError(response) ?? "Async image task failed",
    };
  }

  return {
    done: false,
    mediaType: "image",
    progress: response.progress ?? 50,
    status,
  };
}

function read12AiAsyncImageUrl(response: AsyncImageStatusResponse): string | undefined {
  return response.outputs?.find(output => typeof output === "string" && output.length > 0) ??
    response.data?.find(item => typeof item.url === "string" && item.url.length > 0)?.url;
}

function read12AiAsyncImageError(response: AsyncImageStatusResponse): string | undefined {
  if (typeof response.error === "string" && response.error.trim().length > 0) return response.error;
  if (isRecord(response.error) && typeof response.error.message === "string" && response.error.message.trim().length > 0) {
    return response.error.message;
  }
  return undefined;
}

async function generateModelScopeImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
  const response = await fetch(`${config.baseUrl}/v1/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
      "X-ModelScope-Async-Mode": "true",
    },
    body: JSON.stringify(buildModelScopeImageBody(input)),
  });
  const json = parseProviderResponseBody(await response.text()) as ModelScopeImageCreateResponse;
  if (!response.ok) {
    throw new Error(readProviderError(json) ?? `ModelScope image request failed with HTTP ${response.status}`);
  }

  const taskId = json.task_id ?? json.id;
  if (taskId) {
    return {
      operationName: mediaOperationName("modelscope", "image", taskId),
      source: input.model,
    };
  }

  const imageUrl = readModelScopeImageUrl(json);
  if (imageUrl) return { imageUrl, source: input.model };
  throw new Error("ModelScope image response did not include task_id or image URL");
}

async function getModelScopeImageStatus(config: ProviderConfig, taskId: string): Promise<MediaStatusResult> {
  const response = await fetch(`${config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "X-ModelScope-Task-Type": "image_generation",
    },
  });
  const json = parseProviderResponseBody(await response.text()) as ModelScopeImageStatusResponse;
  if (!response.ok) {
    throw new Error(readProviderError(json) ?? `ModelScope image status failed with HTTP ${response.status}`);
  }

  const status = (json.task_status ?? json.status ?? "PENDING").toLowerCase();
  if (MODELSCOPE_IMAGE_SUCCESS_STATUSES.has(status)) {
    const url = readModelScopeImageUrl(json);
    if (!url) throw new Error("ModelScope image task completed without an image URL");
    return { done: true, mediaType: "image", progress: 100, status, url };
  }
  if (MODELSCOPE_IMAGE_FAILED_STATUSES.has(status)) {
    return {
      done: true,
      mediaType: "image",
      progress: 100,
      status: "failed",
      errorMessage: readProviderError(json) ?? "ModelScope image task failed",
    };
  }
  return { done: false, mediaType: "image", progress: 50, status };
}

export async function generateRunningHubMedia(
  config: ProviderConfig,
  input: RunningHubMediaInput,
  mediaType: ProviderMediaType,
): Promise<GenerateImageResult> {
  const request = await buildRunningHubRequest(config, input, mediaType);
  const response = await postJson<RunningHubCreateResponse>(`${config.baseUrl}${request.endpoint}`, config, request.body);
  assertRunningHubOk(response, "RunningHub task creation failed");
  const taskId = readRunningHubCreatedTaskId(response);
  if (!taskId) {
    const message = response.msg ?? response.message;
    throw new Error(
      `RunningHub response did not include a taskId${message ? ` (${message})` : ""}: ${summarizeRunningHubCreateResponse(response)}`,
    );
  }
  return {
    operationName: mediaOperationName("runninghub", mediaType, runningHubOperationTaskId(request.statusMode, taskId)),
    source: input.model,
  };
}

function readRunningHubCreatedTaskId(response: RunningHubCreateResponse): string | undefined {
  return readRunningHubTaskIdValue(response);
}

function readRunningHubTaskIdValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const taskId = readRunningHubTaskIdValue(item);
      if (taskId) return taskId;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  const directKeys = ["taskId", "task_id", "taskID", "taskid", "id"];
  for (const key of directKeys) {
    const taskId = readRunningHubTaskIdValue(value[key]);
    if (taskId) return taskId;
  }

  const nestedKeys = ["data", "task", "result", "results"];
  for (const key of nestedKeys) {
    const taskId = readRunningHubTaskIdValue(value[key]);
    if (taskId) return taskId;
  }
  return undefined;
}

function summarizeRunningHubCreateResponse(response: RunningHubCreateResponse): string {
  try {
    return JSON.stringify(response).slice(0, 600);
  } catch {
    return "[unserializable response]";
  }
}

export async function getRunningHubMediaStatus(
  config: ProviderConfig,
  mediaType: ProviderMediaType,
  taskId: string,
): Promise<MediaStatusResult> {
  const operationTask = parseRunningHubOperationTaskId(taskId);
  if (operationTask.statusMode === "task-output") {
    return getRunningHubTaskOutputStatus(config, mediaType, operationTask.taskId);
  }

  const response = await postJson<RunningHubQueryResponse>(`${config.baseUrl}/openapi/v2/query`, config, { taskId });
  assertRunningHubOk(response, "RunningHub task query failed");
  const data = response.data ?? response;
  const status = data.status?.toLowerCase() ?? "running";
  if (status === "succeeded" || status === "success" || status === "completed") {
    const url = readRunningHubOutputUrl(data.results ?? [], mediaType);
    if (!url) throw new Error("RunningHub task completed without a result URL");
    return { done: true, mediaType, progress: 100, status, url };
  }
  if (status === "failed" || status === "failure" || status === "canceled") {
    return {
      done: true,
      mediaType,
      progress: 100,
      status: "failed",
      errorMessage: data.errorMessage ?? response.msg ?? "RunningHub task failed",
    };
  }
  return { done: false, mediaType, progress: status === "queued" ? 5 : 50, status };
}

async function getRunningHubTaskOutputStatus(
  config: ProviderConfig,
  mediaType: ProviderMediaType,
  taskId: string,
): Promise<MediaStatusResult> {
  const response = await postJson<RunningHubTaskOutputsResponse>(`${config.baseUrl}/task/openapi/outputs`, config, {
    apiKey: config.apiKey,
    taskId,
  });
  if (response.code === 804 || response.code === 813) {
    return { done: false, mediaType, progress: response.code === 813 ? 5 : 50, status: response.msg ?? "running" };
  }
  if (response.code === 805) {
    return {
      done: true,
      mediaType,
      progress: 100,
      status: "failed",
      errorMessage: response.msg ?? "RunningHub task failed",
    };
  }
  if (response.code !== undefined && response.code !== 0) {
    throw new Error(response.msg ?? `RunningHub task output query failed with code ${response.code}`);
  }

  if (isRunningHubFailedOutput(response.data)) {
    return {
      done: true,
      mediaType,
      progress: 100,
      status: "failed",
      errorMessage: readFailedReason(response.data.failedReason),
    };
  }

  const results = Array.isArray(response.data) ? response.data : [];
  if (results.length === 0) {
    return { done: false, mediaType, progress: 50, status: response.msg ?? "running" };
  }
  const url = readRunningHubOutputUrl(results, mediaType);
  if (!url) throw new Error("RunningHub task completed without a result URL");
  return { done: true, mediaType, progress: 100, status: "success", url };
}

function isRunningHubFailedOutput(value: RunningHubTaskOutputsResponse["data"]): value is { failedReason?: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "failedReason" in value;
}

function readFailedReason(reason: unknown): string {
  return typeof reason === "string" && reason.trim() ? reason : "RunningHub task failed";
}

function readRunningHubOutputUrl(results: RunningHubMediaOutput[], mediaType: ProviderMediaType): string | undefined {
  return results.find(result => isRunningHubOutputMediaType(result, mediaType))?.url
    ?? results.find(result => isRunningHubOutputMediaType(result, mediaType))?.fileUrl;
}

function isRunningHubOutputMediaType(result: RunningHubMediaOutput, mediaType: ProviderMediaType): boolean {
  const marker = (result.fileType ?? result.outputType ?? result.url ?? result.fileUrl ?? "").toLowerCase();
  if (mediaType === "image") return /\.(png|jpe?g|webp|gif)(\?|$)/.test(marker) || /^(png|jpe?g|webp|gif|image)\b/.test(marker);
  if (mediaType === "video") return /\.(mp4|mov|webm|m4v)(\?|$)/.test(marker) || /^(mp4|mov|webm|m4v|video)\b/.test(marker);
  return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/.test(marker) || /^(mp3|wav|m4a|aac|ogg|flac|audio)\b/.test(marker);
}

function readModelScopeReferenceImages(input: GenerateImageInput): string | string[] | undefined {
  if (input.referenceImages.length === 0) return undefined;
  const urls = input.referenceImages.map(reference => reference.dataUri);
  return urls.length === 1 ? urls[0] : urls;
}

function buildModelScopeImageBody(input: GenerateImageInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
  };
  const size = input.imageResolution;
  const match = size.match(/^(\d+)x(\d+)$/);
  if (match) {
    body.size = size;
    body.width = Number(match[1]);
    body.height = Number(match[2]);
  }
  const imageUrl = readModelScopeReferenceImages(input);
  if (imageUrl) body.image_url = imageUrl;
  return body;
}

function readModelScopeImageUrl(response: ModelScopeImageCreateResponse): string | undefined {
  const direct = response.images?.find(item => typeof item.url === "string")?.url ?? response.output_images?.[0];
  if (direct) return direct;
  const outputImage = response.output?.images?.find((item): item is string | { url?: string } => {
    if (typeof item === "string") return item.length > 0;
    return typeof item.url === "string" && item.url.length > 0;
  });
  if (typeof outputImage === "string") return outputImage;
  if (outputImage?.url) return outputImage.url;
  return response.output?.output_images?.[0];
}

async function buildRunningHubRequest(
  config: ProviderConfig,
  input: RunningHubMediaInput,
  mediaType: ProviderMediaType,
): Promise<RunningHubRequest> {
  const size = mediaType === "image" ? input.imageResolution : input.aspectRatio;
  const standardModel = mediaType === "audio" ? null : getRunningHubStandardModel(input.model, mediaType);
  if (standardModel) {
    const references = input.referenceMedia ?? input.referenceImages.map(reference => ({ ...reference, type: "image" as const }));
    validateRunningHubStandardReferenceCount(standardModel, references.length);
    validateRunningHubStandardReferenceMediaTypes(standardModel, references);
    const routedModel = resolveRunningHubStandardModelForReferenceMedia(standardModel, references, input.referenceMode);
    validateRunningHubStandardReferenceCount(routedModel, references.length);
    validateRunningHubStandardReferenceMediaTypes(routedModel, references);
    const referenceMediaUrls = routedModel.supportsReferences
      ? await uploadRunningHubStandardReferences(config, references)
      : undefined;
    return {
      endpoint: getRunningHubStandardEndpoint(routedModel),
      statusMode: "standard",
      body: buildRunningHubStandardBody(routedModel, {
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        imageResolution: input.imageResolution,
        imageQuality: input.imageQuality,
        resolutionName: input.resolutionName,
        durationSeconds: input.durationSeconds,
        referenceImages: input.referenceImages,
        ...(referenceMediaUrls ? { referenceMediaUrls } : {}),
      }),
    };
  }

  if (input.model.startsWith("api:")) {
    const endpoint = input.model.slice("api:".length);
    if (endpoint.startsWith("/openapi/v2/")) {
      const references = input.referenceMedia ?? input.referenceImages.map(reference => ({ ...reference, type: "image" as const }));
      const referenceMediaUrls = references.length > 0 ? await uploadRunningHubStandardReferences(config, references) : undefined;
      const imageUrls = referenceMediaUrls?.imageUrls ?? input.referenceImages.map(reference => reference.dataUri);
      return {
        endpoint,
        statusMode: "standard",
        body: {
          prompt: input.prompt,
          size: size === "auto" ? undefined : size,
          image_url: imageUrls[0],
          image_urls: imageUrls,
        },
      };
    }
  }
  const expectedPrefix = `ai-app-${mediaType}:`;
  if (input.model.startsWith(expectedPrefix)) {
    const webappId = input.model.slice(expectedPrefix.length).trim();
    if (!webappId) throw new Error(`RunningHub ${mediaType} AI App model is missing webappId`);
    if (webappId === "<webappId>") throw new Error(`RunningHub ${mediaType} AI App model is missing webappId`);
    const nodeInfoList = await buildRunningHubTaskNodeInfoList(config, input);
    return {
      endpoint: "/task/openapi/ai-app/run",
      statusMode: "task-output",
      body: {
        apiKey: config.apiKey,
        webappId,
        ...(nodeInfoList.length > 0 ? { nodeInfoList } : {}),
        ...(input.runningHubAccessPassword ? { accessPassword: input.runningHubAccessPassword } : {}),
      },
    };
  }
  const workflowPrefix = `workflow-${mediaType}:`;
  if (input.model.startsWith(workflowPrefix)) {
    const workflowId = input.model.slice(workflowPrefix.length).trim();
    if (!workflowId) throw new Error(`RunningHub ${mediaType} workflow model is missing workflowId`);
    if (workflowId === "<workflowId>") throw new Error(`RunningHub ${mediaType} workflow model is missing workflowId`);
    const nodeInfoList = await buildRunningHubTaskNodeInfoList(config, input);
    return {
      endpoint: "/task/openapi/create",
      statusMode: "task-output",
      body: {
        apiKey: config.apiKey,
        workflowId,
        ...(nodeInfoList.length > 0 ? { nodeInfoList } : {}),
        ...(input.runningHubAccessPassword ? { accessPassword: input.runningHubAccessPassword } : {}),
      },
    };
  }
  throw new Error(
    `RunningHub ${mediaType} model must be api:/openapi/v2/..., ${expectedPrefix}<webappId>, or ${workflowPrefix}<workflowId>`,
  );
}

async function buildRunningHubTaskNodeInfoList(config: ProviderConfig, input: RunningHubMediaInput): Promise<RunningHubNodeInfo[]> {
  const bindings = input.runningHubNodeInfoList ?? [];
  if (bindings.length === 0) return [];
  const references = input.referenceMedia ?? input.referenceImages.map(reference => ({ ...reference, type: "image" as const }));
  const uploadedReferences = await uploadRunningHubTaskReferences(config, references);
  return bindings
    .filter(binding => binding.enabled !== false)
    .filter(binding => shouldSubmitRunningHubTaskBinding(binding, uploadedReferences))
    .map(binding => ({
      nodeId: binding.nodeId,
      fieldName: binding.fieldName,
      fieldValue: resolveRunningHubTaskBindingValue(input.prompt, binding, uploadedReferences),
    }));
}

function shouldSubmitRunningHubTaskBinding(
  binding: RunningHubTaskNodeBinding,
  references: RunningHubTaskReferenceUpload[],
): boolean {
  if (binding.source !== "reference" || binding.required === true) return true;
  const candidates = binding.referenceType
    ? references.filter(reference => reference.type === binding.referenceType)
    : references;
  return candidates[binding.referenceIndex ?? 0] !== undefined;
}

async function uploadRunningHubTaskReferences(
  config: ProviderConfig,
  references: ReferenceMedia[],
): Promise<RunningHubTaskReferenceUpload[]> {
  const uploads: RunningHubTaskReferenceUpload[] = [];
  for (const [index, reference] of references.entries()) {
    const form = new FormData();
    const blob = dataUriToBlob(reference.dataUri);
    const mediaType = mediaReferenceTypeFromMime(blob.type) ?? reference.type;
    form.append("file", blob, `reference-${index + 1}.${mediaReferenceFileExtension(blob.type, mediaType)}`);
    const response = await postForm<RunningHubUploadResponse>(`${config.baseUrl}/openapi/v2/media/upload/binary`, config, form);
    assertRunningHubOk(response, "RunningHub media upload failed");
    uploads.push({
      fileName: readRunningHubUploadFileName(response),
      raw: reference.dataUri,
      type: mediaType,
      url: readRunningHubUploadUrl(response),
    });
  }
  return uploads;
}

function resolveRunningHubTaskBindingValue(
  prompt: string,
  binding: RunningHubTaskNodeBinding,
  references: RunningHubTaskReferenceUpload[],
): unknown {
  if (binding.source === "prompt") return coerceRunningHubTaskBindingValue(prompt, binding);
  if (binding.source === "literal") return coerceRunningHubTaskBindingValue(binding.value ?? "", binding);
  if (binding.source === "randomSeed") return randomRunningHubSeed();

  const candidates = binding.referenceType
    ? references.filter(reference => reference.type === binding.referenceType)
    : references;
  const reference = candidates[binding.referenceIndex ?? 0];
  if (!reference) {
    throw new Error(`RunningHub nodeInfoList binding ${binding.nodeId}.${binding.fieldName} reference is missing`);
  }
  if (binding.deliveryMode === "fileName") {
    if (!reference.fileName) {
      throw new Error(`RunningHub upload for ${binding.nodeId}.${binding.fieldName} did not include filename`);
    }
    return reference.fileName;
  }
  if (binding.deliveryMode === "url") return reference.url;
  return reference.raw;
}

function coerceRunningHubTaskBindingValue(value: string, binding: RunningHubTaskNodeBinding): unknown {
  if (binding.required === true && value.trim() === "") {
    throw new Error(`RunningHub nodeInfoList binding ${binding.nodeId}.${binding.fieldName} is required`);
  }
  if (binding.valueType === "number") {
    if (value.trim() === "") return "";
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(`RunningHub nodeInfoList binding ${binding.nodeId}.${binding.fieldName} must be a number`);
    }
    return numberValue;
  }
  if (binding.valueType === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`RunningHub nodeInfoList binding ${binding.nodeId}.${binding.fieldName} must be true or false`);
  }
  return value;
}

function randomRunningHubSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000_000_000);
}

function runningHubOperationTaskId(statusMode: RunningHubStatusMode, taskId: string): string {
  return statusMode === "task-output" ? `${RUNNINGHUB_TASK_OUTPUT_PREFIX}${taskId}` : taskId;
}

function parseRunningHubOperationTaskId(taskId: string): { statusMode: RunningHubStatusMode; taskId: string } {
  if (taskId.startsWith(RUNNINGHUB_TASK_OUTPUT_PREFIX)) {
    return { statusMode: "task-output", taskId: taskId.slice(RUNNINGHUB_TASK_OUTPUT_PREFIX.length) };
  }
  return { statusMode: "standard", taskId };
}

function validateRunningHubStandardReferenceMediaTypes(
  model: NonNullable<ReturnType<typeof getRunningHubStandardModel>>,
  references: ReferenceMedia[],
): void {
  const acceptedTypes = model.referenceMediaTypes ?? ["image"];
  const unsupported = references.find(reference => !acceptedTypes.includes(reference.type));
  if (unsupported) {
    throw new Error(`${model.label} does not support ${mediaReferenceLabel(unsupported.type)} references`);
  }
}

async function uploadRunningHubStandardReferences(
  config: ProviderConfig,
  references: ReferenceMedia[],
): Promise<{ imageUrls: string[]; videoUrls: string[]; audioUrls: string[] }> {
  const urls = {
    imageUrls: [] as string[],
    videoUrls: [] as string[],
    audioUrls: [] as string[],
  };
  for (const [index, reference] of references.entries()) {
    const form = new FormData();
    const blob = dataUriToBlob(reference.dataUri);
    const mediaType = mediaReferenceTypeFromMime(blob.type) ?? reference.type;
    form.append("file", blob, `reference-${index + 1}.${mediaReferenceFileExtension(blob.type, mediaType)}`);
    const response = await postForm<RunningHubUploadResponse>(`${config.baseUrl}/openapi/v2/media/upload/binary`, config, form);
    assertRunningHubOk(response, "RunningHub media upload failed");
    if (mediaType === "image") urls.imageUrls.push(readRunningHubUploadUrl(response));
    if (mediaType === "video") urls.videoUrls.push(readRunningHubUploadUrl(response));
    if (mediaType === "audio") urls.audioUrls.push(readRunningHubUploadUrl(response));
  }
  return urls;
}

function readRunningHubUploadUrl(response: RunningHubUploadResponse): string {
  const url =
    response.data?.download_url ??
    response.data?.downloadUrl ??
    response.data?.url ??
    response.data?.fileUrl ??
    response.data?.file_url ??
    response.download_url ??
    response.downloadUrl ??
    response.url ??
    response.fileUrl ??
    response.file_url;
  if (!url) throw new Error("RunningHub upload response did not include download_url");
  return url;
}

function readRunningHubUploadFileName(response: RunningHubUploadResponse): string | undefined {
  return (
    response.data?.filename ??
    response.data?.fileName ??
    response.filename ??
    response.fileName
  );
}

function assertRunningHubOk(
  response: { code?: number; msg?: string; message?: string; errorCode?: string; errorMessage?: string },
  fallback: string,
): void {
  const errorCode = response.errorCode?.trim();
  const errorMessage = response.errorMessage?.trim();
  if (errorCode && errorCode !== "0") {
    throw new Error(errorMessage ? `${errorMessage} (errorCode ${errorCode})` : `${fallback} with errorCode ${errorCode}`);
  }
  if (errorMessage) throw new Error(errorMessage);
  if (response.code === undefined || response.code === 0 || response.code === 200) return;
  throw new Error(response.msg ?? response.message ?? `${fallback} with code ${response.code}`);
}

async function generate12AiGeminiImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
  const parts = [
    ...input.referenceImages.map(reference => {
      const parsed = parseDataUri(reference.dataUri);
      return {
        inline_data: {
          mime_type: parsed.mimeType,
          data: parsed.base64,
        },
      };
    }),
    { text: input.prompt },
  ];

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
    ...(input.aspectRatio === "auto"
      ? {}
      : {
          imageConfig: {
            aspectRatio: input.aspectRatio,
            ...(supportsGeminiImageSize(input.model) ? { imageSize: input.imageResolution } : {}),
          },
        }),
  };
  if (input.model === "gemini-3.1-flash-image-preview" && input.thinkingLevel) {
    generationConfig.thinkingConfig = {
      thinkingLevel: input.thinkingLevel,
      includeThoughts: false,
    };
  }

  const response = await fetch(
    `${config.baseUrl}/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(
      config.apiKey,
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig,
      }),
    },
  );

  const json = parseProviderResponseBody(await response.text());
  if (!response.ok) {
    throw new Error(readProviderError(json) ?? `Gemini image request failed with HTTP ${response.status}`);
  }

  const data = readGeminiInlineImage(json);
  if (!data) throw new Error("Gemini image response did not include inline image data");
  return {
    imageUrl: `data:${data.mimeType};base64,${data.base64}`,
    source: input.model,
  };
}

async function generate12AiAsyncImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
  const response = await postJson<AsyncImageCreateResponse>(
    openAiCompatibleUrl(config.baseUrl, "/v1/task/submit"),
    config,
    build12AiAsyncImageTaskBody(input),
  );

  if (!response.id) throw new Error("Async image response did not include a task id");
  return {
    operationName: mediaOperationName("12ai", "image", response.id),
    source: input.model,
  };
}

function build12AiAsyncImageTaskBody(input: GenerateImageInput): Record<string, unknown> {
  return {
    model: input.model,
    input: input.model === "gpt-image-2" ? build12AiGptAsyncImageInput(input) : build12AiGeminiAsyncImageInput(input),
  };
}

function build12AiGptAsyncImageInput(input: GenerateImageInput): Record<string, unknown> {
  const images = input.referenceImages.map(reference => reference.dataUri);
  return {
    prompt: input.prompt,
    n: 1,
    ...(images.length > 0 ? { images } : {}),
    ...(input.imageResolution ? { size: input.imageResolution } : {}),
    ...(input.imageQuality ? { quality: input.imageQuality } : {}),
  };
}

function build12AiGeminiAsyncImageInput(input: GenerateImageInput): Record<string, unknown> {
  const images = input.referenceImages.map(reference => reference.dataUri);
  return {
    prompt: input.prompt,
    n: 1,
    ...(images.length > 0 ? { images } : {}),
    ...(input.aspectRatio && input.aspectRatio !== "auto" ? { aspect_ratio: input.aspectRatio } : {}),
    ...(input.imageResolution ? { image_size: input.imageResolution } : {}),
  };
}

async function generateAgnesImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
  const referenceUrls = input.referenceImages.map(reference => reference.dataUri);
  const response = await postJson<OpenAiImageResponse>(`${config.baseUrl}/v1/images/generations`, config, {
    model: input.model,
    prompt: input.prompt,
    size: input.imageResolution,
    extra_body: {
      response_format: "url",
      ...(referenceUrls.length > 0 ? { image: referenceUrls } : {}),
    },
  });

  const imageUrl = readOpenAiImageUrl(response);
  if (imageUrl) return { imageUrl, source: input.model };
  throw new Error("Agnes image response did not include b64_json or url");
}

async function generateOpenAiCompatibleImage(
  config: ProviderConfig,
  input: GenerateImageInput,
  provider: AiProvider,
): Promise<GenerateImageResult> {
  const response =
    input.referenceImages.length > 0
      ? await editOpenAiCompatibleImage(config, input, provider)
      : await createOpenAiCompatibleImage(config, input);

  const imageUrl = readOpenAiImageUrl(response);
  if (imageUrl) return { imageUrl, source: input.model };
  throw new Error("Image response did not include b64_json or url");
}

function readOpenAiImageUrl(response: OpenAiImageResponse): string | undefined {
  const first = response.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  return first?.url ?? response.image_url ?? response.url;
}

async function createOpenAiCompatibleImage(
  config: ProviderConfig,
  input: GenerateImageInput,
): Promise<OpenAiImageResponse> {
  const body: Record<string, string | number> = {
    model: input.model,
    prompt: input.prompt,
    n: 1,
    size: input.imageResolution,
    response_format: "b64_json",
  };
  if (input.imageQuality) {
    body.quality = normalizeOpenAiImageQuality(input.imageQuality);
  }

  return postJson<OpenAiImageResponse>(openAiCompatibleUrl(config.baseUrl, "/v1/images/generations"), config, body);
}

async function editOpenAiCompatibleImage(
  config: ProviderConfig,
  input: GenerateImageInput,
  provider: AiProvider,
): Promise<OpenAiImageResponse> {
  if (provider === "grok2api" && input.model !== "grok-imagine-image-edit") {
    throw new Error("Grok2API image references require the grok-imagine-image-edit model");
  }

  const form = new FormData();
  form.set("model", input.model);
  form.set("prompt", input.prompt);
  form.set("n", "1");
  form.set("size", openAiEditImageSize(provider, input.imageResolution));
  form.set("response_format", "b64_json");
  if (input.imageQuality) {
    form.set("quality", normalizeOpenAiImageQuality(input.imageQuality));
  }

  input.referenceImages.forEach((reference, index) => {
    const blob = dataUriToBlob(reference.dataUri);
    const fieldName = provider === "grok2api" ? "image[]" : "image";
    form.append(fieldName, blob, `reference_${index + 1}.png`);
  });

  return postForm<OpenAiImageResponse>(openAiCompatibleUrl(config.baseUrl, "/v1/images/edits"), config, form);
}

async function editOpenAiCompatibleImageWithOperation(
  config: ProviderConfig,
  input: EditImageInput,
  provider: AiProvider,
): Promise<GenerateImageResult> {
  if (provider === "grok2api" && input.model !== "grok-imagine-image-edit") {
    throw new Error("Grok2API image edits require the grok-imagine-image-edit model");
  }

  const form = new FormData();
  form.set("model", input.model);
  form.set("prompt", buildImageEditPrompt(input));
  form.set("n", "1");
  form.set("size", openAiEditImageSize(provider, input.imageResolution));
  form.set("response_format", "b64_json");
  if (input.imageQuality) {
    form.set("quality", normalizeOpenAiImageQuality(input.imageQuality));
  }

  const imageBlob = dataUriToBlob(input.image.dataUri);
  form.append(provider === "grok2api" ? "image[]" : "image", imageBlob, "image.png");
  if (input.mask && provider !== "grok2api") {
    form.append("mask", dataUriToBlob(input.mask.dataUri), "mask.png");
  } else if (input.mask && provider === "grok2api") {
    form.append("image[]", dataUriToBlob(input.mask.dataUri), "mask.png");
  }
  if (input.guide) {
    form.append(provider === "grok2api" ? "image[]" : "image", dataUriToBlob(input.guide.dataUri), "guide.png");
  }

  const response = await postForm<OpenAiImageResponse>(openAiCompatibleUrl(config.baseUrl, "/v1/images/edits"), config, form);
  const imageUrl = readOpenAiImageUrl(response);
  if (imageUrl) return { imageUrl, source: input.model };
  throw new Error("Image edit response did not include b64_json or url");
}

function openAiEditImageSize(provider: AiProvider, imageResolution: string): string {
  if (provider === "grok2api" || imageResolution === "auto") return "1024x1024";
  return imageResolution;
}

function normalizeOpenAiImageQuality(value: string): string {
  if (value === "low" || value === "medium" || value === "high" || value === "auto") return value;
  if (value === "4K" || value === "2K") return "high";
  return "auto";
}

function supportsGeminiImageSize(model: string): boolean {
  return model === "gemini-3.1-flash-image-preview" || model === "gemini-3-pro-image-preview";
}

function readGeminiInlineImage(value: unknown): { mimeType: string; base64: string } | undefined {
  const typed = value as GeminiGenerateContentResponse;
  const parts = typed.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        mimeType: part.inlineData.mimeType ?? "image/png",
        base64: part.inlineData.data,
      };
    }
  }
  return undefined;
}

function readProviderError(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const error = value.error;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  if (typeof value.error_info === "string") return value.error_info;
  if (typeof value.message === "string") return value.message;
  if (typeof value.detail === "string") return value.detail;
  return undefined;
}
