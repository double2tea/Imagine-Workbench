import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { BoardEdge, BoardNode } from "@/lib/board/types";

export type BoardPromptReferenceSource = "连线" | "画板" | "库";

export const BOARD_PROMPT_REFERENCE_GROUP_ORDER: readonly BoardPromptReferenceSource[] = [
  "连线",
  "画板",
  "库",
];

export interface BoardPromptReference extends ReferenceImageRef {
  sourceLabel?: BoardPromptReferenceSource | "画廊";
}

export function resolveBoardPromptReferenceGroup(
  reference: BoardPromptReference | ReferenceImageRef,
): BoardPromptReferenceSource | null {
  if (!("sourceLabel" in reference) || !reference.sourceLabel) return null;
  if (reference.sourceLabel === "画廊") return "库";
  if (reference.sourceLabel === "连线" || reference.sourceLabel === "画板" || reference.sourceLabel === "库") {
    return reference.sourceLabel;
  }
  return null;
}

export interface BoardGalleryReferenceItem {
  id: string;
  status: string;
  type: string;
  url: string;
}

const GALLERY_REFERENCE_LIMIT = 24;

function boardNodeReferences(node: BoardNode | undefined): ReferenceImageRef[] {
  if (node?.kind === "asset" && node.asset.type === "image") {
    return [{ id: node.asset.assetId, role: "general", url: node.asset.url }];
  }
  if (node?.kind === "reference-group") {
    return node.references.map(reference => ({ id: reference.assetId, role: reference.role, url: reference.url }));
  }
  return [];
}

function uniqueReferences(references: BoardPromptReference[]): BoardPromptReference[] {
  const seen = new Set<string>();
  const unique: BoardPromptReference[] = [];
  for (const reference of references) {
    const key = `${reference.id}:${reference.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(reference);
  }
  return unique;
}

export function generateReferenceCandidates(nodes: BoardNode[], edges: BoardEdge[], generateNodeId: string): ReferenceImageRef[] {
  return uniqueReferences(
    edges
      .filter(edge => edge.to.nodeId === generateNodeId && edge.to.portId === "reference-in")
      .flatMap(edge => boardNodeReferences(nodes.find(node => node.id === edge.from.nodeId))),
  );
}

function promptReferenceCandidates(nodes: BoardNode[], edges: BoardEdge[], promptNodeId: string): ReferenceImageRef[] {
  const targetGenerateIds = Array.from(new Set(
    edges
      .filter(edge => edge.from.nodeId === promptNodeId && edge.to.portId === "prompt-in")
      .map(edge => edge.to.nodeId),
  ));
  if (targetGenerateIds.length === 1) return generateReferenceCandidates(nodes, edges, targetGenerateIds[0]);
  if (targetGenerateIds.length > 1) {
    return uniqueReferences(
      targetGenerateIds.flatMap(generateNodeId => generateReferenceCandidates(nodes, edges, generateNodeId)),
    );
  }
  return uniqueReferences(nodes.flatMap(node => boardNodeReferences(node)));
}

function boardImageAssetReferences(nodes: BoardNode[]): BoardPromptReference[] {
  return nodes
    .filter((node): node is Extract<BoardNode, { kind: "asset" }> => node.kind === "asset" && node.asset.type === "image")
    .map(node => ({
      id: node.asset.assetId,
      role: "general" as const,
      url: node.asset.url,
      sourceLabel: "画板",
    }));
}

function galleryReferences(items: BoardGalleryReferenceItem[] | undefined): BoardPromptReference[] {
  if (!items?.length) return [];
  return items
    .filter(item => item.type === "image" && item.status === "complete" && item.url.trim().length > 0)
    .slice(0, GALLERY_REFERENCE_LIMIT)
    .map(item => ({
      id: item.id,
      role: "general" as const,
      url: item.url,
      sourceLabel: "库",
    }));
}

export function buildBoardPromptReferences(input: {
  nodes: BoardNode[];
  edges: BoardEdge[];
  focus: { kind: "prompt"; nodeId: string } | { kind: "generate"; nodeId: string };
  galleryItems?: BoardGalleryReferenceItem[];
}): BoardPromptReference[] {
  const wiredRaw = input.focus.kind === "prompt"
    ? promptReferenceCandidates(input.nodes, input.edges, input.focus.nodeId)
    : generateReferenceCandidates(input.nodes, input.edges, input.focus.nodeId);

  const wired: BoardPromptReference[] = wiredRaw.map(reference => ({ ...reference, sourceLabel: "连线" }));
  const seen = new Set(wired.map(reference => `${reference.id}:${reference.url}`));

  const board = boardImageAssetReferences(input.nodes).filter(reference => {
    const key = `${reference.id}:${reference.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const library = galleryReferences(input.galleryItems).filter(reference => {
    const key = `${reference.id}:${reference.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return [...wired, ...board, ...library];
}

export function assetCompareReferenceUrl(
  assetNodeId: string,
  nodes: BoardNode[],
  edges: BoardEdge[],
): string | null {
  const resultEdge = edges.find(edge => edge.to.nodeId === assetNodeId && edge.from.portId === "result-out");
  if (!resultEdge) return null;
  const sourceNode = nodes.find(node => node.id === resultEdge.from.nodeId);
  if (sourceNode?.kind !== "image-generate" && sourceNode?.kind !== "video-generate") return null;
  const references = generateReferenceCandidates(nodes, edges, sourceNode.id);
  return references[0]?.url ?? null;
}

export function isGenerateEdgeProcessing(edge: BoardEdge, nodes: BoardNode[]): boolean {
  const source = nodes.find(node => node.id === edge.from.nodeId);
  if (source?.kind !== "image-generate" && source?.kind !== "video-generate") return false;
  return source.status === "processing";
}
