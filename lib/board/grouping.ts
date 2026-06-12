import type { BoardNode, BoardPoint, BoardSize } from "@/lib/board/types";

export const BOARD_GROUP_PADDING_X = 48;
export const BOARD_GROUP_PADDING_TOP = 72;
export const BOARD_GROUP_PADDING_BOTTOM = 48;
const BOARD_MEDIA_NODE_VISUAL_OUTSET = {
  top: 36,
  right: 16,
  bottom: 42,
  left: 16,
} as const;

interface BoardNodeRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface BoardNodeVisualOutset {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface BoardGroupLayout {
  childNodeIds: string[];
  childPositions: Map<string, BoardPoint>;
  parentId?: string;
  position: BoardPoint;
  size: BoardSize;
}

export interface BoardNodeMoveParentResolution {
  parentId?: string;
  position: BoardPoint;
}

const EMPTY_VISUAL_OUTSET: BoardNodeVisualOutset = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
};

function nodeById(nodes: BoardNode[]): Map<string, BoardNode> {
  return new Map(nodes.map(node => [node.id, node]));
}

function visualOutsetForNode(node: BoardNode): BoardNodeVisualOutset {
  if (node.kind === "asset" || node.kind === "result") return BOARD_MEDIA_NODE_VISUAL_OUTSET;
  return EMPTY_VISUAL_OUTSET;
}

function absolutePositionForNode(nodesById: Map<string, BoardNode>, node: BoardNode): BoardPoint | null {
  const seen = new Set<string>([node.id]);
  let x = node.position.x;
  let y = node.position.y;
  let parentId = node.parentId;

  while (parentId) {
    if (seen.has(parentId)) return null;
    seen.add(parentId);
    const parent = nodesById.get(parentId);
    if (!parent) return null;
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }

  return { x, y };
}

export function boardNodeAbsolutePosition(nodes: BoardNode[], nodeId: string): BoardPoint | null {
  const nodesById = nodeById(nodes);
  const node = nodesById.get(nodeId);
  return node ? absolutePositionForNode(nodesById, node) : null;
}

export function boardNodesWithAbsolutePositions(nodes: BoardNode[]): BoardNode[] {
  const nodesById = nodeById(nodes);
  return nodes.map(node => {
    const position = absolutePositionForNode(nodesById, node);
    return position ? { ...node, position } : node;
  });
}

function rectForNode(nodesById: Map<string, BoardNode>, node: BoardNode): BoardNodeRect | null {
  const position = absolutePositionForNode(nodesById, node);
  if (!position) return null;
  const outset = visualOutsetForNode(node);
  return {
    x: position.x - outset.left,
    y: position.y - outset.top,
    width: node.size.width + outset.left + outset.right,
    height: node.size.height + outset.top + outset.bottom,
  };
}

function relativeRectForNode(node: BoardNode): BoardNodeRect {
  const outset = visualOutsetForNode(node);
  return {
    x: node.position.x - outset.left,
    y: node.position.y - outset.top,
    width: node.size.width + outset.left + outset.right,
    height: node.size.height + outset.top + outset.bottom,
  };
}

