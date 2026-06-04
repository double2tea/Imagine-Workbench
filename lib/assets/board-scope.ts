import type { BoardNode } from "@/lib/board/types";
import type { StorageItemMeta } from "@/lib/db";

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
    if (node.kind === "image-generate" || node.kind === "video-generate") {
      for (const assetId of node.resultAssetIds ?? []) ids.add(assetId);
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
