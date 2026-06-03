"use client";

import type { LucideIcon } from "lucide-react";
import BoardInsertIcon from "@/components/board/BoardInsertIcon";
import { BOARD_QUICK_INSERT_MENU_SIZE, clampFloatingMenuPosition } from "@/lib/board/interaction";
import type { BoardPoint } from "@/lib/board";

export interface BoardQuickInsertMenuItem {
  icon: LucideIcon;
  iconClassName: string;
  iconSurfaceClassName: string;
  kind: string;
  label: string;
}

interface BoardQuickInsertMenuProps {
  clientX: number;
  clientY: number;
  items: BoardQuickInsertMenuItem[];
  position: BoardPoint;
  onPick: (kind: string, position: BoardPoint) => void;
}

export default function BoardQuickInsertMenu({ clientX, clientY, items, position, onPick }: BoardQuickInsertMenuProps) {
  const anchor = clampFloatingMenuPosition(
    clientX,
    clientY,
    BOARD_QUICK_INSERT_MENU_SIZE.width,
    BOARD_QUICK_INSERT_MENU_SIZE.height,
  );

  return (
    <div
      className="imagine-board-quick-insert fixed z-50 grid w-44 gap-1.5 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] p-2 text-[var(--iw-text)]"
      style={{ left: anchor.left, top: anchor.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map(item => (
          <button
            key={item.kind}
            type="button"
            onClick={() => onPick(item.kind, position)}
            className="imagine-header-button relative flex !h-10 !min-h-10 items-center gap-2.5 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-left text-xs font-semibold text-[var(--iw-text)] transition"
            data-accent="amber"
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${item.iconSurfaceClassName}`}>
              <BoardInsertIcon kind={item.kind} icon={item.icon} iconClassName={item.iconClassName} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
    </div>
  );
}