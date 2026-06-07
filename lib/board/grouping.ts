import type { BoardNode, BoardPoint, BoardSize } from "@/lib/board/types";

export const BOARD_GROUP_PADDING_X = 48;
export const BOARD_GROUP_PADDING_TOP = 72;
export const BOARD_GROUP_PADDING_BOTTOM = 48;

interface BoardNodeRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface BoardGroupLayout {
  childNodeIds: string[];
  childPositions: Map<string, BoardPoint>;
  parentId?: string;
  position: BoardPoint;
  size: BoardSize;
}

function nodeById(nodes: BoardNode[]): Map<string, BoardNode> {
  return new Map(nodes.map(node => [node.id, node]));
}

export function boardNodeAbsolutePosition(nodes: BoardNode[], nodeId: string): BoardPoint | null {
  const nodesById = nodeById(nodes);
  const node = nodesById.get(nodeId);
  if (!node) return null;
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

export function boardNodesWithAbsolutePositions(nodes: BoardNode[]): BoardNode[] {
  return nodes.map(node => {
    const position = boardNodeAbsolutePosition(nodes, node.id);
    return position ? { ...node, position } : node;
  });
}

function rectForNode(nodes: BoardNode[], node: BoardNode): BoardNodeRect | null {
  const position = boardNodeAbsolutePosition(nodes, node.id);
  if (!position) return null;
  return {
    x: position.x,
    y: position.y,
    width: node.size.width,
    height: node.size.height,
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

function topLevelSelection(nodes: BoardNode[], nodeIds: string[]): BoardNode[] {
  const selectedIds = new Set(nodeIds);
  const nodesById = nodeById(nodes);
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
  const children = topLevelSelection(nodes, nodeIds);
  if (children.length < 2) return null;
  const rects = children.map(node => rectForNode(nodes, node)).filter((rect): rect is BoardNodeRect => rect !== null);
  const bounds = boundsForRects(rects);
  if (!bounds) return null;

  const parentId = commonParentId(children);
  const parentPosition = parentId ? boardNodeAbsolutePosition(nodes, parentId) : undefined;
  const absolutePosition = {
    x: bounds.x - BOARD_GROUP_PADDING_X,
    y: bounds.y - BOARD_GROUP_PADDING_TOP,
  };
  const position = parentPosition
    ? { x: absolutePosition.x - parentPosition.x, y: absolutePosition.y - parentPosition.y }
    : absolutePosition;
  const childPositions = new Map<string, BoardPoint>();
  for (const child of children) {
    const childPosition = boardNodeAbsolutePosition(nodes, child.id);
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

export function childPositionAfterUngroup(nodes: BoardNode[], group: BoardNode & { kind: "group" }, child: BoardNode): BoardPoint | null {
  const groupPosition = boardNodeAbsolutePosition(nodes, group.id);
  if (!groupPosition) return null;
  const absolutePosition = {
    x: groupPosition.x + child.position.x,
    y: groupPosition.y + child.position.y,
  };
  if (!group.parentId) return absolutePosition;
  const parentPosition = boardNodeAbsolutePosition(nodes, group.parentId);
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
