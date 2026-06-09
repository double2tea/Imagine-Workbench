import type { BoardMultiGridAspectRatio, BoardMultiGridItem, BoardMultiGridSize } from "@/lib/board/types";

export const BOARD_MULTI_GRID_ASPECT_RATIOS: readonly BoardMultiGridAspectRatio[] = ["1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2"];
export const BOARD_MULTI_GRID_SIZES: readonly BoardMultiGridSize[] = [2, 3, 4, 5];

export const DEFAULT_BOARD_MULTI_GRID_ASPECT_RATIO: BoardMultiGridAspectRatio = "16:9";
export const DEFAULT_BOARD_MULTI_GRID_SIZE: BoardMultiGridSize = 3;

export function isBoardMultiGridAspectRatio(value: string): value is BoardMultiGridAspectRatio {
  return BOARD_MULTI_GRID_ASPECT_RATIOS.includes(value as BoardMultiGridAspectRatio);
}

export function isBoardMultiGridSize(value: number): value is BoardMultiGridSize {
  return BOARD_MULTI_GRID_SIZES.includes(value as BoardMultiGridSize);
}

export function boardMultiGridCellCount(gridSize: BoardMultiGridSize): number {
  return gridSize * gridSize;
}

export function boardMultiGridCoverFrame(
  imageAspectRatio: number,
  cellAspectRatio: number,
): { heightPercent: number; widthPercent: number } {
  if (!Number.isFinite(imageAspectRatio) || imageAspectRatio <= 0) {
    throw new Error("图片比例无效");
  }
  if (!Number.isFinite(cellAspectRatio) || cellAspectRatio <= 0) {
    throw new Error("多宫格单元比例无效");
  }
  return imageAspectRatio >= cellAspectRatio
    ? { widthPercent: (imageAspectRatio / cellAspectRatio) * 100, heightPercent: 100 }
    : { widthPercent: 100, heightPercent: (cellAspectRatio / imageAspectRatio) * 100 };
}

export function normalizeBoardMultiGridItems(items: BoardMultiGridItem[], gridSize: BoardMultiGridSize): BoardMultiGridItem[] {
  const visibleCellCount = boardMultiGridCellCount(gridSize);
  const occupiedCells = new Set<number>();
  return items.map(item => {
    const cellIndex = typeof item.cellIndex === "number" && Number.isInteger(item.cellIndex)
      ? item.cellIndex
      : undefined;
    if (cellIndex === undefined || cellIndex < 0 || cellIndex >= visibleCellCount || occupiedCells.has(cellIndex)) {
      return { ...item, cellIndex: undefined };
    }
    occupiedCells.add(cellIndex);
    return { ...item, cellIndex };
  });
}

export function firstEmptyBoardMultiGridCell(items: readonly BoardMultiGridItem[], gridSize: BoardMultiGridSize): number | undefined {
  const occupiedCells = new Set(
    items
      .map(item => item.cellIndex)
      .filter((cellIndex): cellIndex is number => typeof cellIndex === "number"),
  );
  for (let index = 0; index < boardMultiGridCellCount(gridSize); index += 1) {
    if (!occupiedCells.has(index)) return index;
  }
  return undefined;
}