function boundsForRects(rects: BoardNodeRect[]): BoardNodeRect | null {
  if (rects.length === 0) return null;
  const minX = Math.min(...rects.map(rect => rect.x));
  const minY = Math.min(...rects.map(rect => rect.y));
  const maxX = Math.max(...rects.map(rect => rect.x + rect.width));
  const maxY = Math.max(...rects.map(rect => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function pointInsideRect(point: BoardPoint, rect: BoardNodeRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function isDescendantOf(nodesById: Map<string, BoardNode>, nodeId: string, ancestorId: string): boolean {
  const seen = new Set<string>([nodeId]);
  let parentId = nodesById.get(nodeId)?.parentId;
  while (parentId) {
    if (parentId === ancestorId) return true;
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    parentId = nodesById.get(parentId)?.parentId;
  }
  return false;
}

function containingGroupForNode(
  nodes: BoardNode[],
  nodesById: Map<string, BoardNode>,
  node: BoardNode,
  absolutePosition: BoardPoint,
): (BoardNode & { kind: "group" }) | null {
  const center = {
    x: absolutePosition.x + node.size.width / 2,
    y: absolutePosition.y + node.size.height / 2,
  };
  let best: { area: number; group: BoardNode & { kind: "group" } } | null = null;

  for (const candidate of nodes) {
    if (candidate.kind !== "group") continue;
    if (candidate.id === node.id) continue;
    if (isDescendantOf(nodesById, candidate.id, node.id)) continue;
    const rect = rectForNode(nodesById, candidate);
    if (!rect || !pointInsideRect(center, rect)) continue;
    const area = candidate.size.width * candidate.size.height;
    if (!best || area < best.area) best = { area, group: candidate };
  }

  return best?.group ?? null;
}

function topLevelSelection(nodesById: Map<string, BoardNode>, nodeIds: string[]): BoardNode[] {
  const selectedIds = new Set(nodeIds);
  const seen = new Set<string>();
  return nodeIds.flatMap(nodeId => {
    if (seen.has(nodeId)) return [];
    seen.add(nodeId);
    const node = nodesById.get(nodeId);
    if (!node) return [];
    for (const selectedId of selectedIds) {
      if (selectedId !== nodeId && isDescendantOf(nodesById, nodeId, selectedId)) return [];
    }
    return [node];
  });
}

function commonParentId(nodes: BoardNode[]): string | undefined {
  const first = nodes[0]?.parentId;
  return nodes.every(node => node.parentId === first) ? first : undefined;
}

export function createBoardGroupLayout(nodes: BoardNode[], nodeIds: string[]): BoardGroupLayout | null {
  const nodesById = nodeById(nodes);
  const children = topLevelSelection(nodesById, nodeIds);
  if (children.length < 2) return null;
  const rects = children.map(node => rectForNode(nodesById, node)).filter((rect): rect is BoardNodeRect => rect !== null);
  const bounds = boundsForRects(rects);
  if (!bounds) return null;

  const parentId = commonParentId(children);
  const parent = parentId ? nodesById.get(parentId) : undefined;
  const parentPosition = parent ? absolutePositionForNode(nodesById, parent) : undefined;
  const absolutePosition = {
    x: bounds.x - BOARD_GROUP_PADDING_X,
    y: bounds.y - BOARD_GROUP_PADDING_TOP,
  };
  const position = parentPosition
    ? { x: absolutePosition.x - parentPosition.x, y: absolutePosition.y - parentPosition.y }
    : absolutePosition;
  const childPositions = new Map<string, BoardPoint>();
  for (const child of children) {
    const childPosition = absolutePositionForNode(nodesById, child);
    if (!childPosition) return null;
    childPositions.set(child.id, {
      x: childPosition.x - absolutePosition.x,
      y: childPosition.y - absolutePosition.y,
    });
  }

  return {
    childNodeIds: children.map(child => child.id),
    childPositions,
    parentId,
    position,
    size: {
      width: bounds.width + BOARD_GROUP_PADDING_X * 2,
      height: bounds.height + BOARD_GROUP_PADDING_TOP + BOARD_GROUP_PADDING_BOTTOM,
    },
  };
}

export function fitBoardGroupLayoutToChildren(nodes: BoardNode[], groupId: string): BoardGroupLayout | null {
  const group = nodes.find(node => node.id === groupId);
  if (group?.kind !== "group") return null;
  const children = nodes.filter(node => node.parentId === group.id);
  if (children.length === 0) return null;
  const bounds = boundsForRects(children.map(relativeRectForNode));
  if (!bounds) return null;
  const offset = {
    x: bounds.x - BOARD_GROUP_PADDING_X,
    y: bounds.y - BOARD_GROUP_PADDING_TOP,
  };
  const childPositions = new Map<string, BoardPoint>();
  for (const child of children) {
    childPositions.set(child.id, {
      x: child.position.x - offset.x,
      y: child.position.y - offset.y,
    });
  }
  return {
    childNodeIds: children.map(child => child.id),
    childPositions,
    parentId: group.parentId,
    position: {
      x: group.position.x + offset.x,
      y: group.position.y + offset.y,
    },
    size: {
      width: bounds.width + BOARD_GROUP_PADDING_X * 2,
      height: bounds.height + BOARD_GROUP_PADDING_TOP + BOARD_GROUP_PADDING_BOTTOM,
    },
  };
}

function resolveMovedBoardNodeParentWithIndex(
  nodes: BoardNode[],
  nodesById: Map<string, BoardNode>,
  nodeId: string,
): BoardNodeMoveParentResolution | null {
  const node = nodesById.get(nodeId);
  if (!node) return null;
  const absolutePosition = absolutePositionForNode(nodesById, node);
  if (!absolutePosition) return null;
  const parent = containingGroupForNode(nodes, nodesById, node, absolutePosition);
  if (!parent) return { position: absolutePosition };

  const parentPosition = absolutePositionForNode(nodesById, parent);
  if (!parentPosition) return null;
  return {
    parentId: parent.id,
    position: {
      x: absolutePosition.x - parentPosition.x,
      y: absolutePosition.y - parentPosition.y,
    },
  };
}

export function resolveMovedBoardNodeParent(nodes: BoardNode[], nodeId: string): BoardNodeMoveParentResolution | null {
  return resolveMovedBoardNodeParentWithIndex(nodes, nodeById(nodes), nodeId);
}

export function resolveMovedBoardNodeParents(
  nodes: BoardNode[],
  nodeIds: string[],
): Map<string, BoardNodeMoveParentResolution> {
  const nodesById = nodeById(nodes);
  const resolutions = new Map<string, BoardNodeMoveParentResolution>();
  for (const nodeId of nodeIds) {
    const resolution = resolveMovedBoardNodeParentWithIndex(nodes, nodesById, nodeId);
    if (resolution) resolutions.set(nodeId, resolution);
  }
  return resolutions;
}

export function childPositionAfterUngroup(nodes: BoardNode[], group: BoardNode & { kind: "group" }, child: BoardNode): BoardPoint | null {
  const nodesById = nodeById(nodes);
  const groupPosition = absolutePositionForNode(nodesById, group);
  if (!groupPosition) return null;
  const absolutePosition = {
    x: groupPosition.x + child.position.x,
    y: groupPosition.y + child.position.y,
  };
  if (!group.parentId) return absolutePosition;
  const parent = nodesById.get(group.parentId);
  if (!parent) return null;
  const parentPosition = absolutePositionForNode(nodesById, parent);
  if (!parentPosition) return null;
  return {
    x: absolutePosition.x - parentPosition.x,
    y: absolutePosition.y - parentPosition.y,
  };
}

export function sortBoardNodesForReactFlow(nodes: BoardNode[]): BoardNode[] {
  const nodesById = nodeById(nodes);
  const visited = new Set<string>();
  const ordered: BoardNode[] = [];

  const visit = (node: BoardNode): void => {
    if (visited.has(node.id)) return;
    const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
    if (parent) visit(parent);
    visited.add(node.id);
    ordered.push(node);
  };

  for (const node of nodes) visit(node);
  return ordered;
}
