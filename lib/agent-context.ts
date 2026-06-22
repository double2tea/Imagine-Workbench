import type { BoardEdgeKind, BoardNodeKind, BoardPortRef } from "@/lib/board";

export type AgentSurface = "workbench" | "board";

export interface AgentBoardNodeParams {
  asrLanguage?: string;
  audioFormat?: string;
  audioMode?: string;
  audioStylePrompt?: string;
  bindingCount?: number;
  customImageResolution?: string;
  errorMessage?: string;
  imageQuality?: string;
  imageResolution?: string;
  outputType?: string;
  resultAssetId?: string;
  resultAssetIds?: string[];
  resultStackKey?: string;
  targetId?: string;
  targetType?: string;
  thinkingLevel?: string;
  variantCount?: number;
  videoDuration?: string;
  videoPreset?: string;
  videoReferenceMode?: string;
  videoResolution?: string;
  voiceCloneConsentAccepted?: boolean;
  voiceProfileId?: string;
}

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
  params?: AgentBoardNodeParams;
}

export interface AgentBoardNodeDetail extends AgentBoardNodeSummary {
  details?: Record<string, unknown>;
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
  selectedNodeDetails: AgentBoardNodeDetail[];
  selectedAssetReferenceCount: number;
  nodes: AgentBoardNodeSummary[];
  edges: AgentBoardEdgeSummary[];
}

export interface AgentBoardContextSnapshot {
  boardTitle: string;
  nodeCount: number;
  assetCount: number;
}
