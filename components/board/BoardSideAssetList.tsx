"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ImageIcon, Music, PlusCircle, Upload, Video } from "lucide-react";
import { useBoardMediaImport } from "@/components/board/BoardMediaImportContext";
import PreviewImage from "@/components/PreviewImage";
import { ensureHydratedStorageItem } from "@/lib/assets/ensure-hydrated";
import { IMAGINE_BOARD_ASSET_DRAG_TYPE } from "@/lib/board/interaction";
import type { StorageItem } from "@/lib/db";

const PAGE_SIZE = 36;

type AssetFilter = "all" | "image" | "video" | "audio";
type BoardSideMediaType = Extract<StorageItem["type"], "image" | "video" | "audio">;

const mediaTypeLabels: Record<BoardSideMediaType, string> = {
  audio: "音频",
  image: "图片",
  video: "视频",
};

const storageStatusLabels: Record<StorageItem["status"], string> = {
  complete: "可放入",
  failed: "失败",
  pending: "排队中",
  processing: "生成中",
};

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
  const [adding, setAdding] = useState(false);
  const typeLabel = item.type === "audio" || item.type === "image" || item.type === "video"
    ? mediaTypeLabels[item.type]
    : item.type;
  const statusLabel = alreadyOnCanvas ? "已在画布" : storageStatusLabels[item.status];

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
      draggable={item.status === "complete" && !adding && !alreadyOnCanvas}
      onDragStart={event => {
        if (item.status !== "complete" || adding || alreadyOnCanvas) return;
        event.dataTransfer.setData(IMAGINE_BOARD_ASSET_DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = "copy";
        const dragImage = event.currentTarget.cloneNode(true);
        if (dragImage instanceof HTMLElement) {
          dragImage.style.left = "-1000px";
          dragImage.style.opacity = "0.46";
          dragImage.style.pointerEvents = "none";
          dragImage.style.position = "fixed";
          dragImage.style.top = "-1000px";
          dragImage.style.width = `${event.currentTarget.offsetWidth}px`;
          document.body.appendChild(dragImage);
          event.dataTransfer.setDragImage(dragImage, 32, 32);
          window.setTimeout(() => dragImage.remove(), 0);
        }
      }}
      onClick={() => void handleAdd()}
      data-on-canvas={alreadyOnCanvas}
      data-highlighted={highlighted}
      data-status={item.status}
      className={`board-side-asset-row imagine-asset-card grid grid-cols-[54px_1fr] gap-2 !rounded-lg border p-2 text-left transition ${
        highlighted
          ? "border-[var(--iw-board-accent-amber)] bg-[var(--iw-panel)]"
          : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)]"
      } ${alreadyOnCanvas ? "cursor-default opacity-60" : "hover:border-[var(--iw-board-accent-amber)] hover:bg-[var(--iw-panel)]"}`}
    >
      <div className="board-side-asset-preview flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-[var(--iw-panel)]">
        {item.type === "image" && item.status === "complete" ? (
          <PreviewImage src={item.url} alt="" draggable={false} className="h-full w-full select-none object-cover" />
        ) : item.type === "audio" ? (
          <Music className="h-4 w-4 text-[var(--iw-faint)]" />
        ) : item.type === "image" ? (
          <ImageIcon className="h-4 w-4 text-[var(--iw-faint)]" />
        ) : (
          <Video className="h-4 w-4 text-[var(--iw-faint)]" />
        )}
      </div>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="block truncate text-xs font-semibold text-[var(--iw-text)]">{item.prompt || item.model}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="board-side-asset-type shrink-0 rounded-md border border-[var(--iw-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--iw-muted)]">
            {typeLabel}
          </span>
          <span className="imagine-status-chip block truncate font-mono text-[10px]" data-status={item.status}>
            {statusLabel}
          </span>
        </span>
        <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--iw-faint)]">
          {alreadyOnCanvas ? <CheckCircle2 className="h-3 w-3" /> : <PlusCircle className="h-3 w-3" />}
          <span className="truncate">{alreadyOnCanvas ? "画布中已有实例" : item.model}</span>
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
      <Upload className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />
      从本机导入图片/视频/音频
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
  const mediaItems = useMemo(
    () => items.filter(item => item.type === "image" || item.type === "video" || item.type === "audio"),
    [items],
  );

  const filteredItems = useMemo(() => {
    if (filter === "image") return mediaItems.filter(item => item.type === "image");
    if (filter === "video") return mediaItems.filter(item => item.type === "video");
    if (filter === "audio") return mediaItems.filter(item => item.type === "audio");
    return mediaItems;
  }, [filter, mediaItems]);

  const visibleItems = filteredItems.slice(0, visibleLimit);

  const filterChips: Array<{ id: AssetFilter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "image", label: "图片" },
    { id: "video", label: "视频" },
    { id: "audio", label: "音频" },
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
