import { buildStorageItem, type StorageItem } from "@/lib/db";

export type VideoFrameCaptureMode = "first" | "current" | "last";

export interface CapturedVideoFrame {
  dataUrl: string;
  height: number;
  mode: VideoFrameCaptureMode;
  timeSeconds: number;
  width: number;
}

export function getVideoFrameCaptureLabel(mode: VideoFrameCaptureMode): string {
  if (mode === "first") return "首帧";
  if (mode === "last") return "尾帧";
  return "当前帧";
}

export function createVideoFrameStorageItem(
  source: StorageItem,
  frame: CapturedVideoFrame,
  id: string,
): StorageItem {
  const label = getVideoFrameCaptureLabel(frame.mode);
  return buildStorageItem(
    {
      id,
      type: "image",
      url: frame.dataUrl,
      prompt: `${source.prompt} (${label})`,
      model: source.model,
      aspectRatio: `${frame.width}x${frame.height}`,
      createdAt: new Date().toISOString(),
      status: "complete",
      progress: 100,
      sourceBoardNodeId: source.sourceBoardNodeId,
    },
    { boardId: source.boardId || undefined },
  );
}

export async function captureVideoFrame(
  video: HTMLVideoElement,
  mode: VideoFrameCaptureMode,
): Promise<CapturedVideoFrame> {
  await ensureVideoMetadata(video);
  const targetTime = getCaptureTime(video, mode);

  if (Math.abs(video.currentTime - targetTime) > 0.01) {
    await seekVideo(video, targetTime);
  }

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) {
    throw new Error("视频画面尺寸不可用，无法截帧");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持视频截帧画布");

  context.drawImage(video, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    height,
    mode,
    timeSeconds: video.currentTime,
    width,
  };
}

function getCaptureTime(video: HTMLVideoElement, mode: VideoFrameCaptureMode): number {
  if (mode === "current") return video.currentTime;
  if (mode === "first") return 0;

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("视频时长不可用，无法截取尾帧");
  }
  return Math.max(0, duration - 0.05);
}

function ensureVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("error", handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("视频元数据加载失败，无法截帧"));
    };
    video.addEventListener("loadedmetadata", handleLoaded, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
}

function seekVideo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("视频定位失败，无法截帧"));
    };
    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = timeSeconds;
  });
}
