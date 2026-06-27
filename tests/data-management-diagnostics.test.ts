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
      return originalResolveFilename(path.join(compiledRoot, request.slice(2)), parent, isMain, options);
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
  buildBrowserToPostgresMigrationPreview,
  buildManagedLocalStorageInventory,
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

test("buildManagedLocalStorageInventory classifies current persisted localStorage keys", () => {
  const inventory = buildManagedLocalStorageInventory({
    imagine_agent_chat: "[]",
    "imagine_agent_chat:board_1": "[]",
    imagine_agent_orb_position: "{\"x\":1,\"y\":2}",
    imagine_ai_provider: "mimo",
    "imagine_board_viewed_generated_asset_ids:board_1": "[\"asset_1\"]",
    imagine_chat_model: "mimo:mimo-vl-7b",
    imagine_custom_providers: "[]",
    imagine_custom_prompt_templates: "[]",
    imagine_default_image_model: "provider:model",
    imagine_image_edit_feature_models: "{}",
    imagine_provider_credentials: "{}",
    imagine_resolve_integration_enabled: "1",
    imagine_runninghub_saved_targets: "[]",
    imagine_show_price: "false",
    unrelated_key: "ignored",
  });

  assert.deepEqual(
    inventory.map(entry => ({
      key: entry.key,
      kind: entry.kind,
      migrationPolicy: entry.migrationPolicy,
      includeCredentialsRequired: entry.includeCredentialsRequired,
    })),
    [
      {
        key: "imagine_agent_chat",
        kind: "agent",
        migrationPolicy: "optional",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_agent_chat:board_1",
        kind: "agent",
        migrationPolicy: "optional",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_agent_orb_position",
        kind: "ui-preferences",
        migrationPolicy: "required",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_ai_provider",
        kind: "provider-settings",
        migrationPolicy: "required",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_board_viewed_generated_asset_ids:board_1",
        kind: "ui-preferences",
        migrationPolicy: "local-only",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_chat_model",
        kind: "provider-settings",
        migrationPolicy: "required",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_custom_prompt_templates",
        kind: "ui-preferences",
        migrationPolicy: "required",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_custom_providers",
        kind: "provider-settings",
        migrationPolicy: "required",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_default_image_model",
        kind: "model-cache",
        migrationPolicy: "required",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_image_edit_feature_models",
        kind: "model-cache",
        migrationPolicy: "required",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_provider_credentials",
        kind: "provider-credentials",
        migrationPolicy: "optional",
        includeCredentialsRequired: true,
      },
      {
        key: "imagine_resolve_integration_enabled",
        kind: "ui-preferences",
        migrationPolicy: "local-only",
        includeCredentialsRequired: false,
      },
      {
        key: "imagine_runninghub_saved_targets",
        kind: "provider-credentials",
        migrationPolicy: "optional",
        includeCredentialsRequired: true,
      },
      {
        key: "imagine_show_price",
        kind: "ui-preferences",
        migrationPolicy: "required",
        includeCredentialsRequired: false,
      },
    ],
  );
  assert.equal(inventory.every(entry => entry.bytes > 0), true);
});

test("buildBrowserToPostgresMigrationPreview blocks unknown browser sources", () => {
  const preview = buildBrowserToPostgresMigrationPreview({
    assetCount: 2,
    assetPayloadRecordCount: 1,
    assetPreviewRecordCount: 1,
    boardCount: 1,
    generationTaskCount: 1,
    indexedDbIntrospectionAvailable: true,
    libraryAssetCount: 1,
    localStorageEntries: {
      imagine_ai_provider: "grok2api",
      imagine_provider_credentials: "{}",
      imagine_resolve_integration_enabled: "1",
    },
    safetySnapshotCount: 1,
    unknownIndexedDbSources: [{ database: "ImagineWorkbenchDB", store: "future_store" }],
    unknownLocalStorageKeys: ["imagine_future_key"],
    voiceProfileCount: 1,
  });

  assert.equal(preview.canImport, false);
  assert.equal(preview.blockingIssueCount, 2);
  assert.equal(preview.requiredLocalStorageKeyCount, 1);
  assert.equal(preview.optionalLocalStorageKeyCount, 1);
  assert.equal(preview.localOnlyLocalStorageKeyCount, 1);
  assert.equal(preview.optionalCredentialLocalStorageKeyCount, 1);
  assert.deepEqual(preview.unknownLocalStorageKeys, ["imagine_future_key"]);
  assert.deepEqual(preview.unknownIndexedDbSources, [{ database: "ImagineWorkbenchDB", store: "future_store" }]);
});

