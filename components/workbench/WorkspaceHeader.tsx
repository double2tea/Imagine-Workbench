"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type ReactPortal, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  FolderHeart,
  Github,
  Globe,
  Grid2X2,
  Mail,
  Moon,
  MoreHorizontal,
  Plug,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import WorkspaceTopBarBrand from "@/components/workbench/WorkspaceTopBarBrand";
import WorkspaceTopBar, {
  workspaceTopBarButtonClass,
  workspaceTopBarIconButtonClass,
} from "@/components/workbench/WorkspaceTopBar";
import WorkspaceStorageModeBadge, { type WorkspaceStorageModeBadgeTarget } from "@/components/workbench/WorkspaceStorageModeBadge";
import { useThemeMode, type ThemeMode } from "@/lib/theme-mode";
import { useTranslations } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n";

export type { ThemeMode };

interface WorkspaceHeaderProps {
  onClearProject: () => void;
  onOpenAssetLibrary: () => void;
  onOpenSettings: () => void;
  onRunResolveCheck: () => void;
  resolveCheckStatus: "idle" | "running";
  showResolveCheck: boolean;
  storageTarget: WorkspaceStorageModeBadgeTarget;
}

const HEADER_MENU_GAP = 8;
const HEADER_MENU_VIEWPORT_MARGIN = 12;
const OVERFLOW_MENU_ESTIMATED_HEIGHT = 220;
const OVERFLOW_MENU_WIDTH = 220;

