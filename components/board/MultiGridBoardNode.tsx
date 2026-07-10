"use client";

import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createPortal } from "react-dom";
import { Archive, Download, Eraser, Maximize2, Minimize2, Minus, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { useTranslations } from "@/lib/i18n";

interface MultiGridBoardNodeProps {
  node: BoardMultiGridNode;
  onExtractItem: (assetId: string, clientX: number, clientY: number) => void;
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

interface ExtractPreview {
  assetId: string;
  clientX: number;
  clientY: number;
}

interface SortDrag {
  assetId: string;
  pointerId: number;
}

const cellToolButtonClassName = "flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-black/20 text-white/75 shadow-sm backdrop-blur-md transition hover:border-emerald-300/50 hover:bg-black/45 hover:text-white";
const destructiveCellToolButtonClassName = "flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-black/20 text-red-100/75 shadow-sm backdrop-blur-md transition hover:border-red-200/70 hover:bg-red-500/55 hover:text-white";
const toolbarButtonClassName = "inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--iw-border)] px-2 text-[11px] font-semibold text-[var(--iw-muted)] transition hover:border-[var(--iw-tone-success-border)] hover:text-[var(--iw-tone-success-text)] disabled:cursor-not-allowed disabled:opacity-40";
const activeToolbarButtonClassName = "imagine-tone-chip";
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

function isPointInsideElement(clientX: number, clientY: number, element: HTMLElement | null): boolean {
  const rect = element?.getBoundingClientRect();
  return Boolean(
    rect &&
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

const MultiGridBoardNode = memo(function MultiGridBoardNode({
  node,
  onExtractItem,
  onExport,
  onResize,
  onUpdate,
  onUpdateItemTransform,
}: MultiGridBoardNodeProps) {
  const { t } = useTranslations("board");
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
  const [extractPreview, setExtractPreview] = useState<ExtractPreview | null>(null);
  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [sortDrag, setSortDrag] = useState<SortDrag | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);
  const pendingDragPreviewRef = useRef<DragPreview | null>(null);

  const cancelScheduledDragPreview = (): void => {
    if (dragPreviewFrameRef.current !== null) {
      window.cancelAnimationFrame(dragPreviewFrameRef.current);
      dragPreviewFrameRef.current = null;
    }
    pendingDragPreviewRef.current = null;
  };

  const scheduleDragPreview = (preview: DragPreview): void => {
    pendingDragPreviewRef.current = preview;
    if (dragPreviewFrameRef.current !== null) return;
    dragPreviewFrameRef.current = window.requestAnimationFrame(() => {
      dragPreviewFrameRef.current = null;
      const nextPreview = pendingDragPreviewRef.current;
      pendingDragPreviewRef.current = null;
      if (nextPreview) setDragPreview(nextPreview);
    });
  };

  useEffect(() => {
    cancelScheduledDragPreview();
    setActiveDrag(null);
    setDragPreview(null);
    setExtractPreview(null);
    setIsEditingLayout(false);
    setSortDrag(null);
  }, [node.id]);

  useEffect(() => cancelScheduledDragPreview, []);

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
    cancelScheduledDragPreview();
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
    setExtractPreview(null);
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
    const isOutsideGrid = !isPointInsideElement(event.clientX, event.clientY, rootRef.current);
    setExtractPreview(current => {
      if (!isOutsideGrid) return current === null ? current : null;
      if (
        current?.assetId === activeDrag.assetId &&
        current.clientX === event.clientX &&
        current.clientY === event.clientY
      ) {
        return current;
      }
      return { assetId: activeDrag.assetId, clientX: event.clientX, clientY: event.clientY };
    });
    scheduleDragPreview(dragPreviewForEvent(event, activeDrag));
  };

  const endItemDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const nextPreview = dragPreviewForEvent(event, activeDrag);
    if (!isPointInsideElement(event.clientX, event.clientY, rootRef.current)) {
      onExtractItem(activeDrag.assetId, event.clientX, event.clientY);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      cancelScheduledDragPreview();
      setActiveDrag(null);
      setDragPreview(null);
      setExtractPreview(null);
      return;
    }
    onUpdateItemTransform(activeDrag.assetId, {
      offsetX: nextPreview.offsetX,
      offsetY: nextPreview.offsetY,
    });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cancelScheduledDragPreview();
    setActiveDrag(null);
    setDragPreview(null);
    setExtractPreview(null);
  };

  const cancelItemDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cancelScheduledDragPreview();
    setActiveDrag(null);
    setDragPreview(null);
    setExtractPreview(null);
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
            {node.gridSize}x{node.gridSize} · {t('node.multiGridImageCount', { count: node.items.length })}
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onExport();
          }}
          className={toolbarButtonClassName}
          title={t("multiGridNode.exportTitle")}
          aria-label={t("multiGridNode.exportTitle")}
        >
          <Download className="h-3.5 w-3.5" />
          {t("multiGridNode.exportButton")}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed(false);
          }}
          className={toolbarButtonClassName}
          title={t("multiGridNode.expandTitle")}
          aria-label={t("multiGridNode.expandTitle")}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          {t("multiGridNode.expandButton")}
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col bg-[var(--iw-panel)]" data-multi-grid-root-id={node.id}>
      <div className="nodrag flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--iw-border)] px-2">
        <select
          name={`multi-grid-aspect-${node.id}`}
          value={node.aspectRatio}
          onChange={event => onUpdate({ aspectRatio: event.target.value as BoardMultiGridAspectRatio })}
          className="h-7 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 text-[11px] font-semibold text-[var(--iw-text)] outline-none"
          title={t("multiGridNode.aspectRatioLabel")}
        >
          {BOARD_MULTI_GRID_ASPECT_RATIOS.map(ratio => (
            <option key={ratio} value={ratio}>{t("multiGridNode.aspectRatioOption", { ratio })}</option>
          ))}
        </select>
        <select
          name={`multi-grid-size-${node.id}`}
          value={node.gridSize}
          onChange={event => onUpdate({ gridSize: Number(event.target.value) as BoardMultiGridSize })}
          className="h-7 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 text-[11px] font-semibold text-[var(--iw-text)] outline-none"
          title={t("multiGridNode.gridSizeLabel")}
        >
          {BOARD_MULTI_GRID_SIZES.map(size => (
            <option key={size} value={size}>{t("multiGridNode.gridSizeOption", { size })}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsEditingLayout(current => !current);
          }}
          className={`${toolbarButtonClassName} ml-auto ${isEditingLayout ? activeToolbarButtonClassName : ""}`}
          data-tone="success"
          title={t("multiGridNode.editTitle")}
          aria-label={t("multiGridNode.editTitle")}
        >
          <Pencil className="h-3.5 w-3.5" />
          {t("multiGridNode.editButton")}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void onExport();
          }}
          className={toolbarButtonClassName}
          title={t("multiGridNode.exportTitle")}
          aria-label={t("multiGridNode.exportTitle")}
        >
          <Download className="h-3.5 w-3.5" />
          {t("multiGridNode.exportButton")}
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
          title={t("multiGridNode.clearTitle")}
          aria-label={t("multiGridNode.clearTitle")}
        >
          <Eraser className="h-3.5 w-3.5" />
          {t("multiGridNode.clearButton")}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed(true);
          }}
          className={toolbarButtonClassName}
          title={t("multiGridNode.collapseTitle")}
          aria-label={t("multiGridNode.collapseTitle")}
        >
          <Minimize2 className="h-3.5 w-3.5" />
          {t("multiGridNode.collapseButton")}
        </button>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div
          className={[
            "mx-auto grid max-h-full max-w-full overflow-hidden rounded-lg border bg-[var(--iw-panel-soft)] transition-[border-color,box-shadow]",
            extractPreview
              ? "border-sky-300/80 shadow-[0_0_0_2px_rgba(59,130,246,0.14),0_0_16px_rgba(59,130,246,0.22)]"
              : "border-[var(--iw-border)]",
          ].join(" ")}
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
            const isSelected = item?.assetId === node.selectedItemId;
            const isActiveDragItem = Boolean(item && activeDrag?.assetId === item.assetId);
            const isExtractDragItem = Boolean(item && extractPreview?.assetId === item.assetId);
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
                aria-label={item ? t('node.multiGridCellLabel', { index: cellIndex + 1 }) : t('node.multiGridEmptyCellLabel', { index: cellIndex + 1 })}
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
                  cancelItemDrag(event);
                  cancelItemSort(event);
                }}
                onWheel={item ? event => handleItemWheel(event, item) : undefined}
                className={[
                  "nodrag nopan group/cell relative min-h-0 overflow-hidden border border-[var(--iw-border)] bg-[var(--iw-panel)] outline-none transition",
                  item ? isEditingLayout ? "cursor-move" : "cursor-grab active:cursor-grabbing" : "cursor-default",
                  item ? "" : "bg-[linear-gradient(135deg,rgba(16,185,129,0.08),rgba(255,255,255,0.02))] hover:border-emerald-300/50 hover:bg-emerald-400/10",
                  isSortDragItem ? "opacity-70" : "",
                  isExtractDragItem ? "border-sky-300/70 bg-sky-50/70 opacity-45 ring-2 ring-sky-300/50" : "",
                  isSelected && !isExtractDragItem ? "z-10 ring-2 ring-emerald-400" : "",
                ].join(" ")}
                title={item ? item.prompt || item.model : t("multiGridNode.dragImage")}
              >
                {item ? (
                  (() => {
                    const renderedItem = displayItem ?? item;
                    const imageAspectRatio = imageAspectRatioByAssetId.get(item.assetId);
                    const frame = imageAspectRatio
                      ? boardMultiGridCoverFrame(imageAspectRatio, ratioValue)
                      : null;
                    return (
                      // eslint-disable-next-line @next/next/no-img-element -- Grid items use arbitrary local/data URLs and native dimensions for interactive cover transforms.
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
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--iw-muted)]/65 transition group-hover/cell:text-[var(--iw-tone-success-text)]">
                    <Plus className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">{t("multiGridNode.dragImage")}</span>
                  </span>
                )}
                {isExtractDragItem ? (
                  <div className="pointer-events-none absolute inset-2 rounded-md border border-dashed border-sky-300/70 bg-white/30 shadow-[inset_0_0_18px_rgba(59,130,246,0.16)]" />
                ) : null}
                {item && !isEditingLayout && !isActiveDragItem ? (
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
                        title={t("multiGridNode.zoomOut")}
                        aria-label={`${t("multiGridNode.zoomOut")} ${t("node.types.multiGrid")}`}
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
                        title={t("multiGridNode.zoomIn")}
                        aria-label={`${t("multiGridNode.zoomIn")} ${t("node.types.multiGrid")}`}
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
                        title={t("multiGridNode.reset")}
                        aria-label={`${t("multiGridNode.reset")} ${t("node.types.multiGrid")}`}
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
                        title={t("multiGridNode.stash")}
                        aria-label={`${t("multiGridNode.stash")} ${t("node.types.multiGrid")}`}
                      >
                        <Archive className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onUpdate({ items: removeItem(node, item.assetId), selectedItemId: undefined });
                        }}
                        onPointerDown={event => event.stopPropagation()}
                        className={destructiveCellToolButtonClassName}
                        title={t("multiGridNode.remove")}
                        aria-label={`${t("multiGridNode.remove")} ${t("node.types.multiGrid")}`}
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

      {typeof document !== "undefined" && extractPreview ? createPortal(
        (() => {
          const previewItem = node.items.find(item => item.assetId === extractPreview.assetId);
          if (!previewItem) return null;
          return (
            <div
              className="pointer-events-none fixed z-[9999] h-28 w-40 overflow-hidden rounded-lg border border-sky-200/90 bg-white/90 opacity-90 ring-1 ring-white/80 shadow-[0_18px_48px_rgba(37,99,235,0.32)]"
              style={{
                left: extractPreview.clientX + 18,
                top: extractPreview.clientY + 18,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- The transient drag preview renders arbitrary local/data URLs without an optimized image lifecycle. */}
              <img src={previewItem.url} alt="" className="h-full w-full object-contain" draggable={false} />
              <div className="absolute inset-0 border border-white/70" />
            </div>
          );
        })(),
        document.body,
      ) : null}

      <div className="nodrag flex min-h-[34px] shrink-0 items-center gap-2 border-t border-[var(--iw-border)] px-2 py-1">
        <span className="truncate text-[10px] font-semibold text-[var(--iw-muted)]">
          {isEditingLayout ? t("multiGridNode.editLayoutHint") : selectedItem ? selectedItem.prompt || selectedItem.model : t("multiGridNode.summary", { count: node.items.length })}
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
            className="ml-auto h-6 rounded-md border border-[var(--iw-border)] px-2 text-[10px] font-semibold text-[var(--iw-muted)] transition hover:border-[var(--iw-tone-success-border)] hover:text-[var(--iw-tone-success-text)]"
            title={t("multiGridNode.restoreStashed")}
          >
            {t("multiGridNode.stash")} {stashedItems.length}
          </button>
        ) : null}
      </div>
    </div>
  );
});

export default MultiGridBoardNode;
