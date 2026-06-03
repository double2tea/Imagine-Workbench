"use client";

import { useState } from "react";
import { Video } from "lucide-react";
import PreviewImage from "@/components/PreviewImage";
import { IMAGINE_BOARD_ASSET_DRAG_TYPE } from "@/lib/board/interaction";
import type { StorageItem } from "@/lib/db";

const PAGE_SIZE = 36;

interface BoardSideAssetListProps {
  items: StorageItem[];
  onAddToBoard: (item: StorageItem) => void;
}

export default function BoardSideAssetList({ items, onAddToBoard }: BoardSideAssetListProps) {
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const visibleItems = items.slice(0, visibleLimit);

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs text-[var(--iw-muted)]">
          暂无本地资产，请先在首页生成作品
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      {visibleItems.map(item => (
        <button
          key={item.id}
          type="button"
          draggable={item.type === "image" && item.status === "complete"}
          onDragStart={event => {
            if (item.type !== "image" || item.status !== "complete") return;
            event.dataTransfer.setData(IMAGINE_BOARD_ASSET_DRAG_TYPE, item.id);
            event.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => onAddToBoard(item)}
          className="imagine-asset-card grid grid-cols-[54px_1fr] gap-2 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2 text-left transition hover:border-[var(--iw-board-accent-amber)] hover:bg-[var(--iw-panel)]"
        >
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-[var(--iw-panel)]">
            {item.type === "image" && item.status === "complete" ? (
              <PreviewImage src={item.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <Video className="h-4 w-4 text-[var(--iw-faint)]" />
            )}
          </div>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-[var(--iw-text)]">{item.prompt || item.model}</span>
            <span className="imagine-status-chip block truncate font-mono text-[10px]" data-status={item.status}>
              {item.status}
            </span>
          </span>
        </button>
      ))}
      {items.length > visibleLimit ? (
        <button
          type="button"
          onClick={() => setVisibleLimit(limit => limit + PAGE_SIZE)}
          className="imagine-secondary-action h-9 w-full rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold text-[var(--iw-text)]"
        >
          加载更多（{visibleLimit}/{items.length}）
        </button>
      ) : null}
    </div>
  );
}