"use client";

import { useId, type CSSProperties } from "react";

export type ImagineMarkSize = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<ImagineMarkSize, number> = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 40,
};

interface ImagineMarkProps {
  size?: ImagineMarkSize;
  className?: string;
}

export default function ImagineMark({ size = "md", className = "" }: ImagineMarkProps) {
  const uid = useId().replace(/:/g, "");
  const shellGradientId = `imagine-mark-shell-${uid}`;
  const arcGradientId = `imagine-mark-arc-${uid}`;
  const px = SIZE_PX[size];
  const rootClass = ["imagine-mark", size === "xs" ? "imagine-mark-xs" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={rootClass}
      style={{ width: px, height: px } as CSSProperties}
      aria-hidden
    >
      <svg
        className="imagine-mark-svg"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={shellGradientId} x1="7" y1="5" x2="25" y2="27" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-bg-1)" />
            <stop offset="1" stopColor="var(--imagine-mark-bg-2)" />
          </linearGradient>
          <linearGradient id={arcGradientId} x1="10" y1="8" x2="22" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-arc-1)" />
            <stop offset="1" stopColor="var(--imagine-mark-arc-2)" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="9" fill={`url(#${shellGradientId})`} />
        <rect
          x="2.5"
          y="2.5"
          width="27"
          height="27"
          rx="8.5"
          stroke="var(--imagine-mark-border)"
          strokeWidth="0.75"
        />
        <g stroke={`url(#${arcGradientId})`} strokeWidth="2.35" strokeLinecap="round" fill="none">
          <path d="M16 7.2 A9.2 9.2 0 0 1 24.1 19.4" />
          <path d="M16 7.2 A9.2 9.2 0 0 1 24.1 19.4" transform="rotate(120 16 16)" />
          <path d="M16 7.2 A9.2 9.2 0 0 1 24.1 19.4" transform="rotate(240 16 16)" />
        </g>
        <circle cx="16" cy="16" r="2.15" fill="var(--imagine-mark-core)" />
      </svg>
    </span>
  );
}