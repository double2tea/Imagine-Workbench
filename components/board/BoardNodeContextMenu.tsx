"use client";

import { BOARD_NODE_CONTEXT_MENU_SIZE, clampFloatingMenuPosition } from "@/lib/board/interaction";
import type { BoardNode } from "@/lib/board";

export interface BoardNodeContextMenuAction {
  id: string;
  label: string;
  onSelect: () => void;
  tone?: "danger";
}

interface BoardNodeContextMenuProps {
  actions: BoardNodeContextMenuAction[];
  clientX: number;
  clientY: number;
  node: BoardNode;
}

export function buildBoardNodeContextMenuActions(input: {
  node: BoardNode;
  onCompare?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEditImage?: () => void;
  onExecute?: () => void;
  onSendAgent?: () => void;
  onSetReference?: () => void;
}): BoardNodeContextMenuAction[] {
  const actions: BoardNodeContextMenuAction[] = [
    { id: "duplicate", label: "复制节点", onSelect: input.onDuplicate },
  ];
  if ((input.node.kind === "image-generate" || input.node.kind === "video-generate") && input.onExecute) {
    actions.push({ id: "execute", label: "执行生成", onSelect: input.onExecute });
  }
  if (input.node.kind === "asset" && input.node.asset.type === "image") {
    if (input.onCompare) actions.push({ id: "compare", label: "对比参考", onSelect: input.onCompare });
    if (input.onEditImage) actions.push({ id: "edit", label: "编辑图片", onSelect: input.onEditImage });
  }
  if (input.node.kind === "asset") {
    if (input.onSetReference) actions.push({ id: "reference", label: "设为参考", onSelect: input.onSetReference });
    if (input.onSendAgent) actions.push({ id: "agent", label: "发送到 Agent", onSelect: input.onSendAgent });
  }
  if (input.node.kind === "agent" && input.onSendAgent) {
    actions.push({ id: "agent-send", label: "发送到 Agent", onSelect: input.onSendAgent });
  }
  actions.push({ id: "delete", label: "删除节点", onSelect: input.onDelete, tone: "danger" });
  return actions;
}

export default function BoardNodeContextMenu({ actions, clientX, clientY, node }: BoardNodeContextMenuProps) {
  const anchor = clampFloatingMenuPosition(
    clientX,
    clientY,
    BOARD_NODE_CONTEXT_MENU_SIZE.width,
    BOARD_NODE_CONTEXT_MENU_SIZE.height,
  );

  return (
    <div
      className="imagine-board-node-context-menu fixed z-50 grid min-w-[12rem] gap-1 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] p-1.5 text-[var(--iw-text)] shadow-lg"
      style={{ left: anchor.left, top: anchor.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="px-2 py-1 text-[10px] font-semibold text-[var(--iw-muted)]">{node.title}</p>
      {actions.map(action => (
        <button
          key={action.id}
          type="button"
          onClick={action.onSelect}
          className={`imagine-header-button flex !h-9 w-full items-center !justify-start !rounded-md border border-transparent px-2.5 text-left text-xs font-semibold transition ${
            action.tone === "danger"
              ? "text-red-300 hover:border-red-400/30 hover:bg-red-500/10"
              : "text-[var(--iw-text)] hover:border-[var(--iw-border)] hover:bg-[var(--iw-panel-soft)]"
          }`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
