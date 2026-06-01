import type { GenerateVideoInput, GenerateVideoResult, MediaStatusResult, ProviderConfig } from "./types";
import { generateRunningHubMedia, getRunningHubMediaStatus } from "./image";
import {
  aspectRatioToVideoSize,
  authHeaders,
  dataUriToBlob,
  deleteJson,
  getJson,
  isRecord,
  mediaOperationName,
  postForm,
} from "./utils";

interface VideoCreateResponse {
  id?: string;
  status?: string;
}

interface VideoStatusResponse {
  status?: string;
  progress?: number;
  url?: string;
  video_url?: string;
  content_url?: string;
  data?: { url?: string };
  output?: { url?: string };
  error?: { message?: string };
}

interface VideoDeleteResponse {
  success?: boolean;
  message?: string;
}

const VIDEO_SUCCESS_STATUSES = new Set(["complete", "completed", "succeeded", "success"]);
const VIDEO_FAILED_STATUSES = new Set(["failed", "failure", "canceled", "cancelled", "expired"]);

export async function generateVideo(config: ProviderConfig, input: GenerateVideoInput): Promise<GenerateVideoResult> {
  if (config.provider === "modelscope") {
    throw new Error("ModelScope public REST video generation is not supported yet; use a deployed OpenAI-compatible endpoint or RunningHub.");
  }
  if (config.provider === "runninghub") {
    const result = await generateRunningHubMedia(config, {
      prompt: input.prompt,
      model: input.model,
      aspectRatio: input.aspectRatio,
      referenceImages: input.referenceImages,
    }, "video");
    if (!result.operationName) throw new Error("RunningHub video response did not include an operation name");
    return {
      operationName: result.operationName,
      source: result.source,
    };
  }

  const form = new FormData();
  form.set("model", input.model);
  form.set("prompt", input.prompt);
  const videoSize = aspectRatioToVideoSize(input.aspectRatio, config.provider);
  if (videoSize) form.set("size", videoSize);

  if (config.provider === "grok2api") {
    form.set("seconds", normalizeGrokVideoDuration(input.durationSeconds));
    form.set("resolution_name", normalizeGrokVideoResolution(input.resolutionName));
    form.set("preset", normalizeGrokVideoPreset(input.preset));
  } else {
    if (input.durationSeconds) form.set("seconds", input.durationSeconds);
    if (input.resolutionName) form.set("resolution_name", input.resolutionName);
    if (input.preset) form.set("preset", input.preset);
  }

  input.referenceImages.forEach((reference, index) => {
    const blob = dataUriToBlob(reference.dataUri);
    form.append("input_reference[]", blob, `reference_${index + 1}.png`);
  });

  const response = await postForm<VideoCreateResponse>(
    `${config.provider === "12ai" ? config.videoBaseUrl : config.baseUrl}/v1/videos`,
    config,
    form,
  );
  if (!response.id) throw new Error("Video response did not include a task id");

  return {
    operationName: mediaOperationName(config.provider, "video", response.id),
    source: input.model,
  };
}

export async function getVideoStatus(config: ProviderConfig, taskId: string): Promise<MediaStatusResult> {
  if (config.provider === "runninghub") {
    return getRunningHubMediaStatus(config, "video", taskId);
  }

  const baseUrl = config.provider === "12ai" ? config.videoBaseUrl : config.baseUrl;
  const response = await getJson<VideoStatusResponse>(`${baseUrl}/v1/videos/${encodeURIComponent(taskId)}`, config);
  const status = response.status?.toLowerCase() ?? "processing";
  if (VIDEO_FAILED_STATUSES.has(status)) {
    return {
      done: true,
      mediaType: "video",
      progress: 100,
      status: "failed",
      errorMessage: response.error?.message ?? "Video task failed",
    };
  }

  if (VIDEO_SUCCESS_STATUSES.has(status)) {
    return {
      done: true,
      mediaType: "video",
      progress: 100,
      status,
      url: readVideoUrl(response),
    };
  }

  return {
    done: false,
    mediaType: "video",
    progress: response.progress ?? (status === "queued" ? 5 : 50),
    status,
  };
}

export async function downloadVideo(config: ProviderConfig, taskId: string): Promise<Response> {
  const baseUrl = config.provider === "12ai" ? config.videoBaseUrl : config.baseUrl;
  const status = await getJson<VideoStatusResponse>(`${baseUrl}/v1/videos/${encodeURIComponent(taskId)}`, config);
  const videoUrl =
    readVideoUrl(status) ??
    (config.provider === "grok2api" ? `${baseUrl}/v1/videos/${encodeURIComponent(taskId)}/content` : undefined);
  if (!videoUrl) throw new Error("Video task is complete but did not expose a video URL");

  const res = await fetch(videoUrl, {
    headers: videoUrl.startsWith(baseUrl) ? authHeaders(config) : {},
  });
  if (!res.ok) throw new Error(`Failed to download video: HTTP ${res.status}`);

  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "video/mp4",
      "Content-Disposition": `inline; filename="video_${Date.now()}.mp4"`,
      "Cache-Control": "public, max-age=31536000",
    },
  });
}

export async function cancelVideo(config: ProviderConfig, taskId: string): Promise<void> {
  const baseUrl = config.provider === "12ai" ? config.videoBaseUrl : config.baseUrl;
  const response = await deleteJson<VideoDeleteResponse>(`${baseUrl}/v1/videos/${encodeURIComponent(taskId)}`, config);
  if (response.success !== true) {
    throw new Error(response.message ?? "Video task cancel failed");
  }
}

function readVideoUrl(value: VideoStatusResponse): string | undefined {
  const candidates = [value.url, value.video_url, value.content_url, value.data?.url, value.output?.url];
  const direct = candidates.find(candidate => typeof candidate === "string" && candidate.length > 0);
  if (direct) return direct;

  if (isRecord(value)) {
    const nestedData = value.data;
    if (Array.isArray(nestedData)) {
      for (const item of nestedData) {
        if (isRecord(item) && typeof item.url === "string") return item.url;
      }
    }
  }
  return undefined;
}

function normalizeGrokVideoResolution(value: string | undefined): string {
  if (value === undefined) return "720p";
  if (value === "480p" || value === "720p") return value;
  throw new Error("Grok2API video resolution must be 480p or 720p");
}

function normalizeGrokVideoDuration(value: string | undefined): string {
  if (value === undefined) return "10";
  if (value === "6" || value === "10" || value === "12" || value === "16" || value === "20") return value;
  throw new Error("Grok2API video duration must be 6, 10, 12, 16, or 20 seconds");
}

function normalizeGrokVideoPreset(value: string | undefined): string {
  if (value === undefined) return "normal";
  if (value === "fun" || value === "normal" || value === "spicy" || value === "custom") return value;
  throw new Error("Grok2API video preset must be fun, normal, spicy, or custom");
}
