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

test("adding a library asset to the board does not recreate result provenance edges", () => {
  const source = readWorkspaceFile("components/board/BoardPageClient.tsx");
  const addAssetToBoard = sourceBetween(source, "const addAssetToBoard", "const handleImportFilesToLibrary");

  assert.match(addAssetToBoard, /boardController\.addAssetNode/);
  assert.doesNotMatch(addAssetToBoard, /connectPorts/);
  assert.doesNotMatch(addAssetToBoard, /findResultNodeForSourceStack/);
  assert.doesNotMatch(source, /function hasResultAssetConnection/);
});

test("agent image-to-video continuation references result nodes, not result-to-asset provenance edges", () => {
  const source = readWorkspaceFile("components/board/BoardPageClient.tsx");
  const imageToVideoBranch = sourceBetween(source, "if (isAgentImageToVideoAction(action))", "if (isAgentBoardUpdateAction(action))");

  assert.match(imageToVideoBranch, /findConnectedResultNodeForSourceStack/);
  assert.match(imageToVideoBranch, /referenceSourceNodeId/);
  assert.doesNotMatch(imageToVideoBranch, /portId: BOARD_PORT_IDS\.resultOut[\s\S]*portId: BOARD_PORT_IDS\.assetIn/);
});

test("deleting or detaching result nodes clears source result metadata", () => {
  const source = readWorkspaceFile("hooks/useBoardState.ts");
  const page = readWorkspaceFile("components/board/BoardPageClient.tsx");
  const workspace = readWorkspaceFile("components/board/BoardWorkspace.tsx");
  const deletePlan = sourceBetween(source, "function planDeleteBoardNodes", "function createAssetBoardNode");
  const deleteEdge = sourceBetween(source, "const deleteEdge", "const reconnectEdge");
  const pageDeleteEdge = sourceBetween(page, "const deleteBoardEdge", "const promoteItemToOriginal");

  assert.match(source, /function clearSourceResultForDetachedResult/);
  assert.match(deletePlan, /deletedResultNodes/);
  assert.match(deletePlan, /clearSourceResultForDetachedResult/);
  assert.match(deleteEdge, /clearSourceResultForDetachedResult/);
  assert.match(page, /function detachedSourceResultMetadata/);
  assert.match(pageDeleteEdge, /await saveBoardAssetDirect\(\{/);
  assert.match(pageDeleteEdge, /sourceBoardNodeId: undefined/);
  assert.match(pageDeleteEdge, /sourceBoardResultStackKey: undefined/);
  assert.match(pageDeleteEdge, /boardController\.deleteEdge\(edgeId\)/);
  assert.match(workspace, /void onDeleteEdge\(edgeId\)/);
  assert.match(page, /onDeleteEdge=\{edgeId => void deleteBoardEdge\(edgeId\)\}/);
  assert.doesNotMatch(page, /onDeleteEdge=\{boardController\.deleteEdge\}/);
});

test("board warning save call sites use the active board asset save function", () => {
  const page = readWorkspaceFile("components/board/BoardPageClient.tsx");
  const saveWrapper = sourceBetween(page, "async function saveItemOrWarn", "function readFileAsDataUrl");
  const callMatches = Array.from(page.matchAll(/saveItemOrWarn\(([^;]+)\);/g))
    .map(match => match[1] ?? "")
    .filter(call => !call.includes("item: StorageItem"));

  assert.match(saveWrapper, /saveItem: \(item: StorageItem\) => Promise<StorageItem>/);
  assert.doesNotMatch(saveWrapper, /saveItemWithPreview\(item\)/);
  assert.equal(callMatches.length, 9);
  assert.ok(callMatches.every(call => call.includes("saveBoardAssetWithPreview")));
});

test("team board asset loading uses complete paginated team asset reads", () => {
  const hook = readWorkspaceFile("hooks/useBoardAssetStore.ts");
  const page = readWorkspaceFile("components/board/BoardPageClient.tsx");
  const loader = sourceBetween(hook, "async function loadTeamBoardAssetItems", "export function useBoardAssetStore");
  const pruneEffect = sourceBetween(page, "const videoPreviewUpdates = items", "useMediaPolling({");

  assert.match(loader, /fetchAllTeamAssets\(\{ boardId \}\)/);
  assert.match(loader, /fetchTeamAssetsByIds\(referencedAssetIds\)/);
  assert.doesNotMatch(loader, /limit: 200/);
  assert.match(pruneEffect, /!isBoardAssetScopeLoaded/);
});

test("team asset library reads all paginated entries for reload and duplicate checks", () => {
  const hook = readWorkspaceFile("hooks/useAssetLibrary.ts");
  const reload = sourceBetween(hook, "const reload = useCallback", "useEffect(() =>");
  const addSource = sourceBetween(hook, "async function addSourceAssetToTeamLibrary", "async function importFilesToTeamLibrary");

  assert.match(reload, /fetchAllTeamAssetLibrary\(\)/);
  assert.match(addSource, /fetchAllTeamAssetLibrary\(\)/);
  assert.doesNotMatch(reload, /fetchTeamAssetLibrary\(\{ limit: 200 \}\)/);
  assert.doesNotMatch(addSource, /fetchTeamAssetLibrary\(\{ limit: 200 \}\)/);
});

test("reconnecting or restoring result edges keeps result ownership metadata consistent", () => {
  const source = readWorkspaceFile("hooks/useBoardState.ts");
  const reconnectEdge = sourceBetween(source, "const reconnectEdge", "const restoreNodeWithEdges");
  const restoreNodeWithEdges = sourceBetween(source, "const restoreNodeWithEdges", "const duplicateNodes");
  const updateResultNodeAsset = sourceBetween(source, "const updateResultNodeAsset", "const updateAssetReferenceUrls");

  assert.match(source, /function assetNodeFromDetachedResult/);
  assert.match(source, /function syncSourceResultForConnectedResult/);
  assert.match(reconnectEdge, /isRetargetingResultEdge/);
  assert.match(reconnectEdge, /assetNodeFromDetachedResult/);
  assert.match(reconnectEdge, /syncSourceResultForConnectedResult/);
  assert.match(restoreNodeWithEdges, /syncSourceResultForConnectedResult/);
  assert.match(updateResultNodeAsset, /hasLiveResultEdge/);
  assert.match(updateResultNodeAsset, /hasLiveResultEdge &&/);
});

test("plain asset compare uses asset derivation edges instead of result provenance edges", () => {
  const promptReferences = readWorkspaceFile("lib/board/prompt-references.ts");
  const workspace = readWorkspaceFile("components/board/BoardWorkspace.tsx");
  const page = readWorkspaceFile("components/board/BoardPageClient.tsx");
  const compareReferenceUrl = sourceBetween(promptReferences, "export function assetCompareReferenceUrl", "}");
  const workspaceCompareReference = sourceBetween(workspace, "const assetCompareReferenceForNode", "const resolveCompareReferenceUrl");

  assert.doesNotMatch(compareReferenceUrl, /result-out/);
  assert.doesNotMatch(workspaceCompareReference, /result-out/);
  assert.match(compareReferenceUrl, /asset-out/);
  assert.match(workspaceCompareReference, /BOARD_PORT_IDS\.assetOut/);
  assert.doesNotMatch(page, /selectedAssetCompareReference/);
});

test("board media/source copy does not expose separate result and asset node categories", () => {
  const zh = readWorkspaceFile("messages/zh/board.json");
  const en = readWorkspaceFile("messages/en/board.json");
  const commonZh = readWorkspaceFile("messages/zh/common.json");
  const commonEn = readWorkspaceFile("messages/en/common.json");
  const workspace = readWorkspaceFile("components/board/BoardWorkspace.tsx");
  const generateNode = readWorkspaceFile("components/board/GenerateBoardNode.tsx");
  const page = readWorkspaceFile("components/board/BoardPageClient.tsx");
  const assetNode = readWorkspaceFile("components/board/AssetBoardNode.tsx");

  assert.match(zh, /"asset": "媒体"/);
  assert.match(zh, /"result": "媒体"/);
  assert.match(zh, /"resultOut": "来源输出"/);
  assert.match(zh, /"resultDetachedToMedia": "已解除来源关系，媒体仍保留在画布上"/);
  assert.doesNotMatch(zh, /图片资产节点|视频资产|音频资产|结果节点|结果输出|生成结果|本地资产|拖入资产|拖拽素材|导入素材|对比素材/);
  assert.match(en, /"asset": "Media"/);
  assert.match(en, /"result": "Media"/);
  assert.match(en, /"resultOut": "Source Output"/);
  assert.match(en, /"resultDetachedToMedia": "Source relationship removed; the media stays on the board"/);
  assert.doesNotMatch(en, /Generation Result|Image Asset|Video Asset|Audio Asset|Local Assets|drag assets|image asset|video assets|asset node|result node|Result Output/);
  assert.match(commonZh, /"viewResult": "查看媒体"/);
  assert.match(commonZh, /"focusTaskResultMissingResultNode": "未找到任务对应的媒体节点"/);
  assert.match(commonEn, /"viewResult": "View media"/);
  assert.match(commonEn, /"focusTaskResultMissingResultNode": "Task media node was not found"/);
  assert.match(workspace, /result: "board\.node\.edgeKinds\.result"/);
  assert.match(page, /board\.workspace\.resultDetachedToMedia/);
  assert.match(page, /board\.workspace\.resultDetachFailed/);
  assert.match(generateNode, /node\.generateNode\.connectedMediaCount/);
  assert.match(generateNode, /node\.generateNode\.mediaCount/);
  assert.match(page, /board\.agent\.imageToVideoNoConnectedMedia/);
  assert.doesNotMatch(page, /Source node has no connected result node/);
  assert.match(assetNode, /node\.types\.imageAsset/);
  assert.doesNotMatch(assetNode, /Image asset|Video asset|Audio asset/);
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
