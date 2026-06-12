"use client";

import type { LucideIcon } from "lucide-react";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import type { BoardInsertTone } from "@/lib/board/insert-catalog";

interface BoardInsertIconProps {
  icon: LucideIcon;
  kind: string;
  tone: BoardInsertTone;
}

export default function BoardInsertIcon({ kind, icon: Icon, tone }: BoardInsertIconProps) {
  if (kind === "agent") {
    return <AgentIdentityMark variant="inline" />;
  }
  return <Icon className="imagine-tone-icon h-3.5 w-3.5" data-tone={tone} />;
}
