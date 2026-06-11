"use client";

import Link from "next/link";
import { Grid2X2, Moon, Plug, Settings, Sun, Trash2 } from "lucide-react";
import ImagineMark from "@/components/brand/ImagineMark";
import { useThemeMode, type ThemeMode } from "@/lib/theme-mode";

export type { ThemeMode };

interface WorkspaceHeaderProps {
  onClearProject: () => void;
  onOpenSettings: () => void;
  onRunResolveCheck: () => void;
  resolveCheckStatus: "idle" | "running";
}

export default function WorkspaceHeader({
  onClearProject,
  onOpenSettings,
  onRunResolveCheck,
  resolveCheckStatus,
}: WorkspaceHeaderProps) {
  const { themeMode, toggleThemeMode } = useThemeMode();

  return (
    <header className="imagine-app-header sticky top-0 z-40 flex min-w-0 items-center justify-between gap-2 overflow-hidden border-b border-[var(--iw-border)] bg-[var(--iw-header)] px-4 py-3 backdrop-blur-xl sm:gap-3 sm:px-6 select-none">
      <div className="z-10 flex min-w-0 flex-1 items-center gap-3">
        <div className="imagine-brand-mark relative flex h-9 w-9 shrink-0 items-center justify-center">
          <ImagineMark size="md" trackPointer />
        </div>
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-[var(--iw-text)]">
            <span className="truncate">Imagine Workbench</span>
            <span className="imagine-workspace-badge shrink-0">v1.2</span>
          </h1>
          <p className="imagine-workspace-subtitle truncate">智能图像、视频与音频创作工作台</p>
        </div>
      </div>

      <div className="z-10 flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Link
          href="/board"
          className="imagine-header-button flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-xs font-semibold text-[var(--iw-text)] transition"
        >
          <Grid2X2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">画板</span>
        </Link>

        <button
          type="button"
          onClick={onRunResolveCheck}
          disabled={resolveCheckStatus === "running"}
          className="imagine-header-button flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-xs font-semibold text-[var(--iw-text)] transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          title="通过 Resolve 插件执行连接检查"
        >
          <Plug className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{resolveCheckStatus === "running" ? "等待达芬奇" : "达芬奇"}</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="imagine-header-button flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] px-3 text-xs font-semibold text-[var(--iw-text)] transition cursor-pointer"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">设置</span>
        </button>

        <button
          type="button"
          onClick={toggleThemeMode}
          aria-pressed={themeMode === "dark"}
          className="imagine-header-button imagine-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-muted)] transition cursor-pointer"
          title={themeMode === "light" ? "切换深色模式" : "切换浅色模式"}
        >
          {themeMode === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={onClearProject}
          className="imagine-header-button imagine-icon-button flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-muted)] transition cursor-pointer" data-action="danger"
          title="清空本地资产"
          aria-label="清空本地资产"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
