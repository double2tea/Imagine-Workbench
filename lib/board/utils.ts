import type { BoardNode, BoardPoint, BoardSize } from "@/lib/board/types";

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

export function resultNodeIdsOwnedBySource(nodes: readonly BoardNode[], sourceNodeId: string): string[] {
  return nodes
    .filter(
      (node): node is Extract<BoardNode, { kind: "result" }> =>
        node.kind === "result" && node.sourceNodeId === sourceNodeId,
    )
    .map(node => node.id);
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
