"use client";

import { useEffect, useId, useRef } from "react";

interface AgentIdentityMarkProps {
  variant: "orb" | "header" | "inline";
  trackPointer?: boolean;
}

const GAZE_RANGE: Record<AgentIdentityMarkProps["variant"], { x: number; y: number; reach: number }> = {
  orb: { x: 7, y: 6, reach: 220 },
  header: { x: 4.5, y: 3.5, reach: 160 },
  inline: { x: 0, y: 0, reach: 0 },
};

export default function AgentIdentityMark({ variant, trackPointer }: AgentIdentityMarkProps) {
  const markRef = useRef<HTMLSpanElement>(null);
  const uid = useId().replace(/:/g, "");
  const shell = `agentMarkShell-${uid}`;
  const shine = `agentMarkShine-${uid}`;
  const depth = `agentMarkDepth-${uid}`;
  const shouldTrack = trackPointer ?? variant !== "inline";
  const gaze = GAZE_RANGE[variant];

  useEffect(() => {
    if (!shouldTrack || gaze.reach === 0) return;

    const mark = markRef.current;
    if (!mark) return;

    const resetGaze = () => {
      mark.style.setProperty("--agent-mark-pupil-x", "0px");
      mark.style.setProperty("--agent-mark-pupil-y", "0px");
    };

    const updateGaze = (event: PointerEvent) => {
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
        "--agent-mark-pupil-x",
        `${(deltaX / distance) * gaze.x * strength}px`,
      );
      mark.style.setProperty(
        "--agent-mark-pupil-y",
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
      className={`imagine-agent-mark imagine-agent-mark-${variant}`}
      data-track-pointer={shouldTrack ? "true" : "false"}
      aria-hidden
    >
      <svg
        className="imagine-agent-mark-svg"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={shell} x1="6" y1="4" x2="26" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--agent-mark-bg-1, #4f46e5)" />
            <stop offset="0.55" stopColor="var(--agent-mark-bg-2, #6366f1)" />
            <stop offset="1" stopColor="var(--agent-mark-bg-3, #312e81)" />
          </linearGradient>
          <radialGradient
            id={shine}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(10.5 8.5) rotate(-18) scale(11 7)"
          >
            <stop stopColor="var(--agent-mark-shine, rgba(255,255,255,0.55))" />
            <stop offset="1" stopColor="var(--agent-mark-shine, rgba(255,255,255,0))" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={depth}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(22 24) scale(10)"
          >
            <stop stopColor="var(--agent-mark-depth, rgba(15,23,42,0.28))" />
            <stop offset="1" stopColor="var(--agent-mark-depth, rgba(15,23,42,0))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="3" y="3" width="26" height="26" rx="9" fill={`url(#${shell})`} />
        <rect x="3" y="3" width="26" height="26" rx="9" fill={`url(#${depth})`} />
        <rect x="3" y="3" width="26" height="26" rx="9" fill={`url(#${shine})`} />
        <rect
          x="3.5"
          y="3.5"
          width="25"
          height="25"
          rx="8.5"
          stroke="var(--agent-mark-border, rgba(255,255,255,0.34))"
          strokeWidth="0.85"
        />
        <circle
          cx="16"
          cy="16"
          r="7.25"
          stroke="var(--agent-mark-iris, rgba(255,255,255,0.26))"
          strokeWidth="0.85"
          fill="var(--agent-mark-iris-fill, rgba(255,255,255,0.08))"
        />
        <path
          d="M10.2 11.4c2.8-1.6 6.1-1.4 8.4.2"
          stroke="var(--agent-mark-glint, rgba(255,255,255,0.42))"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
      <span className="imagine-agent-mark-pupil" />
      <span className="imagine-agent-mark-pupil-shine" />
    </span>
  );
}