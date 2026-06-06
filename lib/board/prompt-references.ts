import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { BoardEdge, BoardNode } from "@/lib/board/types";
import type { MediaReferenceType } from "@/lib/media-references";
import { getVideoModelCapabilities } from "@/lib/providers/model-catalog";

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

export interface BoardPromptReferenceGraphIndex {
  assetReferences: readonly BoardPromptReference[];
  incomingEdgesByTargetNode: ReadonlyMap<string, readonly BoardEdge[]>;
  nodeReferences: readonly ReferenceImageRef[];
  nodeById: ReadonlyMap<string, BoardNode>;
  outgoingEdgesBySourceNode: ReadonlyMap<string, readonly BoardEdge[]>;
  referenceCandidatesByGenerateNode: ReadonlyMap<string, readonly ReferenceImageRef[]>;
  targetGenerateIdsByPromptNode: ReadonlyMap<string, readonly string[]>;
}

const GALLERY_REFERENCE_LIMIT = 24;

export function buildBoardPromptReferenceGraphIndex(
  nodes: BoardNode[],
  edges: BoardEdge[],
): BoardPromptReferenceGraphIndex {
  const nodeById = new Map<string, BoardNode>();
  const incomingEdgesByTargetNode = new Map<string, BoardEdge[]>();
  const outgoingEdgesBySourceNode = new Map<string, BoardEdge[]>();
  const assetReferences: BoardPromptReference[] = [];
  const nodeReferences: ReferenceImageRef[] = [];
  const referenceCandidatesByGenerateNode = new Map<string, ReferenceImageRef[]>();
  const targetGenerateIdsByPromptNode = new Map<string, string[]>();

  for (const node of nodes) {
    nodeById.set(node.id, node);
    nodeReferences.push(...boardNodeReferences(node));
    if (node.kind === "asset") {
      assetReferences.push({
        id: node.asset.assetId,
        role: "general",
        type: node.asset.type,
        url: node.asset.url,
        sourceLabel: "画板",
      });
    }
  }

  for (const edge of edges) {
    const incoming = incomingEdgesByTargetNode.get(edge.to.nodeId) ?? [];
    incoming.push(edge);
    incomingEdgesByTargetNode.set(edge.to.nodeId, incoming);

    const outgoing = outgoingEdgesBySourceNode.get(edge.from.nodeId) ?? [];
    outgoing.push(edge);
    outgoingEdgesBySourceNode.set(edge.from.nodeId, outgoing);

    if (edge.to.portId === "reference-in") {
      const references = boardNodeReferences(nodeById.get(edge.from.nodeId));
      if (references.length > 0) {
        const targetReferences = referenceCandidatesByGenerateNode.get(edge.to.nodeId) ?? [];
        targetReferences.push(...references);
        referenceCandidatesByGenerateNode.set(edge.to.nodeId, targetReferences);
      }
    }

    if (edge.to.portId === "prompt-in") {
      const targetGenerateIds = targetGenerateIdsByPromptNode.get(edge.from.nodeId) ?? [];
      if (!targetGenerateIds.includes(edge.to.nodeId)) {
        targetGenerateIds.push(edge.to.nodeId);
        targetGenerateIdsByPromptNode.set(edge.from.nodeId, targetGenerateIds);
      }
    }
  }

  return {
    assetReferences,
    incomingEdgesByTargetNode,
    nodeReferences,
    nodeById,
    outgoingEdgesBySourceNode,
    referenceCandidatesByGenerateNode,
    targetGenerateIdsByPromptNode,
  };
}

function generateNodeReferenceTypes(node: BoardNode | undefined): ReadonlySet<MediaReferenceType> | null {
  if (node?.kind === "image-generate") return new Set<MediaReferenceType>(["image"]);
  if (node?.kind === "video-generate") return new Set(getVideoModelCapabilities(node.model).referenceMediaTypes);
  if (node?.kind === "runninghub-app") return new Set<MediaReferenceType>(["image", "video", "audio"]);
  return null;
}

function referenceMatchesTypes(
  reference: Pick<ReferenceImageRef, "type">,
  acceptedTypes: ReadonlySet<MediaReferenceType> | null,
): boolean {
  return !acceptedTypes || acceptedTypes.has(reference.type ?? "image");
}

function boardNodeReferences(node: BoardNode | undefined): ReferenceImageRef[] {
  if (node?.kind === "asset") {
    return [{ id: node.asset.assetId, role: "general", type: node.asset.type, url: node.asset.url }];
  }
  if (node?.kind === "reference-group") {
    return node.references.map(reference => ({ id: reference.assetId, role: reference.role, type: reference.type, url: reference.url }));
  }
  return [];
}

