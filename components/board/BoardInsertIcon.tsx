"use client";

import type { LucideIcon } from "lucide-react";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";

interface BoardInsertIconProps {
  icon: LucideIcon;
  iconClassName: string;
  kind: string;
}

export default function BoardInsertIcon({ kind, icon: Icon, iconClassName }: BoardInsertIconProps) {
  if (kind === "agent") {
    return <AgentIdentityMark variant="inline" />;
  }
  return <Icon className={`h-3.5 w-3.5 ${iconClassName}`} />;
}