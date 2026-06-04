"use client";

import { useId, useLayoutEffect, useRef, type CSSProperties } from "react";

export type ImagineMarkSize = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<ImagineMarkSize, number> = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 40,
};

const GLOW_RANGE: Record<ImagineMarkSize, { x: number; y: number; reach: number }> = {
  xs: { x: 0, y: 0, reach: 0 },
  sm: { x: 1.8, y: 1.8, reach: 40 },
  md: { x: 2.6, y: 2.6, reach: 56 },
  lg: { x: 3.4, y: 3.4, reach: 80 },
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
  const uid = useId().replace(/:/g, "");
  const shellGradientId = `imagine-mark-shell-${uid}`;
  const faceGradientId = `imagine-mark-face-${uid}`;
  const accentGradientId = `imagine-mark-accent-${uid}`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const px = SIZE_PX[size];
  const glow = GLOW_RANGE[size];
  const shouldTrack = trackPointer && glow.reach > 0;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !shouldTrack) return;

    const resetGlow = () => {
      root.style.setProperty("--imagine-mark-glow-x", "0px");
      root.style.setProperty("--imagine-mark-glow-y", "0px");
    };

    const updateGlow = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(distance, glow.reach);
      const nx = (dx / distance) * reach;
      const ny = (dy / distance) * reach;
      root.style.setProperty("--imagine-mark-glow-x", `${(nx / glow.reach) * glow.x}px`);
      root.style.setProperty("--imagine-mark-glow-y", `${(ny / glow.reach) * glow.y}px`);
    };

    const onPointerMove = (event: PointerEvent) => updateGlow(event.clientX, event.clientY);

    resetGlow();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      resetGlow();
    };
  }, [glow.reach, glow.x, glow.y, shouldTrack]);

  const rootClass = [
    "imagine-mark",
    size === "xs" ? "imagine-mark-xs" : "",
    shouldTrack ? "imagine-mark-tracks-pointer" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      ref={rootRef}
      className={rootClass}
      data-track-pointer={shouldTrack ? "true" : undefined}
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
          <linearGradient id={shellGradientId} x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-bg-1)" />
            <stop offset="0.55" stopColor="var(--imagine-mark-bg-2)" />
            <stop offset="1" stopColor="var(--imagine-mark-bg-3)" />
          </linearGradient>
          <linearGradient id={faceGradientId} x1="8" y1="7" x2="24" y2="25" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-face-1)" />
            <stop offset="1" stopColor="var(--imagine-mark-face-2)" />
          </linearGradient>
          <linearGradient id={accentGradientId} x1="10" y1="22" x2="23" y2="9" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-accent-1)" />
            <stop offset="1" stopColor="var(--imagine-mark-accent-2)" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="8" fill={`url(#${shellGradientId})`} />
        <rect
          x="2.5"
          y="2.5"
          width="27"
          height="27"
          rx="7.5"
          stroke="var(--imagine-mark-border)"
          strokeWidth="0.7"
        />
        <path
          d="M8.2 9.5h15.2v4.15H12.55v2.2h8.35v3.85h-8.35v2.8H8.2V9.5Z"
          fill={`url(#${faceGradientId})`}
        />
        <path
          d="M21.4 9.5h4.4l-6.15 13h-4.3l-2.7-5.8h4.35l1.55 3.08 2.85-6.1V9.5Z"
          fill={`url(#${accentGradientId})`}
        />
        <path
          d="M8.2 9.5h15.2M12.55 15.85h8.35M8.2 22.5h4.35"
          stroke="var(--imagine-mark-line)"
          strokeWidth="0.55"
          strokeLinecap="round"
          fill="none"
          opacity="0.55"
        />
        <g className="imagine-mark-glow" transform="translate(23.7 8.3)">
          <circle r="1.55" fill="var(--imagine-mark-node)" />
          <circle r="0.58" fill="var(--imagine-mark-node-core)" />
        </g>
      </svg>
    </span>
  );
}
