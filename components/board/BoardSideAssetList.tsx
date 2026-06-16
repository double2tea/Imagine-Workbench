"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FolderHeart, ImageIcon, Music, PlusCircle, Upload, Video } from "lucide-react";
import { useBoardMediaImport } from "@/components/board/BoardMediaImportContext";
import PreviewImage from "@/components/PreviewImage";
import { ensureHydratedStorageItem } from "@/lib/assets/ensure-hydrated";
import { IMAGINE_BOARD_ASSET_DRAG_TYPE } from "@/lib/board/interaction";
import type { StorageItem } from "@/lib/db";
import { useTranslations } from "@/lib/i18n";

const PAGE_SIZE = 36;
const SIDE_ACTION_BUTTON_CLASS =
  "imagine-secondary-action flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold text-[var(--iw-text)]";

type AssetFilter = "all" | "image" | "video" | "audio";
type BoardSideMediaType = Extract<StorageItem["type"], "image" | "video" | "audio">;

interface BoardSideAssetListProps {
  canvasAssetIds: ReadonlySet<string>;
  highlightAssetId?: string;
  items: StorageItem[];
  loading?: boolean;
  onAddToBoard: (item: StorageItem) => void;
  onOpenAssetLibrary?: () => void;
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
  const { t } = useTranslations("board");
  const commonT = useTranslations("common");
  const [adding, setAdding] = useState(false);
  const typeLabel: Record<BoardSideMediaType, string> = {
    audio: commonT.t('mediaTypeLabels.audio'),
    image: commonT.t('mediaTypeLabels.image'),
    video: commonT.t('mediaTypeLabels.video'),
  };
  const typeLabelValue = item.type === "audio" || item.type === "image" || item.type === "video"
    ? typeLabel[item.type]
    : item.type;
  const statusLabelMap: Record<StorageItem["status"], string> = {
    complete: commonT.t("statusLabels.complete"),
    failed: commonT.t('statusLabels.failed'),
    pending: commonT.t('statusLabels.pending'),
    processing: commonT.t('statusLabels.processing'),
  };
  const statusLabel = alreadyOnCanvas ? commonT.t("statusLabels.complete") : statusLabelMap[item.status];

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
            {typeLabelValue}
          </span>
          <span className="imagine-status-chip block truncate font-mono text-[10px]" data-status={item.status}>
            {statusLabel}
          </span>
        </span>
        <span className="flex items-center gap-1 text-[10px] font-medium text-[var(--iw-faint)]">
          {alreadyOnCanvas ? <CheckCircle2 className="h-3 w-3" /> : <PlusCircle className="h-3 w-3" />}
          <span className="truncate">{alreadyOnCanvas ? t("node.types.asset") : item.model}</span>
        </span>
      </span>
    </button>
  );
}

function ImportMediaButton({ className = "" }: { className?: string }) {
  const { t } = useTranslations("board");
  const openImport = useBoardMediaImport();
  if (!openImport) return null;
  return (
    <button
      type="button"
      onClick={() => openImport()}
      className={`${SIDE_ACTION_BUTTON_CLASS} ${className}`}
    >
      <Upload className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />
      {t('workspace.importMedia')}
    </button>
  );
}

function AssetLibraryButton({ onOpen }: { onOpen?: () => void }) {
  const { t } = useTranslations("common");
  if (!onOpen) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={SIDE_ACTION_BUTTON_CLASS}
    >
      <FolderHeart className="imagine-tone-icon h-3.5 w-3.5" data-tone="accent" />
      {t("library.title")}
    </button>
  );
}

export default function BoardSideAssetList({
  canvasAssetIds,
  highlightAssetId,
  items,
  loading = false,
  onAddToBoard,
  onOpenAssetLibrary,
}: BoardSideAssetListProps) {
  const { t } = useTranslations("common");
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
    { id: "all", label: t("library.all") },
    { id: "image", label: t('mediaTypeLabels.image') },
    { id: "video", label: t('mediaTypeLabels.video') },
    { id: "audio", label: t('mediaTypeLabels.audio') },
  ];

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
        <AssetLibraryButton onOpen={onOpenAssetLibrary} />
        <ImportMediaButton />
        <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs text-[var(--iw-muted)]">
          {t("library.loadingLibrary")}
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
        <AssetLibraryButton onOpen={onOpenAssetLibrary} />
        <ImportMediaButton />
        <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-6 text-center text-xs text-[var(--iw-muted)]">
          {t("gallery.emptySearch")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-3 pt-1">
      <AssetLibraryButton onOpen={onOpenAssetLibrary} />
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
          {t("library.noMatchingAssets")}
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
              {t("gallery.loadMore", { current: visibleLimit, total: filteredItems.length })}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
