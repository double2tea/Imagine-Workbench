import { useState, type ReactNode } from "react";
import { useTranslations } from "@/lib/i18n";

export interface BoardMediaMenuItem {
  id: string;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}

export interface BoardMediaAction {
  id: string;
  icon: ReactNode;
  menuItems?: BoardMediaMenuItem[];
  onClick?: () => void;
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
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
      onPointerLeave={() => setOpenMenuId(null)}
    >
      {visibleGroups.map(group => (
        <div
          key={group.id}
          aria-label={groupLabels[group.id]}
          className="board-media-action-group flex items-center gap-0.5 px-1"
          data-group={group.id}
          role="group"
        >
          {group.actions.map(action => {
            const menuId = `${group.id}:${action.id}`;
            const hasMenu = action.menuItems !== undefined && action.menuItems.length > 0;
            const isMenuOpen = openMenuId === menuId;
            return (
              <div key={action.id} className="relative">
                <button
                  type="button"
                  aria-expanded={hasMenu ? isMenuOpen : undefined}
                  aria-haspopup={hasMenu ? "menu" : undefined}
                  onClick={() => {
                    if (hasMenu) {
                      setOpenMenuId(currentId => currentId === menuId ? null : menuId);
                      return;
                    }
                    setOpenMenuId(null);
                    action.onClick?.();
                  }}
                  className={`imagine-floating-card-action imagine-board-asset-action board-media-dock-action nodrag ${action.toneClassName ?? ""}`}
                  title={action.title}
                  aria-label={action.title}
                >
                  {action.icon}
                </button>
                {hasMenu && isMenuOpen ? (
                  <div
                    role="menu"
                    className="imagine-floating-card-actions absolute left-1/2 top-full z-50 mt-2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel)] p-1 shadow-2xl shadow-black/40"
                  >
                    {action.menuItems?.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setOpenMenuId(null);
                          item.onClick();
                        }}
                        className="imagine-floating-card-action imagine-board-asset-action board-media-dock-action nodrag min-w-9 px-2 text-[11px] font-semibold"
                        title={item.label}
                        aria-label={item.label}
                      >
                        {item.icon ?? item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
