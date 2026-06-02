import type { AiProvider } from "./model-catalog";
import type { GenerateImageInput, GenerateImageResult, MediaStatusResult, ProviderConfig } from "./types";
import {
  dataUriToBlob,
  getJson,
  isRecord,
  mediaOperationName,
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
  error?: { message?: string };
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
  error?: { message?: string };
}

interface RunningHubCreateResponse {
  code?: number;
  msg?: string;
  data?: {
    taskId?: string;
    taskStatus?: string;
  };
  taskId?: string;
}

interface RunningHubQueryResponse {
  code?: number;
  msg?: string;
  data?: {
    status?: string;
    errorMessage?: string;
    results?: Array<{ url?: string; fileUrl?: string; fileType?: string }>;
  };
  status?: string;
  errorMessage?: string;
  results?: Array<{ url?: string; fileUrl?: string; fileType?: string }>;
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
  referenceImages: GenerateImageInput["referenceImages"];
}

const ASYNC_IMAGE_SUCCESS_STATUSES = new Set(["complete", "completed", "partial_complete", "succeeded", "success"]);
const ASYNC_IMAGE_FAILED_STATUSES = new Set(["failed", "failure", "canceled", "cancelled", "expired"]);

export async function generateImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
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

export async function getAsyncImageStatus(config: ProviderConfig, taskId: string): Promise<MediaStatusResult> {
  if (config.provider === "modelscope") {
    return getModelScopeImageStatus(config, taskId);
  }
  if (config.provider === "runninghub") {
    return getRunningHubMediaStatus(config, "image", taskId);
  }

  const response = await getJson<AsyncImageStatusResponse>(
    `${config.baseUrl}/v1/images/async/generations/${encodeURIComponent(taskId)}`,
    config,
  );
  const status = response.status?.toLowerCase() ?? "pending";

  if (ASYNC_IMAGE_SUCCESS_STATUSES.has(status)) {
    const url = response.data?.find(item => typeof item.url === "string")?.url;
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
      errorMessage: response.error?.message ?? "Async image task failed",
    };
  }

  return {
    done: false,
    mediaType: "image",
    progress: response.progress ?? 50,
    status,
  };
}

