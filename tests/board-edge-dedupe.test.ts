import assert from "node:assert/strict";
import test from "node:test";

import { dedupeBoardEdgesByEndpoints } from "../lib/board/edge-dedupe";
import type { BoardEdge } from "../lib/board/types";

const timestamp = "2026-06-03T00:00:00.000Z";

function promptEdge(id: string): BoardEdge {
  return {
    id,
    kind: "prompt",
    from: { nodeId: "prompt_1", portId: "prompt-out", portKind: "prompt" },
    to: { nodeId: "image_1", portId: "prompt-in", portKind: "prompt" },
    createdAt: timestamp,
  };
}

test("dedupeBoardEdgesByEndpoints removes duplicate legacy endpoint edges", () => {
  const edges = dedupeBoardEdgesByEndpoints([
    promptEdge("edge_old_1"),
    promptEdge("edge_old_2"),
  ]);

  assert.equal(edges.length, 1);
  assert.equal(edges[0]?.id, "edge_old_1");
});
