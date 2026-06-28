import type { BoardNode, BoardPoint, BoardSize } from "@/lib/board/types";

const RESULT_OUT_PORT_ID = "result-out";
const ASSET_IN_PORT_ID = "asset-in";

export function isResultSourceNode(
  node: BoardNode | undefined,
): node is Extract<BoardNode, { kind: "image-generate" | "video-generate" | "audio-operation" | "runninghub-app" }> {
  return node?.kind === "image-generate" || node?.kind === "video-generate" || node?.kind === "audio-operation" || node?.kind === "runninghub-app";
}

export function findResultNodeForSource(
  nodes: readonly BoardNode[],
  sourceNodeId: string,
): Extract<BoardNode, { kind: "result" }> | undefined {
  return nodes.find(
    (node): node is Extract<BoardNode, { kind: "result" }> =>
      node.kind === "result" && node.sourceNodeId === sourceNodeId,
  );
}

export function findResultNodeForSourceStack(
  nodes: readonly BoardNode[],
  sourceNodeId: string,
  resultStackKey: string,
): Extract<BoardNode, { kind: "result" }> | undefined {
  return nodes.find(
    (node): node is Extract<BoardNode, { kind: "result" }> =>
      node.kind === "result" && node.sourceNodeId === sourceNodeId && node.resultStackKey === resultStackKey,
  );
}

export function findConnectedResultNodeForSourceStack(
  nodes: readonly BoardNode[],
  edges: readonly { from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string } }[],
  sourceNodeId: string,
  resultStackKey: string,
): Extract<BoardNode, { kind: "result" }> | undefined {
  return nodes.find(
    (node): node is Extract<BoardNode, { kind: "result" }> =>
      node.kind === "result" &&
      node.sourceNodeId === sourceNodeId &&
      node.resultStackKey === resultStackKey &&
      edges.some(edge =>
        edge.from.nodeId === sourceNodeId &&
        edge.from.portId === RESULT_OUT_PORT_ID &&
        edge.to.nodeId === node.id &&
        edge.to.portId === ASSET_IN_PORT_ID
      ),
  );
}

export function resultNodeIdsOwnedBySource(nodes: readonly BoardNode[], sourceNodeId: string): string[] {
  return nodes
    .filter(
      (node): node is Extract<BoardNode, { kind: "result" }> =>
        node.kind === "result" && node.sourceNodeId === sourceNodeId,
    )
    .map(node => node.id);
}

export function resolveGenerationEventResultStackKey(
  sourceResultStackKey: string | undefined,
  eventResultStackKey: string | undefined,
): string | undefined {
  if (eventResultStackKey) return eventResultStackKey;
  return sourceResultStackKey ? undefined : "";
}

export function selectedNodeIdsForContextMenu(currentNodeIds: readonly string[], contextNodeId: string): string[] {
  if (currentNodeIds.length > 1 && currentNodeIds.includes(contextNodeId)) return [...currentNodeIds];
  return [contextNodeId];
}

export function resultNodeDefaultPosition(sourceNode: { position: BoardPoint; size: BoardSize }): BoardPoint {
  return {
    x: sourceNode.position.x + sourceNode.size.width + 48,
    y: sourceNode.position.y,
  };
}

export function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
