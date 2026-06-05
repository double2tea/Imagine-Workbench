"use client";

import { useEffect, useRef, useState, type ReactNode, type ReactPortal, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
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
import {
  BOARD_INSERT_CATALOG,
  readLastBoardInsertKind,
  writeLastBoardInsertKind,
  type BoardInsertKind,
} from "@/lib/board/insert-catalog";
import type { BoardSaveStatus } from "@/hooks/useBoardState";
import { useThemeMode } from "@/lib/theme-mode";
import type { BoardSummary } from "@/lib/board";
import BoardInsertIcon from "@/components/board/BoardInsertIcon";

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
  onInsert: (kind: BoardInsertKind) => void;
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

const headerBtn =
  "imagine-board-header-btn flex h-9 min-h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-xs font-semibold text-[var(--iw-text)] transition";
const iconBtn =
  "imagine-board-header-icon flex h-9 w-9 min-w-9 items-center justify-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] transition disabled:cursor-not-allowed disabled:opacity-40";
const HEADER_MENU_GAP = 8;
const HEADER_MENU_VIEWPORT_MARGIN = 12;
const BOARD_MENU_ESTIMATED_HEIGHT = 380;
const INSERT_MENU_ESTIMATED_HEIGHT = 360;
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
  onInsert,
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
  const [isInsertMenuOpen, setIsInsertMenuOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [lastInsertKind, setLastInsertKind] = useState<BoardInsertKind>("prompt");
  const [boardMenuPosition, setBoardMenuPosition] = useState({ left: 16, top: 56 });
  const [insertMenuPosition, setInsertMenuPosition] = useState({ left: 16, top: 56 });
  const [overflowMenuPosition, setOverflowMenuPosition] = useState({ left: 16, top: 56 });

  const boardMenuButtonRef = useRef<HTMLButtonElement>(null);
  const insertMenuButtonRef = useRef<HTMLButtonElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const boardMenuPanelRef = useRef<HTMLDivElement>(null);
  const insertMenuPanelRef = useRef<HTMLDivElement>(null);
  const overflowMenuPanelRef = useRef<HTMLDivElement>(null);

  const saveMeta = saveStatusMeta(saveStatus, saveError);
  const lastInsertItem =
    BOARD_INSERT_CATALOG.find(item => item.kind === lastInsertKind) ?? BOARD_INSERT_CATALOG[0];


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
    setLastInsertKind(readLastBoardInsertKind());
  }, []);

  useEffect(() => {
    if (!isBoardMenuOpen && !isInsertMenuOpen && !isOverflowOpen) return;

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
      if (!isWithinMenuTrigger(insertMenuButtonRef, insertMenuPanelRef, target)) {
        setIsInsertMenuOpen(false);
      }
      if (!isWithinMenuTrigger(overflowButtonRef, overflowMenuPanelRef, target)) {
        setIsOverflowOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      setIsBoardMenuOpen(false);
      setIsInsertMenuOpen(false);
      setIsOverflowOpen(false);
    }

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isBoardMenuOpen, isInsertMenuOpen, isOverflowOpen]);

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

  function handleInsert(kind: BoardInsertKind): void {
    writeLastBoardInsertKind(kind);
    setLastInsertKind(kind);
    setIsInsertMenuOpen(false);
    onInsert(kind);
  }

  return (
    <header className="imagine-board-header">
      <div className="imagine-board-header-zone imagine-board-header-zone--document">
        <button type="button" onClick={onBack} className={iconBtn} data-accent="amber" title="返回工作台">
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="relative min-w-0">
          <button
            ref={boardMenuButtonRef}
            type="button"
            onClick={() => {
              if (isBoardMenuOpen) {
                setIsBoardMenuOpen(false);
                return;
              }
              setIsInsertMenuOpen(false);
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
          className={`imagine-board-save-status imagine-board-save-status--${saveMeta.tone}`}
          title={saveMeta.title}
        >
          <span className="imagine-board-save-status-dot" aria-hidden />
          <span className="truncate">{saveMeta.label}</span>
        </span>
        <span className="font-mono text-[10px] text-[var(--iw-faint)]">{nodeCount} 节点</span>
      </div>

      <div className="imagine-board-header-zone imagine-board-header-zone--create">
        <div className="relative flex min-w-0 items-center">
          <div className="imagine-board-header-insert-group flex shrink-0 overflow-hidden rounded-lg border border-[var(--iw-border)]">
            <button
              type="button"
              onClick={() => handleInsert(lastInsertKind)}
              className={`${headerBtn} !rounded-none !border-0 shrink-0`}
              data-accent="amber"
              title={`插入${lastInsertItem.label}节点`}
            >
              <BoardInsertIcon
                kind={lastInsertItem.kind}
                icon={lastInsertItem.icon}
                iconClassName={lastInsertItem.iconClassName}
              />
              <span className="hidden sm:inline">插入{lastInsertItem.label}</span>
              <span className="sm:hidden">插入</span>
            </button>
            <button
              ref={insertMenuButtonRef}
              type="button"
              aria-expanded={isInsertMenuOpen}
              aria-label="更多节点类型"
              onClick={() => {
                if (isInsertMenuOpen) {
                  setIsInsertMenuOpen(false);
                  return;
                }
                setIsBoardMenuOpen(false);
                setIsOverflowOpen(false);
                openAnchoredMenu(insertMenuButtonRef, 200, INSERT_MENU_ESTIMATED_HEIGHT, setInsertMenuPosition, () => setIsInsertMenuOpen(true));
              }}
              className={`${iconBtn} !w-8 !min-w-8 !rounded-none !border-0 border-l border-l-[var(--iw-border)]`}
              data-accent="amber"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          {renderAnchoredHeaderMenu(
            isInsertMenuOpen,
            insertMenuPanelRef,
            insertMenuPosition,
            "imagine-board-header-menu fixed z-[60] w-44 p-1.5",
            BOARD_INSERT_CATALOG.map(item => (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => handleInsert(item.kind)}
                  className="imagine-board-header-insert-row"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${item.iconSurfaceClassName}`}
                  >
                    <BoardInsertIcon kind={item.kind} icon={item.icon} iconClassName={item.iconClassName} />
                  </span>
                  <span className="text-xs font-semibold">{item.label}</span>
                </button>
              )),
          )}
        </div>

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

      <div className="imagine-board-header-zone imagine-board-header-zone--actions">
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
              setIsInsertMenuOpen(false);
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
                aria-pressed={showGrid}
              >
                {showGrid ? "隐藏网格" : "显示网格"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleSnapToGrid();
                  setIsOverflowOpen(false);
                }}
                className="imagine-board-header-menu-action"
                aria-pressed={snapToGrid}
              >
                <Magnet className="h-3.5 w-3.5" />
                {snapToGrid ? "关闭磁吸" : "开启磁吸"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleMiniMap();
                  setIsOverflowOpen(false);
                }}
                className="imagine-board-header-menu-action"
                aria-pressed={showMiniMap}
              >
                {showMiniMap ? "隐藏小地图" : "显示小地图"}
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
    </header>
  );
}
