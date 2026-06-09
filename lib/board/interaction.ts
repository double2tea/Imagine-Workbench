export const BOARD_TRASH_LIMIT = 20;

export const IMAGINE_BOARD_ASSET_DRAG_TYPE = "application/x-imagine-board-asset-id";

/** File picker accept for board-local image/video/audio import. */
export const BOARD_MEDIA_FILE_ACCEPT = "image/*,video/*,audio/*";

/** Quick-insert menu item kind (not a board node type). */
export const BOARD_QUICK_INSERT_IMPORT_KIND = "import-media";

export const BOARD_QUICK_INSERT_MENU_SIZE = { width: 224, height: 472 } as const;
export const BOARD_NODE_CONTEXT_MENU_SIZE = { width: 200, height: 240 } as const;

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function clampFloatingMenuPosition(
  clientX: number,
  clientY: number,
  menuWidth: number,
  menuHeight: number,
  margin = 8,
): { left: number; top: number } {
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : clientX + menuWidth;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : clientY + menuHeight;
  let left = clientX;
  let top = clientY;
  if (left + menuWidth + margin > viewportWidth) left = Math.max(margin, viewportWidth - menuWidth - margin);
  if (top + menuHeight + margin > viewportHeight) top = Math.max(margin, viewportHeight - menuHeight - margin);
  if (left < margin) left = margin;
  if (top < margin) top = margin;
  return { left, top };
}
