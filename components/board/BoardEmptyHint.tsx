"use client";

import { useEffect, useState } from "react";
import { Bot, FileText, ImagePlus, Layers3, MousePointerClick, Plus, Upload, type LucideIcon } from "lucide-react";
import { useTranslations } from "@/lib/i18n";

const BOARD_HANDLES_HINT_KEY = "imagine_board_handles_hint_seen";

interface StartAction {
  descriptionKey: string;
  icon: LucideIcon;
  labelKey: string;
}

interface BoardEmptyHintProps {
  onQuickInsert?: () => void;
}

function readHandlesHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(BOARD_HANDLES_HINT_KEY) === "1";
}

export default function BoardEmptyHint({ onQuickInsert }: BoardEmptyHintProps) {
  const { t } = useTranslations("board");
  const [handlesHintSeen, setHandlesHintSeen] = useState(true);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      setHandlesHintSeen(readHandlesHintSeen());
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  const dismissHandlesHint = () => {
    window.localStorage.setItem(BOARD_HANDLES_HINT_KEY, "1");
    setHandlesHintSeen(true);
  };

  const startActions: StartAction[] = [
    { icon: Upload, labelKey: "emptyHint.importMedia", descriptionKey: "emptyHint.topBarOrDrag" },
    { icon: MousePointerClick, labelKey: "emptyHint.doubleClickBlank", descriptionKey: "emptyHint.quickInsert" },
    { icon: ImagePlus, labelKey: "emptyHint.generateNode", descriptionKey: "emptyHint.imageVideoAudio" },
    { icon: Layers3, labelKey: "emptyHint.referenceGroup", descriptionKey: "emptyHint.groupConnect" },
    { icon: FileText, labelKey: "emptyHint.promptNote", descriptionKey: "emptyHint.captureIdeas" },
    { icon: Bot, labelKey: "emptyHint.handToAgent", descriptionKey: "emptyHint.continueArrange" },
  ];

  return (
    <div className="imagine-board-empty-hint">
      <div
        className="imagine-board-empty-hint-card pointer-events-auto"
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <p className="text-sm font-semibold text-[var(--iw-text)]">{t('emptyHint.startWithAction')}</p>
        <p className="mt-2 text-xs leading-5 text-[var(--iw-muted)]">
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
        <div className="mt-4 grid grid-cols-2 gap-1.5 text-left">
          {startActions.map(action => {
            const Icon = action.icon;
            return (
              <span
                key={action.labelKey}
                className="board-empty-start-step rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-[11px] font-semibold text-[var(--iw-text)]"
              >
                <Icon className="h-3.5 w-3.5 text-[var(--iw-muted)]" />
                <span className="min-w-0">
                  <span className="block truncate">{t(action.labelKey)}</span>
                  <span className="block truncate text-[10px] font-medium text-[var(--iw-faint)]">{t(action.descriptionKey)}</span>
                </span>
              </span>
            );
          })}
        </div>
        {!handlesHintSeen && (
          <p className="mt-3 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 py-2 text-[11px] leading-5 text-[var(--iw-muted)]">
            {t('emptyHint.handlesHint')}
          </p>
        )}
        {!handlesHintSeen && (
          <button
            type="button"
            onClick={dismissHandlesHint}
            className="imagine-secondary-action mt-3 h-8 w-full rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold text-[var(--iw-text)] transition hover:bg-[var(--iw-panel-soft)]"
          >
            {t('emptyHint.gotIt')}
          </button>
        )}
      </div>
    </div>
  );
}