function uniqueReferences<T extends ReferenceImageRef>(references: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const reference of references) {
    const key = `${reference.id}:${reference.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(reference);
  }
  return unique;
}

export function generateReferenceCandidates(nodes: BoardNode[], edges: BoardEdge[], generateNodeId: string): ReferenceImageRef[] {
  const index = buildBoardPromptReferenceGraphIndex(nodes, edges);
  return generateReferenceCandidatesFromIndex(index, generateNodeId);
}

function generateReferenceCandidatesFromIndex(
  index: BoardPromptReferenceGraphIndex,
  generateNodeId: string,
): ReferenceImageRef[] {
  return uniqueReferences(index.referenceCandidatesByGenerateNode.get(generateNodeId) ?? []);
}

function promptReferenceCandidates(
  index: BoardPromptReferenceGraphIndex,
  promptNodeId: string,
): ReferenceImageRef[] {
  const targetGenerateIds = index.targetGenerateIdsByPromptNode.get(promptNodeId) ?? [];
  if (targetGenerateIds.length === 1) return generateReferenceCandidatesFromIndex(index, targetGenerateIds[0]);
  if (targetGenerateIds.length > 1) {
    return uniqueReferences(
      targetGenerateIds.flatMap(generateNodeId => generateReferenceCandidatesFromIndex(index, generateNodeId)),
    );
  }
  return uniqueReferences(index.nodeReferences);
}

function boardMediaAssetReferences(
  index: BoardPromptReferenceGraphIndex,
  acceptedTypes: ReadonlySet<MediaReferenceType> | null,
): BoardPromptReference[] {
  return index.assetReferences.filter(reference => referenceMatchesTypes(reference, acceptedTypes));
}

function galleryReferences(
  items: BoardGalleryReferenceItem[] | undefined,
  acceptedTypes: ReadonlySet<MediaReferenceType> | null,
): BoardPromptReference[] {
  if (!items?.length) return [];
  return items
    .filter(item => (item.type === "image" || item.type === "video" || item.type === "audio") && item.status === "complete" && item.url.trim().length > 0)
    .filter(item => referenceMatchesTypes({ type: item.type as MediaReferenceType }, acceptedTypes))
    .slice(0, GALLERY_REFERENCE_LIMIT)
    .map(item => ({
      id: item.id,
      role: "general" as const,
      type: item.type === "video" || item.type === "audio" ? item.type : "image",
      url: item.url,
      sourceLabel: "库",
    }));
}

function acceptedTypesForFocus(
  index: BoardPromptReferenceGraphIndex,
  focus: { kind: "prompt"; nodeId: string } | { kind: "generate"; nodeId: string },
): ReadonlySet<MediaReferenceType> | null {
  if (focus.kind === "generate") {
    return generateNodeReferenceTypes(index.nodeById.get(focus.nodeId));
  }
  const targetGenerateIds = index.targetGenerateIdsByPromptNode.get(focus.nodeId) ?? [];
  if (targetGenerateIds.length !== 1) return null;
  return generateNodeReferenceTypes(index.nodeById.get(targetGenerateIds[0]));
}

export function buildBoardPromptReferences(input: {
  nodes: BoardNode[];
  edges: BoardEdge[];
  focus: { kind: "prompt"; nodeId: string } | { kind: "generate"; nodeId: string };
  galleryItems?: BoardGalleryReferenceItem[];
  index?: BoardPromptReferenceGraphIndex;
}): BoardPromptReference[] {
  const index = input.index ?? buildBoardPromptReferenceGraphIndex(input.nodes, input.edges);
  const wiredRaw = input.focus.kind === "prompt"
    ? promptReferenceCandidates(index, input.focus.nodeId)
    : generateReferenceCandidatesFromIndex(index, input.focus.nodeId);
  const acceptedTypes = acceptedTypesForFocus(index, input.focus);

  const wired: BoardPromptReference[] = wiredRaw
    .filter(reference => referenceMatchesTypes(reference, acceptedTypes))
    .map(reference => ({ ...reference, sourceLabel: "连线" }));
  const seen = new Set(wired.map(reference => `${reference.id}:${reference.url}`));

  const board = boardMediaAssetReferences(index, acceptedTypes).filter(reference => {
    const key = `${reference.id}:${reference.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const library = galleryReferences(input.galleryItems, acceptedTypes).filter(reference => {
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
  index = buildBoardPromptReferenceGraphIndex(nodes, edges),
): string | null {
  const resultEdge = (index.incomingEdgesByTargetNode.get(assetNodeId) ?? [])
    .find(edge => edge.from.portId === "result-out");
  if (!resultEdge) return null;
  const sourceNode = index.nodeById.get(resultEdge.from.nodeId);
  if (sourceNode?.kind !== "image-generate" && sourceNode?.kind !== "video-generate" && sourceNode?.kind !== "runninghub-app") return null;
  const references = generateReferenceCandidatesFromIndex(index, sourceNode.id);
  return references[0]?.url ?? null;
}
