"use client";

import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAlert } from "@/components/confirm/ConfirmProvider";
import type { StorageItem } from "@/lib/db";
import {
  captureVideoFrame,
  type CapturedVideoFrame,
  type VideoFrameCaptureMode,
} from "@/lib/video-frame";

export type VideoFrameCaptureRequest = (mode: VideoFrameCaptureMode) => Promise<void>;

interface VideoAssetPlayerProps {
  autoPlay?: boolean;
  className?: string;
  controlsVisibility?: "always" | "hover";
  item: StorageItem;
  loop?: boolean;
  onAspectRatio?: (aspectRatio: number) => void;
  onCaptureFrame?: (item: StorageItem, frame: CapturedVideoFrame) => void | Promise<unknown>;
  onCaptureFrameRequestReady?: (request: VideoFrameCaptureRequest | null) => void;
  preload?: "none" | "metadata" | "auto";
  showFullscreenButton?: boolean;
}

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function isPlayInterruptedError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function VideoAssetPlayer({
  autoPlay = false,
  className = "h-full w-full object-contain",
  controlsVisibility = "always",
  item,
  loop = true,
  onAspectRatio,
  onCaptureFrame,
  onCaptureFrameRequestReady,
  preload = "metadata",
  showFullscreenButton = true,
}: VideoAssetPlayerProps) {
  const showAlert = useAlert();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(!autoPlay);
  const rangeMax = Number.isFinite(duration) && duration > 0 ? duration : Math.max(currentTime, 0);
  const rangeValue = Math.min(currentTime, rangeMax);
  const progressPercent = rangeMax > 0 ? (rangeValue / rangeMax) * 100 : 0;
  const videoUrl = item.url.trim();

  const captureFrame = useCallback<VideoFrameCaptureRequest>(async (mode) => {
    const video = videoRef.current;
    if (!video || !onCaptureFrame) return;

    try {
      const frame = await captureVideoFrame(video, mode);
      await onCaptureFrame(item, frame);
    } catch (error) {
      await showAlert({ message: error instanceof Error ? error.message : "视频截帧失败" });
    }
  }, [item, onCaptureFrame, showAlert]);

  useEffect(() => {
    if (!onCaptureFrame || !onCaptureFrameRequestReady) return undefined;
    onCaptureFrameRequestReady(captureFrame);
    return () => onCaptureFrameRequestReady(null);
  }, [captureFrame, onCaptureFrame, onCaptureFrameRequestReady]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(error => {
        if (isPlayInterruptedError(error)) return;
        console.error("Video play failed:", error);
      });
    } else {
      video.pause();
    }
  };

  const toggleMuted = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const requestFullscreen = () => {
    const container = containerRef.current;
    if (!container || typeof container.requestFullscreen !== "function") return;
    void container.requestFullscreen();
  };

  const seekTo = (value: string) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Number(value);
  };

  if (!videoUrl) {
    return <div ref={containerRef} className="relative flex h-full w-full items-center justify-center bg-slate-950" />;
  }

  return (
    <div ref={containerRef} className="group/video relative flex h-full w-full items-center justify-center bg-slate-950">
      <video
        ref={videoRef}
        src={videoUrl}
        loop={loop}
        autoPlay={autoPlay}
        muted={isMuted}
        playsInline
        preload={preload}
        className={className}
        onClick={togglePlay}
        onLoadedMetadata={event => {
          const video = event.currentTarget;
          setDuration(video.duration);
          setCurrentTime(video.currentTime);
          setIsMuted(video.muted);
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            onAspectRatio?.(video.videoWidth / video.videoHeight);
          }
        }}
        onPause={() => setIsPaused(true)}
        onPlay={() => setIsPaused(false)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onVolumeChange={event => setIsMuted(event.currentTarget.muted)}
      />

      <div
        className={[
          "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/86 via-black/50 to-transparent px-4 pb-2.5 pt-6 text-white transition-opacity duration-200",
          controlsVisibility === "hover" ? "pointer-events-none opacity-0 group-hover/video:pointer-events-auto group-hover/video:opacity-100" : "opacity-100",
        ].join(" ")}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex h-6 items-center gap-2.5">
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white transition hover:bg-white/12"
            title={isPaused ? "播放" : "暂停"}
          >
            {isPaused ? <Play className="h-4 w-4 fill-white" /> : <Pause className="h-4 w-4 fill-white" />}
          </button>
          <span className="min-w-[70px] font-mono text-xs text-white/90">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="relative h-3 min-w-0 flex-1">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/24">
              <div
                className="h-full rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.35)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_6px_rgba(15,23,42,0.45)]"
              style={{ left: `${progressPercent}%` }}
            />
            <input
              type="range"
              min={0}
              max={rangeMax}
              step={0.01}
              value={rangeValue}
              onChange={event => seekTo(event.target.value)}
              className="absolute inset-0 h-3 w-full cursor-pointer opacity-0"
              aria-label="视频进度"
            />
          </div>
          <button
            type="button"
            onClick={toggleMuted}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white transition hover:bg-white/12"
            title={isMuted ? "取消静音" : "静音"}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          {showFullscreenButton && (
            <button
              type="button"
              onClick={requestFullscreen}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white transition hover:bg-white/12"
              title="全屏播放"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
