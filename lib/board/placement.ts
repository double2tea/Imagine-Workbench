import type { BoardPoint, BoardSize } from "@/lib/board/types";

interface BoardPlacementNode {
  position: BoardPoint;
  size: BoardSize;
}

const BOARD_PLACEMENT_GAP = 48;
const BOARD_PLACEMENT_SEARCH_LIMIT = 240;

function overlaps(leftPosition: BoardPoint, leftSize: BoardSize, right: BoardPlacementNode): boolean {
  return (
    leftPosition.x < right.position.x + right.size.width + BOARD_PLACEMENT_GAP &&
    leftPosition.x + leftSize.width + BOARD_PLACEMENT_GAP > right.position.x &&
    leftPosition.y < right.position.y + right.size.height + BOARD_PLACEMENT_GAP &&
    leftPosition.y + leftSize.height + BOARD_PLACEMENT_GAP > right.position.y
  );
}

function rowOffset(index: number): number {
  if (index === 0) return 0;
  const distance = Math.ceil(index / 2);
  return index % 2 === 1 ? distance : -distance;
}

export function findAvailableBoardNodePosition(
  nodes: BoardPlacementNode[],
  preferredPosition: BoardPoint,
  size: BoardSize,
): BoardPoint {
  const columnStep = size.width + BOARD_PLACEMENT_GAP;
  const rowStep = size.height + BOARD_PLACEMENT_GAP;
  for (let index = 0; index < BOARD_PLACEMENT_SEARCH_LIMIT; index += 1) {
    const column = Math.floor(index / 9);
    const row = rowOffset(index % 9);
    const position = {
      x: Math.round(preferredPosition.x + column * columnStep),
      y: Math.round(preferredPosition.y + row * rowStep),
    };
    if (!nodes.some(node => overlaps(position, size, node))) return position;
  }
  return {
    x: Math.round(preferredPosition.x + columnStep),
    y: Math.round(preferredPosition.y + rowStep),
  };
}
