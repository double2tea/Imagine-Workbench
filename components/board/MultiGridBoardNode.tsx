"use client";

import { memo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Download, Plus, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
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

const iconButtonClassName = "flex h-6 w-6 items-center justify-center rounded-md border border-[var(--iw-border)] text-[var(--iw-muted)] transition hover:border-emerald-400/50 hover:text-emerald-200";

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

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--iw-panel)]">
      <div className="nodrag flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--iw-border)] px-2">
        <select
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

      <div className="min-h-0 flex-1 p-2">
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
              <button
                key={cellIndex}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdate({ selectedItemId: item?.assetId });
                }}
                className={[
                  "nodrag relative min-h-0 overflow-hidden border border-[var(--iw-border)] bg-[var(--iw-panel)]",
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
                    <Plus className="h-4 w-4" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="nodrag flex min-h-[34px] shrink-0 items-center gap-1 border-t border-[var(--iw-border)] px-2 py-1">
        {selectedItem ? (
          <>
            <button type="button" className={iconButtonClassName} title="左移" onClick={() => onUpdateItemTransform(selectedItem.assetId, { offsetX: selectedItem.offsetX - 5 })}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={iconButtonClassName} title="右移" onClick={() => onUpdateItemTransform(selectedItem.assetId, { offsetX: selectedItem.offsetX + 5 })}>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={iconButtonClassName} title="上移" onClick={() => onUpdateItemTransform(selectedItem.assetId, { offsetY: selectedItem.offsetY - 5 })}>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={iconButtonClassName} title="下移" onClick={() => onUpdateItemTransform(selectedItem.assetId, { offsetY: selectedItem.offsetY + 5 })}>
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={iconButtonClassName} title="缩小" onClick={() => onUpdateItemTransform(selectedItem.assetId, { scale: selectedItem.scale - 0.1 })}>
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={iconButtonClassName} title="放大" onClick={() => onUpdateItemTransform(selectedItem.assetId, { scale: selectedItem.scale + 0.1 })}>
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button type="button" className={iconButtonClassName} title="复位" onClick={() => onUpdateItemTransform(selectedItem.assetId, { offsetX: 0, offsetY: 0, scale: 1 })}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <span className="text-[10px] font-semibold text-[var(--iw-muted)]">连接图片后可微调裁切</span>
        )}
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
