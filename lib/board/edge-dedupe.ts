import type { BoardEdge } from "./types";

function edgeEndpointKey(edge: BoardEdge): string {
  return [
    edge.from.nodeId,
    edge.from.portId,
    edge.from.portKind,
    edge.to.nodeId,
    edge.to.portId,
    edge.to.portKind,
  ].join("\t");
}

export function dedupeBoardEdgesByEndpoints(edges: BoardEdge[]): BoardEdge[] {
  const seenEndpoints = new Set<string>();
  const dedupedEdges: BoardEdge[] = [];
  for (const edge of edges) {
    const endpointKey = edgeEndpointKey(edge);
    if (seenEndpoints.has(endpointKey)) continue;
    seenEndpoints.add(endpointKey);
    dedupedEdges.push(edge);
  }
  return dedupedEdges;
}
