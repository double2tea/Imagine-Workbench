import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import test, { after } from "node:test";

import { buildStorageItem, type StorageItemMeta } from "../lib/db";
import type { BoardDocument, BoardNode } from "../lib/board/types";

type ResolveFilename = (
  request: string,
  parent: NodeModule | undefined,
  isMain: boolean,
  options?: unknown,
) => string;

let restoreCompiledPathAlias: (() => void) | undefined;

function registerCompiledPathAlias(): void {
  const moduleWithResolver = Module as unknown as {
    _resolveFilename: ResolveFilename;
  };
  const originalResolveFilename = moduleWithResolver._resolveFilename;
  const compiledRoot = path.resolve(__dirname, "..");

  moduleWithResolver._resolveFilename = (request, parent, isMain, options) => {
    if (request.startsWith("@/")) {
      return path.join(compiledRoot, `${request.slice(2)}.js`);
    }
    return originalResolveFilename(request, parent, isMain, options);
  };
  restoreCompiledPathAlias = () => {
    moduleWithResolver._resolveFilename = originalResolveFilename;
    restoreCompiledPathAlias = undefined;
  };
}

registerCompiledPathAlias();

const {
  buildWorkspaceIntegrityDiagnostics,
  buildWorkspaceIntegrityDiagnosticsWithPayloads,
} = require("../lib/data-management") as typeof import("../lib/data-management");

after(() => {
  restoreCompiledPathAlias?.();
});

const now = Date.parse("2026-06-12T00:00:00.000Z");
const timestamp = "2026-06-11T00:00:00.000Z";

function assetMeta(input: Partial<StorageItemMeta>): StorageItemMeta {
  const item = buildStorageItem({
    id: input.id ?? "asset_1",
    type: input.type ?? "image",
    url: input.url ?? "data:image/png;base64,AA==",
    prompt: input.prompt ?? "prompt",
    model: input.model ?? "model",
    aspectRatio: input.aspectRatio ?? "1:1",
    createdAt: input.createdAt ?? timestamp,
    status: input.status ?? "complete",
    progress: input.progress ?? 100,
    sourceBoardNodeId: input.sourceBoardNodeId,
  }, { boardId: input.boardId });
  const { url: _url, ...meta } = item;
  void _url;
  return {
    ...meta,
    hasBlob: input.hasBlob ?? meta.hasBlob,
    url: input.url && input.url.startsWith("http") ? input.url : undefined,
  };
}

function board(nodes: BoardNode[]): BoardDocument {
  return {
    id: "board_1",
    title: "Storyboard",
    config: { showGrid: true, showMiniMap: true, snapToGrid: false },
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

test("buildWorkspaceIntegrityDiagnostics reports missing board references with node details", () => {
  const nodes: BoardNode[] = [
    {
      id: "asset_node_1",
      kind: "asset",
      title: "Placed",
      position: { x: 0, y: 0 },
      size: { width: 320, height: 220 },
      createdAt: timestamp,
      updatedAt: timestamp,
      asset: {
        assetId: "asset_missing",
        type: "image",
        url: "",
        prompt: "missing",
        model: "model",
      },
    },
    {
      id: "grid_1",
      kind: "multi-grid",
      title: "Grid",
      position: { x: 360, y: 0 },
      size: { width: 640, height: 420 },
      createdAt: timestamp,
      updatedAt: timestamp,
      aspectRatio: "1:1",
      gridSize: 2,
      items: [{
        assetId: "asset_grid_missing",
        cellIndex: 0,
        model: "model",
        offsetX: 0,
        offsetY: 0,
        prompt: "grid",
        scale: 1,
        url: "",
      }],
    },
  ];

  const diagnostics = buildWorkspaceIntegrityDiagnostics([assetMeta({ id: "asset_ok" })], [board(nodes)], now);

  assert.equal(diagnostics.status, "critical");
  assert.deepEqual(
    diagnostics.missingBoardReferences.map(reference => ({
      assetId: reference.assetId,
      nodeId: reference.nodeId,
      nodeKind: reference.nodeKind,
      field: reference.field,
    })),
    [
      { assetId: "asset_missing", nodeId: "asset_node_1", nodeKind: "asset", field: "asset.assetId" },
      { assetId: "asset_grid_missing", nodeId: "grid_1", nodeKind: "multi-grid", field: "items.assetId" },
    ],
  );
});

test("buildWorkspaceIntegrityDiagnostics separates stale source links and maintenance ids", () => {
  const existingNode: BoardNode = {
    id: "node_existing",
    kind: "prompt",
    title: "Prompt",
    position: { x: 0, y: 0 },
    size: { width: 320, height: 220 },
    createdAt: timestamp,
    updatedAt: timestamp,
    prompt: "hello",
  };
  const diagnostics = buildWorkspaceIntegrityDiagnostics([
    assetMeta({ id: "asset_stale_source", boardId: "board_1", sourceBoardNodeId: "node_deleted" }),
    assetMeta({ id: "asset_failed", status: "failed" }),
    assetMeta({ id: "asset_pending_old", status: "pending", progress: 4, createdAt: "2026-06-11T21:00:00.000Z", url: "" }),
    assetMeta({ id: "asset_broken", hasBlob: false, url: "" }),
  ], [board([existingNode])], now);

  assert.equal(diagnostics.status, "critical");
  assert.deepEqual(diagnostics.staleAssetSourceLinks.map(link => link.assetId), ["asset_stale_source"]);
  assert.deepEqual(diagnostics.failedAssetIds, ["asset_failed"]);
  assert.deepEqual(diagnostics.staleProcessingAssetIds, ["asset_pending_old"]);
  assert.deepEqual(diagnostics.brokenCompleteAssetIds, ["asset_broken"]);
});

test("orphaned complete assets are cleanup candidates but not health issues", () => {
  const diagnostics = buildWorkspaceIntegrityDiagnostics([
    assetMeta({ id: "asset_orphaned" }),
  ], [board([])], now);

  assert.equal(diagnostics.status, "healthy");
  assert.equal(diagnostics.issueCount, 0);
  assert.deepEqual(diagnostics.orphanedAssetIds, ["asset_orphaned"]);
});

test("payload-aware diagnostics reports complete assets with missing blob payloads", async () => {
  const diagnostics = await buildWorkspaceIntegrityDiagnosticsWithPayloads([
    assetMeta({ id: "asset_missing_payload", hasBlob: true }),
    assetMeta({ id: "asset_with_payload", hasBlob: true }),
  ], [board([])], now, async asset => asset.id === "asset_with_payload");

  assert.equal(diagnostics.status, "critical");
  assert.equal(diagnostics.issueCount, 1);
  assert.deepEqual(diagnostics.brokenCompleteAssetIds, ["asset_missing_payload"]);
});
