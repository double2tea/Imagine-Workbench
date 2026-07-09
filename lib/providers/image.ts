import type { AiProvider } from "./model-catalog";
import { ApiError } from "../api/errors";
import { isKnownProvider } from "./registry";
import {
  buildRunningHubStandardBody,
  getRunningHubYouchuanCatalog,
  getRunningHubStandardEndpoint,
  getRunningHubStandardModel,
  resolveRunningHubStandardModelForReferenceMedia,
  validateRunningHubStandardReferenceCount,
} from "./runninghub";
import type { EditImageInput, GenerateImageInput, GenerateImageResult, MediaStatusResult, ProviderConfig, ProviderMediaType, ReferenceImage, ReferenceMedia, RunningHubTaskNodeBinding } from "./types";
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
  runningHubYouchuan?: GenerateImageInput["runningHubYouchuan"];
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

function assertConcreteImageResolution(imageResolution: string, operation: string): void {
  if (imageResolution === "custom") {
    throw new Error(`Custom image size must be resolved to a concrete size before ${operation}`);
  }
}

export async function generateImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
  assertConcreteImageResolution(input.imageResolution, "image generation");
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
  assertConcreteImageResolution(input.imageResolution, "image editing");
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

export async function downloadImage(config: ProviderConfig, taskId: string, outputIndex = 0): Promise<Response> {
  const status = await getAsyncImageStatus(config, taskId);
  const url = readStatusUrlAt(status, outputIndex);
  if (!url) throw new Error(`Image task is complete but did not expose image #${outputIndex + 1}`);

  const res = await fetch(url, { signal: config.signal });
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
    referenceImages: [input.image, ...(input.mask ? [input.mask] : []), ...editInputGuides(input)],
    async: false,
  };
}

function buildImageEditPrompt(input: EditImageInput): string {
  const userPrompt = input.prompt?.trim();
  const maskText = input.mask
    ? "The second input image is a black and white mask only; it is not a style or content reference."
    : "No mask image is provided.";
  const guideText = editInputGuides(input).length > 0
    ? "Additional input images are visual references for content, style, or composition."
    : "No additional visual reference images are provided.";
  if (input.operation === "redraw") {
    return [
      "The first input image is the source image to edit.",
      maskText,
      guideText,
      input.mask ? "Change only the white masked region and preserve the rest of the image." : "Edit the source image according to the instruction while preserving its identity and composition.",
      userPrompt ? `Edit instruction: ${userPrompt}` : "Edit instruction: redraw the masked area naturally.",
    ].join("\n");
  }
  if (input.operation === "erase") {
    return [
      "The first input image is the source image to edit.",
      maskText,
      guideText,
      input.mask ? "Remove the white masked object or area and reconstruct the background naturally." : "Remove the object or area described by the instruction and reconstruct the background naturally.",
      "Preserve the unmasked image exactly as much as possible.",
    ].join("\n");
  }
  if (input.operation === "outpaint") {
    return [
      "The first input image is the expanded source canvas to outpaint.",
      input.mask ? "The second input image is a black and white mask only; white areas are the new canvas space to fill." : "No mask image is provided.",
      guideText,
      "Extend the scene naturally with matching perspective, lighting, texture, and camera style.",
      userPrompt ? `Outpaint instruction: ${userPrompt}` : "Outpaint instruction: continue the image beyond its original frame.",
    ].join("\n");
  }
  if (input.operation === "angle") {
    return [
      "The first input image is the source image to edit.",
      guideText,
      "Change the camera viewpoint according to the edit instruction.",
      "Preserve the subject identity, key objects, visual style, scene mood, and coherent scene content.",
      "Reconstruct only the newly visible parts needed for the changed camera viewpoint.",
      userPrompt ? `Edit instruction: ${userPrompt}` : "Edit instruction: adjust the camera angle while keeping the source image recognizable.",
    ].join("\n");
  }
  if (input.operation === "lighting") {
    return [
      "The first input image is the source image to relight.",
      guideText,
      "Change only lighting, highlights, shadows, color temperature, and rim light according to the edit instruction.",
      "Preserve the subject identity, camera angle, geometry, composition, texture detail, and scene content.",
      userPrompt ? `Edit instruction: ${userPrompt}` : "Edit instruction: relight the source image naturally.",
    ].join("\n");
  }
  return [
    "Remove the background from the first image and keep the main subject.",
    "Return a clean cutout-style result with a transparent or plain neutral background if transparency is unavailable.",
    userPrompt ? `Subject guidance: ${userPrompt}` : "",
  ].filter(Boolean).join("\n");
}

