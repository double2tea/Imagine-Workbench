"use client";

import { useId } from "react";

interface AgentIdentityMarkProps {
  variant: "orb" | "header" | "inline";
}

export default function AgentIdentityMark({ variant }: AgentIdentityMarkProps) {
  const uid = useId().replace(/:/g, "");
  const bg = `agentMarkBg-${uid}`;
  const shine = `agentMarkShine-${uid}`;
  const glow = `agentMarkGlow-${uid}`;

  return (
    <span className={`imagine-agent-mark imagine-agent-mark-${variant}`} aria-hidden>
      <svg
        className="imagine-agent-mark-svg"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={bg} x1="7" y1="5" x2="25" y2="27" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--agent-mark-bg-1, #4338ca)" />
            <stop offset="0.45" stopColor="var(--agent-mark-bg-2, #7c3aed)" />
            <stop offset="1" stopColor="var(--agent-mark-bg-3, #312e81)" />
          </linearGradient>
          <radialGradient
            id={shine}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(11 9) rotate(-24) scale(9 6)"
          >
            <stop stopColor="var(--agent-mark-shine, rgba(255,255,255,0.62))" />
            <stop offset="1" stopColor="var(--agent-mark-shine, rgba(255,255,255,0))" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={glow}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(21 23) scale(11)"
          >
            <stop stopColor="var(--agent-mark-glow, rgba(245,158,11,0.42))" />
            <stop offset="1" stopColor="var(--agent-mark-glow, rgba(245,158,11,0))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="14" fill={`url(#${bg})`} />
        <circle cx="16" cy="16" r="14" fill={`url(#${glow})`} />
        <circle cx="16" cy="16" r="14" fill={`url(#${shine})`} />
        <circle
          cx="16"
          cy="16"
          r="12.75"
          stroke="var(--agent-mark-ring, rgba(255,255,255,0.28))"
          strokeWidth="0.75"
        />
        <path
          d="M21.2 10.4a9.2 9.2 0 0 0-10.8 8.1"
          stroke="var(--agent-mark-arc, rgba(255,255,255,0.42))"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <g stroke="var(--agent-mark-spark, rgba(255,255,255,0.72))" strokeLinecap="round">
          <path d="M16 6.2v2.6" strokeWidth="1.35" />
          <path d="M22.8 9.1l-1.8 1.8" strokeWidth="1.1" />
          <path d="M9.2 9.1l1.8 1.8" strokeWidth="1.1" />
        </g>
        <circle
          cx="16"
          cy="16"
          r="6.25"
          stroke="var(--agent-mark-core-ring, rgba(255,255,255,0.22))"
          strokeWidth="0.7"
          fill="var(--agent-mark-core-fill, rgba(255,255,255,0.1))"
        />
        <circle cx="16" cy="16" r="2.15" fill="var(--agent-mark-core-dot, rgba(255,255,255,0.38))" />
      </svg>
      <span className="imagine-agent-mark-pupil" />
    </span>
  );
}