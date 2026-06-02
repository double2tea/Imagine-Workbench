import type { BoardEdge, BoardNode, BoardReferenceGroupItem } from "@/lib/board/types";

function serializeReferenceGroupItem(item: BoardReferenceGroupItem): string {
  return `${item.assetId}:${item.role}:${item.url}`;
}

function serializeNodeContent(node: BoardNode): string {
  switch (node.kind) {
    case "asset":
      return `asset|${node.id}|${node.asset.assetId}|${node.asset.type}|${node.asset.url}`;
    case "prompt":
      return `prompt|${node.id}|${node.prompt}`;
    case "reference-group":
      return `refgroup|${node.id}|${node.references.map(serializeReferenceGroupItem).join(",")}`;
    case "image-generate":
      return [
        "image-gen",
        node.id,
        node.model,
        node.status,
        node.prompt,
        node.aspectRatio,
        node.imageResolution,
        node.customImageResolution,
        node.variantCount,
        node.resultAssetId ?? "",
      ].join("|");
    case "video-generate":
      return [
        "video-gen",
        node.id,
        node.model,
        node.status,
        node.prompt,
        node.aspectRatio,
        node.variantCount,
        node.resultAssetId ?? "",
      ].join("|");
    case "agent":
      return `agent|${node.id}|${node.instruction}`;
    case "note":
      return `note|${node.id}|${node.body}`;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function serializeEdge(edge: BoardEdge): string {
  return `${edge.id}|${edge.kind}|${edge.from.nodeId}|${edge.from.portId}|${edge.to.nodeId}|${edge.to.portId}`;
}

/** Stable key for graph-derived node data; ignores position, size, and viewport. */
export function buildBoardGraphContentKey(nodes: BoardNode[], edges: BoardEdge[]): string {
  const nodePart = [...nodes]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(serializeNodeContent)
    .join("\n");
  const edgePart = [...edges]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(serializeEdge)
    .join("\n");
  return `${nodePart}\n---\n${edgePart}`;
}

export function buildGalleryReferenceFingerprint(
  items: Array<{ id: string; status: string; type: string; url: string }>,
): string {
  return items
    .filter(item => item.type === "image")
    .map(item => `${item.id}\t${item.status}\t${item.url}`)
    .sort()
    .join("\n");
}

export function buildGalleryTaskFingerprint(
  items: Array<{ id: string; progress: number; sourceBoardNodeId?: string; status: string }>,
): string {
  return items
    .filter(item => item.sourceBoardNodeId && (item.status === "pending" || item.status === "processing"))
    .map(item => `${item.sourceBoardNodeId}\t${item.id}\t${item.status}\t${item.progress}`)
    .sort()
    .join("\n");
}