"use client";

import { useId } from "react";

/** Shared Imagine Workbench mark — header, Agent, board nodes, favicon source. */
export type ImagineMarkSize = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<ImagineMarkSize, number> = {
  xs: 14,
  sm: 24,
  md: 32,
  lg: 56,
};

interface ImagineMarkProps {
  size?: ImagineMarkSize;
  className?: string;
}

export default function ImagineMark({ size = "md", className = "" }: ImagineMarkProps) {
  const uid = useId().replace(/:/g, "");
  const shellGradient = `imagineMarkShell-${uid}`;
  const dimension = SIZE_PX[size];

  return (
    <span
      className={`imagine-mark imagine-mark-${size} ${className}`.trim()}
      style={{ width: dimension, height: dimension }}
      aria-hidden
    >
      <svg
        className="imagine-mark-svg"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={shellGradient} x1="6" y1="5" x2="26" y2="27" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-bg-1, #1c212b)" />
            <stop offset="0.55" stopColor="var(--imagine-mark-bg-2, #12161d)" />
            <stop offset="1" stopColor="var(--imagine-mark-bg-3, #080a0f)" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="8" fill={`url(#${shellGradient})`} />
        <rect
          x="2.5"
          y="2.5"
          width="27"
          height="27"
          rx="7.5"
          stroke="var(--imagine-mark-border, rgba(226, 232, 240, 0.2))"
          strokeWidth="0.75"
        />
        <path
          d="M7.5 8.5h4.2"
          stroke="var(--imagine-mark-glint, rgba(255, 255, 255, 0.42))"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M12.25 9.25v13.5"
          stroke="var(--imagine-mark-stem, rgba(248, 250, 252, 0.92))"
          strokeWidth="2.15"
          strokeLinecap="round"
        />
        <path
          d="M20.5 11.25 L23.75 11.25 L23.75 14.5"
          stroke="var(--imagine-mark-corner, rgba(226, 232, 240, 0.72))"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20.5 20.75 L23.75 20.75 L23.75 17.5"
          stroke="var(--imagine-mark-corner, rgba(226, 232, 240, 0.72))"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="22.35"
          cy="16"
          r="1.55"
          fill="var(--imagine-mark-accent, #2dd4bf)"
        />
      </svg>
    </span>
  );
}