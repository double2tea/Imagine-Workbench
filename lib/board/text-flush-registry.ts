import type { BoardEdge, BoardNode } from "@/lib/board/types";

interface BoardTextCommitHandle {
  flush: () => void;
  getValue: () => string;
}

const commitRegistry = new Map<string, BoardTextCommitHandle>();

export function registerBoardTextCommit(nodeId: string, handle: BoardTextCommitHandle): void {
  commitRegistry.set(nodeId, handle);
}

export function unregisterBoardTextCommit(nodeId: string): void {
  commitRegistry.delete(nodeId);
}

export function getBoardTextDraft(nodeId: string): string | undefined {
  return commitRegistry.get(nodeId)?.getValue();
}

export function flushBoardText(nodeIds: string[]): void {
  for (const nodeId of nodeIds) {
    commitRegistry.get(nodeId)?.flush();
  }
}

export function flushAllBoardText(): void {
  for (const handle of commitRegistry.values()) {
    handle.flush();
  }
}

export function flushBoardTextForGenerateNode(
  nodes: BoardNode[],
  edges: BoardEdge[],
  generateNodeId: string,
): void {
  const nodeIds = new Set<string>([generateNodeId]);
  const promptEdge = edges.find(edge => edge.to.nodeId === generateNodeId && edge.to.portId === "prompt-in");
  if (promptEdge) nodeIds.add(promptEdge.from.nodeId);
  flushBoardText([...nodeIds]);
}