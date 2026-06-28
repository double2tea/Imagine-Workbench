"use client";

import Link from "next/link";
import { FolderHeart, Github, Globe, Grid2X2, Mail, Moon, Plug, Settings, Sun, Trash2 } from "lucide-react";
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
  const { locale, setLocale } = useLocale();
  const nextLocale = locale === "zh" ? "en" : "zh";
  const languageToggleLabel = t(`workspaceHeader.language.${nextLocale}`);
  const languageToggleShort = t(`workspaceHeader.language.${locale}Short`);
  const storageModeLabel = storageTarget === "postgres"
    ? t("workspaceHeader.storageModePostgres")
    : t("workspaceHeader.storageModeIndexedDb");

  return (
    <WorkspaceTopBar
      sticky
      start={
        <WorkspaceTopBarBrand subtitle={t('workspaceHeader.brandSubtitle')} />
      }
      end={
        <div className="z-10 flex shrink-0 items-center gap-1.5 sm:gap-2">
          {storageTarget === "postgres" ? (
            <WorkspaceStorageModeBadge
              label={storageModeLabel}
              target={storageTarget}
              title={t("workspaceHeader.storageModeTitle", { mode: storageModeLabel })}
            />
          ) : null}

          <Link href="/board" className={workspaceTopBarButtonClass} title={t('workspaceHeader.boardLink')} aria-label={t('workspaceHeader.boardLink')}>
            <Grid2X2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('workspaceHeader.boardLink')}</span>
          </Link>

          <button
            type="button"
            onClick={onOpenAssetLibrary}
            className={`${workspaceTopBarButtonClass} cursor-pointer`}
            title={t('workspaceHeader.assetLibraryLink')}
            aria-label={t('workspaceHeader.assetLibraryLink')}
          >
            <FolderHeart className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('workspaceHeader.assetLibraryLink')}</span>
          </button>

          {showResolveCheck ? (
            <button
              type="button"
              onClick={onRunResolveCheck}
              disabled={resolveCheckStatus === "running"}
              className={`${workspaceTopBarButtonClass} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
              title={t('workspaceHeader.resolveCheckTitle')}
              aria-label={t('workspaceHeader.resolveCheckTitle')}
            >
              <Plug className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{resolveCheckStatus === "running" ? t('workspaceHeader.resolveRunning') : t('workspaceHeader.resolveIdle')}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onOpenSettings}
            className={`${workspaceTopBarButtonClass} cursor-pointer`}
            title={t('workspaceHeader.settingsLink')}
            aria-label={t('workspaceHeader.settingsLink')}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('workspaceHeader.settingsLink')}</span>
          </button>

          <a
            href="https://github.com/double2tea/Imagine-Workbench"
            target="_blank"
            rel="noreferrer"
            className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
            title="GitHub: Imagine Workbench"
            aria-label={t('workspaceHeader.githubLinkAriaLabel')}
          >
            <Github className="h-3.5 w-3.5" />
          </a>

          <a
            href="mailto:double_tea@foxmail.com"
            className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
            title={t('workspaceHeader.contactEmailTitle')}
            aria-label={t('workspaceHeader.contactEmailAriaLabel')}
          >
            <Mail className="h-3.5 w-3.5" />
          </a>

          <button
            type="button"
            onClick={toggleThemeMode}
            aria-pressed={themeMode === "dark"}
            className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
            title={themeMode === "light" ? t('workspaceHeader.toggleDarkModeTitle') : t('workspaceHeader.toggleLightModeTitle')}
            aria-label={themeMode === "light" ? t('workspaceHeader.toggleDarkModeTitle') : t('workspaceHeader.toggleLightModeTitle')}
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
              className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-[5px] border border-[var(--iw-border)] bg-[var(--iw-panel)] px-1 text-[8px] font-bold leading-none text-[var(--iw-text)] shadow-sm"
              aria-hidden="true"
            >
              {languageToggleShort}
            </span>
          </button>

          <button
            type="button"
            onClick={onClearProject}
            className={`${workspaceTopBarIconButtonClass} cursor-pointer`}
            data-action="danger"
            title={t('workspaceHeader.clearAssetsTitle')}
            aria-label={t('workspaceHeader.clearAssetsAriaLabel')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      }
    />
  );
}