function editInputGuides(input: EditImageInput): ReferenceImage[] {
  return [...(input.guide ? [input.guide] : []), ...(input.guides ?? [])];
}

export async function downloadRunningHubMedia(
  config: ProviderConfig,
  mediaType: ProviderMediaType,
  taskId: string,
  outputIndex = 0,
): Promise<Response> {
  const status = await getRunningHubMediaStatus(config, mediaType, taskId);
  const url = readStatusUrlAt(status, outputIndex);
  if (!url) throw new Error(`RunningHub ${mediaType} task is complete but did not expose result #${outputIndex + 1}`);

  const res = await fetch(url, { signal: config.signal });
  if (!res.ok) throw new Error(`Failed to download RunningHub ${mediaType}: HTTP ${res.status}`);

  return new Response(res.body, {
    headers: {
      "Content-Type": runningHubDownloadContentType(res, mediaType),
      "Content-Disposition": `inline; filename="${mediaType}_${Date.now()}.${runningHubDownloadExtension(res, url, mediaType)}"`,
      "Cache-Control": "public, max-age=31536000",
    },
  });
}

function readStatusUrlAt(status: MediaStatusResult, outputIndex: number): string | undefined {
  if (!Number.isInteger(outputIndex) || outputIndex < 0) throw new Error("outputIndex must be a non-negative integer");
  return status.urls?.[outputIndex] ?? (outputIndex === 0 ? status.url : undefined);
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
    const urls = read12AiAsyncImageUrls(response);
    if (urls.length === 0) throw new Error("Async image task completed without an image URL");
    return {
      done: true,
      mediaType: "image",
      progress: 100,
      status,
      url: urls[0],
      urls,
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

function read12AiAsyncImageUrls(response: AsyncImageStatusResponse): string[] {
  return dedupeUrls([
    ...(response.outputs ?? []),
    ...(response.data ?? []).map(item => item.url),
  ]);
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
    signal: config.signal,
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

  const imageUrls = readModelScopeImageUrls(json);
  if (imageUrls.length > 0) return { imageUrl: imageUrls[0], imageUrls, source: input.model };
  throw new Error("ModelScope image response did not include task_id or image URL");
}

async function getModelScopeImageStatus(config: ProviderConfig, taskId: string): Promise<MediaStatusResult> {
  const response = await fetch(`${config.baseUrl}/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "X-ModelScope-Task-Type": "image_generation",
    },
    signal: config.signal,
  });
  const json = parseProviderResponseBody(await response.text()) as ModelScopeImageStatusResponse;
  if (!response.ok) {
    throw new Error(readProviderError(json) ?? `ModelScope image status failed with HTTP ${response.status}`);
  }

  const status = (json.task_status ?? json.status ?? "PENDING").toLowerCase();
  if (MODELSCOPE_IMAGE_SUCCESS_STATUSES.has(status)) {
    const urls = readModelScopeImageUrls(json);
    if (urls.length === 0) throw new Error("ModelScope image task completed without an image URL");
    return { done: true, mediaType: "image", progress: 100, status, url: urls[0], urls };
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
    const urls = readRunningHubOutputUrls(data.results ?? [], mediaType);
    if (urls.length === 0) throw new Error("RunningHub task completed without a result URL");
    return { done: true, mediaType, progress: 100, status, url: urls[0], urls };
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
  const urls = readRunningHubOutputUrls(results, mediaType);
  if (urls.length === 0) throw new Error("RunningHub task completed without a result URL");
  return { done: true, mediaType, progress: 100, status: "success", url: urls[0], urls };
}

function isRunningHubFailedOutput(value: RunningHubTaskOutputsResponse["data"]): value is { failedReason?: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "failedReason" in value;
}

function readFailedReason(reason: unknown): string {
  return typeof reason === "string" && reason.trim() ? reason : "RunningHub task failed";
}

function readRunningHubOutputUrls(results: RunningHubMediaOutput[], mediaType: ProviderMediaType): string[] {
  return dedupeUrls(results
    .filter(result => isRunningHubOutputMediaType(result, mediaType))
    .flatMap(result => [result.url, result.fileUrl]));
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

function readModelScopeImageUrls(response: ModelScopeImageCreateResponse): string[] {
  return dedupeUrls([
    ...(response.images ?? []).map(item => item.url),
    ...(response.output_images ?? []),
    ...(response.output?.images ?? []).map(item => typeof item === "string" ? item : item.url),
    ...(response.output?.output_images ?? []),
  ]);
}

async function buildRunningHubRequest(
  config: ProviderConfig,
  input: RunningHubMediaInput,
  mediaType: ProviderMediaType,
): Promise<RunningHubRequest> {
  const size = mediaType === "image" ? input.imageResolution : input.aspectRatio;
  const standardModel = getRunningHubStandardModel(input.model, mediaType);
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
    const runningHubYouchuan = await uploadRunningHubYouchuanReferences(config, routedModel.model, input.runningHubYouchuan);
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
        youchuan: runningHubYouchuan,
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

async function uploadRunningHubYouchuanReferences(
  config: ProviderConfig,
  model: string,
  settings: GenerateImageInput["runningHubYouchuan"],
): Promise<GenerateImageInput["runningHubYouchuan"]> {
  if (!settings) return undefined;
  const catalog = getRunningHubYouchuanCatalog(model);
  if (!catalog || catalog.referenceParams.length === 0) return settings;
  const uploaded: GenerateImageInput["runningHubYouchuan"] = { ...settings };
  for (const param of catalog.referenceParams) {
    const value = settings[param.field];
    if (!value) continue;
    if (value.startsWith("http://") || value.startsWith("https://")) {
      if (param.field === "sref") uploaded.sref = value;
      if (param.field === "oref") uploaded.oref = value;
      continue;
    }
    const urls = await uploadRunningHubStandardReferences(config, [{ dataUri: value, type: "image" }]);
    const url = urls.imageUrls[0];
    if (!url) throw new Error(`RunningHub Youchuan ${param.field} upload did not return an image URL`);
    if (param.field === "sref") uploaded.sref = url;
    if (param.field === "oref") uploaded.oref = url;
  }
  return uploaded;
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
    throw runningHubApiError(errorCode, errorMessage, fallback);
  }
  if (errorMessage) throw runningHubApiError(undefined, errorMessage, fallback);
  if (response.code === undefined || response.code === 0 || response.code === 200) return;
  throw runningHubApiError(String(response.code), response.msg ?? response.message, fallback);
}

function runningHubApiError(providerCode: string | undefined, providerMessage: string | undefined, fallback: string): ApiError {
  const message = runningHubErrorMessage(providerCode, providerMessage, fallback);
  return new ApiError(
    runningHubHttpStatus(providerCode),
    runningHubErrorCode(providerCode),
    message,
    providerCode ? { provider: "runninghub", providerCode } : { provider: "runninghub" },
  );
}

function runningHubErrorMessage(providerCode: string | undefined, providerMessage: string | undefined, fallback: string): string {
  const message = providerMessage?.trim() || fallback;
  return providerCode ? `${message} (RunningHub code ${providerCode})` : message;
}

function runningHubHttpStatus(providerCode: string | undefined): number {
  switch (providerCode) {
    case "301":
    case "433":
    case "803":
    case "810":
    case "1007":
    case "1101":
    case "1501":
    case "1505":
      return 400;
    case "801":
    case "802":
    case "811":
    case "1002":
    case "1601":
      return 401;
    case "1014":
      return 403;
    case "416":
    case "812":
      return 402;
    case "380":
    case "423":
    case "807":
    case "901":
    case "1004":
      return 404;
    case "421":
    case "1003":
      return 429;
    case "415":
    case "435":
    case "436":
    case "813":
    case "1010":
    case "1011":
    case "1504":
      return 503;
    default:
      return 502;
  }
}

function runningHubErrorCode(providerCode: string | undefined): string {
  switch (providerCode) {
    case "301":
    case "1007":
      return "runninghub_invalid_request";
    case "433":
    case "803":
    case "810":
    case "1101":
      return "runninghub_workflow_invalid";
    case "1501":
    case "1505":
      return "runninghub_content_rejected";
    case "801":
    case "802":
    case "811":
    case "1002":
    case "1601":
      return "runninghub_auth_failed";
    case "1014":
      return "runninghub_enterprise_key_required";
    case "416":
    case "812":
      return "runninghub_insufficient_funds";
    case "380":
    case "423":
    case "807":
    case "901":
    case "1004":
      return "runninghub_not_found";
    case "421":
    case "1003":
      return "runninghub_rate_limited";
    case "415":
    case "435":
    case "436":
    case "813":
    case "1010":
    case "1011":
    case "1504":
      return "runninghub_temporarily_unavailable";
    default:
      return "runninghub_provider_error";
  }
}

async function generate12AiGeminiImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
  const parts = [
    ...input.referenceImages.map(reference => {
      const parsed = parseDataUri(reference.dataUri);
      return {
        inlineData: {
          mimeType: parsed.mimeType,
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
      signal: config.signal,
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
    ...(supportsGeminiImageSize(input.model) ? { image_size: input.imageResolution } : {}),
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

  const imageUrls = readOpenAiImageUrls(response);
  if (imageUrls.length > 0) return { imageUrl: imageUrls[0], imageUrls, source: input.model };
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

  const imageUrls = readOpenAiImageUrls(response);
  if (imageUrls.length > 0) return { imageUrl: imageUrls[0], imageUrls, source: input.model };
  throw new Error("Image response did not include b64_json or url");
}

function readOpenAiImageUrls(response: OpenAiImageResponse): string[] {
  return dedupeUrls([
    ...(response.data ?? []).map(item => item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url),
    response.image_url,
    response.url,
  ]);
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

  const imageFieldName = openAiEditImageFieldName(provider, editInputGuides(input).length);
  const imageBlob = dataUriToBlob(input.image.dataUri);
  form.append(imageFieldName, imageBlob, "image.png");
  if (input.mask && provider !== "grok2api") {
    form.append("mask", dataUriToBlob(input.mask.dataUri), "mask.png");
  } else if (input.mask && provider === "grok2api") {
    form.append("image[]", dataUriToBlob(input.mask.dataUri), "mask.png");
  }
  editInputGuides(input).forEach((guide, index) => {
    form.append(imageFieldName, dataUriToBlob(guide.dataUri), `reference_${index + 1}.png`);
  });

  const response = await postForm<OpenAiImageResponse>(openAiCompatibleUrl(config.baseUrl, "/v1/images/edits"), config, form);
  const imageUrls = readOpenAiImageUrls(response);
  if (imageUrls.length > 0) return { imageUrl: imageUrls[0], imageUrls, source: input.model };
  throw new Error("Image edit response did not include b64_json or url");
}

function dedupeUrls(values: Array<string | undefined>): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const url = value?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function openAiEditImageFieldName(provider: AiProvider, guideCount: number): "image" | "image[]" {
  if (provider === "grok2api" || guideCount > 0) return "image[]";
  return "image";
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
