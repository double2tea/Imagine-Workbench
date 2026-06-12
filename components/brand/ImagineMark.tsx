"use client";

import { useId, useLayoutEffect, useRef, type CSSProperties } from "react";

export type ImagineMarkSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<ImagineMarkSize, number> = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 40,
  xl: 108,
};

const POINTER_REACH: Record<ImagineMarkSize, number> = {
  xs: 0,
  sm: 40,
  md: 56,
  lg: 80,
  xl: 160,
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
  const plumeBaseGradientId = `imagine-mark-plume-base-${uid}`;
  const plumeLightGradientId = `imagine-mark-plume-light-${uid}`;
  const plumeWarmGradientId = `imagine-mark-plume-warm-${uid}`;
  const plumeShadeGradientId = `imagine-mark-plume-shade-${uid}`;
  const sparkGradientId = `imagine-mark-spark-${uid}`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const px = SIZE_PX[size];
  const pointerReach = POINTER_REACH[size];
  const shouldTrack = trackPointer && pointerReach > 0;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !shouldTrack) return;

    const resetMotion = () => {
      root.style.setProperty("--imagine-mark-plume-x", "0px");
      root.style.setProperty("--imagine-mark-plume-y", "0px");
      root.style.setProperty("--imagine-mark-spark-x", "0px");
      root.style.setProperty("--imagine-mark-spark-y", "0px");
    };

    const updateMotion = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(distance, pointerReach);
      const nx = (dx / distance) * reach;
      const ny = (dy / distance) * reach;
      root.style.setProperty("--imagine-mark-plume-x", `${(nx / pointerReach) * 0.42}px`);
      root.style.setProperty("--imagine-mark-plume-y", `${(ny / pointerReach) * 0.34}px`);
      root.style.setProperty("--imagine-mark-spark-x", `${(nx / pointerReach) * 1}px`);
      root.style.setProperty("--imagine-mark-spark-y", `${(ny / pointerReach) * 0.82}px`);
    };

    const onPointerMove = (event: PointerEvent) => updateMotion(event.clientX, event.clientY);

    resetMotion();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      resetMotion();
    };
  }, [pointerReach, shouldTrack]);

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
          <linearGradient id={plumeBaseGradientId} x1="4.2" y1="23.4" x2="25.4" y2="11.4" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-plume-deep)" />
            <stop offset="0.48" stopColor="var(--imagine-mark-plume-mid)" />
            <stop offset="1" stopColor="var(--imagine-mark-plume-light)" />
          </linearGradient>
          <linearGradient id={plumeLightGradientId} x1="4.4" y1="18" x2="24.2" y2="9.8" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-plume-soft)" />
            <stop offset="0.58" stopColor="var(--imagine-mark-plume-ice)" />
            <stop offset="1" stopColor="var(--imagine-mark-plume-fade)" />
          </linearGradient>
          <linearGradient id={plumeWarmGradientId} x1="12.5" y1="17.8" x2="24.8" y2="4.8" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-warm-fade)" />
            <stop offset="0.64" stopColor="var(--imagine-mark-warm-soft)" />
            <stop offset="1" stopColor="var(--imagine-mark-warm)" />
          </linearGradient>
          <linearGradient id={plumeShadeGradientId} x1="5.2" y1="24.4" x2="18.8" y2="20.1" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-plume-shadow)" />
            <stop offset="1" stopColor="var(--imagine-mark-plume-shadow-clear)" />
          </linearGradient>
          <radialGradient id={sparkGradientId} cx="0" cy="0" r="1" gradientTransform="matrix(2.18 0 0 2.18 24.5 6.2)" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-spark-core)" />
            <stop offset="1" stopColor="var(--imagine-mark-spark)" />
          </radialGradient>
        </defs>
        <g transform="translate(-2.4 -1.8) scale(1.22)">
          <g className="imagine-mark-body">
            <path
              d="M3.82 22.58c2.26-5.89 8.64-7.8 17.92-11.76-3.36 3.58-6.18 6.6-8.44 9.08 3.84-1.08 7.17-2.8 10.04-5.17-3.95 7.16-10.45 11.22-18.2 10.3-1.03-.12-1.67-1.48-1.32-2.45Z"
              fill={`url(#${plumeBaseGradientId})`}
            />
            <path
              d="M4.48 20.42c3.76-5.55 10.64-6.43 18.64-12.23-1.14 5.02-4.5 9.08-10.08 12.17-3.1 1.72-6.27 2.08-8.56.06Z"
              fill={`url(#${plumeLightGradientId})`}
              opacity="0.86"
            />
            <path
              d="M10.14 20.63c3.88-3.72 9.8-7.72 14.46-16.68-.18 5.68-2.58 11.15-7.18 16.38-1.78 2.03-4.72 2.29-7.28.3Z"
              fill={`url(#${plumeWarmGradientId})`}
              opacity="0.66"
            />
            <path
              d="M4.16 23.02c3.93.78 8.5.2 13.68-1.76-3.84 3.02-8.22 4.34-12.64 3.8-.82-.1-1.27-1.18-1.04-2.04Z"
              fill={`url(#${plumeShadeGradientId})`}
              opacity="0.58"
            />
            <path
              d="M7.02 21.25c4.94.08 9.68-1.54 14.2-4.86"
              stroke="var(--imagine-mark-cut)"
              strokeWidth="0.58"
              strokeLinecap="round"
              opacity="0.52"
            />
          </g>
          <g className="imagine-mark-signal">
            <path d="M24.5 3.3 25.05 5.68 27.33 6.22 25.05 6.78 24.5 9.16 23.94 6.78 21.66 6.22 23.94 5.68 24.5 3.3Z" fill={`url(#${sparkGradientId})`} />
            <circle cx="18.24" cy="11.62" r="0.72" fill="var(--imagine-mark-dot-blue)" opacity="0.72" />
            <circle cx="21.26" cy="9.42" r="0.54" fill="var(--imagine-mark-dot-warm)" opacity="0.68" />
          </g>
        </g>
      </svg>
    </span>
  );
}
