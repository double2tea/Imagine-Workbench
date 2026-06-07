import assert from "node:assert/strict";
import test from "node:test";

import {
  childPositionAfterUngroup,
  createBoardGroupLayout,
  sortBoardNodesForReactFlow,
} from "../lib/board/grouping";
import type { BoardGroupNode, BoardNode } from "../lib/board/types";

const timestamp = "2026-06-07T00:00:00.000Z";

function noteNode(input: {
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}): BoardNode {
  return {
    id: input.id,
    kind: "note",
    title: input.id,
    parentId: input.parentId,
    position: input.position,
    size: input.size ?? { width: 200, height: 120 },
    body: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function groupNode(input: {
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
}): BoardGroupNode {
  return {
    id: input.id,
    kind: "group",
    title: input.id,
    parentId: input.parentId,
    position: input.position,
    size: input.size ?? { width: 640, height: 420 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

test("createBoardGroupLayout wraps selected nodes without changing their visual positions", () => {
  const nodes = [
    noteNode({ id: "note_a", position: { x: 100, y: 200 } }),
    noteNode({ id: "note_b", position: { x: 420, y: 260 } }),
  ];

  const layout = createBoardGroupLayout(nodes, ["note_a", "note_b"]);

  assert.ok(layout);
  assert.deepEqual(layout.position, { x: 52, y: 128 });
  assert.deepEqual(layout.size, { width: 616, height: 300 });
  assert.deepEqual(layout.childPositions.get("note_a"), { x: 48, y: 72 });
  assert.deepEqual(layout.childPositions.get("note_b"), { x: 368, y: 132 });
});

test("childPositionAfterUngroup restores a direct child to absolute coordinates", () => {
  const group = groupNode({ id: "group_1", position: { x: 52, y: 128 }, size: { width: 616, height: 300 } });
  const child = noteNode({ id: "note_a", parentId: group.id, position: { x: 48, y: 72 } });

  assert.deepEqual(childPositionAfterUngroup([group, child], group, child), { x: 100, y: 200 });
});

test("sortBoardNodesForReactFlow puts parent groups before children", () => {
  const child = noteNode({ id: "note_a", parentId: "group_1", position: { x: 48, y: 72 } });
  const group = groupNode({ id: "group_1", position: { x: 52, y: 128 } });

  assert.deepEqual(sortBoardNodesForReactFlow([child, group]).map(node => node.id), ["group_1", "note_a"]);
});
