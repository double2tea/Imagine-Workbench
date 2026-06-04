import type { BoardNode } from "@/lib/board/types";
import type { StorageItemMeta } from "@/lib/db";

type BoardResultStackNode = BoardNode & {
  resultAssetId?: string;
  resultAssetIds?: string[];
};

export function isBoardResultStackNode(node: BoardNode): node is BoardResultStackNode {
  return node.kind === "image-generate" || node.kind === "video-generate" || "resultAssetId" in node || "resultAssetIds" in node;
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function collectBoardNodeIdsFromNodes(nodes: BoardNode[]): Set<string> {
  return new Set(nodes.map(node => node.id));
}

export function collectBoardAssetIdsFromNodes(nodes: BoardNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.kind === "asset") ids.add(node.asset.assetId);
    if (node.kind === "reference-group") {
      for (const reference of node.references) ids.add(reference.assetId);
    }
    if (isBoardResultStackNode(node) && node.resultAssetId) {
      ids.add(node.resultAssetId);
    }
    if (isBoardResultStackNode(node)) {
      for (const assetId of node.resultAssetIds ?? []) ids.add(assetId);
    }
  }
  return ids;
}

export function collectPlacedBoardAssetIdsFromNodes(nodes: BoardNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.kind === "asset") ids.add(node.asset.assetId);
    if (node.kind === "reference-group") {
      for (const reference of node.references) ids.add(reference.assetId);
    }
  }
  return ids;
}

export function removeResultAssetFromBoardNodeResultStack(
  node: BoardResultStackNode,
  assetId: string,
  updatedAt: string,
): BoardResultStackNode {
  const currentIds = node.resultAssetIds ?? (node.resultAssetId ? [node.resultAssetId] : []);
  const nextIds = currentIds.filter(currentId => currentId !== assetId);
  const nextResultAssetId = node.resultAssetId && nextIds.includes(node.resultAssetId)
    ? node.resultAssetId
    : nextIds[nextIds.length - 1];
  if (sameStringList(currentIds, nextIds) && node.resultAssetId === nextResultAssetId) return node;
  return {
    ...node,
    resultAssetId: nextResultAssetId,
    resultAssetIds: nextIds,
    updatedAt,
  };
}

export function mergeBoardScopedMetas(
  byBoard: StorageItemMeta[],
  byReference: StorageItemMeta[],
): StorageItemMeta[] {
  const merged = new Map<string, StorageItemMeta>();
  for (const meta of [...byBoard, ...byReference]) {
    merged.set(meta.id, meta);
  }
  return Array.from(merged.values()).sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}
