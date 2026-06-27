"use client";

import { Database } from "lucide-react";

export type WorkspaceStorageModeBadgeTarget = "indexeddb" | "postgres";

interface WorkspaceStorageModeBadgeProps {
  label: string;
  target: WorkspaceStorageModeBadgeTarget;
  title: string;
}

export default function WorkspaceStorageModeBadge({ label, target, title }: WorkspaceStorageModeBadgeProps) {
  return (
    <span
      className={[
        "hidden h-9 min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition sm:inline-flex",
        target === "postgres"
          ? "border-[var(--iw-accent)]/45 bg-[var(--iw-accent)]/10 text-[var(--iw-text)]"
          : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]",
      ].join(" ")}
      title={title}
      aria-label={title}
      data-storage-target={target}
    >
      <Database className="h-3.5 w-3.5" />
      <span className="max-w-28 truncate">{label}</span>
    </span>
  );
}
