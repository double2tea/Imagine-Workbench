"use client";

import type { ReactNode } from "react";

interface WorkspaceTopBarProps {
  center?: ReactNode;
  end: ReactNode;
  start: ReactNode;
  sticky?: boolean;
}

export const workspaceTopBarButtonClass =
  "imagine-header-button imagine-topbar-button flex h-9 min-h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-xs font-semibold text-[var(--iw-text)] transition";

export const workspaceTopBarIconButtonClass =
  "imagine-header-button imagine-icon-button imagine-topbar-icon-button flex h-9 w-9 min-w-9 items-center justify-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] transition disabled:cursor-not-allowed disabled:opacity-40";

export default function WorkspaceTopBar({ center, end, start, sticky = false }: WorkspaceTopBarProps) {
  const className = [
    "imagine-app-topbar",
    sticky ? "imagine-app-topbar--sticky" : "",
    center ? "imagine-app-topbar--has-center" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={className}>
      <div className="imagine-app-topbar-zone imagine-app-topbar-zone--start">{start}</div>
      <div className="imagine-app-topbar-zone imagine-app-topbar-zone--center">{center}</div>
      <div className="imagine-app-topbar-zone imagine-app-topbar-zone--end">{end}</div>
    </header>
  );
}
