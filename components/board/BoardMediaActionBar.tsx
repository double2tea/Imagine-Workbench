import type { ReactNode } from "react";
import { useTranslations } from "@/lib/i18n";

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

export default function BoardMediaActionBar({ groups, visible = false }: BoardMediaActionBarProps) {
  const { t } = useTranslations("board");
  const visibleGroups = groups.filter(group => group.actions.length > 0);
  if (visibleGroups.length === 0) return null;
  const actionCount = visibleGroups.reduce((count, group) => count + group.actions.length, 0);
  const visibilityClass = visible
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0 group-hover/board-video:pointer-events-auto group-hover/board-video:opacity-100";

  const groupLabels: Record<BoardMediaActionGroupId, string> = {
    assist: t('mediaActionBar.assist'),
    edit: t('mediaActionBar.edit'),
    media: t('mediaActionBar.media'),
    view: t('mediaActionBar.view'),
  };

  return (
    <div
      data-action-count={actionCount}
      data-group-count={visibleGroups.length}
      data-visible={visible ? "true" : "false"}
      className={`board-media-controls board-media-top-actions nodrag nopan absolute bottom-full left-1/2 right-auto z-40 mb-12 flex w-max max-w-none flex-nowrap items-center justify-center whitespace-nowrap [translate:-50%_0] transition-opacity duration-200 ${visibilityClass}`}
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
    >
      {visibleGroups.map(group => (
        <div
          key={group.id}
          aria-label={groupLabels[group.id]}
          className="board-media-action-group flex items-center gap-0.5 px-1"
          data-group={group.id}
          role="group"
        >
          {group.actions.map(action => (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              className={`imagine-floating-card-action imagine-board-asset-action board-media-dock-action nodrag ${action.toneClassName ?? ""}`}
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
