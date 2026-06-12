"use client";

import { useEffect, useRef, useState, type ReactNode, type ReactPortal, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Grid2X2,
  Layers,
  Magnet,
  MoreHorizontal,
  CircleHelp,
  Moon,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { useAlert } from "@/components/confirm/ConfirmProvider";
import { BOARD_CONNECTION_HELP } from "@/lib/workspace-messages";
import type { BoardSaveStatus } from "@/hooks/useBoardState";
import { useThemeMode } from "@/lib/theme-mode";
import type { BoardSummary } from "@/lib/board";
import WorkspaceTopBarBrand from "@/components/workbench/WorkspaceTopBarBrand";
import WorkspaceTopBar, {
  workspaceTopBarButtonClass,
  workspaceTopBarIconButtonClass,
} from "@/components/workbench/WorkspaceTopBar";

interface BoardToolbarProps {
  boardId: string;
  boardSummaries: BoardSummary[];
  boardTitle: string;
  canRedo: boolean;
  canUndo: boolean;
  nodeCount: number;
  saveError: string | null;
  saveStatus: BoardSaveStatus;
  showGrid: boolean;
  showMiniMap: boolean;
  snapToGrid: boolean;
  trashedCount: number;
  onBack: () => void;
  onClear: () => void;
  onCreateBoard: () => void;
  onDeleteBoard: () => void;
  onImportMedia: () => void;
  onOpenSettings: () => void;
  onRenameBoard: () => void;
  onRedo: () => void;
  onRestoreTrash?: () => void;
  onSelectBoard: (boardId: string) => void;
  onUndo: () => void;
  onToggleGrid: () => void;
  onToggleMiniMap: () => void;
  onToggleSnapToGrid: () => void;
}

function saveStatusMeta(status: BoardSaveStatus, error: string | null): {
  label: string;
  tone: "idle" | "busy" | "ok" | "error";
  title?: string;
} {
  if (status === "loading") return { label: "加载中", tone: "busy" };
  if (status === "saving") return { label: "保存中", tone: "busy" };
  if (status === "saved") return { label: "已保存", tone: "ok" };
  if (status === "error") {
    return { label: "保存失败", tone: "error", title: error ?? undefined };
  }
  return { label: "就绪", tone: "idle" };
}

const headerBtn = workspaceTopBarButtonClass;
const iconBtn = workspaceTopBarIconButtonClass;
const HEADER_MENU_GAP = 8;
const HEADER_MENU_VIEWPORT_MARGIN = 12;
const BOARD_MENU_ESTIMATED_HEIGHT = 380;
const OVERFLOW_MENU_ESTIMATED_HEIGHT = 280;

function resolveHeaderMenuPortalRoot(): HTMLElement {
  const boardMain = document.querySelector("main.imagine-workbench-shell");
  if (boardMain instanceof HTMLElement) return boardMain;
  const shell = document.querySelector(".imagine-workbench-shell");
  if (shell instanceof HTMLElement) return shell;
  return document.body;
}

function renderAnchoredHeaderMenu(
  open: boolean,
  panelRef: RefObject<HTMLDivElement | null>,
  position: { left: number; top: number },
  className: string,
  children: ReactNode,
): ReactPortal | null {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={panelRef}
      className={`${className} max-h-[calc(100vh-1.5rem)] overflow-y-auto`}
      style={{ left: position.left, top: position.top }}
    >
      {children}
    </div>,
    resolveHeaderMenuPortalRoot(),
  );
}

