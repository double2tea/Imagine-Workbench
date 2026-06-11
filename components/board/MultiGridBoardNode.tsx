"use client";

import { memo, useEffect, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Download, Eraser, Maximize2, Minimize2, Minus, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { BoardMultiGridAspectRatio, BoardMultiGridItem, BoardMultiGridNode, BoardMultiGridSize, BoardSize } from "@/lib/board";
import { DEFAULT_MULTI_GRID_NODE_SIZE } from "@/lib/board/defaults";
import {
  BOARD_MULTI_GRID_ASPECT_RATIOS,
  BOARD_MULTI_GRID_SIZES,
  boardMultiGridCellCount,
  boardMultiGridCoverFrame,
  firstEmptyBoardMultiGridCell,
  normalizeBoardMultiGridItems,
} from "@/lib/board/multi-grid";

interface MultiGridBoardNodeProps {
  activeDropCellIndex?: number;
  node: BoardMultiGridNode;
  onExport: () => void | Promise<void>;
  onResize: (size: BoardSize) => void;
  onUpdate: (input: Partial<Pick<BoardMultiGridNode, "aspectRatio" | "gridSize" | "isCollapsed" | "items" | "selectedItemId">>) => void;
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

interface DragPreview {
  assetId: string;
  offsetX: number;
  offsetY: number;
}

interface SortDrag {
  assetId: string;
  pointerId: number;
}

const cellToolButtonClassName = "flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-black/20 text-white/75 shadow-sm backdrop-blur-md transition hover:border-emerald-300/50 hover:bg-black/45 hover:text-white";
const destructiveCellToolButtonClassName = "flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-black/20 text-red-100/75 shadow-sm backdrop-blur-md transition hover:border-red-200/70 hover:bg-red-500/55 hover:text-white";
const toolbarButtonClassName = "inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--iw-border)] px-2 text-[11px] font-semibold text-[var(--iw-muted)] transition hover:border-emerald-400/50 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40";
const activeToolbarButtonClassName = "border-emerald-400/60 bg-emerald-400/10 text-emerald-100";
const collapsedMultiGridNodeSize: BoardSize = { width: 360, height: 120 };
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

function clearItems(node: BoardMultiGridNode): BoardMultiGridItem[] {
  return normalizeBoardMultiGridItems([], node.gridSize);
}

function moveItemToCell(node: BoardMultiGridNode, assetId: string, cellIndex: number): BoardMultiGridItem[] {
  const sourceItem = node.items.find(item => item.assetId === assetId && typeof item.cellIndex === "number");
  if (!sourceItem || sourceItem.cellIndex === cellIndex) return node.items;
  const targetItem = node.items.find(item => item.assetId !== assetId && item.cellIndex === cellIndex);
  return normalizeBoardMultiGridItems(
    node.items.map(item => {
      if (item.assetId === assetId) return { ...item, cellIndex };
      if (targetItem && item.assetId === targetItem.assetId) return { ...item, cellIndex: sourceItem.cellIndex };
      return item;
    }),
    node.gridSize,
  );
}

function cellIndexFromPoint(clientX: number, clientY: number, nodeId: string): number | undefined {
  const element = document.elementFromPoint(clientX, clientY);
  const cell = element?.closest("[data-multi-grid-cell-index]");
  if (!(cell instanceof HTMLElement)) return undefined;
  if (cell.dataset.multiGridId !== nodeId) return undefined;
  const cellIndex = Number(cell.dataset.multiGridCellIndex);
  return Number.isInteger(cellIndex) ? cellIndex : undefined;
}

const MultiGridBoardNode = memo(function MultiGridBoardNode({
  activeDropCellIndex,
  node,
  onExport,
  onResize,
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
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [sortDrag, setSortDrag] = useState<SortDrag | null>(null);

  useEffect(() => {
    setActiveDrag(null);
    setDragPreview(null);
    setIsEditingLayout(false);
    setSortDrag(null);
  }, [node.id]);

  useEffect(() => {
    const liveAssetIds = new Set(node.items.map(item => item.assetId));
    setImageAspectRatioByAssetId(current => {
      let didPrune = false;
      const next = new Map<string, number>();
      current.forEach((value, assetId) => {
        if (!liveAssetIds.has(assetId)) {
          didPrune = true;
          return;
        }
        next.set(assetId, value);
      });
      return didPrune ? next : current;
    });
  }, [node.items]);

  const dragPreviewForEvent = (event: ReactPointerEvent<HTMLDivElement>, drag: ActiveCellDrag): DragPreview => ({
    assetId: drag.assetId,
    offsetX: drag.offsetX + ((event.clientX - drag.startX) / drag.width) * 100,
    offsetY: drag.offsetY + ((event.clientY - drag.startY) / drag.height) * 100,
  });

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
    setDragPreview({
      assetId: item.assetId,
      offsetX: item.offsetX,
      offsetY: item.offsetY,
    });
  };

  const beginItemSort = (event: ReactPointerEvent<HTMLDivElement>, item: BoardMultiGridItem): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onUpdate({ selectedItemId: item.assetId });
    setSortDrag({ assetId: item.assetId, pointerId: event.pointerId });
  };

  const moveItemDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setDragPreview(dragPreviewForEvent(event, activeDrag));
  };

  const endItemDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const nextPreview = dragPreviewForEvent(event, activeDrag);
    onUpdateItemTransform(activeDrag.assetId, {
      offsetX: nextPreview.offsetX,
      offsetY: nextPreview.offsetY,
    });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setActiveDrag(null);
    setDragPreview(null);
  };

  const endItemSort = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!sortDrag || sortDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const targetCellIndex = cellIndexFromPoint(event.clientX, event.clientY, node.id);
    if (targetCellIndex !== undefined) {
      onUpdate({
        items: moveItemToCell(node, sortDrag.assetId, targetCellIndex),
        selectedItemId: sortDrag.assetId,
      });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setSortDrag(null);
  };

  const cancelItemSort = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!sortDrag || sortDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setSortDrag(null);
  };

  const zoomItem = (item: BoardMultiGridItem, delta: number): void => {
    onUpdateItemTransform(item.assetId, { scale: item.scale + delta });
  };

  const handleItemWheel = (event: ReactWheelEvent<HTMLDivElement>, item: BoardMultiGridItem): void => {
    if (item.assetId !== node.selectedItemId) return;
    event.preventDefault();
    event.stopPropagation();
    zoomItem(item, event.deltaY < 0 ? zoomStep : -zoomStep);
  };

  const toggleCollapsed = (isCollapsed: boolean): void => {
    setIsEditingLayout(false);
    setSortDrag(null);
    onUpdate({ isCollapsed });
    onResize(isCollapsed ? collapsedMultiGridNodeSize : DEFAULT_MULTI_GRID_NODE_SIZE);
  };

  if (node.isCollapsed) {
    return (
      <div className="flex h-full min-h-0 items-center gap-2 bg-[var(--iw-panel)] px-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-[var(--iw-text)]">{node.title}</div>
          <div className="mt-0.5 text-[10px] font-semibold text-[var(--iw-muted)]">
            {node.gridSize}x{node.gridSize} · {node.items.length} 张图片
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onExport();
          }}
          className={toolbarButtonClassName}
          title="合成多宫格"
          aria-label="合成多宫格"
        >
          <Download className="h-3.5 w-3.5" />
          合成
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed(false);
          }}
          className={toolbarButtonClassName}
          title="展开多宫格"
          aria-label="展开多宫格"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          展开
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--iw-panel)]">
      <div className="nodrag flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--iw-border)] px-2">
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
            setIsEditingLayout(current => !current);
          }}
          className={`${toolbarButtonClassName} ml-auto ${isEditingLayout ? activeToolbarButtonClassName : ""}`}
          title="编辑排序"
          aria-label="编辑排序"
        >
          <Pencil className="h-3.5 w-3.5" />
          编辑
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onExport();
          }}
          className={toolbarButtonClassName}
          title="合成多宫格"
          aria-label="合成多宫格"
        >
          <Download className="h-3.5 w-3.5" />
          合成
        </button>
        <button
          type="button"
          disabled={node.items.length === 0}
          onClick={(event) => {
            event.stopPropagation();
            setIsEditingLayout(false);
            setSortDrag(null);
            onUpdate({ items: clearItems(node), selectedItemId: undefined });
          }}
          className={toolbarButtonClassName}
          title="清空多宫格"
          aria-label="清空多宫格"
        >
          <Eraser className="h-3.5 w-3.5" />
          清空
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed(true);
          }}
          className={toolbarButtonClassName}
          title="折叠多宫格"
          aria-label="折叠多宫格"
        >
          <Minimize2 className="h-3.5 w-3.5" />
          折叠
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
          onDoubleClick={(event) => {
            event.stopPropagation();
            setIsEditingLayout(true);
          }}
        >
          {Array.from({ length: visibleCellCount }, (_, cellIndex) => {
            const item = itemByCellIndex.get(cellIndex);
            const isDropActive = activeDropCellIndex === cellIndex;
            const isSelected = item?.assetId === node.selectedItemId;
            const isSortDragItem = Boolean(item && sortDrag?.assetId === item.assetId);
            const displayItem = item && dragPreview?.assetId === item.assetId
              ? { ...item, offsetX: dragPreview.offsetX, offsetY: dragPreview.offsetY }
              : item;
            return (
              <div
                key={cellIndex}
                data-multi-grid-cell-index={cellIndex}
                data-multi-grid-id={node.id}
                role="button"
                aria-label={item ? `多宫格图片 ${cellIndex + 1}` : `空宫格 ${cellIndex + 1}，可拖入图片`}
                aria-pressed={isSelected}
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
                onPointerDown={item ? event => (isEditingLayout ? beginItemSort(event, item) : beginItemDrag(event, item)) : event => event.stopPropagation()}
                onPointerMove={moveItemDrag}
                onPointerUp={(event) => {
                  endItemDrag(event);
                  endItemSort(event);
                }}
                onPointerCancel={(event) => {
                  endItemDrag(event);
                  cancelItemSort(event);
                }}
                onWheel={item ? event => handleItemWheel(event, item) : undefined}
                className={[
                  "nodrag nopan group/cell relative min-h-0 overflow-hidden border border-[var(--iw-border)] bg-[var(--iw-panel)] outline-none transition",
                  item ? isEditingLayout ? "cursor-move" : "cursor-grab active:cursor-grabbing" : "cursor-default",
                  item ? "" : "bg-[linear-gradient(135deg,rgba(16,185,129,0.08),rgba(255,255,255,0.02))] hover:border-emerald-300/50 hover:bg-emerald-400/10",
                  isDropActive ? "multi-grid-drop-cell-active z-20 border-emerald-200 bg-emerald-400/25" : "",
                  isSortDragItem && !isDropActive ? "opacity-70" : "",
                  isSelected ? "z-10 ring-2 ring-emerald-400" : "",
                ].join(" ")}
                style={isDropActive ? {
                  background: "radial-gradient(circle at center, rgba(110, 231, 183, 0.34), rgba(16, 185, 129, 0.18) 54%, rgba(16, 185, 129, 0.1))",
                  boxShadow: "inset 0 0 0 4px rgba(167, 243, 208, 0.98), 0 0 34px rgba(16, 185, 129, 0.58)",
                  outline: "4px solid rgba(110, 231, 183, 0.98)",
                  outlineOffset: "-4px",
                } : undefined}
                title={item ? item.prompt || item.model : "拖入图片"}
              >
                {isDropActive && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-2 z-30 border-2 border-emerald-100/90 bg-emerald-300/10 shadow-[0_0_30px_rgba(16,185,129,0.62)]"
                  >
                    <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-50 shadow-[0_0_0_10px_rgba(16,185,129,0.24),0_0_28px_rgba(110,231,183,0.72)]" />
                  </span>
                )}
                {item ? (
                  (() => {
                    const renderedItem = displayItem ?? item;
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
                          left: `calc(50% + ${renderedItem.offsetX}%)`,
                          top: `calc(50% + ${renderedItem.offsetY}%)`,
                          transform: `translate(-50%, -50%) scale(${renderedItem.scale})`,
                          width: `${frame.widthPercent}%`,
                        } : undefined}
                      />
                    );
                  })()
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--iw-muted)]/65 transition group-hover/cell:text-emerald-200">
                    <Plus className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">拖入图片</span>
                  </span>
                )}
                {item && !isEditingLayout ? (
                  <div
                    className={[
                      "pointer-events-none absolute inset-0 flex items-start justify-end p-1.5 opacity-0 transition",
                      isSelected ? "opacity-100" : "group-hover/cell:opacity-100 group-focus/cell:opacity-100",
                    ].join(" ")}
                    onDoubleClick={event => event.stopPropagation()}
                  >
                    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-px rounded-md border border-white/10 bg-black/15 p-px backdrop-blur-md">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          zoomItem(item, -zoomStep);
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        className={cellToolButtonClassName}
                        title="缩小"
                        aria-label="缩小多宫格图片"
                      >
                        <Minus className="h-3 w-3" />
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
                        aria-label="放大多宫格图片"
                      >
                        <Plus className="h-3 w-3" />
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
                        aria-label="复位多宫格图片"
                      >
                        <RotateCcw className="h-3 w-3" />
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
                        aria-label="暂存多宫格图片"
                      >
                        <Download className="h-3 w-3 rotate-180" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onUpdate({ items: removeItem(node, item.assetId), selectedItemId: undefined });
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        className={destructiveCellToolButtonClassName}
                        title="移除"
                        aria-label="移除多宫格图片"
                      >
                        <Trash2 className="h-3 w-3" />
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
          {isEditingLayout ? "拖动图片格子调整顺序" : selectedItem ? selectedItem.prompt || selectedItem.model : `${node.items.length} 张图片 · 双击进入分镜编辑排序`}
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
