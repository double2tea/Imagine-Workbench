"use client";

import { ArrowLeft, Bot, FileText, ImagePlus, MessageSquareText, Moon, Settings, Sun, Trash2, Video } from "lucide-react";
import type { BoardSaveStatus } from "@/hooks/useBoardState";
import type { ThemeMode } from "@/components/workbench/WorkspaceHeader";

interface BoardToolbarProps {
  nodeCount: number;
  saveStatus: BoardSaveStatus;
  themeMode: ThemeMode;
  onAddAgent: () => void;
  onAddImageGenerate: () => void;
  onAddNote: () => void;
  onAddPrompt: () => void;
  onAddVideoGenerate: () => void;
  onBack: () => void;
  onClear: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
}

function formatSaveStatus(status: BoardSaveStatus): string {
  if (status === "loading") return "加载中";
  if (status === "saving") return "保存中";
  if (status === "saved") return "已保存";
  if (status === "error") return "错误";
  return "就绪";
}

const toolButtonClass = "imagine-header-button flex !h-8 !min-h-8 items-center gap-1.5 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-xs font-semibold text-[var(--iw-text)] transition sm:px-3";
const iconButtonClass = "imagine-icon-button flex !h-8 !w-8 !min-w-8 items-center justify-center !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] transition";

export default function BoardToolbar({
  nodeCount,
  saveStatus,
  themeMode,
  onAddAgent,
  onAddImageGenerate,
  onAddNote,
  onAddPrompt,
  onAddVideoGenerate,
  onBack,
  onClear,
  onOpenSettings,
  onToggleTheme,
}: BoardToolbarProps) {
  return (
    <div className="imagine-toolbar-surface no-scrollbar flex h-12 w-full min-w-0 shrink-0 items-center justify-start gap-2 overflow-x-auto overscroll-x-contain !rounded-none border-b border-[var(--iw-border)] bg-[var(--iw-header)] !px-3 !py-0 text-[var(--iw-text)] sm:gap-3 sm:!px-4 lg:justify-between">
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onBack}
          className={`${iconButtonClass} shrink-0`}
          data-accent="amber"
          title="返回工作台"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <h1 className="truncate text-sm font-semibold text-[var(--iw-text)]">画板</h1>
        <span className="imagine-meta-chip rounded border border-[var(--iw-border)] px-2 py-1 text-[10px] font-mono text-[var(--iw-muted)]">{nodeCount} 节点</span>
        <span className="hidden text-[10px] font-mono text-[var(--iw-faint)] sm:inline">{formatSaveStatus(saveStatus)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onAddPrompt} className={toolButtonClass} data-accent="amber">
          <MessageSquareText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">提示</span>
        </button>
        <button type="button" onClick={onAddImageGenerate} className={toolButtonClass} data-accent="amber">
          <ImagePlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">图片</span>
        </button>
        <button type="button" onClick={onAddVideoGenerate} className={toolButtonClass} data-accent="amber">
          <Video className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">视频</span>
        </button>
        <button type="button" onClick={onAddAgent} className={toolButtonClass} data-accent="amber">
          <Bot className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">智能体</span>
        </button>
        <button type="button" onClick={onAddNote} className={toolButtonClass} data-accent="amber">
          <FileText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">笔记</span>
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className={`${iconButtonClass}`}
          data-accent="amber"
          title="设置"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleTheme}
          aria-pressed={themeMode === "dark"}
          className={`${iconButtonClass}`}
          title={themeMode === "light" ? "切换深色模式" : "切换浅色模式"}
        >
          {themeMode === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onClear}
          className={`${iconButtonClass}`}
          data-action="danger"
          title="清空画板"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
