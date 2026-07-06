"use client";

import { useEffect, useState } from "react";
import { ImagePlus, MousePointerClick, Plus, Upload, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

const BOARD_EMPTY_HINT_DISMISSED_KEY = "imagine_board_empty_hint_dismissed";

interface StartAction {
  descriptionKey: string;
  icon: LucideIcon;
  labelKey: string;
  mobilePriority?: "low";
}

interface BoardEmptyHintProps {
  onQuickInsert?: () => void;
}

function readEmptyHintDismissed(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(BOARD_EMPTY_HINT_DISMISSED_KEY) === "1";
}

export default function BoardEmptyHint({ onQuickInsert }: BoardEmptyHintProps) {
  const { t } = useTranslations("board");
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      setDismissed(readEmptyHintDismissed());
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  const dismissEmptyHint = () => {
    window.localStorage.setItem(BOARD_EMPTY_HINT_DISMISSED_KEY, "1");
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  const startActions: StartAction[] = [
    { icon: Upload, labelKey: "emptyHint.importMedia", descriptionKey: "emptyHint.topBarOrDrag" },
    { icon: MousePointerClick, labelKey: "emptyHint.doubleClickBlank", descriptionKey: "emptyHint.quickInsert", mobilePriority: "low" },
    { icon: ImagePlus, labelKey: "emptyHint.generateNode", descriptionKey: "emptyHint.imageVideoAudio", mobilePriority: "low" },
  ];

  return (
    <div className="imagine-board-empty-hint">
      <div
        className="imagine-board-empty-hint-card pointer-events-auto"
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--iw-text)]">{t('emptyHint.startWithAction')}</p>
          <button
            type="button"
            onClick={dismissEmptyHint}
            className="imagine-icon-button flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--iw-border)] text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
            aria-label={t('emptyHint.dismiss')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="board-empty-hint-description mt-2 text-xs leading-5 text-[var(--iw-muted)]">
          {t('emptyHint.description')}
        </p>
        {onQuickInsert ? (
          <button
            type="button"
            onClick={onQuickInsert}
            className="board-empty-start-action mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--iw-border)] text-xs font-semibold text-[var(--iw-text)] transition"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('emptyHint.openInsertMenu')}
          </button>
        ) : null}
        <div className="mt-3 grid grid-cols-1 gap-1.5 text-left sm:grid-cols-3">
          {startActions.map((action) => {
            const Icon = action.icon;
            return (
              <span
                key={action.labelKey}
                data-mobile-priority={action.mobilePriority}
                className="board-empty-start-step flex items-start gap-2 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-[11px] font-semibold text-[var(--iw-text)]"
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--iw-muted)]" />
                <span className="min-w-0">
                  <span className="block truncate">{t(action.labelKey)}</span>
                  <span className="block truncate text-[10px] font-medium text-[var(--iw-faint)]">{t(action.descriptionKey)}</span>
                </span>
              </span>
            );
          })}
        </div>
        <p className="mt-3 text-[10px] leading-4 text-[var(--iw-faint)]">{t('emptyHint.handlesHint')}</p>
        <button
          type="button"
          onClick={dismissEmptyHint}
          className="imagine-secondary-action mt-3 h-8 w-full rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold text-[var(--iw-text)] transition hover:bg-[var(--iw-panel-soft)]"
        >
          {t('emptyHint.gotIt')}
        </button>
      </div>
    </div>
  );
}
