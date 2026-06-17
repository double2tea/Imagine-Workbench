import assert from "node:assert/strict";
import test from "node:test";

import {
  findConnectedResultNodeForSourceStack,
  findResultNodeForSourceStack,
  resultNodeIdsOwnedBySource,
  selectedNodeIdsForContextMenu,
} from "../lib/board/utils";
import type { BoardEdge, BoardNode } from "../lib/board/types";

const timestamp = "2026-06-16T00:00:00.000Z";

const imageAsset = {
  assetId: "asset_1",
  type: "image" as const,
  url: "data:image/png;base64,AA==",
  prompt: "prompt",
  model: "model",
};

function resultNode(input: { id: string; sourceNodeId: string; resultStackKey?: string }): BoardNode {
  return {
    id: input.id,
    kind: "result",
    title: input.id,
    sourceNodeId: input.sourceNodeId,
    resultStackKey: input.resultStackKey ?? "stack",
    activeAssetId: imageAsset.assetId,
    resultAssetIds: [imageAsset.assetId],
    asset: imageAsset,
    position: { x: 0, y: 0 },
    size: { width: 220, height: 180 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function resultEdge(input: { id: string; sourceNodeId: string; resultNodeId: string }): BoardEdge {
  return {
    id: input.id,
    kind: "result",
    from: { nodeId: input.sourceNodeId, portId: "result-out", portKind: "result" },
    to: { nodeId: input.resultNodeId, portId: "asset-in", portKind: "asset" },
    createdAt: timestamp,
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

test("findResultNodeForSourceStack matches source and stack identity", () => {
  const nodes = [
    resultNode({ id: "result_current", sourceNodeId: "generate_1", resultStackKey: "stack_a" }),
    resultNode({ id: "result_old", sourceNodeId: "generate_1", resultStackKey: "stack_b" }),
  ];

  assert.equal(findResultNodeForSourceStack(nodes, "generate_1", "stack_a")?.id, "result_current");
  assert.equal(findResultNodeForSourceStack(nodes, "generate_1", "stack_missing"), undefined);
});

test("findConnectedResultNodeForSourceStack ignores detached result nodes", () => {
  const nodes = [
    resultNode({ id: "result_detached", sourceNodeId: "generate_1", resultStackKey: "stack_a" }),
    resultNode({ id: "result_connected", sourceNodeId: "generate_1", resultStackKey: "stack_b" }),
  ];
  const edges = [
    resultEdge({ id: "edge_1", sourceNodeId: "generate_1", resultNodeId: "result_connected" }),
  ];

  assert.equal(findConnectedResultNodeForSourceStack(nodes, edges, "generate_1", "stack_a"), undefined);
  assert.equal(findConnectedResultNodeForSourceStack(nodes, edges, "generate_1", "stack_b")?.id, "result_connected");
});

test("findConnectedResultNodeForSourceStack skips earlier detached nodes in the same stack", () => {
  const nodes = [
    resultNode({ id: "result_detached", sourceNodeId: "generate_1", resultStackKey: "stack_a" }),
    resultNode({ id: "result_connected", sourceNodeId: "generate_1", resultStackKey: "stack_a" }),
  ];
  const edges = [
    resultEdge({ id: "edge_1", sourceNodeId: "generate_1", resultNodeId: "result_connected" }),
  ];

  assert.equal(findConnectedResultNodeForSourceStack(nodes, edges, "generate_1", "stack_a")?.id, "result_connected");
});

test("selectedNodeIdsForContextMenu preserves multi-select when opening a selected node", () => {
  assert.deepEqual(selectedNodeIdsForContextMenu(["node_a", "node_b"], "node_b"), ["node_a", "node_b"]);
});

test("selectedNodeIdsForContextMenu collapses stale multi-select for an unselected context node", () => {
  assert.deepEqual(selectedNodeIdsForContextMenu(["node_a", "node_b"], "node_c"), ["node_c"]);
});
