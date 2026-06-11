"use client";

import { memo, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Download, Minus, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { BoardMultiGridAspectRatio, BoardMultiGridItem, BoardMultiGridNode, BoardMultiGridSize } from "@/lib/board";
import {
  BOARD_MULTI_GRID_ASPECT_RATIOS,
  BOARD_MULTI_GRID_SIZES,
  boardMultiGridCellCount,
  boardMultiGridCoverFrame,
  firstEmptyBoardMultiGridCell,
  normalizeBoardMultiGridItems,
} from "@/lib/board/multi-grid";

interface MultiGridBoardNodeProps {
  node: BoardMultiGridNode;
  onExport: () => void | Promise<void>;
  onUpdate: (input: Partial<Pick<BoardMultiGridNode, "aspectRatio" | "gridSize" | "items" | "selectedItemId">>) => void;
  onUpdateItemTransform: (assetId: string, transform: Partial<Pick<BoardMultiGridItem, "offsetX" | "offsetY" | "scale">>) => void;
}

function aspectRatioCssValue(ratio: BoardMultiGridAspectRatio): string {
  const [width, height] = ratio.split(":");
  return `${width} / ${height}`;
}

function aspectRatioNumber(ratio: BoardMultiGridAspectRatio): number {
  const [width, height] = ratio.split(":").map(Number);
  if (!width || !height) return 1;
  return width / height;
}

function selectedVisibleItem(node: BoardMultiGridNode): BoardMultiGridItem | undefined {
  if (!node.selectedItemId) return undefined;
  return node.items.find(item => item.assetId === node.selectedItemId && typeof item.cellIndex === "number");
}

function restoreItemToFirstEmptyCell(node: BoardMultiGridNode, item: BoardMultiGridItem): BoardMultiGridItem[] {
  const cellIndex = firstEmptyBoardMultiGridCell(node.items, node.gridSize);
  if (cellIndex === undefined) return node.items;
  return normalizeBoardMultiGridItems(
    node.items.map(currentItem =>
      currentItem.assetId === item.assetId ? { ...currentItem, cellIndex } : currentItem,
    ),
    node.gridSize,
  );
}

interface ActiveCellDrag {
  assetId: string;
  height: number;
  offsetX: number;
  offsetY: number;
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
}

const cellToolButtonClassName = "flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-black/55 text-white shadow-sm backdrop-blur transition hover:border-emerald-300/60 hover:bg-black/75";
const zoomStep = 0.1;

function stashItem(node: BoardMultiGridNode, assetId: string): BoardMultiGridItem[] {
  return normalizeBoardMultiGridItems(
    node.items.map(item => item.assetId === assetId ? { ...item, cellIndex: undefined } : item),
    node.gridSize,
  );
}

function removeItem(node: BoardMultiGridNode, assetId: string): BoardMultiGridItem[] {
  return normalizeBoardMultiGridItems(
    node.items.filter(item => item.assetId !== assetId),
    node.gridSize,
  );
}

const MultiGridBoardNode = memo(function MultiGridBoardNode({
  node,
  onExport,
  onUpdate,
  onUpdateItemTransform,
}: MultiGridBoardNodeProps) {
  const visibleCellCount = boardMultiGridCellCount(node.gridSize);
  const itemByCellIndex = new Map(
    node.items
      .filter((item): item is BoardMultiGridItem & { cellIndex: number } => typeof item.cellIndex === "number")
      .map(item => [item.cellIndex, item]),
  );
  const selectedItem = selectedVisibleItem(node);
  const stashedItems = node.items.filter(item => typeof item.cellIndex !== "number");
  const ratioValue = aspectRatioNumber(node.aspectRatio);
  const [imageAspectRatioByAssetId, setImageAspectRatioByAssetId] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [activeDrag, setActiveDrag] = useState<ActiveCellDrag | null>(null);

  const beginItemDrag = (event: ReactPointerEvent<HTMLDivElement>, item: BoardMultiGridItem): void => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onUpdate({ selectedItemId: item.assetId });
    setActiveDrag({
      assetId: item.assetId,
      height: Math.max(1, rect.height),
      offsetX: item.offsetX,
      offsetY: item.offsetY,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: Math.max(1, rect.width),
    });
  };

  const moveItemDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    onUpdateItemTransform(activeDrag.assetId, {
      offsetX: activeDrag.offsetX + ((event.clientX - activeDrag.startX) / activeDrag.width) * 100,
      offsetY: activeDrag.offsetY + ((event.clientY - activeDrag.startY) / activeDrag.height) * 100,
    });
  };

  const endItemDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveDrag(null);
  };

  const zoomItem = (item: BoardMultiGridItem, delta: number): void => {
    onUpdateItemTransform(item.assetId, { scale: item.scale + delta });
  };

  const handleItemWheel = (event: ReactWheelEvent<HTMLDivElement>, item: BoardMultiGridItem): void => {
    event.preventDefault();
    event.stopPropagation();
    onUpdate({ selectedItemId: item.assetId });
    zoomItem(item, event.deltaY < 0 ? zoomStep : -zoomStep);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--iw-panel)]">
      <div className="nodrag flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--iw-border)] px-2">
        <select
          name={`multi-grid-aspect-${node.id}`}
          value={node.aspectRatio}
          onChange={event => onUpdate({ aspectRatio: event.target.value as BoardMultiGridAspectRatio })}
          className="h-7 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 text-[11px] font-semibold text-[var(--iw-text)] outline-none"
          title="比例"
        >
          {BOARD_MULTI_GRID_ASPECT_RATIOS.map(ratio => (
            <option key={ratio} value={ratio}>比例 {ratio}</option>
          ))}
        </select>
        <select
          name={`multi-grid-size-${node.id}`}
          value={node.gridSize}
          onChange={event => onUpdate({ gridSize: Number(event.target.value) as BoardMultiGridSize })}
          className="h-7 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 text-[11px] font-semibold text-[var(--iw-text)] outline-none"
          title="宫格"
        >
          {BOARD_MULTI_GRID_SIZES.map(size => (
            <option key={size} value={size}>宫格 {size}x{size}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onExport();
          }}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-[var(--iw-border)] text-[var(--iw-muted)] transition hover:border-emerald-400/50 hover:text-emerald-200"
          title="导出当前多宫格"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div
          className="mx-auto grid max-h-full max-w-full overflow-hidden rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]"
          style={{
            aspectRatio: aspectRatioCssValue(node.aspectRatio),
            gridTemplateColumns: `repeat(${node.gridSize}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${node.gridSize}, minmax(0, 1fr))`,
            height: ratioValue < 1 ? "100%" : "auto",
            width: ratioValue >= 1 ? "100%" : "auto",
          }}
        >
          {Array.from({ length: visibleCellCount }, (_, cellIndex) => {
            const item = itemByCellIndex.get(cellIndex);
            const isSelected = item?.assetId === node.selectedItemId;
            return (
              <div
                key={cellIndex}
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdate({ selectedItemId: item?.assetId });
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onUpdate({ selectedItemId: item?.assetId });
                }}
                onPointerDown={item ? event => beginItemDrag(event, item) : event => event.stopPropagation()}
                onPointerMove={moveItemDrag}
                onPointerUp={endItemDrag}
                onPointerCancel={endItemDrag}
                onWheel={item ? event => handleItemWheel(event, item) : event => event.stopPropagation()}
                className={[
                  "nodrag nopan nowheel group/cell relative min-h-0 overflow-hidden border border-[var(--iw-border)] bg-[var(--iw-panel)] outline-none",
                  item ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                  isSelected ? "z-10 ring-2 ring-emerald-400" : "",
                ].join(" ")}
                title={item ? item.prompt || item.model : "空格"}
              >
                {item ? (
                  (() => {
                    const imageAspectRatio = imageAspectRatioByAssetId.get(item.assetId);
                    const frame = imageAspectRatio
                      ? boardMultiGridCoverFrame(imageAspectRatio, ratioValue)
                      : null;
                    return (
                      <img
                        src={item.url}
                        alt=""
                        className={frame ? "absolute max-w-none" : "h-full w-full object-cover"}
                        draggable={false}
                        onLoad={(event) => {
                          const image = event.currentTarget;
                          if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
                          const nextAspectRatio = image.naturalWidth / image.naturalHeight;
                          setImageAspectRatioByAssetId(current => {
                            if (current.get(item.assetId) === nextAspectRatio) return current;
                            const next = new Map(current);
                            next.set(item.assetId, nextAspectRatio);
                            return next;
                          });
                        }}
                        style={frame ? {
                          height: `${frame.heightPercent}%`,
                          left: `calc(50% + ${item.offsetX}%)`,
                          top: `calc(50% + ${item.offsetY}%)`,
                          transform: `translate(-50%, -50%) scale(${item.scale})`,
                          width: `${frame.widthPercent}%`,
                        } : undefined}
                      />
                    );
                  })()
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[var(--iw-muted)]/55">
                    <Plus className="h-5 w-5" />
                  </span>
                )}
                {item ? (
                  <div
                    className={[
                      "pointer-events-none absolute inset-0 flex items-start justify-end p-2 opacity-0 transition",
                      isSelected ? "opacity-100" : "group-hover/cell:opacity-100 group-focus/cell:opacity-100",
                    ].join(" ")}
                  >
                    <div className="pointer-events-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          zoomItem(item, -zoomStep);
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        className={cellToolButtonClassName}
                        title="缩小"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          zoomItem(item, zoomStep);
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        className={cellToolButtonClassName}
                        title="放大"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onUpdateItemTransform(item.assetId, { offsetX: 0, offsetY: 0, scale: 1 });
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        className={cellToolButtonClassName}
                        title="复位"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onUpdate({ items: stashItem(node, item.assetId), selectedItemId: undefined });
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        className={cellToolButtonClassName}
                        title="暂存"
                      >
                        <Download className="h-3.5 w-3.5 rotate-180" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onUpdate({ items: removeItem(node, item.assetId), selectedItemId: undefined });
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-red-300/30 bg-red-500/75 text-white shadow-sm backdrop-blur transition hover:border-red-200 hover:bg-red-500"
                        title="移除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="nodrag flex min-h-[34px] shrink-0 items-center gap-2 border-t border-[var(--iw-border)] px-2 py-1">
        <span className="truncate text-[10px] font-semibold text-[var(--iw-muted)]">
          {selectedItem ? selectedItem.prompt || selectedItem.model : `${node.items.length} 张图片`}
        </span>
        {stashedItems.length > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              const firstStashedItem = stashedItems[0];
              if (!firstStashedItem) return;
              onUpdate({
                items: restoreItemToFirstEmptyCell(node, firstStashedItem),
                selectedItemId: firstStashedItem.assetId,
              });
            }}
            className="ml-auto h-6 rounded-md border border-[var(--iw-border)] px-2 text-[10px] font-semibold text-[var(--iw-muted)] transition hover:border-emerald-400/50 hover:text-emerald-200"
            title="恢复一张暂存图片到空格"
          >
            暂存 {stashedItems.length}
          </button>
        ) : null}
      </div>
    </div>
  );
});

export default MultiGridBoardNode;