async function generateModelScopeImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
  const response = await fetch(`${config.baseUrl}/v1/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
      "X-ModelScope-Async-Mode": "true",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      size: input.imageResolution,
      image_url: readModelScopeReferenceImages(input),
    }),
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
  if (status === "succeed" || status === "success" || status === "completed") {
    const url = readModelScopeImageUrl(json);
    if (!url) throw new Error("ModelScope image task completed without an image URL");
    return { done: true, mediaType: "image", progress: 100, status, url };
  }
  if (status === "failed" || status === "fail" || status === "canceled") {
    return {
      done: true,
      mediaType: "image",
      progress: 100,
      status: "failed",
      errorMessage: json.error?.message ?? json.message ?? "ModelScope image task failed",
    };
  }
  return { done: false, mediaType: "image", progress: 50, status };
}

export async function generateRunningHubMedia(
  config: ProviderConfig,
  input: RunningHubMediaInput,
  mediaType: "image" | "video",
): Promise<GenerateImageResult> {
  const request = buildRunningHubRequest(config, input, mediaType);
  const response = await postJson<RunningHubCreateResponse>(`${config.baseUrl}${request.endpoint}`, config, request.body);
  const taskId = response.data?.taskId ?? response.taskId;
  if (!taskId) {
    throw new Error(response.msg ?? "RunningHub response did not include a taskId");
  }
  return {
    operationName: mediaOperationName("runninghub", mediaType, taskId),
    source: input.model,
  };
}

export async function getRunningHubMediaStatus(
  config: ProviderConfig,
  mediaType: "image" | "video",
  taskId: string,
): Promise<MediaStatusResult> {
  const response = await postJson<RunningHubQueryResponse>(`${config.baseUrl}/openapi/v2/query`, config, { taskId });
  const data = response.data ?? response;
  const status = data.status?.toLowerCase() ?? "running";
  if (status === "succeeded" || status === "success" || status === "completed") {
    const url = data.results?.find(result => result.url || result.fileUrl)?.url ?? data.results?.find(result => result.fileUrl)?.fileUrl;
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

function readModelScopeReferenceImages(input: GenerateImageInput): string | string[] | undefined {
  if (input.referenceImages.length === 0) return undefined;
  const urls = input.referenceImages.map(reference => reference.dataUri);
  return urls.length === 1 ? urls[0] : urls;
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

function buildRunningHubRequest(
  config: ProviderConfig,
  input: RunningHubMediaInput,
  mediaType: "image" | "video",
): { endpoint: string; body: Record<string, unknown> } {
  const size = mediaType === "image" ? input.imageResolution : input.aspectRatio;
  if (input.model.startsWith("api:")) {
    const endpoint = input.model.slice("api:".length);
    if (endpoint.startsWith("/openapi/v2/")) {
      return {
        endpoint,
        body: {
          prompt: input.prompt,
          size: size === "auto" ? undefined : size,
          image_url: input.referenceImages[0]?.dataUri,
          image_urls: input.referenceImages.map(reference => reference.dataUri),
        },
      };
    }
  }
  const expectedPrefix = mediaType === "image" ? "ai-app-image:" : "ai-app-video:";
  if (input.model.startsWith(expectedPrefix)) {
    const webappId = input.model.slice(expectedPrefix.length).trim();
    if (!webappId) throw new Error(`RunningHub ${mediaType} AI App model is missing webappId`);
    if (webappId === "<webappId>") throw new Error(`RunningHub ${mediaType} AI App model is missing webappId`);
    return {
      endpoint: "/task/openapi/ai-app/run",
      body: {
        apiKey: config.apiKey,
        webappId,
        nodeInfoList: [
          { nodeId: "prompt", fieldName: "prompt", fieldValue: input.prompt },
          ...input.referenceImages.map((reference, index) => ({
            nodeId: `image_${index + 1}`,
            fieldName: "image",
            fieldValue: reference.dataUri,
          })),
        ],
      },
    };
  }
  const workflowPrefix = mediaType === "image" ? "workflow-image:" : "workflow-video:";
  if (input.model.startsWith(workflowPrefix)) {
    const workflowId = input.model.slice(workflowPrefix.length).trim();
    if (!workflowId) throw new Error(`RunningHub ${mediaType} workflow model is missing workflowId`);
    if (workflowId === "<workflowId>") throw new Error(`RunningHub ${mediaType} workflow model is missing workflowId`);
    return {
      endpoint: "/task/openapi/create",
      body: {
        apiKey: config.apiKey,
        workflowId,
        nodeInfoList: [
          { nodeId: "prompt", fieldName: "prompt", fieldValue: input.prompt },
          ...input.referenceImages.map((reference, index) => ({
            nodeId: `image_${index + 1}`,
            fieldName: "image",
            fieldValue: reference.dataUri,
          })),
        ],
      },
    };
  }
  throw new Error(
    `RunningHub ${mediaType} model must be api:/openapi/v2/..., ${expectedPrefix}<webappId>, or ${workflowPrefix}<workflowId>`,
  );
}

async function generate12AiGeminiImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
  const parts = [
    { text: input.prompt },
    ...input.referenceImages.map(reference => {
      const parsed = parseDataUri(reference.dataUri);
      return {
        inline_data: {
          mime_type: parsed.mimeType,
          data: parsed.base64,
        },
      };
    }),
  ];

  const generationConfig: Record<string, unknown> = {
    responseModalities: ["IMAGE"],
    imageConfig: {
      aspectRatio: input.aspectRatio,
      ...(supportsGeminiImageSize(input.model) ? { imageSize: input.imageResolution } : {}),
    },
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
  const body: Record<string, unknown> =
    input.model === "gpt-image-2"
      ? {
          model: input.model,
          prompt: input.prompt,
          n: 1,
          size: input.imageResolution,
          quality: input.imageQuality,
        }
      : {
          model: input.model,
          prompt: input.prompt,
          n: 1,
          size: input.aspectRatio,
          quality: input.imageResolution,
          images: input.referenceImages.map(reference => reference.dataUri),
        };
  const response = await postJson<AsyncImageCreateResponse>(`${config.baseUrl}/v1/images/async/generations`, config, body);

  if (!response.id) throw new Error("Async image response did not include a task id");
  return {
    operationName: mediaOperationName("12ai", "image", response.id),
    source: input.model,
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
      : await createOpenAiCompatibleImage(config, input, provider);

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
  provider: AiProvider,
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

  return postJson<OpenAiImageResponse>(`${config.baseUrl}/v1/images/generations`, config, body);
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
  form.set("size", provider === "grok2api" ? "1024x1024" : input.imageResolution);
  form.set("response_format", "b64_json");
  if (input.imageQuality) {
    form.set("quality", normalizeOpenAiImageQuality(input.imageQuality));
  }

  input.referenceImages.forEach((reference, index) => {
    const blob = dataUriToBlob(reference.dataUri);
    const fieldName = provider === "grok2api" ? "image[]" : "image";
    form.append(fieldName, blob, `reference_${index + 1}.png`);
  });

  return postForm<OpenAiImageResponse>(`${config.baseUrl}/v1/images/edits`, config, form);
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
  return undefined;
}
