"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

interface VoiceProfilePreviewPlayerProps {
  className?: string;
  src: string;
}

function formatPlaybackTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function VoiceProfilePreviewPlayer({ className = "", src }: VoiceProfilePreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setHasError(false);
  }, [src]);

  const togglePlayback = async (): Promise<void> => {
    const audio = audioRef.current;
    if (!audio || hasError) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setHasError(true);
      setIsPlaying(false);
    }
  };

  const seek = (event: MouseEvent<HTMLButtonElement>): void => {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2.5 py-2 text-[var(--iw-text)] ${className}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onDurationChange={event => setDuration(event.currentTarget.duration)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setHasError(true);
          setIsPlaying(false);
        }}
      />
      <button
        type="button"
        onClick={() => void togglePlayback()}
        disabled={hasError}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-700 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:border-[var(--iw-border)] disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
        aria-label={isPlaying ? "暂停音色预览" : "播放音色预览"}
        title={isPlaying ? "暂停" : "播放"}
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-[var(--iw-muted)]">
          <span>试听</span>
          <span className="font-mono text-[var(--iw-faint)]">
            {hasError ? "不可播放" : `${formatPlaybackTime(currentTime)} / ${formatPlaybackTime(duration)}`}
          </span>
        </div>
        <button
          type="button"
          onClick={seek}
          disabled={hasError || duration <= 0}
          className="relative block h-1.5 w-full overflow-hidden rounded-full bg-[var(--iw-panel-soft)] text-left disabled:cursor-not-allowed"
          aria-label="音色预览进度"
          title="点击跳转"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-amber-500"
            style={{ width: `${progress}%` }}
          />
        </button>
      </div>
    </div>
  );
}
