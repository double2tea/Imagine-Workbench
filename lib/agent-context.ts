import type { BoardEdgeKind, BoardNodeKind, BoardPortRef } from "@/lib/board";

export type AgentSurface = "workbench" | "board";

export interface AgentBoardNodeSummary {
  id: string;
  kind: BoardNodeKind;
  title: string;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  status?: string;
  resultAssetId?: string;
  assetId?: string;
  assetType?: string;
  body?: string;
  instruction?: string;
}

export interface AgentBoardEdgeSummary {
  id: string;
  kind: BoardEdgeKind;
  from: BoardPortRef;
  to: BoardPortRef;
}

export interface AgentBoardContext {
  boardId: string;
  title: string;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  selectedNodes: AgentBoardNodeSummary[];
  selectedAssetReferenceCount: number;
  nodes: AgentBoardNodeSummary[];
  edges: AgentBoardEdgeSummary[];
}

export interface AgentBoardContextSnapshot {
  boardTitle: string;
  nodeCount: number;
  assetCount: number;
}