test("buildBrowserToPostgresMigrationPreview allows fully classified browser sources", () => {
  const preview = buildBrowserToPostgresMigrationPreview({
    assetCount: 2,
    assetPayloadRecordCount: 2,
    assetPreviewRecordCount: 1,
    boardCount: 1,
    generationTaskCount: 1,
    indexedDbIntrospectionAvailable: true,
    libraryAssetCount: 1,
    localStorageEntries: {
      imagine_agent_chat: "[]",
      imagine_ai_provider: "grok2api",
    },
    safetySnapshotCount: 1,
    unknownIndexedDbSources: [],
    unknownLocalStorageKeys: [],
    voiceProfileCount: 1,
  });

  assert.equal(preview.canImport, true);
  assert.equal(preview.blockingIssueCount, 0);
  assert.equal(preview.requiredLocalStorageKeyCount, 1);
  assert.equal(preview.optionalLocalStorageKeyCount, 1);
  assert.equal(preview.localOnlyLocalStorageKeyCount, 0);
});

test("buildBrowserToPostgresMigrationPreview classifies all current persisted localStorage sources", () => {
  const localStorageEntries = {
    imagine_12ai_api_key: "twelve-key",
    imagine_agent_chat: "[]",
    "imagine_agent_chat:board_1": "[]",
    imagine_agent_orb_position: "{\"x\":1,\"y\":2}",
    imagine_ai_provider: "grok2api",
    imagine_audio_model_options: "{}",
    imagine_auto_execute: "false",
    imagine_board_handles_hint_seen: "1",
    imagine_board_last_insert: "image-generate",
    imagine_board_side_collapsed: "0",
    imagine_board_side_tab: "assets",
    "imagine_board_viewed_generated_asset_ids:board_1": "[\"asset_1\"]",
    imagine_chat_model: "grok2api:grok-4-image",
    imagine_chat_model_options: "{}",
    imagine_custom_api_base_url: "https://custom.example.test",
    imagine_custom_api_key: "custom-key",
    imagine_custom_prompt_templates: "[]",
    imagine_custom_providers: "[]",
    imagine_default_audio_model: "mimo:speech-02",
    imagine_default_image_model: "grok2api:grok-4-image",
    imagine_default_video_model: "runninghub:api:/openapi/v2/example",
    imagine_grok2api_api_key: "grok-key",
    imagine_grok2api_base_url: "https://grok.example.test",
    imagine_image_edit_feature_models: "{}",
    imagine_image_model_options: "{}",
    imagine_language: "zh",
    imagine_provider_credentials: "{}",
    imagine_resolve_integration_enabled: "1",
    imagine_runninghub_saved_targets: "[]",
    imagine_show_price: "false",
    imagine_theme_mode: "dark",
    imagine_video_model_options: "{}",
  };

  const preview = buildBrowserToPostgresMigrationPreview({
    assetCount: 2,
    assetPayloadRecordCount: 2,
    assetPreviewRecordCount: 1,
    boardCount: 1,
    generationTaskCount: 1,
    indexedDbIntrospectionAvailable: true,
    libraryAssetCount: 1,
    localStorageEntries,
    safetySnapshotCount: 1,
    unknownIndexedDbSources: [],
    unknownLocalStorageKeys: [],
    voiceProfileCount: 1,
  });

  assert.equal(preview.canImport, true);
  assert.equal(preview.blockingIssueCount, 0);
  assert.equal(preview.managedLocalStorageKeyCount, Object.keys(localStorageEntries).length);
  assert.equal(preview.requiredLocalStorageKeyCount, 20);
  assert.equal(preview.optionalLocalStorageKeyCount, 10);
  assert.equal(preview.optionalCredentialLocalStorageKeyCount, 7);
  assert.equal(preview.localOnlyLocalStorageKeyCount, 2);
  assert.deepEqual(preview.unknownLocalStorageKeys, []);
  assert.deepEqual(preview.unknownIndexedDbSources, []);
});

test("buildBrowserToPostgresMigrationPreview requires IndexedDB introspection", () => {
  const preview = buildBrowserToPostgresMigrationPreview({
    assetCount: 0,
    assetPayloadRecordCount: 0,
    assetPreviewRecordCount: 0,
    boardCount: 0,
    generationTaskCount: 0,
    indexedDbIntrospectionAvailable: false,
    libraryAssetCount: 0,
    localStorageEntries: {},
    safetySnapshotCount: 0,
    unknownIndexedDbSources: [],
    unknownLocalStorageKeys: [],
    voiceProfileCount: 0,
  });

  assert.equal(preview.canImport, false);
  assert.equal(preview.blockingIssueCount, 1);
});
