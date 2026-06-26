import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { BoardEdge, BoardNode } from "@/lib/board/types";
import type { MediaReferenceType } from "@/lib/media-references";
import { getAudioModelCapabilities, getVideoModelCapabilities } from "@/lib/providers/model-catalog";

export type BoardPromptReferenceSource = "connection" | "board" | "library";
export type BoardPromptReferenceSourceLabel = BoardPromptReferenceSource | "画廊" | "画板" | "连线" | "库";

export const BOARD_PROMPT_REFERENCE_GROUP_ORDER: readonly BoardPromptReferenceSource[] = [
  "connection",
  "board",
  "library",
];

export interface BoardPromptReference extends ReferenceImageRef {
  sourceLabel?: BoardPromptReferenceSourceLabel;
}

const BOARD_PROMPT_REFERENCE_SOURCE_ALIASES: Record<string, BoardPromptReferenceSource> = {
  连线: "connection",
  画板: "board",
  库: "library",
  画廊: "library",
};

function normalizeBoardPromptReferenceSource(value?: string): BoardPromptReferenceSource | null {
  if (!value) return null;
  if (value === "connection" || value === "board" || value === "library") return value;
  return BOARD_PROMPT_REFERENCE_SOURCE_ALIASES[value] ?? null;
}

export function resolveBoardPromptReferenceGroup(
  reference: BoardPromptReference | ReferenceImageRef,
): BoardPromptReferenceSource | null {
  if (!("sourceLabel" in reference) || typeof reference.sourceLabel !== "string") return null;
  const sourceLabel = normalizeBoardPromptReferenceSource(reference.sourceLabel);
  if (!sourceLabel) return null;
  return sourceLabel;
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
  referenceCandidatesByPromptNode: ReadonlyMap<string, readonly ReferenceImageRef[]>;
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
  const referenceCandidatesByPromptNode = new Map<string, ReferenceImageRef[]>();
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
        sourceLabel: "board",
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

    if (edge.to.portId === "asset-in" && nodeById.get(edge.to.nodeId)?.kind === "prompt") {
      const references = boardNodeReferences(nodeById.get(edge.from.nodeId));
      if (references.length > 0) {
        const targetReferences = referenceCandidatesByPromptNode.get(edge.to.nodeId) ?? [];
        targetReferences.push(...references);
        referenceCandidatesByPromptNode.set(edge.to.nodeId, targetReferences);
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
    referenceCandidatesByPromptNode,
    targetGenerateIdsByPromptNode,
  };
}

function generateNodeReferenceTypes(node: BoardNode | undefined): ReadonlySet<MediaReferenceType> | null {
  if (node?.kind === "image-generate") return new Set<MediaReferenceType>(["image"]);
  if (node?.kind === "video-generate") return new Set(getVideoModelCapabilities(node.model).referenceMediaTypes);
  if (node?.kind === "audio-operation") return new Set(getAudioModelCapabilities(node.model).referenceMediaTypes);
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
  if (node?.kind === "result") {
    return [{ id: node.activeAssetId, role: "general", type: node.asset.type, url: node.asset.url }];
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

export function promptInputReferenceCandidates(nodes: BoardNode[], edges: BoardEdge[], promptNodeId: string): ReferenceImageRef[] {
  const index = buildBoardPromptReferenceGraphIndex(nodes, edges);
  return uniqueReferences(index.referenceCandidatesByPromptNode.get(promptNodeId) ?? []);
}

function generateReferenceCandidatesFromIndex(
  index: BoardPromptReferenceGraphIndex,
  generateNodeId: string,
): ReferenceImageRef[] {
  const promptEdge = (index.incomingEdgesByTargetNode.get(generateNodeId) ?? [])
    .find(edge => edge.to.portId === "prompt-in");
  const promptNode = promptEdge ? index.nodeById.get(promptEdge.from.nodeId) : undefined;
  const promptReferences = promptNode?.kind === "prompt"
    ? index.referenceCandidatesByPromptNode.get(promptNode.id) ?? []
    : [];
  const directReferences = index.referenceCandidatesByGenerateNode.get(generateNodeId) ?? [];
  return uniqueReferences([...promptReferences, ...directReferences]);
}

function promptReferenceCandidates(
  index: BoardPromptReferenceGraphIndex,
  promptNodeId: string,
): ReferenceImageRef[] {
  const directReferences = index.referenceCandidatesByPromptNode.get(promptNodeId) ?? [];
  if (directReferences.length > 0) return uniqueReferences(directReferences);

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
      sourceLabel: "library",
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
    .map(reference => ({ ...reference, sourceLabel: "connection" }));
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
  const node = index.nodeById.get(assetNodeId);
  if (node?.kind !== "asset" || node.asset.type !== "image") return null;
  const sourceEdge = (index.incomingEdgesByTargetNode.get(assetNodeId) ?? [])
    .find(edge => edge.from.portId === "asset-out" && edge.to.portId === "asset-in");
  const reference = sourceEdge ? boardNodeReferences(index.nodeById.get(sourceEdge.from.nodeId))[0] : undefined;
  return reference?.type === "image" ? reference.url : null;
}