function resolveHeaderMenuPortalRoot(): HTMLElement {
  const main = document.querySelector("main.imagine-workbench-shell");
  if (main instanceof HTMLElement) return main;
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

export default function WorkspaceHeader({
  onClearProject,
  onOpenAssetLibrary,
  onOpenSettings,
  onRunResolveCheck,
  resolveCheckStatus,
  showResolveCheck,
  storageTarget,
}: WorkspaceHeaderProps) {
  const { themeMode, toggleThemeMode } = useThemeMode();
  const { t } = useTranslations("media");
  const commonT = useTranslations("common");
  const { locale, setLocale } = useLocale();
  const nextLocale = locale === "zh" ? "en" : "zh";
  const languageToggleLabel = t(`workspaceHeader.language.${nextLocale}`);
  const languageToggleShort = t(`workspaceHeader.language.${locale}Short`);
  const storageModeLabel = storageTarget === "postgres"
    ? t("workspaceHeader.storageModePostgres")
    : t("workspaceHeader.storageModeIndexedDb");

  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [overflowMenuPosition, setOverflowMenuPosition] = useState({ left: 16, top: 56 });
  const overflowButtonRef = useRef<HTMLButtonElement>(null);
  const overflowMenuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOverflowOpen) return;

    function closeOnPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        overflowButtonRef.current?.contains(target) === true ||
        overflowMenuPanelRef.current?.contains(target) === true
      ) {
        return;
      }
      setIsOverflowOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      setIsOverflowOpen(false);
    }

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOverflowOpen]);

  function openOverflowMenu(): void {
    const rect = overflowButtonRef.current?.getBoundingClientRect();
    if (rect) {
      const maxTop = window.innerHeight - OVERFLOW_MENU_ESTIMATED_HEIGHT - HEADER_MENU_VIEWPORT_MARGIN;
      const belowTop = rect.bottom + HEADER_MENU_GAP;
      const aboveTop = rect.top - OVERFLOW_MENU_ESTIMATED_HEIGHT - HEADER_MENU_GAP;
      setOverflowMenuPosition({
        left: Math.max(
          HEADER_MENU_VIEWPORT_MARGIN,
          Math.min(rect.left, window.innerWidth - OVERFLOW_MENU_WIDTH - HEADER_MENU_VIEWPORT_MARGIN),
        ),
        top: belowTop <= maxTop
          ? belowTop
          : Math.max(HEADER_MENU_VIEWPORT_MARGIN, Math.min(aboveTop, maxTop)),
      });
    }
    setIsOverflowOpen(true);
  }

  return (
    <WorkspaceTopBar
      sticky
      start={
        <WorkspaceTopBarBrand
          compact
          showBadge={false}
          subtitle={t("workspaceHeader.brandSubtitle")}
        />
      }
      end={
        <div className="z-10 flex shrink-0 items-center gap-1 sm:gap-1.5">
          <div className="flex items-center gap-1 sm:gap-1.5">
            {storageTarget === "postgres" ? (
              <WorkspaceStorageModeBadge
                label={storageModeLabel}
                target={storageTarget}
                title={t("workspaceHeader.storageModeTitle", { mode: storageModeLabel })}
              />
            ) : null}

            <Link
              href="/board"
              className={workspaceTopBarButtonClass}
              title={t("workspaceHeader.boardLink")}
              aria-label={t("workspaceHeader.boardLink")}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("workspaceHeader.boardLink")}</span>
            </Link>

            <button
              type="button"
              onClick={onOpenAssetLibrary}
              className={`${workspaceTopBarButtonClass} cursor-pointer`}
              title={t("workspaceHeader.assetLibraryLink")}
              aria-label={t("workspaceHeader.assetLibraryLink")}
            >
              <FolderHeart className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("workspaceHeader.assetLibraryLink")}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className={`${workspaceTopBarButtonClass} cursor-pointer`}
              title={t("workspaceHeader.settingsLink")}
              aria-label={t("workspaceHeader.settingsLink")}
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("workspaceHeader.settingsLink")}</span>
            </button>
          </div>

          <span className="imagine-toolbar-chip-divider hidden sm:block" aria-hidden="true" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleThemeMode}
              aria-pressed={themeMode === "dark"}
              className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
              title={themeMode === "light" ? t("workspaceHeader.toggleDarkModeTitle") : t("workspaceHeader.toggleLightModeTitle")}
              aria-label={themeMode === "light" ? t("workspaceHeader.toggleDarkModeTitle") : t("workspaceHeader.toggleLightModeTitle")}
            >
              {themeMode === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => setLocale(nextLocale)}
              className={`${workspaceTopBarIconButtonClass} relative shrink-0 overflow-visible cursor-pointer`}
              title={languageToggleLabel}
              aria-label={languageToggleLabel}
            >
              <Globe className="h-3.5 w-3.5" />
              <span
                className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-[5px] border border-[var(--iw-border)] bg-[var(--iw-panel)] px-1 text-[8px] font-bold leading-none text-[var(--iw-text)]"
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
                  openOverflowMenu();
                }}
                className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
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
                  <a
                    href="https://github.com/double2tea/Imagine-Workbench"
                    target="_blank"
                    rel="noreferrer"
                    className="imagine-board-header-menu-action"
                    title={t("workspaceHeader.githubLinkTitle")}
                    aria-label={t("workspaceHeader.githubLinkAriaLabel")}
                    onClick={() => setIsOverflowOpen(false)}
                  >
                    <Github className="h-3.5 w-3.5" />
                    {t("workspaceHeader.githubLinkTitle")}
                  </a>
                  <a
                    href="mailto:double_tea@foxmail.com"
                    className="imagine-board-header-menu-action"
                    title={t("workspaceHeader.contactEmailTitle")}
                    aria-label={t("workspaceHeader.contactEmailAriaLabel")}
                    onClick={() => setIsOverflowOpen(false)}
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {t("workspaceHeader.contactEmailTitle")}
                  </a>
                  {showResolveCheck ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOverflowOpen(false);
                        onRunResolveCheck();
                      }}
                      disabled={resolveCheckStatus === "running"}
                      className="imagine-board-header-menu-action disabled:cursor-not-allowed disabled:opacity-60"
                      title={t("workspaceHeader.resolveCheckTitle")}
                      aria-label={t("workspaceHeader.resolveCheckTitle")}
                    >
                      <Plug className="h-3.5 w-3.5" />
                      {resolveCheckStatus === "running"
                        ? t("workspaceHeader.resolveRunning")
                        : t("workspaceHeader.resolveIdle")}
                    </button>
                  ) : null}
                  <div className="my-1 border-t border-[var(--iw-border)]" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsOverflowOpen(false);
                      onClearProject();
                    }}
                    className="imagine-board-header-menu-action"
                    data-action="danger"
                    title={t("workspaceHeader.clearAssetsTitle")}
                    aria-label={t("workspaceHeader.clearAssetsAriaLabel")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("workspaceHeader.clearAssetsTitle")}
                  </button>
                </>,
              )}
            </div>
          </div>
        </div>
      }
    />
  );
}
