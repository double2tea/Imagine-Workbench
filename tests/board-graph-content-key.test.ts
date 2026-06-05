import assert from "node:assert/strict";
import test from "node:test";

import { buildBoardGraphContentKey } from "../lib/board/graph-content-key";
import type { BoardNode } from "../lib/board/types";

const timestamp = "2026-06-05T00:00:00.000Z";

function assetNode(url: string): BoardNode {
  return {
    id: "asset_1",
    kind: "asset",
    title: "Asset",
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 },
    createdAt: timestamp,
    updatedAt: timestamp,
    asset: {
      assetId: "item_1",
      model: "model",
      prompt: "prompt",
      type: "image",
      url,
    },
  };
}

function referenceGroupNode(url: string): BoardNode {
  return {
    id: "refgroup_1",
    kind: "reference-group",
    title: "References",
    position: { x: 0, y: 0 },
    size: { width: 280, height: 220 },
    createdAt: timestamp,
    updatedAt: timestamp,
    references: [
      {
        assetId: "item_1",
        model: "model",
        prompt: "prompt",
        role: "general",
        type: "image",
        url,
      },
    ],
  };
}

test("board graph content key changes when asset urls change", () => {
  const first = buildBoardGraphContentKey([assetNode("blob:first")], []);
  const second = buildBoardGraphContentKey([assetNode("blob:second")], []);

  assert.notEqual(first, second);
});

test("board graph content key changes when reference group item urls change", () => {
  const first = buildBoardGraphContentKey([referenceGroupNode("blob:first")], []);
  const second = buildBoardGraphContentKey([referenceGroupNode("blob:second")], []);

  assert.notEqual(first, second);
});
