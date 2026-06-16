import assert from "node:assert/strict";
import test from "node:test";

import {
  resultNodeIdsOwnedBySource,
  selectedNodeIdsForContextMenu,
} from "../lib/board/utils";
import type { BoardNode } from "../lib/board/types";

const timestamp = "2026-06-16T00:00:00.000Z";

const imageAsset = {
  assetId: "asset_1",
  type: "image" as const,
  url: "data:image/png;base64,AA==",
  prompt: "prompt",
  model: "model",
};

function resultNode(input: { id: string; sourceNodeId: string }): BoardNode {
  return {
    id: input.id,
    kind: "result",
    title: input.id,
    sourceNodeId: input.sourceNodeId,
    resultStackKey: "stack",
    activeAssetId: imageAsset.assetId,
    resultAssetIds: [imageAsset.assetId],
    asset: imageAsset,
    position: { x: 0, y: 0 },
    size: { width: 220, height: 180 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function assetNode(id: string): BoardNode {
  return {
    id,
    kind: "asset",
    title: id,
    asset: imageAsset,
    position: { x: 0, y: 0 },
    size: { width: 220, height: 180 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function noteNode(id: string): BoardNode {
  return {
    id,
    kind: "note",
    title: id,
    body: "",
    position: { x: 0, y: 0 },
    size: { width: 220, height: 180 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

test("resultNodeIdsOwnedBySource returns only auto-owned result nodes", () => {
  assert.deepEqual(
    resultNodeIdsOwnedBySource([
      resultNode({ id: "result_owned", sourceNodeId: "generate_1" }),
      resultNode({ id: "result_other", sourceNodeId: "generate_2" }),
      assetNode("asset_connected_by_result_out"),
      noteNode("note_connected_by_result_out"),
    ], "generate_1"),
    ["result_owned"],
  );
});

test("selectedNodeIdsForContextMenu preserves multi-select when opening a selected node", () => {
  assert.deepEqual(selectedNodeIdsForContextMenu(["node_a", "node_b"], "node_b"), ["node_a", "node_b"]);
});

test("selectedNodeIdsForContextMenu collapses stale multi-select for an unselected context node", () => {
  assert.deepEqual(selectedNodeIdsForContextMenu(["node_a", "node_b"], "node_c"), ["node_c"]);
});
