import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_CINEMATIC_PROFILE } from "../lib/cinematic-controls";
import { generateReferenceCandidates } from "../lib/board/prompt-references";
import type { BoardEdge, BoardNode } from "../lib/board/types";

const timestamp = "2026-06-24T00:00:00.000Z";

function assetNode(id: string, url: string): BoardNode {
  return {
    id,
    kind: "asset",
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 160, height: 120 },
    asset: {
      assetId: id,
      model: "test-model",
      prompt: "",
      type: "image",
      url,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function promptNode(id: string): BoardNode {
  return {
    id,
    kind: "prompt",
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 240, height: 160 },
    prompt: "use @图1",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function imageGenerateNode(id: string): BoardNode {
  return {
    id,
    kind: "image-generate",
    title: id,
    position: { x: 0, y: 0 },
    size: { width: 260, height: 220 },
    aspectRatio: "1:1",
    cinematicProfile: DEFAULT_CINEMATIC_PROFILE,
    customImageResolution: "1024x1024",
    imageResolution: "1K",
    model: "test-image-model",
    prompt: "",
    status: "idle",
    variantCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function referenceEdge(id: string, fromNodeId: string, toNodeId: string, toPortId: "asset-in" | "reference-in"): BoardEdge {
  return {
    id,
    kind: "reference",
    from: { nodeId: fromNodeId, portId: "asset-out", portKind: "asset" },
    to: { nodeId: toNodeId, portId: toPortId, portKind: "asset" },
    createdAt: timestamp,
  };
}

function promptEdge(id: string, fromNodeId: string, toNodeId: string): BoardEdge {
  return {
    id,
    kind: "prompt",
    from: { nodeId: fromNodeId, portId: "prompt-out", portKind: "prompt" },
    to: { nodeId: toNodeId, portId: "prompt-in", portKind: "prompt" },
    createdAt: timestamp,
  };
}

test("generate references include prompt-linked references before direct references", () => {
  const nodes = [
    assetNode("asset_a", "data:image/png;base64,a"),
    assetNode("asset_b", "data:image/png;base64,b"),
    promptNode("prompt_1"),
    imageGenerateNode("image_1"),
  ];
  const edges = [
    referenceEdge("edge_prompt_ref", "asset_a", "prompt_1", "asset-in"),
    promptEdge("edge_prompt", "prompt_1", "image_1"),
    referenceEdge("edge_direct_duplicate", "asset_a", "image_1", "reference-in"),
    referenceEdge("edge_direct", "asset_b", "image_1", "reference-in"),
  ];

  const references = generateReferenceCandidates(nodes, edges, "image_1");

  assert.deepEqual(references.map(reference => reference.id), ["asset_a", "asset_b"]);
});
