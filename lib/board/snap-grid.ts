import type { BoardPoint } from "@/lib/board/types";

/** Matches React Flow background dot grid in BoardWorkspace. */
export const BOARD_SNAP_GRID: [number, number] = [24, 24];

export function snapBoardPoint(point: BoardPoint, enabled: boolean): BoardPoint {
  if (!enabled) return point;
  const [gridX, gridY] = BOARD_SNAP_GRID;
  return {
    x: gridX * Math.round(point.x / gridX),
    y: gridY * Math.round(point.y / gridY),
  };
}