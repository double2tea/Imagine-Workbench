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
  const bodyGradientId = `imagine-mark-body-${uid}`;
  const shadeGradientId = `imagine-mark-shade-${uid}`;
  const blushGradientId = `imagine-mark-blush-${uid}`;
  const rootRef = useRef<HTMLSpanElement>(null);
  const px = SIZE_PX[size];
  const pointerReach = POINTER_REACH[size];
  const shouldTrack = trackPointer && pointerReach > 0;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !shouldTrack) return;

    const resetMotion = () => {
      root.style.setProperty("--imagine-mark-body-x", "0px");
      root.style.setProperty("--imagine-mark-body-y", "0px");
      root.style.setProperty("--imagine-mark-eye-x", "0px");
      root.style.setProperty("--imagine-mark-eye-y", "0px");
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
      root.style.setProperty("--imagine-mark-body-x", `${(nx / pointerReach) * 0.46}px`);
      root.style.setProperty("--imagine-mark-body-y", `${(ny / pointerReach) * 0.36}px`);
      root.style.setProperty("--imagine-mark-eye-x", `${(nx / pointerReach) * 1.15}px`);
      root.style.setProperty("--imagine-mark-eye-y", `${(ny / pointerReach) * 0.95}px`);
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
        viewBox="-4 -4 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id={bodyGradientId} cx="0" cy="0" r="1" gradientTransform="matrix(7.5 8.85 -9.52 8.1 14.15 8.5)" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-body-light)" />
            <stop offset="0.5" stopColor="var(--imagine-mark-body-mid)" />
            <stop offset="1" stopColor="var(--imagine-mark-body-deep)" />
          </radialGradient>
          <linearGradient id={shadeGradientId} x1="9.2" y1="5.75" x2="19.4" y2="21.05" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-shine)" />
            <stop offset="0.45" stopColor="var(--imagine-mark-shine-soft)" />
            <stop offset="1" stopColor="var(--imagine-mark-shadow-soft)" />
          </linearGradient>
          <radialGradient id={blushGradientId} cx="0" cy="0" r="1" gradientTransform="matrix(3.28 0 0 1.94 14.32 17.43)" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--imagine-mark-blush)" />
            <stop offset="1" stopColor="transparent" />
          </radialGradient>
        </defs>
        <g className="imagine-mark-body">
          <path
            d="M13.52 4.55c1.18-1.43 3.71-.84 4.25.93 1.94-.17 3.54 1.22 3.66 3.16 1.64.59 2.69 2.15 2.48 3.96-.25 2.15-2.06 3.75-4.17 3.92-.63 1.98-2.57 3.37-4.8 3.37-1.64 0-3.16-.76-4.13-1.9-1.94.76-4.21-.04-5.1-1.86-1.94-.21-3.37-1.81-3.37-3.75 0-1.77 1.22-3.29 2.91-3.71-.17-.42-.25-.88-.25-1.35 0-2.27 1.9-4.13 4.17-4.13.93 0 1.81.29 2.48.8.34-.34.72-.59 1.27-.72Z"
            fill={`url(#${bodyGradientId})`}
          />
          <path
            d="M13.52 4.55c1.18-1.43 3.71-.84 4.25.93 1.94-.17 3.54 1.22 3.66 3.16 1.64.59 2.69 2.15 2.48 3.96-.25 2.15-2.06 3.75-4.17 3.92-.63 1.98-2.57 3.37-4.8 3.37-1.64 0-3.16-.76-4.13-1.9-1.94.76-4.21-.04-5.1-1.86-1.94-.21-3.37-1.81-3.37-3.75 0-1.77 1.22-3.29 2.91-3.71-.17-.42-.25-.88-.25-1.35 0-2.27 1.9-4.13 4.17-4.13.93 0 1.81.29 2.48.8.34-.34.72-.59 1.27-.72Z"
            fill={`url(#${shadeGradientId})`}
            opacity="0.95"
          />
        </g>
        <path
          d="M6.74 9.26c1.18-1.6 3.16-2.27 5.01-1.69 1.26-1.64 3.92-1.81 5.43-.34"
          stroke="var(--imagine-mark-highlight)"
          strokeWidth="0.26"
          strokeLinecap="round"
          opacity="0.58"
        />
        <g className="imagine-mark-eyes">
          <g transform="translate(9.01 14.53)">
            <ellipse rx="1.43" ry="1.98" fill="var(--imagine-mark-eye)" />
            <circle cx="-0.46" cy="-0.72" r="0.46" fill="var(--imagine-mark-eye-glint)" />
            <circle cx="0.5" cy="0.8" r="0.21" fill="var(--imagine-mark-eye-glint)" opacity="0.4" />
          </g>
          <g transform="translate(15.58 14.53)">
            <ellipse rx="1.43" ry="1.98" fill="var(--imagine-mark-eye)" />
            <circle cx="-0.46" cy="-0.72" r="0.46" fill="var(--imagine-mark-eye-glint)" />
            <circle cx="0.5" cy="0.8" r="0.21" fill="var(--imagine-mark-eye-glint)" opacity="0.4" />
          </g>
        </g>
        <ellipse cx="7.75" cy="17.68" rx="2.61" ry="1.52" fill={`url(#${blushGradientId})`} opacity="0.86" />
        <ellipse cx="17.26" cy="17.68" rx="2.61" ry="1.52" fill={`url(#${blushGradientId})`} opacity="0.78" />
        <circle cx="17.01" cy="9.6" r="0.59" fill="var(--imagine-mark-spark)" opacity="0.92" />
      </svg>
    </span>
  );
}
