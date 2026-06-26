import assert from "node:assert/strict";
import test from "node:test";

import {
  BOARD_PORT_IDS,
  isValidBoardConnection,
  resolveBoardConnectionKind,
} from "../lib/board/ports";
import type { BoardNode, BoardPortRef } from "../lib/board/types";
import { DEFAULT_CINEMATIC_PROFILE } from "../lib/cinematic-controls";

const timestamp = "2026-06-26T00:00:00.000Z";

const imageAsset = {
  assetId: "asset_1",
  type: "image" as const,
  url: "data:image/png;base64,AA==",
  prompt: "prompt",
  model: "model",
};

function imageGenerateNode(): BoardNode {
  return {
    id: "generate_1",
    kind: "image-generate",
    title: "Generate",
    prompt: "prompt",
    model: "openai:gpt-image-1",
    aspectRatio: "1:1",
    cinematicProfile: DEFAULT_CINEMATIC_PROFILE,
    customImageResolution: "1024x1024",
    imageResolution: "1024x1024",
    position: { x: 0, y: 0 },
    size: { width: 420, height: 300 },
    status: "complete",
    variantCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function assetNode(): BoardNode {
  return {
    id: "asset_1",
    kind: "asset",
    title: "Asset",
    asset: imageAsset,
    position: { x: 500, y: 0 },
    size: { width: 360, height: 280 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function resultNode(sourceNodeId = "generate_1"): BoardNode {
  return {
    id: "result_1",
    kind: "result",
    title: "Result",
    sourceNodeId,
    resultStackKey: "stack_1",
    activeAssetId: imageAsset.assetId,
    resultAssetIds: [imageAsset.assetId],
    asset: imageAsset,
    position: { x: 500, y: 0 },
    size: { width: 360, height: 280 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function noteNode(): BoardNode {
  return {
    id: "note_1",
    kind: "note",
    title: "Transcript",
    body: "transcript",
    position: { x: 500, y: 320 },
    size: { width: 260, height: 180 },
    variant: "transcript",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function resultOut(nodeId = "generate_1"): BoardPortRef {
  return { nodeId, portId: BOARD_PORT_IDS.resultOut, portKind: "result" };
}

test("generation result output cannot connect to a plain asset node", () => {
  const nodes = [imageGenerateNode(), assetNode()];
  const to: BoardPortRef = { nodeId: "asset_1", portId: BOARD_PORT_IDS.assetIn, portKind: "asset" };

  assert.equal(isValidBoardConnection(nodes, resultOut(), to), false);
  assert.throws(() => resolveBoardConnectionKind(nodes, resultOut(), to));
});

test("generation result output can connect to a result node", () => {
  const nodes = [imageGenerateNode(), resultNode()];
  const to: BoardPortRef = { nodeId: "result_1", portId: BOARD_PORT_IDS.assetIn, portKind: "asset" };

  assert.equal(isValidBoardConnection(nodes, resultOut(), to), true);
  assert.equal(resolveBoardConnectionKind(nodes, resultOut(), to), "result");
});

test("generation result output cannot connect to another source node's result", () => {
  const nodes = [imageGenerateNode(), resultNode("generate_2")];
  const to: BoardPortRef = { nodeId: "result_1", portId: BOARD_PORT_IDS.assetIn, portKind: "asset" };

  assert.equal(isValidBoardConnection(nodes, resultOut(), to), false);
  assert.throws(() => resolveBoardConnectionKind(nodes, resultOut(), to));
});

test("generation result output can connect transcript note output", () => {
  const nodes = [imageGenerateNode(), noteNode()];
  const to: BoardPortRef = { nodeId: "note_1", portId: BOARD_PORT_IDS.noteIn, portKind: "result" };

  assert.equal(isValidBoardConnection(nodes, resultOut(), to), true);
  assert.equal(resolveBoardConnectionKind(nodes, resultOut(), to), "result");
});
