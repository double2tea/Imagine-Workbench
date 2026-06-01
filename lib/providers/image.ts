import type { AiProvider } from "./model-catalog";
import type { GenerateImageInput, GenerateImageResult, MediaStatusResult, ProviderConfig } from "./types";
import {
  aspectRatioToOpenAiSize,
  authHeaders,
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

const ASYNC_IMAGE_SUCCESS_STATUSES = new Set(["complete", "completed", "partial_complete", "succeeded", "success"]);
const ASYNC_IMAGE_FAILED_STATUSES = new Set(["failed", "failure", "canceled", "cancelled", "expired"]);

export async function generateImage(config: ProviderConfig, input: GenerateImageInput): Promise<GenerateImageResult> {
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
      ...(supportsGeminiImageSize(input.model) ? { imageSize: input.imageSize } : {}),
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
  const response = await postJson<AsyncImageCreateResponse>(`${config.baseUrl}/v1/images/async/generations`, config, {
    model: input.model,
    prompt: input.prompt,
    n: 1,
    size: input.aspectRatio,
    quality: input.imageSize,
    images: input.referenceImages.map(reference => reference.dataUri),
  });

  if (!response.id) throw new Error("Async image response did not include a task id");
  return {
    operationName: mediaOperationName("12ai", "image", response.id),
    source: input.model,
  };
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

  const first = response.data?.[0];
  if (first?.b64_json) {
    return { imageUrl: `data:image/png;base64,${first.b64_json}`, source: input.model };
  }
  if (first?.url) {
    return { imageUrl: first.url, source: input.model };
  }
  throw new Error("Image response did not include b64_json or url");
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
    size: aspectRatioToOpenAiSize(input.aspectRatio),
    response_format: "b64_json",
  };
  if (provider === "12ai") {
    body.quality = normalizeOpenAiImageQuality(input.imageSize);
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
  form.set("size", provider === "grok2api" ? "1024x1024" : aspectRatioToOpenAiSize(input.aspectRatio));
  form.set("response_format", "b64_json");
  if (provider === "12ai") {
    form.set("quality", normalizeOpenAiImageQuality(input.imageSize));
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
