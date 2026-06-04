import assert from "node:assert/strict";
import test from "node:test";

import {
  collectBoardAssetIdsFromNodes,
  collectPlacedBoardAssetIdsFromNodes,
  removeResultAssetFromBoardNodeResultStack,
} from "../lib/assets/board-scope";
import type { BoardNode } from "../lib/board/types";

const timestamp = "2026-06-05T00:00:00.000Z";

const nodes: BoardNode[] = [
  {
    id: "generate_1",
    kind: "image-generate",
    title: "Generate",
    position: { x: 0, y: 0 },
    size: { width: 320, height: 220 },
    createdAt: timestamp,
    updatedAt: timestamp,
    prompt: "test",
    model: "model",
    aspectRatio: "1:1",
    customImageResolution: "1024x1024",
    imageResolution: "1K",
    status: "complete",
    variantCount: 4,
    resultAssetId: "asset_b",
    resultAssetIds: ["asset_a", "asset_b"],
  },
  {
    id: "asset_node_1",
    kind: "asset",
    title: "Placed",
    position: { x: 400, y: 0 },
    size: { width: 220, height: 180 },
    createdAt: timestamp,
    updatedAt: timestamp,
    asset: {
      assetId: "asset_c",
      type: "image",
      url: "data:image/png;base64,AA==",
      prompt: "placed",
      model: "model",
    },
  },
  {
    id: "reference_group_1",
    kind: "reference-group",
    title: "References",
    position: { x: 0, y: 300 },
    size: { width: 260, height: 180 },
    createdAt: timestamp,
    updatedAt: timestamp,
    references: [{
      assetId: "asset_d",
      type: "image",
      role: "general",
      url: "data:image/png;base64,AA==",
      prompt: "reference",
      model: "model",
    }],
  },
];

test("collectPlacedBoardAssetIdsFromNodes excludes generate result stack assets", () => {
  assert.deepEqual(
    Array.from(collectBoardAssetIdsFromNodes(nodes)).sort(),
    ["asset_a", "asset_b", "asset_c", "asset_d"],
  );
  assert.deepEqual(
    Array.from(collectPlacedBoardAssetIdsFromNodes(nodes)).sort(),
    ["asset_c", "asset_d"],
  );
});

test("removeResultAssetFromBoardNodeResultStack removes a materialized result without deleting the asset record", () => {
  const node = nodes[0];
  if (node.kind !== "image-generate") throw new Error("Expected image generate fixture");

  const updated = removeResultAssetFromBoardNodeResultStack(node, "asset_b", "2026-06-05T00:01:00.000Z");

  assert.deepEqual(updated.resultAssetIds, ["asset_a"]);
  assert.equal(updated.resultAssetId, "asset_a");
  assert.equal(updated.updatedAt, "2026-06-05T00:01:00.000Z");
});
