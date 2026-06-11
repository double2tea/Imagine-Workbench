import type { ReactNode } from "react";

export interface BoardMediaAction {
  id: string;
  icon: ReactNode;
  onClick: () => void;
  title: string;
  toneClassName?: string;
}

export interface BoardMediaActionGroup {
  actions: BoardMediaAction[];
  id: string;
}

interface BoardMediaActionBarProps {
  groups: BoardMediaActionGroup[];
  visible?: boolean;
}

export default function BoardMediaActionBar({ groups, visible = false }: BoardMediaActionBarProps) {
  const visibleGroups = groups.filter(group => group.actions.length > 0);
  if (visibleGroups.length === 0) return null;
  const visibilityClass = visible
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0 group-hover/board-video:pointer-events-auto group-hover/board-video:opacity-100";

  return (
    <div
      className={`board-media-controls board-media-top-actions nodrag nopan absolute -top-10 right-0 z-40 flex max-w-full items-center gap-1 transition-opacity duration-200 ${visibilityClass}`}
      onPointerDown={event => event.stopPropagation()}
    >
      {visibleGroups.map(group => (
        <div key={group.id} className="board-media-action-group flex items-center gap-1 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)]/92 p-1 shadow-sm backdrop-blur">
          {group.actions.map(action => (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className={`imagine-board-asset-action nodrag ${action.toneClassName ?? ""}`}
              title={action.title}
              aria-label={action.title}
            >
              {action.icon}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
