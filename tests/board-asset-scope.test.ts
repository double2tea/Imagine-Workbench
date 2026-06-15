import assert from "node:assert/strict";
import test from "node:test";

import {
  collectBoardAssetIdsFromNodes,
  collectPlacedBoardAssetIdsFromNodes,
} from "../lib/assets/board-scope";
import { DEFAULT_CINEMATIC_PROFILE } from "../lib/cinematic-controls";
import type { BoardNode } from "../lib/board/types";

const timestamp = "2026-06-05T00:00:00.000Z";

const generateNode: BoardNode = {
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
  cinematicProfile: DEFAULT_CINEMATIC_PROFILE,
  customImageResolution: "1024x1024",
  imageResolution: "1K",
  status: "complete",
  variantCount: 4,
  resultAssetId: "asset_generate_b",
  resultAssetIds: ["asset_generate_a", "asset_generate_b"],
  resultStackKey: "stack-1",
};

const audioOperationNode: BoardNode = {
  id: "audio_operation_1",
  kind: "audio-operation",
  title: "Audio Operation",
  position: { x: 0, y: 620 },
  size: { width: 320, height: 220 },
  createdAt: timestamp,
  updatedAt: timestamp,
  prompt: "test audio",
  model: "mimo-audio",
  audioMode: "tts",
  audioFormat: "mp3",
  status: "complete",
  variantCount: 1,
  resultAssetId: "asset_audio_b",
  resultAssetIds: ["asset_audio_a", "asset_audio_b"],
  resultStackKey: "stack-audio",
};

const resultNode: BoardNode = {
  id: "result_1",
  kind: "result",
  title: "Result",
  position: { x: 400, y: 0 },
  size: { width: 220, height: 180 },
  createdAt: timestamp,
  updatedAt: timestamp,
  sourceNodeId: "generate_1",
  resultStackKey: "stack-1",
  activeAssetId: "asset_b",
  resultAssetIds: ["asset_a", "asset_b"],
  asset: {
    assetId: "asset_b",
    type: "image",
    url: "data:image/png;base64,AA==",
    prompt: "result",
    model: "model",
  },
};

const assetNode: BoardNode = {
  id: "asset_node_1",
  kind: "asset",
  title: "Placed",
  position: { x: 800, y: 0 },
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
};

const referenceGroupNode: BoardNode = {
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
};

test("collectBoardAssetIdsFromNodes includes result node stack assets", () => {
  assert.deepEqual(
    Array.from(collectBoardAssetIdsFromNodes([generateNode, audioOperationNode, resultNode, assetNode, referenceGroupNode])).sort(),
    ["asset_a", "asset_audio_a", "asset_audio_b", "asset_b", "asset_c", "asset_d", "asset_generate_a", "asset_generate_b"],
  );
});

test("collectPlacedBoardAssetIdsFromNodes includes result node assets as placed", () => {
  // asset_a and asset_b are in result node's resultAssetIds — they count as placed
  // asset_c is a standalone asset node — placed
  // asset_d is in a reference group — placed
  assert.deepEqual(
    Array.from(collectPlacedBoardAssetIdsFromNodes([resultNode, assetNode, referenceGroupNode])).sort(),
    ["asset_a", "asset_b", "asset_c", "asset_d"],
  );
});

test("collectPlacedBoardAssetIdsFromNodes excludes generate-only results", () => {
  // Generate node alone (no result node) should NOT place its result assets
  assert.deepEqual(
    Array.from(collectPlacedBoardAssetIdsFromNodes([generateNode, audioOperationNode])).sort(),
    [],
  );
});
