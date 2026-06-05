"use client";

import { ArrowDown, ArrowUp, Music, Video, X } from "lucide-react";
import PreviewImage from "@/components/PreviewImage";
import type { BoardReferenceGroupNode, BoardReferenceRole } from "@/lib/board";
import { getMediaReferencePromptToken, mediaReferenceLabel } from "@/lib/media-references";

interface ReferenceGroupBoardNodeProps {
  node: BoardReferenceGroupNode;
  onMove: (assetId: string, direction: "up" | "down") => void;
  onRemove: (assetId: string) => void;
  onRoleChange: (assetId: string, role: BoardReferenceRole) => void;
}

const roleOrder: BoardReferenceRole[] = ["general", "start", "end"];

function roleLabel(role: BoardReferenceRole): string {
  if (role === "start") return "首帧";
  if (role === "end") return "尾帧";
  return "参考";
}

function nextRole(role: BoardReferenceRole): BoardReferenceRole {
  const index = roleOrder.indexOf(role);
  return roleOrder[(index + 1) % roleOrder.length];
}

export default function ReferenceGroupBoardNode({
  node,
  onMove,
  onRemove,
  onRoleChange,
}: ReferenceGroupBoardNodeProps) {
  if (node.references.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs leading-5 text-[var(--iw-muted)]">
        连接媒体资产组成参考组
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
              {reference.type === "image" ? (
                <PreviewImage src={reference.url} alt="" className="h-full w-full object-cover" />
              ) : reference.type === "video" ? (
                <Video className="m-auto h-full w-5 text-[var(--iw-faint)]" />
              ) : (
                <Music className="m-auto h-full w-5 text-[var(--iw-faint)]" />
              )}
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
                  {roleLabel(reference.role)}
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
                title="上移"
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
                title="下移"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(reference.assetId);
                }}
                className="nodrag flex h-5 w-5 items-center justify-center rounded text-[var(--iw-muted)] transition hover:bg-red-500/10 hover:text-red-300"
                title="移除"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
