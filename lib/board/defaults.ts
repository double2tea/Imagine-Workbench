import type { BoardConfig, BoardDocument, BoardPoint, BoardSize, BoardViewport } from "@/lib/board/types";

export const DEFAULT_BOARD_ID = "main";

export const DEFAULT_BOARD_VIEWPORT: BoardViewport = {
  x: 0,
  y: 0,
  zoom: 1,
};

export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  showGrid: true,
  showMiniMap: true,
  snapToGrid: false,
};

export const DEFAULT_ASSET_NODE_SIZE: BoardSize = {
  width: 360,
  height: 280,
};

export const DEFAULT_AUDIO_ASSET_NODE_SIZE: BoardSize = {
  width: 340,
  height: 260,
};

export const DEFAULT_NOTE_NODE_SIZE: BoardSize = {
  width: 260,
  height: 180,
};

export const DEFAULT_PROMPT_NODE_SIZE: BoardSize = {
  width: 320,
  height: 220,
};

export const DEFAULT_REFERENCE_GROUP_NODE_SIZE: BoardSize = {
  width: 340,
  height: 260,
};

export const DEFAULT_GROUP_NODE_SIZE: BoardSize = {
  width: 640,
  height: 420,
};

export const DEFAULT_GENERATE_NODE_SIZE: BoardSize = {
  width: 420,
  height: 300,
};

export const DEFAULT_RUNNINGHUB_APP_NODE_SIZE: BoardSize = {
  width: 680,
  height: 520,
};

export const DEFAULT_AGENT_NODE_SIZE: BoardSize = {
  width: 320,
  height: 220,
};

export const DEFAULT_NODE_POSITION: BoardPoint = {
  x: 120,
  y: 120,
};

export function createEmptyBoard(
  id: string = DEFAULT_BOARD_ID,
  title: string = "Board",
  now: string = new Date().toISOString(),
): BoardDocument {
  return {
    id,
    title,
    config: DEFAULT_BOARD_CONFIG,
    nodes: [],
    edges: [],
    viewport: DEFAULT_BOARD_VIEWPORT,
    createdAt: now,
    updatedAt: now,
  };
}
