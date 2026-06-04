"use client";

import { useMemo, useState } from "react";
import { Upload, Video } from "lucide-react";
import { useBoardMediaImport } from "@/components/board/BoardMediaImportContext";
import PreviewImage from "@/components/PreviewImage";
import { useResolvedAssetUrl } from "@/hooks/useResolvedAssetUrl";
import { ensureHydratedStorageItem } from "@/lib/assets/ensure-hydrated";
import { IMAGINE_BOARD_ASSET_DRAG_TYPE } from "@/lib/board/interaction";
import type { StorageItem } from "@/lib/db";

const PAGE_SIZE = 36;

type AssetFilter = "all" | "image" | "video" | "active";

interface BoardSideAssetListProps {
  canvasAssetIds: ReadonlySet<string>;
  highlightAssetId?: string;
  items: StorageItem[];
  loading?: boolean;
  onAddToBoard: (item: StorageItem) => void;
}

function BoardSideAssetRow({
  alreadyOnCanvas,
  highlighted,
  item,
  onAddToBoard,
}: {
  alreadyOnCanvas: boolean;
  highlighted: boolean;
  item: StorageItem;
  onAddToBoard: (item: StorageItem) => void;
}) {
  const previewUrl = useResolvedAssetUrl(item);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (adding || alreadyOnCanvas) return;
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
      disabled={adding || alreadyOnCanvas}
      draggable={item.type === "image" && item.status === "complete" && !adding && !alreadyOnCanvas}
      onDragStart={event => {
        if (item.type !== "image" || item.status !== "complete" || adding || alreadyOnCanvas) return;
        event.dataTransfer.setData(IMAGINE_BOARD_ASSET_DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => void handleAdd()}
      data-highlighted={highlighted}
      className={`imagine-asset-card grid grid-cols-[54px_1fr] gap-2 !rounded-lg border p-2 text-left transition ${
        highlighted
          ? "border-[var(--iw-board-accent-amber)] bg-[var(--iw-panel)]"
          : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)]"
      } ${alreadyOnCanvas ? "cursor-default opacity-60" : "hover:border-[var(--iw-board-accent-amber)] hover:bg-[var(--iw-panel)]"}`}
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
          {alreadyOnCanvas ? "已在画布" : item.status}
        </span>
      </span>
    </button>
  );
}

function ImportMediaButton({ className = "" }: { className?: string }) {
  const openImport = useBoardMediaImport();
  if (!openImport) return null;
  return (
    <button
      type="button"
      onClick={() => openImport()}
      className={`imagine-secondary-action flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold text-[var(--iw-text)] ${className}`}
    >
      <Upload className="h-3.5 w-3.5 text-emerald-300" />
      从本机导入图片/视频
    </button>
  );
}

export default function BoardSideAssetList({
  canvasAssetIds,
  highlightAssetId,
  items,
  loading = false,
  onAddToBoard,
}: BoardSideAssetListProps) {
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [filter, setFilter] = useState<AssetFilter>("all");

  const filteredItems = useMemo(() => {
    if (filter === "image") return items.filter(item => item.type === "image");
    if (filter === "video") return items.filter(item => item.type === "video");
    if (filter === "active") {
      return items.filter(item => item.status === "pending" || item.status === "processing");
    }
    return items;
  }, [filter, items]);

  const visibleItems = filteredItems.slice(0, visibleLimit);

  const filterChips: Array<{ id: AssetFilter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "image", label: "图片" },
    { id: "video", label: "视频" },
    { id: "active", label: "进行中" },
  ];

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
        <ImportMediaButton />
        <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs text-[var(--iw-muted)]">
          正在加载本画板资产…
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
        <ImportMediaButton />
        <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs text-[var(--iw-muted)]">
          本画板暂无关联资产。使用上方导入，或在此画板生成后出现在列表中。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
      <ImportMediaButton />
      <div className="flex flex-wrap gap-1.5">
        {filterChips.map(chip => (
          <button
            key={chip.id}
            type="button"
            data-active={filter === chip.id}
            onClick={() => {
              setFilter(chip.id);
              setVisibleLimit(PAGE_SIZE);
            }}
            className="imagine-filter-chip border border-[var(--iw-border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--iw-muted)]"
          >
            {chip.label}
          </button>
        ))}
      </div>
      {filteredItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs text-[var(--iw-muted)]">
          当前筛选无匹配资产
        </p>
      ) : (
        <>
          {visibleItems.map(item => (
            <BoardSideAssetRow
              key={item.id}
              item={item}
              highlighted={highlightAssetId === item.id}
              alreadyOnCanvas={canvasAssetIds.has(item.id)}
              onAddToBoard={onAddToBoard}
            />
          ))}
          {filteredItems.length > visibleLimit ? (
            <button
              type="button"
              onClick={() => setVisibleLimit(limit => limit + PAGE_SIZE)}
              className="imagine-secondary-action h-9 w-full rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold text-[var(--iw-text)]"
            >
              加载更多（{visibleLimit}/{filteredItems.length}）
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}