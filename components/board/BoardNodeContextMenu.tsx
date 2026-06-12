"use client";

import { Fragment } from "react";
import {
  Bot,
  Clipboard,
  Copy,
  GitBranchPlus,
  Images,
  Mic2,
  Pencil,
  Play,
  ScanSearch,
  Trash2,
  Ungroup,
  type LucideIcon,
} from "lucide-react";
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

type BoardNodeContextMenuGroup = "node" | "selection" | "media" | "run" | "agent" | "danger";

const actionGroupLabels: Record<BoardNodeContextMenuGroup, string> = {
  agent: "Agent",
  danger: "危险操作",
  media: "媒体",
  node: "节点",
  run: "执行",
  selection: "多选",
};

const actionIcons: Record<string, LucideIcon> = {
  agent: Bot,
  "agent-send": Bot,
  compare: ScanSearch,
  "connect-selected": GitBranchPlus,
  "copy-image": Clipboard,
  "create-reference-group": Images,
  delete: Trash2,
  duplicate: Copy,
  edit: Pencil,
  execute: Play,
  "group-selected": Images,
  "save-voice-profile": Mic2,
  ungroup: Ungroup,
};

function actionGroup(action: BoardNodeContextMenuAction): BoardNodeContextMenuGroup {
  if (action.tone === "danger") return "danger";
  if (action.id === "execute") return "run";
  if (action.id === "agent" || action.id === "agent-send") return "agent";
  if (action.id === "compare" || action.id === "copy-image" || action.id === "edit" || action.id === "save-voice-profile") return "media";
  if (action.id === "connect-selected" || action.id === "group-selected" || action.id === "ungroup" || action.id === "create-reference-group") return "selection";
  return "node";
}

export function buildBoardNodeContextMenuActions(input: {
  node: BoardNode;
  onCompare?: () => void;
  onCopyImage?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEditImage?: () => void;
  onExecute?: () => void;
  onConnectSelected?: () => void;
  onGroupSelected?: () => void;
  onCreateReferenceGroup?: () => void;
  onSaveVoiceProfile?: () => void;
  onSendAgent?: () => void;
  onUngroup?: () => void;
}): BoardNodeContextMenuAction[] {
  const actions: BoardNodeContextMenuAction[] = [
    { id: "duplicate", label: "复制节点", onSelect: input.onDuplicate },
  ];
  if (input.onConnectSelected) actions.push({ id: "connect-selected", label: "所选节点连到此节点", onSelect: input.onConnectSelected });
  if (input.onGroupSelected) actions.push({ id: "group-selected", label: "打组", onSelect: input.onGroupSelected });
  if (input.onUngroup) actions.push({ id: "ungroup", label: "取消分组", onSelect: input.onUngroup });
  if (input.onCreateReferenceGroup) actions.push({ id: "create-reference-group", label: "所选图片建参考组", onSelect: input.onCreateReferenceGroup });
  if (input.onCopyImage) actions.push({ id: "copy-image", label: "复制图片", onSelect: input.onCopyImage });
  if ((input.node.kind === "image-generate" || input.node.kind === "video-generate" || input.node.kind === "audio-operation" || input.node.kind === "runninghub-app") && input.onExecute) {
    actions.push({ id: "execute", label: "执行生成", onSelect: input.onExecute });
  }
  if (input.node.kind === "asset" && input.node.asset.type === "image") {
    if (input.onCompare) actions.push({ id: "compare", label: "对比参考", onSelect: input.onCompare });
    if (input.onEditImage) actions.push({ id: "edit", label: "编辑图片", onSelect: input.onEditImage });
  }
  if (input.node.kind === "asset") {
    if (input.node.asset.type === "audio" && input.onSaveVoiceProfile) {
      actions.push({ id: "save-voice-profile", label: "保存为克隆音色", onSelect: input.onSaveVoiceProfile });
    }
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
      className="imagine-board-node-context-menu fixed z-50 grid min-w-[13.5rem] gap-1 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] p-1.5 text-[var(--iw-text)] shadow-lg"
      style={{ left: anchor.left, top: anchor.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="board-node-context-title px-2 py-1 text-[10px] font-semibold text-[var(--iw-muted)]">{node.title}</p>
      {actions.map((action, index) => {
        const group = actionGroup(action);
        const previousGroup = index > 0 ? actionGroup(actions[index - 1]) : null;
        const Icon = actionIcons[action.id] ?? Copy;
        return (
          <Fragment key={action.id}>
            {group !== previousGroup ? (
              <span className="board-node-context-group px-2 pt-1 text-[10px] font-semibold text-[var(--iw-faint)]">
                {actionGroupLabels[group]}
              </span>
            ) : null}
            <button
              type="button"
              onClick={action.onSelect}
              className={`board-node-context-action imagine-header-button flex !h-9 w-full items-center !justify-start gap-2 !rounded-md border border-transparent px-2.5 text-left text-xs font-semibold transition ${
                action.tone === "danger"
                  ? "imagine-tone-link hover:border-[var(--iw-tone-danger-border)]"
                  : "text-[var(--iw-text)] hover:border-[var(--iw-border)] hover:bg-[var(--iw-panel-soft)]"
              }`}
              data-group={group}
              data-tone={action.tone === "danger" ? "danger" : undefined}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--iw-muted)]" />
              {action.label}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
