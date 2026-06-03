"use client";

import { useState } from "react";
import { Video } from "lucide-react";
import PreviewImage from "@/components/PreviewImage";
import { useResolvedAssetUrl } from "@/hooks/useResolvedAssetUrl";
import { ensureHydratedStorageItem } from "@/lib/assets/ensure-hydrated";
import { IMAGINE_BOARD_ASSET_DRAG_TYPE } from "@/lib/board/interaction";
import type { StorageItem } from "@/lib/db";

const PAGE_SIZE = 36;

interface BoardSideAssetListProps {
  items: StorageItem[];
  loading?: boolean;
  onAddToBoard: (item: StorageItem) => void;
}

function BoardSideAssetRow({
  item,
  onAddToBoard,
}: {
  item: StorageItem;
  onAddToBoard: (item: StorageItem) => void;
}) {
  const previewUrl = useResolvedAssetUrl(item);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const hydrated = await ensureHydratedStorageItem(item);
      onAddToBoard(hydrated);
    } finally {
      setAdding(false);
    }
  };

  return (
    <button
      type="button"
      disabled={adding}
      draggable={item.type === "image" && item.status === "complete" && !adding}
      onDragStart={event => {
        if (item.type !== "image" || item.status !== "complete" || adding) return;
        event.dataTransfer.setData(IMAGINE_BOARD_ASSET_DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => void handleAdd()}
      className="imagine-asset-card grid grid-cols-[54px_1fr] gap-2 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2 text-left transition hover:border-[var(--iw-board-accent-amber)] hover:bg-[var(--iw-panel)]"
    >
      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-[var(--iw-panel)]">
        {item.type === "image" && item.status === "complete" ? (
          <PreviewImage src={previewUrl} alt="" className="h-full w-full object-cover" />
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
  );
}

export default function BoardSideAssetList({ items, loading = false, onAddToBoard }: BoardSideAssetListProps) {
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const visibleItems = items.slice(0, visibleLimit);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs text-[var(--iw-muted)]">
          正在加载本画板资产…
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-3 pb-3">
        <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs text-[var(--iw-muted)]">
          本画板暂无关联资产。在此画板生成，或从画布引用已有节点。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      {visibleItems.map(item => (
        <BoardSideAssetRow key={item.id} item={item} onAddToBoard={onAddToBoard} />
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