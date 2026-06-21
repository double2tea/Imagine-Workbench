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
  assert.match(source, /zIndex:\s*selectedEdgeId === edge\.id \? 20 : 8/);
  assert.match(edgeClickHandler, /event\.preventDefault\(\)/);
  assert.match(edgeClickHandler, /event\.stopPropagation\(\)/);
  assert.match(edgeClickHandler, /protectedEdgeSelectionRef\.current = edge\.id/);
  assert.match(selectionHandler, /ids\.length === 0 && !edgeId && protectedEdgeSelectionRef\.current/);
});

test("board blank connection drop creates a default target instead of only opening a picker", () => {
  const source = readWorkspaceFile("components/board/BoardWorkspace.tsx");
  const connectEndHandler = sourceBetween(source, "const handleConnectEnd", "const openQuickInsertMenu");
  const promptBranch = sourceBetween(connectEndHandler, "if (sourceKind === \"prompt\")", "if (sourceKind === \"asset\")");
  const assetBranch = sourceBetween(connectEndHandler, "if (isBoardMediaSourceNode(sourceNode))", "if (sourceNode?.kind !== \"reference-group\")");
  const referenceGroupBranch = sourceBetween(connectEndHandler, "if (sourceNode?.kind !== \"reference-group\") return;", "if (sourceKind === \"result\")");

  assert.match(promptBranch, /addConnectedQuickNodeAtPoint\(\s*"image-generate"/);
  assert.match(assetBranch, /sourceNode\.asset\.type === "audio" \? "audio-operation" : sourceNode\.asset\.type === "video" \? "video-generate" : "image-generate"/);
  assert.match(referenceGroupBranch, /addConnectedQuickNodeAtPoint\(\s*"image-generate"/);
  assert.doesNotMatch(promptBranch, /setQuickInsertMenu/);
  assert.doesNotMatch(assetBranch, /setQuickInsertMenu/);
  assert.doesNotMatch(referenceGroupBranch, /setQuickInsertMenu/);
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
