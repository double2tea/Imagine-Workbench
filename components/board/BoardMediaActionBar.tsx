import type { ReactNode } from "react";

export interface BoardMediaAction {
  id: string;
  icon: ReactNode;
  onClick: () => void;
  title: string;
  toneClassName?: string;
}

export type BoardMediaActionGroupId = "assist" | "edit" | "media" | "view";

export interface BoardMediaActionGroup {
  actions: BoardMediaAction[];
  id: BoardMediaActionGroupId;
}

interface BoardMediaActionBarProps {
  groups: BoardMediaActionGroup[];
  visible?: boolean;
}

const BOARD_MEDIA_ACTION_GROUP_LABELS = {
  assist: "辅助操作",
  edit: "编辑操作",
  media: "媒体操作",
  view: "查看与导出",
} satisfies Record<BoardMediaActionGroupId, string>;

export default function BoardMediaActionBar({ groups, visible = false }: BoardMediaActionBarProps) {
  const visibleGroups = groups.filter(group => group.actions.length > 0);
  if (visibleGroups.length === 0) return null;
  const actionCount = visibleGroups.reduce((count, group) => count + group.actions.length, 0);
  const visibilityClass = visible
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0 group-hover/board-video:pointer-events-auto group-hover/board-video:opacity-100";

  return (
    <div
      data-action-count={actionCount}
      data-group-count={visibleGroups.length}
      data-visible={visible ? "true" : "false"}
      className={`board-media-controls board-media-top-actions nodrag nopan absolute bottom-full left-[var(--board-media-title-chrome-width,13rem)] right-auto z-40 mb-2 flex w-max max-w-none flex-nowrap items-center justify-start gap-1.5 whitespace-nowrap transition-opacity duration-200 ${visibilityClass}`}
      onPointerDown={event => event.stopPropagation()}
    >
      {visibleGroups.map(group => (
        <div
          key={group.id}
          aria-label={BOARD_MEDIA_ACTION_GROUP_LABELS[group.id]}
          className="board-media-action-group flex items-center gap-1 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)]/92 p-1 shadow-sm backdrop-blur"
          data-group={group.id}
          role="group"
        >
          {group.actions.map(action => (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className={`imagine-floating-card-action imagine-board-asset-action nodrag ${action.toneClassName ?? ""}`}
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
