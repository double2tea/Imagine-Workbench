import assert from "node:assert/strict";
import test from "node:test";

import {
  boardNodeAbsolutePosition,
  childPositionAfterUngroup,
  createBoardGroupLayout,
  resolveMovedBoardNodeParent,
  resolveMovedBoardNodeParents,
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

test("boardNodeAbsolutePosition resolves nested group-relative coordinates", () => {
  const outer = groupNode({ id: "group_outer", position: { x: 100, y: 120 } });
  const inner = groupNode({ id: "group_inner", parentId: outer.id, position: { x: 40, y: 50 } });
  const child = noteNode({ id: "note_nested", parentId: inner.id, position: { x: 12, y: 18 } });

  assert.deepEqual(boardNodeAbsolutePosition([outer, inner, child], child.id), { x: 152, y: 188 });
});

test("sortBoardNodesForReactFlow puts parent groups before children", () => {
  const child = noteNode({ id: "note_a", parentId: "group_1", position: { x: 48, y: 72 } });
  const group = groupNode({ id: "group_1", position: { x: 52, y: 128 } });

  assert.deepEqual(sortBoardNodesForReactFlow([child, group]).map(node => node.id), ["group_1", "note_a"]);
});

test("resolveMovedBoardNodeParent releases a child dragged outside its group", () => {
  const group = groupNode({ id: "group_1", position: { x: 100, y: 100 }, size: { width: 400, height: 300 } });
  const child = noteNode({ id: "note_a", parentId: group.id, position: { x: 500, y: 40 }, size: { width: 100, height: 60 } });

  const resolution = resolveMovedBoardNodeParent([group, child], child.id);

  assert.ok(resolution);
  assert.equal(resolution.parentId, undefined);
  assert.deepEqual(resolution.position, { x: 600, y: 140 });
});

test("resolveMovedBoardNodeParent attaches a root node dragged into a group", () => {
  const group = groupNode({ id: "group_1", position: { x: 100, y: 100 }, size: { width: 400, height: 300 } });
  const child = noteNode({ id: "note_a", position: { x: 140, y: 160 }, size: { width: 100, height: 60 } });

  const resolution = resolveMovedBoardNodeParent([group, child], child.id);

  assert.ok(resolution);
  assert.equal(resolution.parentId, group.id);
  assert.deepEqual(resolution.position, { x: 40, y: 60 });
});

test("resolveMovedBoardNodeParents resolves mixed group exits and entries in one batch", () => {
  const group = groupNode({ id: "group_1", position: { x: 100, y: 100 }, size: { width: 400, height: 300 } });
  const leavingChild = noteNode({
    id: "note_leaving",
    parentId: group.id,
    position: { x: 500, y: 40 },
    size: { width: 100, height: 60 },
  });
  const enteringChild = noteNode({
    id: "note_entering",
    position: { x: 140, y: 160 },
    size: { width: 100, height: 60 },
  });

  const resolutions = resolveMovedBoardNodeParents(
    [group, leavingChild, enteringChild],
    [leavingChild.id, enteringChild.id],
  );
  const leavingResolution = resolutions.get(leavingChild.id);
  const enteringResolution = resolutions.get(enteringChild.id);

  assert.ok(leavingResolution);
  assert.equal(leavingResolution.parentId, undefined);
  assert.deepEqual(leavingResolution.position, { x: 600, y: 140 });
  assert.ok(enteringResolution);
  assert.equal(enteringResolution.parentId, group.id);
  assert.deepEqual(enteringResolution.position, { x: 40, y: 60 });
});

test("resolveMovedBoardNodeParent chooses the smallest containing group", () => {
  const outer = groupNode({ id: "group_outer", position: { x: 0, y: 0 }, size: { width: 500, height: 500 } });
  const inner = groupNode({ id: "group_inner", parentId: outer.id, position: { x: 100, y: 100 }, size: { width: 200, height: 200 } });
  const child = noteNode({ id: "note_a", position: { x: 150, y: 150 }, size: { width: 80, height: 60 } });

  const resolution = resolveMovedBoardNodeParent([outer, inner, child], child.id);

  assert.ok(resolution);
  assert.equal(resolution.parentId, inner.id);
  assert.deepEqual(resolution.position, { x: 50, y: 50 });
});

test("resolveMovedBoardNodeParent does not attach a group to its descendant", () => {
  const outer = groupNode({ id: "group_outer", position: { x: 90, y: 90 }, size: { width: 500, height: 500 } });
  const inner = groupNode({ id: "group_inner", parentId: outer.id, position: { x: 80, y: 80 }, size: { width: 260, height: 260 } });

  const resolution = resolveMovedBoardNodeParent([outer, inner], outer.id);

  assert.ok(resolution);
  assert.equal(resolution.parentId, undefined);
  assert.deepEqual(resolution.position, { x: 90, y: 90 });
});
