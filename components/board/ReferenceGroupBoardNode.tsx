"use client";

import { memo } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import MediaReferenceThumbnail from "@/components/reference/MediaReferenceThumbnail";
import type { BoardReferenceGroupNode, BoardReferenceRole } from "@/lib/board";
import { getMediaReferencePromptToken, mediaReferenceLabel } from "@/lib/media-references";
import { useTranslations } from "@/lib/i18n";

interface ReferenceGroupBoardNodeProps {
  node: BoardReferenceGroupNode;
  onMove: (assetId: string, direction: "up" | "down") => void;
  onRemove: (assetId: string) => void;
  onRoleChange: (assetId: string, role: BoardReferenceRole) => void;
}

const roleOrder: BoardReferenceRole[] = ["general", "start", "end"];

function roleLabel(role: BoardReferenceRole, t: (key: string) => string): string {
  if (role === "start") return t('referenceGroup.roleStart');
  if (role === "end") return t('referenceGroup.roleEnd');
  return t('referenceGroup.roleReference');
}

function nextRole(role: BoardReferenceRole): BoardReferenceRole {
  const index = roleOrder.indexOf(role);
  return roleOrder[(index + 1) % roleOrder.length];
}

const ReferenceGroupBoardNode = memo(function ReferenceGroupBoardNode({
  node,
  onMove,
  onRemove,
  onRoleChange,
}: ReferenceGroupBoardNodeProps) {
  const { t } = useTranslations("board");
  if (node.references.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs leading-5 text-[var(--iw-muted)]">
        {t('referenceGroup.emptyHint')}
      </div>
    );
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto p-2">
      <div className="grid gap-2">
        {node.references.map((reference, index) => (
          <div
            key={reference.assetId}
            className="grid grid-cols-[52px_1fr_auto] items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-1.5"
            style={{ contentVisibility: "auto", containIntrinsicSize: "64px" }}
          >
            <div className="h-12 w-12 overflow-hidden rounded-md bg-[var(--iw-panel)]">
              <MediaReferenceThumbnail reference={reference} alt="" className="h-full w-full" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="rounded border border-[var(--iw-border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--iw-muted)]">
                  {getMediaReferencePromptToken(index, reference.type)}
                </span>
                <span className="rounded border border-[var(--iw-border)] px-1.5 py-0.5 text-[10px] text-[var(--iw-muted)]">
                  {mediaReferenceLabel(reference.type)}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRoleChange(reference.assetId, nextRole(reference.role));
                  }}
                  className="nodrag rounded border border-[var(--iw-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--iw-text)] transition hover:border-[var(--iw-board-accent-amber)]"
                >
                  {roleLabel(reference.role, t)}
                </button>
              </div>
              <p className="mt-1 truncate text-[10px] text-[var(--iw-muted)]">{reference.prompt || reference.model}</p>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={(event) => {
                  event.stopPropagation();
                  onMove(reference.assetId, "up");
                }}
                className="nodrag flex h-5 w-5 items-center justify-center rounded text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel)] disabled:opacity-35"
                title={t('referenceGroup.moveUp')}
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                disabled={index === node.references.length - 1}
                onClick={(event) => {
                  event.stopPropagation();
                  onMove(reference.assetId, "down");
                }}
                className="nodrag flex h-5 w-5 items-center justify-center rounded text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel)] disabled:opacity-35"
                title={t('referenceGroup.moveDown')}
              >
                <ArrowDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(reference.assetId);
                }}
                className="nodrag flex h-5 w-5 items-center justify-center rounded text-[var(--iw-muted)] transition hover:bg-[var(--iw-tone-danger-bg)] hover:text-[var(--iw-tone-danger-text)]"
                title={t('referenceGroup.remove')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default ReferenceGroupBoardNode;
