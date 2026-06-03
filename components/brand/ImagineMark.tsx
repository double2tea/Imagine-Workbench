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
  const ringGradientId = `imagine-mark-ring-${uid}`;
  const glowGradientId = `imagine-mark-glow-${uid}`;
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
          <linearGradient id={ringGradientId} x1="8" y1="7" x2="24" y2="25" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-ring-1)" />
            <stop offset="1" stopColor="var(--imagine-mark-ring-2)" />
          </linearGradient>
          <radialGradient id={glowGradientId} cx="0.35" cy="0.32" r="0.72">
            <stop stopColor="var(--imagine-mark-glow-core)" />
            <stop offset="0.55" stopColor="var(--imagine-mark-glow-mid)" />
            <stop offset="1" stopColor="var(--imagine-mark-glow-edge)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="2" y="2" width="28" height="28" rx="10" fill={`url(#${shellGradientId})`} />
        <rect
          x="2.5"
          y="2.5"
          width="27"
          height="27"
          rx="9.5"
          stroke="var(--imagine-mark-border)"
          strokeWidth="0.7"
        />
        <circle cx="16" cy="16" r="10.5" stroke="var(--imagine-mark-ring-faint)" strokeWidth="0.65" opacity="0.55" />
        <path
          d="M16 5.8c4.9 0 8.9 3.6 9.8 8.2 1 5.2-2.4 10.2-7.4 11.6"
          stroke={`url(#${ringGradientId})`}
          strokeWidth="2.15"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M16 26.2c-4.4 0-8-3.1-8.9-7.2-.8-3.7 1.2-7.4 4.6-9"
          stroke="var(--imagine-mark-ring-2)"
          strokeWidth="1.35"
          strokeLinecap="round"
          fill="none"
          opacity="0.72"
        />
        <g transform="translate(16 16)">
          <g className="imagine-mark-glow">
            <circle r="5.2" fill={`url(#${glowGradientId})`} opacity="0.92" />
            <circle r="1.35" fill="var(--imagine-mark-glow-hot)" />
          </g>
        </g>
      </svg>
    </span>
  );
}