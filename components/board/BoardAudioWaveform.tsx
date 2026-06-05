"use client";

import { FastForward, Pause, Play, Rewind } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

interface BoardAudioWaveformProps {
  src: string;
}

const SOURCE_POINT_COUNT = 160;
const WAVEFORM_AMPLITUDE = 1.05;
const VISIBLE_POINT_COUNT = 96;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function computePeaks(buffer: AudioBuffer): number[] {
  const data = buffer.getChannelData(0);
  const samplesPerPoint = Math.max(1, Math.floor(data.length / SOURCE_POINT_COUNT));
  const peaks: number[] = [];

  for (let index = 0; index < SOURCE_POINT_COUNT; index += 1) {
    const start = index * samplesPerPoint;
    const end = Math.min(start + samplesPerPoint, data.length);
    let peak = 0;
    let sumSquares = 0;
    let sampleCount = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const value = Math.abs(data[sampleIndex] ?? 0);
      peak = Math.max(peak, value);
      sumSquares += value * value;
      sampleCount += 1;
    }

    const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
    peaks.push((rms * 0.8) + (peak * 0.2));
  }

  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map(peak => Math.max(0.08, peak / maxPeak));
}

function resamplePeaks(peaks: number[], barCount: number): number[] {
  if (peaks.length === barCount) return peaks;

  const nextPeaks: number[] = [];
  for (let index = 0; index < barCount; index += 1) {
    const start = Math.floor((index * peaks.length) / barCount);
    const end = Math.max(start + 1, Math.floor(((index + 1) * peaks.length) / barCount));
    let peak = 0;
    for (let peakIndex = start; peakIndex < end; peakIndex += 1) {
      peak = Math.max(peak, peaks[peakIndex] ?? 0);
    }
    nextPeaks.push(peak);
  }
  return nextPeaks;
}

function waveformPoints(peaks: number[], amplitude: number): string {
  if (peaks.length === 0) return "";
  const lastIndex = Math.max(1, peaks.length - 1);
  const upper = peaks.map((peak, index) => {
    const x = (index / lastIndex) * 100;
    const y = 50 - Math.min(1, peak * amplitude) * 42;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const lower = [...peaks].reverse().map((peak, reverseIndex) => {
    const index = peaks.length - 1 - reverseIndex;
    const x = (index / lastIndex) * 100;
    const y = 50 + Math.min(1, peak * amplitude) * 42;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return [...upper, ...lower].join(" ");
}

export default function BoardAudioWaveform({ src }: BoardAudioWaveformProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const clipPathId = useId().replace(/:/g, "");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [peaks, setPeaks] = useState<number[]>(() => Array.from({ length: SOURCE_POINT_COUNT }, () => 0.12));
  const visiblePeaks = useMemo(() => resamplePeaks(peaks, VISIBLE_POINT_COUNT), [peaks]);
  const points = useMemo(() => waveformPoints(visiblePeaks, WAVEFORM_AMPLITUDE), [visiblePeaks]);

  useEffect(() => {
    let isCancelled = false;

    async function loadWaveform() {
      const response = await fetch(src);
      const arrayBuffer = await response.arrayBuffer();
      const context = new AudioContext();
      const buffer = await context.decodeAudioData(arrayBuffer);
      if (!isCancelled) {
        setDuration(buffer.duration);
        setPeaks(computePeaks(buffer));
      }
      await context.close();
    }

    void loadWaveform();

    return () => {
      isCancelled = true;
    };
  }, [src]);

  const seekToClientX = (clientX: number) => {
    const audio = audioRef.current;
    const waveform = waveformRef.current;
    const playableDuration = duration || audio?.duration || 0;
    if (!audio || !waveform || playableDuration <= 0) return;

    const rect = waveform.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const nextTime = playableDuration * ratio;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const seekBy = (seconds: number) => {
    const audio = audioRef.current;
    const playableDuration = duration || audio?.duration || 0;
    if (!audio || playableDuration <= 0) return;
    const nextTime = Math.min(playableDuration, Math.max(0, audio.currentTime + seconds));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div
      className="flex h-full w-full flex-col justify-between overflow-hidden rounded-lg border border-[var(--iw-board-border)] px-5 pb-6 pt-5 text-[var(--iw-text)] shadow-inner"
      style={{
        background: "linear-gradient(180deg, color-mix(in srgb, var(--iw-accent) 10%, var(--iw-panel)), var(--iw-panel))",
      }}
    >
      <audio
        ref={audioRef}
        src={src}
        onDurationChange={event => setDuration(event.currentTarget.duration)}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
      />
      <div className="flex items-center justify-end gap-2">
        <div className="text-xs font-semibold tabular-nums text-[color-mix(in_srgb,var(--iw-text)_58%,transparent)]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
      <div
        ref={waveformRef}
        className="nodrag relative h-28 cursor-ew-resize px-2"
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsDragging(true);
          seekToClientX(event.clientX);
        }}
        onPointerMove={event => {
          if (isDragging) seekToClientX(event.clientX);
        }}
        onPointerUp={event => {
          event.currentTarget.releasePointerCapture(event.pointerId);
          setIsDragging(false);
          seekToClientX(event.clientX);
        }}
        onPointerCancel={() => setIsDragging(false)}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-x-2 inset-y-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] overflow-visible"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <defs>
            <clipPath id={clipPathId}>
              <rect height="100" width={Math.min(100, Math.max(0, progress * 100))} x="0" y="0" />
            </clipPath>
          </defs>
          <polygon
            points={points}
            style={{ fill: "color-mix(in srgb, var(--iw-text) 22%, transparent)" }}
          />
          <polygon
            clipPath={`url(#${clipPathId})`}
            points={points}
            style={{ fill: "var(--iw-accent)" }}
          />
          <polyline
            fill="none"
            points={points.split(" ").slice(0, visiblePeaks.length).join(" ")}
            strokeWidth="0.6"
            style={{ stroke: "color-mix(in srgb, var(--iw-text) 36%, transparent)" }}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="pointer-events-none absolute bottom-2 top-2 w-0.5 bg-[var(--iw-accent)] shadow-[0_0_14px_var(--iw-accent-glow)]"
          style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        >
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[var(--iw-accent)]" />
        </span>
      </div>
      <div className="flex items-center justify-center gap-8">
        <button
          type="button"
          className="nodrag flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--iw-muted)] transition hover:bg-[var(--iw-accent-soft)] hover:text-[var(--iw-text)]"
          onClick={() => seekBy(-5)}
          title="后退 5 秒"
        >
          <Rewind className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="nodrag flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--iw-accent)] text-white shadow-[0_12px_30px_var(--iw-accent-glow)] transition hover:scale-105"
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused) {
              void audio.play();
              return;
            }
            audio.pause();
          }}
          title={isPlaying ? "暂停" : "播放"}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
        </button>
        <button
          type="button"
          className="nodrag flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--iw-muted)] transition hover:bg-[var(--iw-accent-soft)] hover:text-[var(--iw-text)]"
          onClick={() => seekBy(5)}
          title="前进 5 秒"
        >
          <FastForward className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
