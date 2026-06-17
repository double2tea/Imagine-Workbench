"use client";

import { Fragment } from "react";
import {
  Bot,
  Clipboard,
  Copy,
  GitBranchPlus,
  Images,
  Play,
  Trash2,
  Ungroup,
  type LucideIcon,
} from "lucide-react";
import { WORKBENCH_OPERATION_META } from "@/components/workbench/OperationControls";
import { BOARD_NODE_CONTEXT_MENU_SIZE, clampFloatingMenuPosition } from "@/lib/board/interaction";
import type { BoardNode } from "@/lib/board";
import { useTranslations } from "@/lib/i18n";

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

const actionGroupLabelKeys: Record<BoardNodeContextMenuGroup, string> = {
  agent: "contextMenu.groupAgent",
  danger: "contextMenu.groupDanger",
  media: "contextMenu.groupMedia",
  node: "contextMenu.groupNode",
  run: "contextMenu.groupRun",
  selection: "contextMenu.groupSelection",
};

const actionIcons: Record<string, LucideIcon> = {
  agent: Bot,
  "agent-send": Bot,
  compare: WORKBENCH_OPERATION_META.compare.Icon,
  "connect-selected": GitBranchPlus,
  "copy-image": Clipboard,
  "create-reference-group": Images,
  delete: Trash2,
  duplicate: Copy,
  edit: WORKBENCH_OPERATION_META.localEdit.Icon,
  execute: Play,
  "group-selected": Images,
  "save-voice-profile": WORKBENCH_OPERATION_META.voice.Icon,
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
  t: (key: string) => string;
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
  const { t } = input;
  const actions: BoardNodeContextMenuAction[] = [
    { id: "duplicate", label: t('contextMenu.duplicate'), onSelect: input.onDuplicate },
  ];
  if (input.onConnectSelected) actions.push({ id: "connect-selected", label: t('contextMenu.connectSelected'), onSelect: input.onConnectSelected });
  if (input.onGroupSelected) actions.push({ id: "group-selected", label: t('contextMenu.group'), onSelect: input.onGroupSelected });
  if (input.onUngroup) actions.push({ id: "ungroup", label: t('contextMenu.ungroup'), onSelect: input.onUngroup });
  if (input.onCreateReferenceGroup) actions.push({ id: "create-reference-group", label: t('contextMenu.createRefGroup'), onSelect: input.onCreateReferenceGroup });
  if (input.onCopyImage) actions.push({ id: "copy-image", label: t('contextMenu.copyImage'), onSelect: input.onCopyImage });
  if ((input.node.kind === "image-generate" || input.node.kind === "video-generate" || input.node.kind === "audio-operation" || input.node.kind === "runninghub-app") && input.onExecute) {
    actions.push({ id: "execute", label: t('contextMenu.execute'), onSelect: input.onExecute });
  }
  if (input.node.kind === "asset" && input.node.asset.type === "image") {
    if (input.onCompare) actions.push({ id: "compare", label: t('contextMenu.compare'), onSelect: input.onCompare });
    if (input.onEditImage) actions.push({ id: "edit", label: t("quickEdit.localEdit"), onSelect: input.onEditImage });
  }
  if (input.node.kind === "asset") {
    if (input.node.asset.type === "audio" && input.onSaveVoiceProfile) {
      actions.push({ id: "save-voice-profile", label: t('contextMenu.saveVoiceProfile'), onSelect: input.onSaveVoiceProfile });
    }
    if (input.onSendAgent) actions.push({ id: "agent", label: t('contextMenu.sendToAgent'), onSelect: input.onSendAgent });
  }
  if (input.node.kind === "agent" && input.onSendAgent) {
    actions.push({ id: "agent-send", label: t('contextMenu.sendToAgent'), onSelect: input.onSendAgent });
  }
  actions.push({ id: "delete", label: t('contextMenu.delete'), onSelect: input.onDelete, tone: "danger" });
  return actions;
}

export default function BoardNodeContextMenu({ actions, clientX, clientY, node }: BoardNodeContextMenuProps) {
  const { t } = useTranslations("board");
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
                {t(actionGroupLabelKeys[group])}
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
