import type { BoardNode } from "@/lib/board/types";
import { metaToPlaceholderItem, saveToDB, type StorageItemMeta } from "@/lib/db";

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
    if ((node.kind === "image-generate" || node.kind === "video-generate") && node.resultAssetId) {
      ids.add(node.resultAssetId);
    }
  }
  return ids;
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

export async function repairLegacyBoardAssetScope(
  boardId: string,
  metas: StorageItemMeta[],
  boardNodeIds: Set<string>,
): Promise<StorageItemMeta[]> {
  const repairs: StorageItemMeta[] = [];
  const next = metas.map(meta => {
    if (
      !meta.sourceBoardNodeId ||
      !boardNodeIds.has(meta.sourceBoardNodeId) ||
      (meta.scope === "board" && meta.boardId === boardId)
    ) {
      return meta;
    }
    const repaired: StorageItemMeta = { ...meta, scope: "board", boardId };
    repairs.push(repaired);
    return repaired;
  });
  if (repairs.length > 0) {
    await Promise.all(repairs.map(meta => saveToDB(metaToPlaceholderItem(meta))));
  }
  return next;
}