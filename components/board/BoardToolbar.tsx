"use client";

import { useEffect, useRef, useState, type ReactNode, type ReactPortal, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Globe,
  Grid2X2,
  Layers,
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
import { getBoardConnectionHelp } from "@/lib/workspace-messages";
import type { BoardSaveStatus } from "@/hooks/useBoardState";
import { useThemeMode } from "@/lib/theme-mode";
import type { BoardSummary } from "@/lib/board";
import WorkspaceTopBarBrand from "@/components/workbench/WorkspaceTopBarBrand";
import WorkspaceTopBar, {
  workspaceTopBarButtonClass,
  workspaceTopBarIconButtonClass,
} from "@/components/workbench/WorkspaceTopBar";
import WorkspaceStorageModeBadge, { type WorkspaceStorageModeBadgeTarget } from "@/components/workbench/WorkspaceStorageModeBadge";
import { useLocale, useTranslations } from "@/lib/i18n";

interface BoardToolbarProps {
  boardId: string;
  boardSummaries: BoardSummary[];
  boardTitle: string;
  canRedo: boolean;
  canUndo: boolean;
  nodeCount: number;
  saveError: string | null;
  saveStatus: BoardSaveStatus;
  storageTarget: WorkspaceStorageModeBadgeTarget;
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
}

function saveStatusMeta(status: BoardSaveStatus, error: string | null, t: (key: string) => string): {
  label: string;
  tone: "idle" | "busy" | "ok" | "error";
  title?: string;
} {
  if (status === "loading") return { label: t("workspace.saveStatusLoading"), tone: "busy" };
  if (status === "saving") return { label: t("workspace.saveStatusSaving"), tone: "busy" };
  if (status === "saved") return { label: t("workspace.saveStatusSaved"), tone: "ok" };
  if (status === "error") {
    return { label: t("workspace.saveStatusError"), tone: "error", title: error ?? undefined };
  }
  return { label: t("workspace.saveStatusReady"), tone: "idle" };
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
  storageTarget,
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
}: BoardToolbarProps) {
  const { t } = useTranslations("board");
  const mediaT = useTranslations("media");
  const commonT = useTranslations("common");
  const { themeMode, toggleThemeMode } = useThemeMode();
  const { locale, setLocale } = useLocale();
  const showAlert = useAlert();
  const [isBoardMenuOpen, setIsBoardMenuOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [boardMenuPosition, setBoardMenuPosition] = useState({ left: 16, top: 56 });
  const [overflowMenuPosition, setOverflowMenuPosition] = useState({ left: 16, top: 56 });

  const boardMenuButtonRef = useRef<HTMLButtonElement>(null);
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const boardMenuPanelRef = useRef<HTMLDivElement>(null);
  const overflowMenuPanelRef = useRef<HTMLDivElement>(null);

  const saveMeta = saveStatusMeta(saveStatus, saveError, t);
  const nextLocale = locale === "zh" ? "en" : "zh";
  const languageToggleLabel = t(`workspace.language.${nextLocale}`);
  const languageToggleShort = t(`workspace.language.${locale}Short`);
  const storageModeLabel = storageTarget === "postgres"
    ? mediaT.t("workspaceHeader.storageModePostgres")
    : mediaT.t("workspaceHeader.storageModeIndexedDb");

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

          <WorkspaceStorageModeBadge
            label={storageModeLabel}
            target={storageTarget}
            title={mediaT.t("workspaceHeader.storageModeTitle", { mode: storageModeLabel })}
          />

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
            aria-label={boardTitle}
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
                <span className="text-[11px] font-semibold text-[var(--iw-muted)]">{t('workspace.boardLabel')}</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsBoardMenuOpen(false);
                    onCreateBoard();
                  }}
                  className={`${headerBtn} !h-8 !min-h-8 px-2 text-[11px]`}
                >
                  <Plus className="h-3 w-3" />
                  {commonT.t("buttons.create")}
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
                            {t('workspace.nodeCountLabel', { count: board.nodeCount })}
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
                  {t('workspace.renameCurrentBoard')}
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
                  {t('workspace.deleteCurrentBoard')}
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
        <span className="hidden font-mono text-[10px] text-[var(--iw-faint)] lg:inline">{t('workspace.nodeCountLabel', { count: nodeCount })}</span>
        </div>
      }
      center={
        <div className="contents">
          <button
            type="button"
            onClick={onImportMedia}
            className={`${headerBtn} hidden shrink-0 lg:flex`}
            title={t('workspace.importMedia')}
            aria-label={t('workspace.importMedia')}
          >
            <Upload className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />
            <span>{t('workspace.importMedia')}</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={iconBtn}
              title={t("workspace.undo")}
              aria-label={t("workspace.undo")}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={iconBtn}
              title={t("workspace.redo")}
              aria-label={t("workspace.redo")}
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
            title={t("workspace.backToWorkspace")}
            aria-label={t("workspace.backToWorkspace")}
          >
            <Grid2X2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{t("workspace.backToWorkspace")}</span>
          </button>

          {trashedCount > 0 && onRestoreTrash ? (
            <button
              type="button"
              onClick={onRestoreTrash}
              className={`${headerBtn} hidden lg:flex`}
              title={t("workspace.restoreDeleted")}
              aria-label={t("workspace.restoreDeleted")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{commonT.t("buttons.restore")} {trashedCount}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setLocale(nextLocale)}
            className={`${iconBtn} relative shrink-0 overflow-visible`}
            title={languageToggleLabel}
            aria-label={languageToggleLabel}
          >
            <Globe className="h-3.5 w-3.5" />
            <span
              className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-[5px] border border-[var(--iw-border)] bg-[var(--iw-panel)] px-1 text-[8px] font-bold leading-none text-[var(--iw-text)] shadow-sm"
              aria-hidden="true"
            >
              {languageToggleShort}
            </span>
          </button>

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
            aria-label={commonT.t("buttons.more")}
            title={commonT.t("buttons.more")}
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
                className="imagine-board-header-menu-action lg:hidden"
              >
                <Upload className="h-3.5 w-3.5" />
                {t("workspace.importMedia")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOverflowOpen(false);
                  void showAlert({ title: t("connectionHelp"), message: getBoardConnectionHelp(t) });
                }}
                className="imagine-board-header-menu-action"
              >
                <CircleHelp className="h-3.5 w-3.5" />
                {t("connectionHelp")}
              </button>
              {trashedCount > 0 && onRestoreTrash ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsOverflowOpen(false);
                    onRestoreTrash();
                  }}
                  className="imagine-board-header-menu-action lg:hidden"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {`${t("workspace.restoreDeleted")} (${trashedCount})`}
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
                  {t('workspace.openSettings')}
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
                {themeMode === "light" ? t('workspace.switchDarkMode') : t('workspace.switchLightMode')}
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
                {t('workspace.clearBoardNodes')}
              </button>
            </>,
          )}
        </div>
        </div>
      }
    />
  );
}
