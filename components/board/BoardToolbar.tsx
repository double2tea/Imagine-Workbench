"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Check, ChevronDown, FileText, Grid3X3, ImagePlus, Layers, Map, MessageSquareText, Moon, Pencil, Plus, RotateCcw, RotateCw, Settings, Sun, Trash2, Video } from "lucide-react";
import type { BoardSaveStatus } from "@/hooks/useBoardState";
import type { ThemeMode } from "@/components/workbench/WorkspaceHeader";
import type { BoardSummary } from "@/lib/board";

interface BoardToolbarProps {
  boardId: string;
  boardSummaries: BoardSummary[];
  boardTitle: string;
  canRedo: boolean;
  canUndo: boolean;
  nodeCount: number;
  saveError: string | null;
  saveStatus: BoardSaveStatus;
  trashedCount: number;
  showGrid: boolean;
  showMiniMap: boolean;
  themeMode: ThemeMode;
  onAddAgent: () => void;
  onAddImageGenerate: () => void;
  onAddNote: () => void;
  onAddPrompt: () => void;
  onAddReferenceGroup: () => void;
  onAddVideoGenerate: () => void;
  onBack: () => void;
  onClear: () => void;
  onCreateBoard: () => void;
  onDeleteBoard: () => void;
  onOpenSettings: () => void;
  onRenameBoard: () => void;
  onSelectBoard: (boardId: string) => void;
  onRedo: () => void;
  onRestoreTrash?: () => void;
  onUndo: () => void;
  onToggleGrid: () => void;
  onToggleMiniMap: () => void;
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
  boardId,
  boardSummaries,
  boardTitle,
  canRedo,
  canUndo,
  nodeCount,
  saveError,
  saveStatus,
  trashedCount,
  showGrid,
  showMiniMap,
  themeMode,
  onAddAgent,
  onAddImageGenerate,
  onAddNote,
  onAddPrompt,
  onAddReferenceGroup,
  onAddVideoGenerate,
  onBack,
  onClear,
  onCreateBoard,
  onDeleteBoard,
  onOpenSettings,
  onRenameBoard,
  onSelectBoard,
  onRedo,
  onRestoreTrash,
  onUndo,
  onToggleGrid,
  onToggleMiniMap,
  onToggleTheme,
}: BoardToolbarProps) {
  const [isBoardMenuOpen, setIsBoardMenuOpen] = useState(false);
  const [boardMenuPosition, setBoardMenuPosition] = useState({ left: 16, top: 56 });
  const boardMenuButtonRef = useRef<HTMLButtonElement>(null);
  const boardMenuRef = useRef<HTMLDivElement>(null);
  const visibleBoardSummaries = boardSummaries.some(board => board.id === boardId)
    ? boardSummaries
    : [{
      id: boardId,
      title: boardTitle,
      nodeCount,
      updatedAt: "",
      createdAt: "",
    }, ...boardSummaries];

  useEffect(() => {
    if (!isBoardMenuOpen) return;

    function closeOnPointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && boardMenuRef.current?.contains(event.target)) return;
      setIsBoardMenuOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") setIsBoardMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isBoardMenuOpen]);

  function toggleBoardMenu(): void {
    if (isBoardMenuOpen) {
      setIsBoardMenuOpen(false);
      return;
    }
    const rect = boardMenuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      const menuWidth = 352;
      setBoardMenuPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12)),
        top: rect.bottom + 8,
      });
    }
    setIsBoardMenuOpen(true);
  }

  return (
    <div className="imagine-toolbar-surface relative flex h-12 w-full min-w-0 shrink-0 items-center justify-start gap-2 overflow-visible !rounded-none border-b border-[var(--iw-border)] bg-[var(--iw-header)] !px-3 !py-0 text-[var(--iw-text)] sm:gap-3 sm:!px-4 lg:justify-between">
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
        <div ref={boardMenuRef} className="relative flex min-w-[14rem] items-center gap-1.5">
          <button
            ref={boardMenuButtonRef}
            type="button"
            onClick={toggleBoardMenu}
            className="imagine-header-button flex h-8 min-w-0 max-w-[16rem] items-center gap-2 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-xs font-semibold text-[var(--iw-text)] transition"
            title={boardTitle}
            aria-expanded={isBoardMenuOpen}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-[var(--iw-board-accent-amber)]" />
            <span className="truncate">{boardTitle}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--iw-muted)]" />
          </button>
          <button type="button" onClick={onCreateBoard} className={iconButtonClass} title="新建画板">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onRenameBoard} className={iconButtonClass} title="重命名画板">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDeleteBoard} className={iconButtonClass} data-action="danger" title="删除当前画板">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {isBoardMenuOpen && (
            <div
              className="fixed z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] p-2 shadow-2xl"
              style={{ left: boardMenuPosition.left, top: boardMenuPosition.top }}
            >
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--iw-faint)]">画板页</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsBoardMenuOpen(false);
                    onCreateBoard();
                  }}
                  className="imagine-header-button flex h-7 items-center gap-1.5 rounded-md border border-[var(--iw-border)] px-2 text-[11px] font-semibold"
                >
                  <Plus className="h-3 w-3" />
                  新建
                </button>
              </div>
              <div className="flex max-h-[18rem] flex-col gap-1 overflow-y-auto">
                {visibleBoardSummaries.map(board => (
                  <button
                    key={board.id}
                    type="button"
                    onClick={() => {
                      setIsBoardMenuOpen(false);
                      onSelectBoard(board.id);
                    }}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-transparent px-2 py-2 text-left transition hover:border-[var(--iw-border)] hover:bg-[var(--iw-panel-soft)]"
                    aria-current={board.id === boardId ? "page" : undefined}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-[var(--iw-text)]">{board.title}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-[var(--iw-muted)]">{board.nodeCount} 节点</span>
                    </span>
                    {board.id === boardId && <Check className="h-3.5 w-3.5 text-[var(--iw-board-accent-amber)]" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <span className="imagine-meta-chip rounded border border-[var(--iw-border)] px-2 py-1 text-[10px] font-mono text-[var(--iw-muted)]">{nodeCount} 节点</span>
        <span
          className={`hidden text-[10px] font-mono sm:inline ${saveStatus === "error" ? "text-red-300" : "text-[var(--iw-faint)]"}`}
          title={saveError ?? undefined}
        >
          {saveStatus === "error" && saveError ? saveError : formatSaveStatus(saveStatus)}
        </span>
      </div>
      <div className="no-scrollbar flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto overscroll-x-contain">
        <button type="button" onClick={onAddPrompt} className={toolButtonClass} data-accent="amber">
          <MessageSquareText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">提示</span>
        </button>
        <button type="button" onClick={onAddImageGenerate} className={toolButtonClass} data-accent="amber">
          <ImagePlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">图片</span>
        </button>
        <button type="button" onClick={onAddReferenceGroup} className={toolButtonClass} data-accent="amber">
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">参考组</span>
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
          onClick={onUndo}
          disabled={!canUndo}
          className={`${iconButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
          title="撤销 (Ctrl+Z)"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className={`${iconButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
          title="重做 (Ctrl+Shift+Z)"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
        {trashedCount > 0 && onRestoreTrash ? (
          <button
            type="button"
            onClick={onRestoreTrash}
            className={toolButtonClass}
            title="恢复最近删除的节点"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">恢复 ({trashedCount})</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleGrid}
          aria-pressed={showGrid}
          className={`${iconButtonClass}`}
          title={showGrid ? "隐藏网格" : "显示网格"}
        >
          <Grid3X3 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleMiniMap}
          aria-pressed={showMiniMap}
          className={`${iconButtonClass}`}
          title={showMiniMap ? "隐藏小地图" : "显示小地图"}
        >
          <Map className="h-3.5 w-3.5" />
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
