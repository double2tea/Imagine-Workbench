import type { BoardPoint, BoardSize } from "@/lib/board/types";

interface BoardPlacementNode {
  position: BoardPoint;
  size: BoardSize;
}

const BOARD_PLACEMENT_GAP = 48;
const BOARD_PLACEMENT_SEARCH_RADIUS = 24;
const OFFSETS_CACHE = new Map<number, Array<[number, number]>>();

function overlaps(leftPosition: BoardPoint, leftSize: BoardSize, right: BoardPlacementNode): boolean {
  return (
    leftPosition.x < right.position.x + right.size.width + BOARD_PLACEMENT_GAP &&
    leftPosition.x + leftSize.width + BOARD_PLACEMENT_GAP > right.position.x &&
    leftPosition.y < right.position.y + right.size.height + BOARD_PLACEMENT_GAP &&
    leftPosition.y + leftSize.height + BOARD_PLACEMENT_GAP > right.position.y
  );
}

function placementOffsets(radius: number): Array<[number, number]> {
  const cached = OFFSETS_CACHE.get(radius);
  if (cached) return cached;
  if (radius === 0) {
    const result: Array<[number, number]> = [[0, 0]];
    OFFSETS_CACHE.set(radius, result);
    return result;
  }
  const offsets: Array<[number, number]> = [];
  for (let x = -radius; x <= radius; x += 1) {
    offsets.push([x, -radius], [x, radius]);
  }
  for (let y = -radius + 1; y < radius; y += 1) {
    offsets.push([-radius, y], [radius, y]);
  }
  const result = offsets.sort((left, right) => {
    const leftDistance = Math.abs(left[0]) + Math.abs(left[1]);
    const rightDistance = Math.abs(right[0]) + Math.abs(right[1]);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    const leftSide = left[0] < 0 ? 1 : 0;
    const rightSide = right[0] < 0 ? 1 : 0;
    if (leftSide !== rightSide) return leftSide - rightSide;
    return Math.abs(left[1]) - Math.abs(right[1]);
  });
  OFFSETS_CACHE.set(radius, result);
  return result;
}

export function findAvailableBoardNodePosition(
  nodes: BoardPlacementNode[],
  preferredPosition: BoardPoint,
  size: BoardSize,
): BoardPoint {
  const columnStep = size.width + BOARD_PLACEMENT_GAP;
  const rowStep = size.height + BOARD_PLACEMENT_GAP;
  for (let radius = 0; radius <= BOARD_PLACEMENT_SEARCH_RADIUS; radius += 1) {
    for (const [column, row] of placementOffsets(radius)) {
      const position = {
        x: Math.round(preferredPosition.x + column * columnStep),
        y: Math.round(preferredPosition.y + row * rowStep),
      };
      if (!nodes.some(node => overlaps(position, size, node))) return position;
    }
  }
  return {
    x: Math.round(preferredPosition.x + columnStep),
    y: Math.round(preferredPosition.y + rowStep),
  };
}
