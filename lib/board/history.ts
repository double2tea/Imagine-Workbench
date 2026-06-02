import type { BoardConfig, BoardDocument, BoardEdge, BoardNode, BoardViewport } from "@/lib/board/types";

export const BOARD_UNDO_LIMIT = 40;

export interface BoardHistorySnapshot {
  config: BoardConfig;
  edges: BoardEdge[];
  nodes: BoardNode[];
  viewport: BoardViewport;
}

export function cloneBoardHistory(board: BoardDocument): BoardHistorySnapshot {
  return {
    nodes: structuredClone(board.nodes),
    edges: structuredClone(board.edges),
    config: { ...board.config },
    viewport: { ...board.viewport },
  };
}