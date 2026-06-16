"use client";

import type { LucideIcon } from "lucide-react";
import BoardInsertIcon from "@/components/board/BoardInsertIcon";
import { BOARD_QUICK_INSERT_IMPORT_KIND, BOARD_QUICK_INSERT_MENU_SIZE, clampFloatingMenuPosition } from "@/lib/board/interaction";
import { BOARD_INSERT_GROUP_LABELS, boardInsertGroupLabel, isBoardInsertKind, type BoardInsertGroupLabel, type BoardInsertTone } from "@/lib/board/insert-catalog";
import type { BoardPoint } from "@/lib/board";
import { useTranslations } from "@/lib/i18n";

export interface BoardQuickInsertMenuItem {
  icon: LucideIcon;
  kind: string;
  label: string;
  tone: BoardInsertTone;
}

interface BoardQuickInsertMenuProps {
  clientX: number;
  clientY: number;
  items: BoardQuickInsertMenuItem[];
  position: BoardPoint;
  onPick: (kind: string, position: BoardPoint) => void;
}

function quickInsertGroupLabel(kind: string): BoardInsertGroupLabel | null {
  if (kind === BOARD_QUICK_INSERT_IMPORT_KIND) return "开始";
  return isBoardInsertKind(kind) ? boardInsertGroupLabel(kind) : null;
}

export default function BoardQuickInsertMenu({ clientX, clientY, items, position, onPick }: BoardQuickInsertMenuProps) {
  const { t } = useTranslations("board");
  const anchor = clampFloatingMenuPosition(
    clientX,
    clientY,
    BOARD_QUICK_INSERT_MENU_SIZE.width,
    BOARD_QUICK_INSERT_MENU_SIZE.height,
  );
  const itemCountByGroup = new Map<BoardInsertGroupLabel, number>();
  for (const item of items) {
    const groupLabel = quickInsertGroupLabel(item.kind);
    if (!groupLabel) continue;
    itemCountByGroup.set(groupLabel, (itemCountByGroup.get(groupLabel) ?? 0) + 1);
  }

  return (
    <div
      className="imagine-board-quick-insert fixed z-50 w-60 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] p-2 text-[var(--iw-text)]"
      style={{ left: anchor.left, top: anchor.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="mb-2 flex items-center justify-between px-1.5">
        <span className="text-[11px] font-semibold text-[var(--iw-muted)]">{t('workspace.emptyHint')}</span>
        <span className="font-mono text-[10px] text-[var(--iw-faint)]">{items.length}</span>
      </div>
      <div className="grid max-h-[min(420px,calc(100vh-5rem))] gap-2 overflow-y-auto pr-1">
        {BOARD_INSERT_GROUP_LABELS.map(groupLabel => {
          const groupItems = items.filter(item => quickInsertGroupLabel(item.kind) === groupLabel);
          if (groupItems.length === 0) return null;
          return (
            <div key={groupLabel} className="board-quick-insert-group grid gap-1" data-group={groupLabel}>
              <span className="board-quick-insert-group-label flex items-center justify-between px-1 text-[10px] font-semibold text-[var(--iw-faint)]">
                <span>{groupLabel}</span>
                <span className="font-mono">{itemCountByGroup.get(groupLabel)}</span>
              </span>
              {groupItems.map(item => (
                <button
                  key={item.kind}
                  type="button"
                  onClick={() => onPick(item.kind, position)}
                  className="board-quick-insert-item imagine-header-button relative flex !h-10 !min-h-10 items-center gap-2.5 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-left text-xs font-semibold text-[var(--iw-text)] transition"
                  data-accent="amber"
                  data-kind={item.kind}
                >
                  <span className="imagine-tone-surface flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border" data-tone={item.tone}>
                    <BoardInsertIcon kind={item.kind} icon={item.icon} tone={item.tone} />
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
