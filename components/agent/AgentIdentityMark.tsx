"use client";

import ImagineMark, { type ImagineMarkSize } from "@/components/brand/ImagineMark";

interface AgentIdentityMarkProps {
  variant: "orb" | "header" | "inline";
  trackPointer?: boolean;
}

const SIZE_BY_VARIANT: Record<AgentIdentityMarkProps["variant"], ImagineMarkSize> = {
  orb: "lg",
  header: "md",
  inline: "xs",
};

export default function AgentIdentityMark({ variant, trackPointer }: AgentIdentityMarkProps) {
  const size = SIZE_BY_VARIANT[variant];
  const shouldTrack = trackPointer ?? variant !== "inline";

  return <ImagineMark size={size} trackPointer={shouldTrack} />;
}