export default function BoardToolbar({
  boardId,
  boardSummaries,
  boardTitle,
  canRedo,
  canUndo,
  nodeCount,
  saveError,
  saveStatus,
  showGrid,
  showMiniMap,
  snapToGrid,
  trashedCount,
  onBack,
  onClear,
  onCreateBoard,
  onDeleteBoard,
  onImportMedia,
  onOpenSettings,
  onRenameBoard,
  onRedo,
  onRestoreTrash,
  onSelectBoard,
  onUndo,
  onToggleGrid,
  onToggleMiniMap,
  onToggleSnapToGrid,
}: BoardToolbarProps) {
  const { themeMode, toggleThemeMode } = useThemeMode();
  const showAlert = useAlert();
  const [isBoardMenuOpen, setIsBoardMenuOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [boardMenuPosition, setBoardMenuPosition] = useState({ left: 16, top: 56 });
  const [overflowMenuPosition, setOverflowMenuPosition] = useState({ left: 16, top: 56 });

  const boardMenuButtonRef = useRef<HTMLButtonElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const boardMenuPanelRef = useRef<HTMLDivElement>(null);
  const overflowMenuPanelRef = useRef<HTMLDivElement>(null);

  const saveMeta = saveStatusMeta(saveStatus, saveError);

  const visibleBoardSummaries = boardSummaries.some(board => board.id === boardId)
    ? boardSummaries
    : [
        {
          id: boardId,
          title: boardTitle,
          nodeCount,
          updatedAt: "",
          createdAt: "",
        },
        ...boardSummaries,
      ];

  useEffect(() => {
    if (!isBoardMenuOpen && !isOverflowOpen) return;

    function isWithinMenuTrigger(
      buttonRef: RefObject<HTMLButtonElement | null>,
      panelRef: RefObject<HTMLDivElement | null>,
      target: Node,
    ): boolean {
      return (
        buttonRef.current?.contains(target) === true ||
        panelRef.current?.contains(target) === true
      );
    }

    function closeOnPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!isWithinMenuTrigger(boardMenuButtonRef, boardMenuPanelRef, target)) {
        setIsBoardMenuOpen(false);
      }
      if (!isWithinMenuTrigger(overflowButtonRef, overflowMenuPanelRef, target)) {
        setIsOverflowOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      setIsBoardMenuOpen(false);
      setIsOverflowOpen(false);
    }

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isBoardMenuOpen, isOverflowOpen]);

  function openAnchoredMenu(
    buttonRef: RefObject<HTMLButtonElement | null>,
    menuWidth: number,
    menuHeight: number,
    setPosition: (value: { left: number; top: number }) => void,
    open: () => void,
  ): void {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const maxTop = window.innerHeight - menuHeight - HEADER_MENU_VIEWPORT_MARGIN;
      const belowTop = rect.bottom + HEADER_MENU_GAP;
      const aboveTop = rect.top - menuHeight - HEADER_MENU_GAP;
      setPosition({
        left: Math.max(
          HEADER_MENU_VIEWPORT_MARGIN,
          Math.min(rect.left, window.innerWidth - menuWidth - HEADER_MENU_VIEWPORT_MARGIN),
        ),
        top: belowTop <= maxTop
          ? belowTop
          : Math.max(HEADER_MENU_VIEWPORT_MARGIN, Math.min(aboveTop, maxTop)),
      });
    }
    open();
  }

  return (
    <WorkspaceTopBar
      start={
        <div className="contents">
          <WorkspaceTopBarBrand compact showBadge={false} />

          <span className="hidden h-7 w-px shrink-0 bg-[var(--iw-border)] md:block" aria-hidden="true" />

          <div className="relative min-w-0">
          <button
            ref={boardMenuButtonRef}
            type="button"
            onClick={() => {
              if (isBoardMenuOpen) {
                setIsBoardMenuOpen(false);
                return;
              }
              setIsOverflowOpen(false);
              openAnchoredMenu(boardMenuButtonRef, 320, BOARD_MENU_ESTIMATED_HEIGHT, setBoardMenuPosition, () => setIsBoardMenuOpen(true));
            }}
            className={`${headerBtn} min-w-0 max-w-[min(14rem,42vw)]`}
            title={boardTitle}
            aria-expanded={isBoardMenuOpen}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-[var(--iw-board-accent-amber)]" />
            <span className="truncate">{boardTitle}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--iw-muted)]" />
          </button>
          {renderAnchoredHeaderMenu(
            isBoardMenuOpen,
            boardMenuPanelRef,
            boardMenuPosition,
            "imagine-board-header-menu fixed z-[60] w-[20rem] max-w-[calc(100vw-1.5rem)]",
            <>
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-semibold text-[var(--iw-muted)]">画板</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsBoardMenuOpen(false);
                    onCreateBoard();
                  }}
                  className={`${headerBtn} !h-8 !min-h-8 px-2 text-[11px]`}
                >
                  <Plus className="h-3 w-3" />
                  新建
                </button>
              </div>
              <div className="max-h-[16rem] overflow-y-auto">
                {visibleBoardSummaries.map(board => (
                  <button
                    key={board.id}
                    type="button"
                    onClick={() => {
                      setIsBoardMenuOpen(false);
                      onSelectBoard(board.id);
                    }}
                    className="imagine-board-header-menu-row"
                    aria-current={board.id === boardId ? "page" : undefined}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{board.title}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-[var(--iw-muted)]">
                        {board.nodeCount} 节点
                      </span>
                    </span>
                    {board.id === boardId ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--iw-board-accent-amber)]" />
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="mt-2 border-t border-[var(--iw-border)] pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsBoardMenuOpen(false);
                    onRenameBoard();
                  }}
                  className="imagine-board-header-menu-action"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  重命名当前画板
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsBoardMenuOpen(false);
                    onDeleteBoard();
                  }}
                  className="imagine-board-header-menu-action"
                  data-action="danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除当前画板
                </button>
              </div>
            </>,
          )}
        </div>

        <span
          className={`imagine-board-save-status imagine-board-save-status--${saveMeta.tone} hidden md:inline-flex`}
          title={saveMeta.title}
        >
          <span className="imagine-board-save-status-dot" aria-hidden />
          <span className="truncate">{saveMeta.label}</span>
        </span>
        <span className="hidden font-mono text-[10px] text-[var(--iw-faint)] lg:inline">{nodeCount} 节点</span>
        </div>
      }
      center={
        <div className="contents">
          <button
            type="button"
            onClick={onImportMedia}
            className={`${headerBtn} shrink-0`}
            title="导入图片、视频或音频到画布"
          >
            <Upload className="h-3.5 w-3.5 text-emerald-300" />
            <span className="hidden md:inline">导入媒体</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={iconBtn}
              title="撤销 (Ctrl+Z)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={iconBtn}
              title="重做 (Ctrl+Shift+Z)"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      }
      end={
        <div className="contents">
          <button
            type="button"
            onClick={onBack}
            className={`${headerBtn} shrink-0`}
            title="返回工作台"
          >
            <Grid2X2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">工作台</span>
          </button>

          {trashedCount > 0 && onRestoreTrash ? (
            <button
              type="button"
              onClick={onRestoreTrash}
              className={`${headerBtn} hidden sm:flex`}
              title="恢复最近删除的节点"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>恢复 {trashedCount}</span>
            </button>
          ) : null}

        <div className="relative">
          <button
            ref={overflowButtonRef}
            type="button"
            onClick={() => {
              if (isOverflowOpen) {
                setIsOverflowOpen(false);
                return;
              }
              setIsBoardMenuOpen(false);
              openAnchoredMenu(overflowButtonRef, 220, OVERFLOW_MENU_ESTIMATED_HEIGHT, setOverflowMenuPosition, () => setIsOverflowOpen(true));
            }}
            className={iconBtn}
            aria-expanded={isOverflowOpen}
            aria-label="更多操作"
            title="更多"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {renderAnchoredHeaderMenu(
            isOverflowOpen,
            overflowMenuPanelRef,
            overflowMenuPosition,
            "imagine-board-header-menu fixed z-[60] w-[13.5rem] p-1.5",
            <>
              <button
                type="button"
                onClick={() => {
                  setIsOverflowOpen(false);
                  onImportMedia();
                }}
                className="imagine-board-header-menu-action"
              >
                <Upload className="h-3.5 w-3.5" />
                导入媒体
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOverflowOpen(false);
                  void showAlert({ title: "连线说明", message: BOARD_CONNECTION_HELP });
                }}
                className="imagine-board-header-menu-action"
              >
                <CircleHelp className="h-3.5 w-3.5" />
                连线说明
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleGrid();
                  setIsOverflowOpen(false);
                }}
                className="imagine-board-header-menu-action"
                data-state={showGrid ? "on" : "off"}
                aria-pressed={showGrid}
              >
                <span>{showGrid ? "隐藏网格" : "显示网格"}</span>
                <span className="board-toolbar-toggle-state">{showGrid ? "开" : "关"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleSnapToGrid();
                  setIsOverflowOpen(false);
                }}
                className="imagine-board-header-menu-action"
                data-state={snapToGrid ? "on" : "off"}
                aria-pressed={snapToGrid}
              >
                <Magnet className="h-3.5 w-3.5" />
                <span>{snapToGrid ? "关闭磁吸" : "开启磁吸"}</span>
                <span className="board-toolbar-toggle-state">{snapToGrid ? "开" : "关"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleMiniMap();
                  setIsOverflowOpen(false);
                }}
                className="imagine-board-header-menu-action"
                data-state={showMiniMap ? "on" : "off"}
                aria-pressed={showMiniMap}
              >
                <span>{showMiniMap ? "隐藏小地图" : "显示小地图"}</span>
                <span className="board-toolbar-toggle-state">{showMiniMap ? "开" : "关"}</span>
              </button>
              {trashedCount > 0 && onRestoreTrash ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsOverflowOpen(false);
                    onRestoreTrash();
                  }}
                  className="imagine-board-header-menu-action sm:hidden"
                >
                  恢复删除 ({trashedCount})
                </button>
              ) : null}
              <div className="my-1 border-t border-[var(--iw-border)]" />
              <button
                type="button"
                onClick={() => {
                  setIsOverflowOpen(false);
                  onOpenSettings();
                }}
                className="imagine-board-header-menu-action"
              >
                <Settings className="h-3.5 w-3.5" />
                设置
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleThemeMode();
                  setIsOverflowOpen(false);
                }}
                className="imagine-board-header-menu-action"
              >
                {themeMode === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                {themeMode === "light" ? "深色模式" : "浅色模式"}
              </button>
              <div className="my-1 border-t border-[var(--iw-border)]" />
              <button
                type="button"
                onClick={() => {
                  setIsOverflowOpen(false);
                  onClear();
                }}
                className="imagine-board-header-menu-action"
                data-action="danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空画板节点
              </button>
            </>,
          )}
        </div>
        </div>
      }
    />
  );
}
