import type { GenerateVideoInput, GenerateVideoResult, MediaStatusResult, ProviderConfig } from "./types";
import { aspectRatioToVideoSize, authHeaders, getJson, isRecord, mediaOperationName, postForm } from "./utils";

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

export async function generateVideo(config: ProviderConfig, input: GenerateVideoInput): Promise<GenerateVideoResult> {
  const form = new FormData();
  form.set("model", input.model);
  form.set("prompt", input.prompt);
  const videoSize = aspectRatioToVideoSize(input.aspectRatio, config.provider);
  if (videoSize) form.set("size", videoSize);

  if (config.provider === "grok2api") {
    form.set("seconds", "10");
    form.set("resolution_name", "720p");
    form.set("preset", "normal");
  }

  input.referenceImages.forEach(reference => {
    form.append("input_reference[]", reference.dataUri);
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
  const baseUrl = config.provider === "12ai" ? config.videoBaseUrl : config.baseUrl;
  const response = await getJson<VideoStatusResponse>(`${baseUrl}/v1/videos/${encodeURIComponent(taskId)}`, config);
  const status = response.status ?? "processing";
  if (status === "failed") {
    throw new Error(response.error?.message ?? "Video task failed");
  }

  if (status === "completed" || status === "complete") {
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
