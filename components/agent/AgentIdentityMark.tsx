"use client";

import ImagineMark, { type ImagineMarkSize } from "@/components/brand/ImagineMark";

interface AgentIdentityMarkProps {
  variant: "orb" | "header" | "inline";
}

const SIZE_BY_VARIANT: Record<AgentIdentityMarkProps["variant"], ImagineMarkSize> = {
  orb: "xl",
  header: "md",
  inline: "xs",
};

export default function AgentIdentityMark({ variant }: AgentIdentityMarkProps) {
  return <ImagineMark size={SIZE_BY_VARIANT[variant]} trackPointer />;
}
