import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("board edges keep a large clickable interaction path and protected click selection", () => {
  const source = readWorkspaceFile("components/board/BoardWorkspace.tsx");
  const edgeComponent = sourceBetween(source, "const BoardEdgeComponent", "const edgeTypes");
  const edgeClickHandler = sourceBetween(source, "const handleEdgeClick", "const handleNodeDragStart");
  const selectionHandler = sourceBetween(source, "const handleSelectionChange", "const handleNodeClick");

  assert.match(edgeComponent, /interactionWidth=\{36\}/);
  assert.match(edgeComponent, /imagine-board-edge-selection-path/);
  assert.match(source, /data:\s*\{ kind: edge\.kind, processing, selected: isSelected \}/);
  assert.match(edgeClickHandler, /event\.preventDefault\(\)/);
  assert.match(edgeClickHandler, /event\.stopPropagation\(\)/);
  assert.match(edgeClickHandler, /protectedEdgeSelectionRef\.current = edge\.id/);
  assert.match(selectionHandler, /ids\.length === 0 && !edgeId && protectedEdgeSelectionRef\.current/);
});

test("board blank connection drop opens the typed quick-insert menu", () => {
  const source = readWorkspaceFile("components/board/BoardWorkspace.tsx");
  const connectEndHandler = sourceBetween(source, "const handleConnectEnd", "const openQuickInsertMenu");
  const promptBranch = sourceBetween(connectEndHandler, "if (sourceKind === \"prompt\")", "if (sourceKind === \"asset\")");
  const assetBranch = sourceBetween(connectEndHandler, "if (isBoardMediaSourceNode(sourceNode))", "if (sourceNode?.kind !== \"reference-group\")");
  const referenceGroupBranch = sourceBetween(connectEndHandler, "if (sourceNode?.kind !== \"reference-group\") return;", "if (sourceKind === \"result\")");

  assert.match(promptBranch, /setQuickInsertMenu\(\{/);
  assert.match(promptBranch, /connectionFrom:\s*\{ nodeId: sourceNodeId, portId: sourceHandleId, portKind: "prompt" \}/);
  assert.match(assetBranch, /setQuickInsertMenu\(\{/);
  assert.match(assetBranch, /connectionFrom:\s*\{ nodeId: sourceNodeId, portId: sourceHandleId, portKind: "asset" \}/);
  assert.match(referenceGroupBranch, /setQuickInsertMenu\(\{/);
  assert.match(referenceGroupBranch, /connectionFrom:\s*\{ nodeId: sourceNodeId, portId: sourceHandleId, portKind: "asset" \}/);
  assert.doesNotMatch(promptBranch, /addConnectedQuickNodeAtPoint/);
  assert.doesNotMatch(assetBranch, /addConnectedQuickNodeAtPoint/);
  assert.doesNotMatch(referenceGroupBranch, /addConnectedQuickNodeAtPoint/);
});

test("board node titles remain draggable while edit fields stay nodrag", () => {
  const source = readWorkspaceFile("components/board/BoardNode.tsx");
  const groupTitle = sourceBetween(source, "className=\"board-group-node-title", "onDoubleClick={event =>");
  const standardTitle = sourceBetween(source, "\"pointer-events-auto flex min-w-0 items-center truncate", "onDoubleClick={event =>");
  const titleInput = sourceBetween(source, "className={[", "value={draftTitle}");

  assert.doesNotMatch(groupTitle, /nodrag/);
  assert.doesNotMatch(standardTitle, /nodrag/);
  assert.match(titleInput, /nodrag/);
});

test("media node title chrome stays above the hover bridge for double-click rename", () => {
  const nodeSource = readWorkspaceFile("components/board/BoardNode.tsx");
  const shellSource = readWorkspaceFile("components/board/BoardMediaNodeShell.tsx");

  assert.match(nodeSource, /absolute -top-5 left-1 z-30 h-5/);
  assert.match(shellSource, /absolute bottom-full left-0 right-0 z-20 h-12/);
});

test("downloaded media filenames include a label and timestamp", () => {
  const downloadSource = readWorkspaceFile("lib/assets/download-zip.ts");
  const boardPageSource = readWorkspaceFile("components/board/BoardPageClient.tsx");
  const boardNodeSource = readWorkspaceFile("components/board/BoardNode.tsx");

  assert.match(downloadSource, /export function storageItemDownloadFileName/);
  assert.match(downloadSource, /\$\{name\}_\$\{storageItemDownloadTimestamp\(item\)\}\.\$\{extension\}/);
  assert.match(downloadSource, /fileNameLabel\?: \(item: StorageItem\) => string \| undefined/);
  assert.match(boardNodeSource, /onDownload=\{item => c\.onDownloadAsset\(item, node\.title\)\}/);
  assert.match(boardPageSource, /storageItemDownloadFileName\(originalItem, \{ label: fileNameLabel, prefix: "board_creation" \}\)/);
  assert.match(boardPageSource, /fileNameLabel: item => selectedDownloadableBoardItemLabels\.get\(item\.id\)/);
});

test("generate node run controls expose accessible labels", () => {
  const source = readWorkspaceFile("components/board/GenerateBoardNode.tsx");
  const cancelButton = sourceBetween(source, "title={t(\"node.generateNode.cancelTask\")}", "<Loader2");
  const runButton = sourceBetween(source, "onClick={onExecute}", "node.kind === \"image-generate\"");

  assert.match(cancelButton, /aria-label=\{t\("node\.generateNode\.cancelTask"\)\}/);
  assert.match(runButton, /title=\{t\("node\.generateNode\.run"\)\}/);
  assert.match(runButton, /aria-label=\{t\("node\.generateNode\.run"\)\}/);
});

function readWorkspaceFile(filePath: string): string {
  return readFileSync(path.resolve(process.cwd(), filePath), "utf8");
}

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}
