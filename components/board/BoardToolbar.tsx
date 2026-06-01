"use client";

import { ArrowLeft, Bot, FileText, ImagePlus, MessageSquareText, Settings, Trash2, Video } from "lucide-react";
import type { BoardSaveStatus } from "@/hooks/useBoardState";

interface BoardToolbarProps {
  nodeCount: number;
  saveStatus: BoardSaveStatus;
  onAddAgent: () => void;
  onAddImageGenerate: () => void;
  onAddNote: () => void;
  onAddPrompt: () => void;
  onAddVideoGenerate: () => void;
  onBack: () => void;
  onClear: () => void;
  onOpenSettings: () => void;
}

function formatSaveStatus(status: BoardSaveStatus): string {
  if (status === "loading") return "Loading";
  if (status === "saving") return "Saving";
  if (status === "saved") return "Saved";
  if (status === "error") return "Error";
  return "Ready";
}

const toolButtonClass = "flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800";

export default function BoardToolbar({
  nodeCount,
  saveStatus,
  onAddAgent,
  onAddImageGenerate,
  onAddNote,
  onAddPrompt,
  onAddVideoGenerate,
  onBack,
  onClear,
  onOpenSettings,
}: BoardToolbarProps) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
          title="返回工作台"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <h1 className="truncate text-sm font-semibold text-slate-100">Board</h1>
        <span className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400">{nodeCount} nodes</span>
        <span className="hidden text-[11px] text-slate-500 sm:inline">{formatSaveStatus(saveStatus)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onAddPrompt} className={toolButtonClass}>
          <MessageSquareText className="h-3.5 w-3.5" />
          Prompt
        </button>
        <button type="button" onClick={onAddImageGenerate} className={toolButtonClass}>
          <ImagePlus className="h-3.5 w-3.5" />
          Image
        </button>
        <button type="button" onClick={onAddVideoGenerate} className={toolButtonClass}>
          <Video className="h-3.5 w-3.5" />
          Video
        </button>
        <button type="button" onClick={onAddAgent} className={toolButtonClass}>
          <Bot className="h-3.5 w-3.5" />
          Agent
        </button>
        <button type="button" onClick={onAddNote} className={toolButtonClass}>
          <FileText className="h-3.5 w-3.5" />
          Note
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-slate-200"
          title="设置"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClear}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-400 transition hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
          title="清空画板"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
