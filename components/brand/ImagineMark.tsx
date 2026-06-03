"use client";

import { useEffect, useId, useRef } from "react";

/** Shared Imagine Workbench mark — app header, Agent, board nodes, favicon source. */
export type ImagineMarkSize = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<ImagineMarkSize, number> = {
  xs: 14,
  sm: 24,
  md: 32,
  lg: 56,
};

const GAZE_RANGE: Record<ImagineMarkSize, { x: number; y: number; reach: number }> = {
  xs: { x: 0, y: 0, reach: 0 },
  sm: { x: 2.5, y: 2, reach: 140 },
  md: { x: 4.5, y: 3.5, reach: 180 },
  lg: { x: 7, y: 5.5, reach: 240 },
};

interface ImagineMarkProps {
  size?: ImagineMarkSize;
  trackPointer?: boolean;
  className?: string;
}

export default function ImagineMark({
  size = "md",
  trackPointer = false,
  className = "",
}: ImagineMarkProps) {
  const markRef = useRef<HTMLSpanElement>(null);
  const uid = useId().replace(/:/g, "");
  const shellGradient = `imagineMarkShell-${uid}`;
  const gaze = GAZE_RANGE[size];
  const shouldTrack = trackPointer && gaze.reach > 0;
  const dimension = SIZE_PX[size];

  useEffect(() => {
    if (!shouldTrack) return;

    const mark = markRef.current;
    if (!mark) return;

    const resetGaze = (): void => {
      mark.style.setProperty("--imagine-mark-core-x", "0px");
      mark.style.setProperty("--imagine-mark-core-y", "0px");
    };

    const updateGaze = (event: PointerEvent): void => {
      const rect = mark.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance === 0) {
        resetGaze();
        return;
      }
      const strength = Math.min(distance / gaze.reach, 1);
      mark.style.setProperty(
        "--imagine-mark-core-x",
        `${(deltaX / distance) * gaze.x * strength}px`,
      );
      mark.style.setProperty(
        "--imagine-mark-core-y",
        `${(deltaY / distance) * gaze.y * strength}px`,
      );
    };

    window.addEventListener("pointermove", updateGaze, { passive: true });
    return () => {
      window.removeEventListener("pointermove", updateGaze);
      resetGaze();
    };
  }, [gaze.reach, gaze.x, gaze.y, shouldTrack]);

  return (
    <span
      ref={markRef}
      className={`imagine-mark imagine-mark-${size} ${className}`.trim()}
      style={{ width: dimension, height: dimension }}
      data-track-pointer={shouldTrack ? "true" : "false"}
      aria-hidden
    >
      <svg
        className="imagine-mark-svg"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={shellGradient} x1="5" y1="4" x2="27" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-bg-1, #4f46e5)" />
            <stop offset="0.55" stopColor="var(--imagine-mark-bg-2, #6366f1)" />
            <stop offset="1" stopColor="var(--imagine-mark-bg-3, #312e81)" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="9" fill={`url(#${shellGradient})`} />
        <rect
          x="2.5"
          y="2.5"
          width="27"
          height="27"
          rx="8.5"
          stroke="var(--imagine-mark-border, rgba(255,255,255,0.34))"
          strokeWidth="0.75"
        />
        <path
          d="M8.5 9.2h5.2"
          stroke="var(--imagine-mark-glint, rgba(255,255,255,0.48))"
          strokeWidth="1.05"
          strokeLinecap="round"
        />
        <circle
          cx="16"
          cy="17"
          r="6.25"
          stroke="var(--imagine-mark-ring, rgba(255,255,255,0.28))"
          strokeWidth="1.05"
          fill="var(--imagine-mark-ring-fill, rgba(255,255,255,0.06))"
        />
        <g
          className="imagine-mark-core"
          style={{
            transform:
              "translate(calc(var(--imagine-mark-core-x, 0px)), calc(var(--imagine-mark-core-y, 0px)))",
            transformOrigin: "16px 17px",
          }}
        >
          <circle
            cx="16"
            cy="17"
            r="2.35"
            fill="var(--imagine-mark-core, rgba(255,255,255,0.96))"
          />
          <circle cx="15.1" cy="16.1" r="0.65" fill="var(--imagine-mark-core-shine, rgba(255,255,255,0.55))" />
        </g>
      </svg>
    </span>
  );
}