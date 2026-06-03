"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  applyNodeChanges,
  BaseEdge,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  MiniMap,
  ReactFlow,
  getSmoothStepPath,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type EdgeProps,
  type IsValidConnection,
  type NodeMouseHandler,
  type OnConnect,
  type OnConnectEnd,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesChange,
  type OnNodesDelete,
  type OnReconnect,
  type OnSelectionChangeFunc,
  type ReactFlowInstance,
  useReactFlow,
} from "@xyflow/react";
import BoardQuickInsertMenu from "@/components/board/BoardQuickInsertMenu";
import BoardNodeContextMenu, { buildBoardNodeContextMenuActions } from "@/components/board/BoardNodeContextMenu";
import { BOARD_TRASH_LIMIT, IMAGINE_BOARD_ASSET_DRAG_TYPE, isTextEntryTarget } from "@/lib/board/interaction";
import type { BoardStateController } from "@/hooks/useBoardState";
import BoardNode, { type BoardFlowNode } from "@/components/board/BoardNode";
import type { BoardGenerateInputSummary, BoardGenerateTaskSummary } from "@/components/board/GenerateBoardNode";
import BoardEmptyHint from "@/components/board/BoardEmptyHint";
import BoardToolbar from "@/components/board/BoardToolbar";
import BoardAssetCompareOverlay from "@/components/board/BoardAssetCompareOverlay";
import type { StorageItem } from "@/lib/db";
import {
  buildGalleryReferenceFingerprint,
  buildGalleryTaskFingerprint,
  buildBoardGraphContentKey,
} from "@/lib/board/graph-content-key";
import { flushAllBoardText } from "@/lib/board/text-flush-registry";
import {
  assetCompareReferenceUrl,
  buildBoardPromptReferences,
  generateReferenceCandidates,
  isGenerateEdgeProcessing,
} from "@/lib/board/prompt-references";
import { useThemeModeSnapshot } from "@/lib/theme-mode";
import type { CapturedVideoFrame } from "@/lib/video-frame";
import {
  BOARD_SNAP_GRID,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_REFERENCE_GROUP_NODE_SIZE,
  snapBoardPoint,
  type BoardEdge,
  type BoardEdgeKind,
  type BoardNode as BoardNodeModel,
  type BoardPoint,
  type BoardPortKind,
  type BoardPortRef,
  type BoardSize,
  type BoardSummary,
  type BoardViewport,
  type CreateAssetNodeInput,
} from "@/lib/board";
import { BOARD_PORT_IDS, isValidBoardConnection as isValidBoardPortConnection } from "@/lib/board/ports";
import { BOARD_INSERT_CATALOG, type BoardInsertKind } from "@/lib/board/insert-catalog";
import { DEFAULT_VIDEO_MODEL } from "@/lib/providers/model-catalog";

interface BoardWorkspaceProps {
  boardSummaries: BoardSummary[];
  controller: BoardStateController;
  children?: ReactNode;
  galleryItems?: StorageItem[];
  onBack: () => void;
  onCaptureVideoFrame: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onConnectionError: (message: string) => void;
  onCancelGenerateNode: (nodeId: string) => void;
  onEditAssetImage: (nodeId: string) => void;
  onExecuteGenerateNode: (nodeId: string) => void;
  onImportBoardFiles: (files: File[], position: BoardPoint) => void | Promise<void>;
  onCreateBoard: () => void;
  onDeleteBoard: () => void;
  onOpenSettings: () => void;
  onRenameBoard: () => void;
  onSelectBoard: (boardId: string) => void;
  onSendAssetToAgent: (nodeId: string) => void;
  onSendAgentNode: (nodeId: string) => void;
  onSetAssetAsReference: (nodeId: string) => void;
}

type BoardFlowEdge = Edge<{ kind: BoardEdgeKind; processing?: boolean }, "smoothstep">;
type BoardHandleDirection = "input" | "output";

interface QuickInsertMenu {
  clientX: number;
  connectionFrom?: BoardPortRef;
  clientY: number;
  position: BoardPoint;
}

interface CopiedBoardNode {
  node: BoardNodeModel;
}

interface BoardTrashEntry {
  edges: BoardEdge[];
  node: BoardNodeModel;
}

interface BoardNodeContextMenuState {
  clientX: number;
  clientY: number;
  nodeId: string;
}

const nodeTypes = { board: BoardNode };
const DEFAULT_BOARD_IMAGE_MODEL = "modelscope:Qwen/Qwen-Image";
const DEFAULT_BOARD_REFERENCE_IMAGE_MODEL = "modelscope:Qwen/Qwen-Image-Edit";
const BOARD_VIEWPORT_POSITION_EPSILON = 0.5;
const BOARD_VIEWPORT_ZOOM_EPSILON = 0.001;

interface BoardSelectionSnapshot {
  edgeId: string | null;
  nodeId: string | null;
  nodeIds: string[];
}

function sameStringList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameOptionalNumber(left: number | undefined, right: number | undefined): boolean {
  return left === right;
}

function sameBoardViewportModel(left: BoardViewport, right: BoardViewport): boolean {
  return (
    Math.abs(left.x - right.x) < BOARD_VIEWPORT_POSITION_EPSILON &&
    Math.abs(left.y - right.y) < BOARD_VIEWPORT_POSITION_EPSILON &&
    Math.abs(left.zoom - right.zoom) < BOARD_VIEWPORT_ZOOM_EPSILON
  );
}

function sameBoardSelectionSnapshot(left: BoardSelectionSnapshot, right: BoardSelectionSnapshot): boolean {
  return left.edgeId === right.edgeId && left.nodeId === right.nodeId && sameStringList(left.nodeIds, right.nodeIds);
}

function sameBoardNodeRenderModel(left: BoardNodeModel, right: BoardNodeModel): boolean {
  return (
    left === right ||
    (
      left.id === right.id &&
      left.kind === right.kind &&
      left.title === right.title &&
      left.updatedAt === right.updatedAt &&
      left.size.width === right.size.width &&
      left.size.height === right.size.height
    )
  );
}

function sameFlowNodeState(left: BoardFlowNode, right: BoardFlowNode): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    left.data === right.data &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.selected === right.selected &&
    left.dragging === right.dragging &&
    sameOptionalNumber(left.measured?.width, right.measured?.width) &&
    sameOptionalNumber(left.measured?.height, right.measured?.height) &&
    sameOptionalNumber(left.width, right.width) &&
    sameOptionalNumber(left.height, right.height)
  );
}

function sameFlowNodeList(left: BoardFlowNode[], right: BoardFlowNode[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((node, index) => sameFlowNodeState(node, right[index]));
}

function sameReferenceList(
  left: BoardFlowNode["data"]["generateReferences"],
  right: BoardFlowNode["data"]["generateReferences"],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((reference, index) => {
    const other = right[index];
    return reference.id === other.id && reference.url === other.url && reference.role === other.role;
  });
}

function sameGenerateInputSummary(
  left: BoardGenerateInputSummary | undefined,
  right: BoardGenerateInputSummary | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  if (
    left.promptPreview !== right.promptPreview ||
    left.promptSourceTitle !== right.promptSourceTitle ||
    left.referenceCount !== right.referenceCount ||
    left.referencePreviews.length !== right.referencePreviews.length
  ) return false;
  return left.referencePreviews.every((reference, index) => {
    const other = right.referencePreviews[index];
    return reference.id === other.id && reference.url === other.url && reference.role === other.role;
  });
}

function sameGenerateTaskSummary(
  left: BoardGenerateTaskSummary | undefined,
  right: BoardGenerateTaskSummary | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id && left.progress === right.progress && left.status === right.status;
}

function sameFlowNodeDataModel(left: BoardFlowNode["data"], right: BoardFlowNode["data"]): boolean {
  return (
    sameBoardNodeRenderModel(left.node, right.node) &&
    left.hasResultConnection === right.hasResultConnection &&
    left.compareReferenceUrl === right.compareReferenceUrl &&
    sameGenerateInputSummary(left.generateInputSummary, right.generateInputSummary) &&
    sameGenerateTaskSummary(left.generateTaskSummary, right.generateTaskSummary) &&
    sameReferenceList(left.generateReferences, right.generateReferences) &&
    sameReferenceList(left.promptReferences, right.promptReferences)
  );
}

function sameFlowNodeModelList(left: BoardFlowNode[], right: BoardFlowNode[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((node, index) => {
    const other = right[index];
    return (
      node.id === other.id &&
      node.type === other.type &&
      sameFlowNodeDataModel(node.data, other.data) &&
      node.position.x === other.position.x &&
      node.position.y === other.position.y
    );
  });
}

function BoardEdgeComponent({
  data,
  id,
  markerEnd,
  markerStart,
  selected,
  sourcePosition,
  sourceX,
  sourceY,
  style,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps<BoardFlowEdge>) {
  const { deleteElements } = useReactFlow<BoardFlowNode, BoardFlowEdge>();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });
  const kind = data?.kind ?? "reference";
  const processing = data?.processing === true;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
        interactionWidth={18}
        className={`imagine-board-edge-path imagine-board-edge-path-${kind}`}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan flex items-center gap-1"
          style={{
            pointerEvents: "all",
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {processing ? (
            <span className="rounded-full border border-blue-400/30 bg-blue-500/15 px-2 py-0.5 text-[9px] font-semibold text-blue-200">
              生成中
            </span>
          ) : null}
          <button
            type="button"
            aria-label="删除连接"
            title="删除连接"
            onClick={() => void deleteElements({ edges: [{ id }] })}
            className={`flex h-6 w-6 items-center justify-center rounded-full border border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-muted)] shadow-lg transition hover:border-red-400/40 hover:bg-red-500 hover:text-white ${
              selected ? "opacity-100" : "opacity-70"
            }`}
          >
            <span className="text-sm leading-none">×</span>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { smoothstep: BoardEdgeComponent };
const reactFlowConnectionLineStyle = { stroke: "#60a5fa", strokeDasharray: "7 5", strokeWidth: 2.5 };
const reactFlowDefaultEdgeOptions = { type: "smoothstep" };
const reactFlowDeleteKeyCode = ["Backspace", "Delete"];
const reactFlowPanOnDrag = [1, 2];
const reactFlowProOptions = { hideAttribution: true };

function portKindFromHandle(handleId: string | null | undefined): BoardPortKind | null {
  if (!handleId) return null;
  if (handleId === BOARD_PORT_IDS.promptIn || handleId === BOARD_PORT_IDS.promptOut) return "prompt";
  if (handleId === BOARD_PORT_IDS.agentContextIn) return "agent";
  if (handleId === BOARD_PORT_IDS.resultOut) return "result";
  if (handleId === BOARD_PORT_IDS.assetIn || handleId === BOARD_PORT_IDS.assetOut || handleId === BOARD_PORT_IDS.referenceIn) return "asset";
  return null;
}

function handleDirectionFromHandle(handleId: string | null | undefined): BoardHandleDirection | null {
  if (!handleId) return null;
  if (
    handleId === BOARD_PORT_IDS.assetOut ||
    handleId === BOARD_PORT_IDS.promptOut ||
    handleId === BOARD_PORT_IDS.resultOut
  ) return "output";
  if (
    handleId === BOARD_PORT_IDS.assetIn ||
    handleId === BOARD_PORT_IDS.promptIn ||
    handleId === BOARD_PORT_IDS.referenceIn ||
    handleId === BOARD_PORT_IDS.agentContextIn
  ) return "input";
  return null;
}

function connectionPortRefs(connection: {
  source?: string | null;
  sourceHandle?: string | null;
  target?: string | null;
  targetHandle?: string | null;
}): { from: BoardPortRef; to: BoardPortRef } | null {
  const sourceKind = portKindFromHandle(connection.sourceHandle);
  const targetKind = portKindFromHandle(connection.targetHandle);
  const sourceDirection = handleDirectionFromHandle(connection.sourceHandle);
  const targetDirection = handleDirectionFromHandle(connection.targetHandle);
  if (
    !connection.source ||
    !connection.target ||
    !connection.sourceHandle ||
    !connection.targetHandle ||
    !sourceKind ||
    !targetKind ||
    !sourceDirection ||
    !targetDirection
  ) return null;

  const sourceRef: BoardPortRef = { nodeId: connection.source, portId: connection.sourceHandle, portKind: sourceKind };
  const targetRef: BoardPortRef = { nodeId: connection.target, portId: connection.targetHandle, portKind: targetKind };
  if (sourceDirection === "output" && targetDirection === "input") return { from: sourceRef, to: targetRef };
  if (sourceDirection === "input" && targetDirection === "output") return { from: targetRef, to: sourceRef };
  return null;
}

function importableFiles(dataTransfer: DataTransfer): File[] {
  const transferFiles = Array.from(dataTransfer.files).filter(file => file.type.startsWith("image/") || file.type.startsWith("video/"));
  if (transferFiles.length > 0) return transferFiles;
  return Array.from(dataTransfer.items)
    .filter(item => item.kind === "file")
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null && (file.type.startsWith("image/") || file.type.startsWith("video/")));
}

function hasImportableFile(dataTransfer: DataTransfer): boolean {
  return (
    Array.from(dataTransfer.files).some(file => file.type.startsWith("image/") || file.type.startsWith("video/")) ||
    Array.from(dataTransfer.items).some(item =>
      item.kind === "file" && (item.type === "" || item.type.startsWith("image/") || item.type.startsWith("video/")),
    )
  );
}

function hasImportableImageUrl(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).some(type => type === "text/uri-list" || type === "text/html" || type === "text/plain");
}

function imageUrlsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const urls: string[] = [];
  const uriList = dataTransfer.getData("text/uri-list");
  for (const line of uriList.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) urls.push(trimmed);
  }

  const html = dataTransfer.getData("text/html");
  if (html.trim()) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const src = doc.querySelector("img")?.getAttribute("src");
    if (src) urls.push(src);
  }

  const plain = dataTransfer.getData("text/plain").trim();
  if (plain.startsWith("http://") || plain.startsWith("https://") || plain.startsWith("data:image/")) {
    urls.push(plain);
  }

  return Array.from(new Set(urls));
}

function extensionFromImageType(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "img";
}

async function imageUrlToFile(url: string, index: number): Promise<File> {
  if (url.startsWith("data:image/")) {
    const response = await fetch(url);
    const blob = await response.blob();
    return new File([blob], `board-drag-image-${index}.${extensionFromImageType(blob.type)}`, { type: blob.type });
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片拖入失败 (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("拖入地址不是图片");
  }
  return new File([blob], `board-drag-image-${index}.${extensionFromImageType(blob.type)}`, { type: blob.type });
}

function pasteImageFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.items)
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function storageItemToBoardAsset(item: StorageItem): CreateAssetNodeInput["asset"] {
  return {
    assetId: item.id,
    type: item.type === "video" ? "video" : "image",
    url: item.url,
    model: item.model,
    prompt: item.prompt,
  };
}

function getBoardVar(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const cs = getComputedStyle(document.querySelector(".imagine-workbench-shell") || document.documentElement);
  const val = cs.getPropertyValue(varName).trim();
  return val || fallback;
}

function edgeColor(kind: BoardEdge["kind"]): string {
  const varNames: Record<BoardEdge["kind"], string> = { prompt: "--iw-board-edge-prompt", reference: "--iw-board-edge-reference", "agent-context": "--iw-board-edge-agent-context", result: "--iw-board-edge-result" };
  const fallbacks: Record<BoardEdge["kind"], string> = { prompt: "#2dd4bf", reference: "#60a5fa", "agent-context": "#a78bfa", result: "#34d399" };
  return getBoardVar(varNames[kind], fallbacks[kind]);
}

function generateInputSummaryForNode(node: BoardNodeModel, nodes: BoardNodeModel[], edges: BoardEdge[]): BoardGenerateInputSummary | undefined {
  if (node.kind !== "image-generate" && node.kind !== "video-generate") return undefined;

  const promptEdge = edges.find(edge => edge.to.nodeId === node.id && edge.to.portId === "prompt-in");
  const promptNode = promptEdge ? nodes.find(item => item.id === promptEdge.from.nodeId) : undefined;
  const promptPreview = promptNode?.kind === "prompt" ? promptNode.prompt : null;
  const references = generateReferenceCandidates(nodes, edges, node.id);

  return {
    promptPreview,
    promptSourceTitle: promptNode?.kind === "prompt" ? promptNode.title : undefined,
    referenceCount: references.length,
    referencePreviews: references.map(reference => ({
      id: reference.id,
      role: reference.role,
      url: reference.url,
    })),
  };
}

function isActiveGenerateTask(item: StorageItem): item is StorageItem & { status: "pending" | "processing" } {
  return item.status === "pending" || item.status === "processing";
}

function activeGenerateTaskForNode(items: StorageItem[], nodeId: string): BoardGenerateTaskSummary | undefined {
  const item = items
    .filter((candidate): candidate is StorageItem & { status: "pending" | "processing" } => candidate.sourceBoardNodeId === nodeId && isActiveGenerateTask(candidate))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
  if (!item) return undefined;
  return {
    id: item.id,
    progress: Math.max(0, Math.min(100, item.progress)),
    status: item.status,
  };
}

function hasResultConnection(nodeId: string, edges: BoardEdge[]): boolean {
  return edges.some(edge => edge.from.nodeId === nodeId && edge.from.portId === "result-out");
}

function pastedNodePosition(node: BoardNodeModel): BoardPoint {
  return {
    x: node.position.x + 36,
    y: node.position.y + 36,
  };
}

export default function BoardWorkspace({
  boardSummaries,
  children,
  controller,
  galleryItems = [],
  onBack,
  onCancelGenerateNode,
  onCaptureVideoFrame,
  onConnectionError,
  onEditAssetImage,
  onExecuteGenerateNode,
  onImportBoardFiles,
  onCreateBoard,
  onDeleteBoard,
  onOpenSettings,
  onRenameBoard,
  onSelectBoard,
  onSendAssetToAgent,
  onSendAgentNode,
  onSetAssetAsReference,
}: BoardWorkspaceProps) {
  const themeMode = useThemeModeSnapshot();
  const flowInstanceRef = useRef<ReactFlowInstance<BoardFlowNode, BoardFlowEdge> | null>(null);
  const flowHostRef = useRef<HTMLElement | null>(null);
  const copiedNodeRef = useRef<CopiedBoardNode | null>(null);
  const isNodeDragActiveRef = useRef(false);
  const pendingDragPositionByIdRef = useRef<Map<string, BoardPoint>>(new Map());
  const selectionRef = useRef<BoardSelectionSnapshot>({ edgeId: null, nodeId: null, nodeIds: [] });
  const [quickInsertMenu, setQuickInsertMenu] = useState<QuickInsertMenu | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<BoardNodeContextMenuState | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [trashedNodes, setTrashedNodes] = useState<BoardTrashEntry[]>([]);
  const [assetCompare, setAssetCompare] = useState<{ originalUrl: string; resultUrl: string } | null>(null);
  const updateSelectedNodeIds = useCallback((nextIds: string[]): void => {
    setSelectedNodeIds(currentIds => (sameStringList(currentIds, nextIds) ? currentIds : nextIds));
  }, []);
  const galleryReferenceFingerprint = useMemo(
    () => buildGalleryReferenceFingerprint(galleryItems),
    [galleryItems],
  );
  const galleryReferenceItems = useMemo(
    () => galleryItems.map(item => ({ id: item.id, status: item.status, type: item.type, url: item.url })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint gates rebuild on progress-only polls
    [galleryReferenceFingerprint],
  );
  const galleryTaskFingerprint = useMemo(
    () => buildGalleryTaskFingerprint(galleryItems),
    [galleryItems],
  );
  const {
    board,
    canRedo,
    canUndo,
    saveError,
    saveStatus,
    selectedEdgeId,
    selectedNodeId,
    beginUndoGesture,
    endUndoGesture,
    redo,
    undo,
    duplicateNode,
    duplicateNodes,
    reconnectEdge,
    restoreNodeWithEdges,
    addAgentNode,
    addAssetNode,
    addAssetNodeWithConnection,
    addAssetToReferenceGroup,
    addGenerateNode,
    addGenerateNodeWithConnection,
    addNoteNode,
    addPromptNode,
    addReferenceGroupNode,
    addReferenceGroupNodeWithAsset,
    clearBoard,
    connectPorts,
    deleteEdge,
    deleteNode,
    moveReferenceGroupItem,
    removeReferenceGroupItem,
    selectEdge,
    selectNode,
    setViewport,
    updateBoardConfig,
    updateReferenceGroupItemRole,
    updateAgentInstruction,
    updateGenerateNode,
    updateNodesPositions,
    updateNoteBody,
    updatePromptNode,
  } = controller;
  const viewportRef = useRef<BoardViewport>(board.viewport);
  useLayoutEffect(() => {
    viewportRef.current = board.viewport;
    selectionRef.current = { edgeId: selectedEdgeId, nodeId: selectedNodeId, nodeIds: selectedNodeIds };
  }, [board.viewport, selectedEdgeId, selectedNodeId, selectedNodeIds]);

  const boardGraphContentKey = useMemo(
    () => buildBoardGraphContentKey(board.nodes, board.edges),
    [board.nodes, board.edges],
  );

  const closeOverlayMenus = useCallback(() => {
    setQuickInsertMenu(null);
    setNodeContextMenu(null);
  }, []);

  const trashAndDeleteNode = useCallback((nodeId: string) => {
    const node = board.nodes.find(item => item.id === nodeId);
    if (node) {
      const edges = board.edges.filter(edge => edge.from.nodeId === nodeId || edge.to.nodeId === nodeId);
      setTrashedNodes(current => [{ node: structuredClone(node), edges: structuredClone(edges) }, ...current].slice(0, BOARD_TRASH_LIMIT));
    }
    deleteNode(nodeId);
    setSelectedNodeIds(current => {
      const next = current.filter(id => id !== nodeId);
      return sameStringList(current, next) ? current : next;
    });
  }, [board.edges, board.nodes, deleteNode]);

  const restoreTrashedNode = useCallback((index: number) => {
    const entry = trashedNodes[index];
    if (!entry) return;
    try {
      restoreNodeWithEdges(entry.node, entry.edges);
      setTrashedNodes(current => current.filter((_item, itemIndex) => itemIndex !== index));
    } catch (error) {
      onConnectionError(error instanceof Error ? error.message : "恢复节点失败");
    }
  }, [onConnectionError, restoreNodeWithEdges, trashedNodes]);

  const flowNodeDataById = useMemo(() => {
    const dataById = new Map<string, BoardFlowNode["data"]>();
    for (const node of board.nodes) {
      dataById.set(node.id, {
        generateInputSummary: generateInputSummaryForNode(node, board.nodes, board.edges),
        hasResultConnection: hasResultConnection(node.id, board.edges),
        node,
        generateReferences:
          node.kind === "image-generate" || node.kind === "video-generate"
            ? buildBoardPromptReferences({
              nodes: board.nodes,
              edges: board.edges,
              focus: { kind: "generate", nodeId: node.id },
              galleryItems: galleryReferenceItems,
            })
            : [],
        promptReferences:
          node.kind === "prompt"
            ? buildBoardPromptReferences({
              nodes: board.nodes,
              edges: board.edges,
              focus: { kind: "prompt", nodeId: node.id },
              galleryItems: galleryReferenceItems,
            })
            : [],
        compareReferenceUrl:
          node.kind === "asset" && node.asset.type === "image"
            ? assetCompareReferenceUrl(node.id, board.nodes, board.edges)
            : null,
        onCaptureVideoFrame,
        onCancelGenerate: onCancelGenerateNode,
        onOpenAssetCompare: (nodeId: string) => {
          const assetNode = board.nodes.find(item => item.id === nodeId);
          if (assetNode?.kind !== "asset" || assetNode.asset.type !== "image") return;
          const originalUrl = assetCompareReferenceUrl(nodeId, board.nodes, board.edges);
          if (!originalUrl) return;
          setAssetCompare({ originalUrl, resultUrl: assetNode.asset.url });
        },
        onDelete: trashAndDeleteNode,
        onEditAssetImage,
        onExecuteGenerate: onExecuteGenerateNode,
        onMoveReferenceGroupItem: moveReferenceGroupItem,
        onRemoveReferenceGroupItem: removeReferenceGroupItem,
        onSendAgent: onSendAgentNode,
        onSendAssetToAgent,
        onSetAssetAsReference,
        onUpdateReferenceGroupItemRole: updateReferenceGroupItemRole,
        onUpdateAgent: updateAgentInstruction,
        onUpdateGenerate: updateGenerateNode,
        onUpdateNote: updateNoteBody,
        onUpdatePrompt: updatePromptNode,
      });
    }
    return dataById;
    // board.nodes / board.edges read when graph content changes; omit to skip position-only updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    boardGraphContentKey,
    galleryReferenceItems,
    onCancelGenerateNode,
    onCaptureVideoFrame,
    onEditAssetImage,
    onExecuteGenerateNode,
    moveReferenceGroupItem,
    removeReferenceGroupItem,
    onSendAssetToAgent,
    onSendAgentNode,
    onSetAssetAsReference,
    trashAndDeleteNode,
    updateReferenceGroupItemRole,
    updateAgentInstruction,
    updateGenerateNode,
    updateNoteBody,
    updatePromptNode,
  ]);

  const generateTaskByNodeId = useMemo(() => {
    const map = new Map<string, BoardGenerateTaskSummary>();
    for (const node of board.nodes) {
      if (node.kind !== "image-generate" && node.kind !== "video-generate") continue;
      const task = activeGenerateTaskForNode(galleryItems, node.id);
      if (task) map.set(node.id, task);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- task fingerprint gates progress-only polls
  }, [galleryTaskFingerprint]);

  const flowNodes = useMemo<BoardFlowNode[]>(
    () =>
      board.nodes.map(node => {
        const cachedData = flowNodeDataById.get(node.id);
        if (!cachedData) {
          throw new Error(`Missing flow data for board node ${node.id}`);
        }
        return {
          id: node.id,
          type: "board",
          position: node.position,
          data: {
            ...cachedData,
            node,
            generateTaskSummary:
              node.kind === "image-generate" || node.kind === "video-generate"
                ? generateTaskByNodeId.get(node.id)
                : undefined,
          },
        };
      }),
    [board.nodes, flowNodeDataById, generateTaskByNodeId],
  );
  const [reactFlowNodes, setReactFlowNodes] = useState<BoardFlowNode[]>(flowNodes);
  const reactFlowNodesRef = useRef<BoardFlowNode[]>(flowNodes);
  useLayoutEffect(() => {
    if (isNodeDragActiveRef.current) return;
    if (sameFlowNodeModelList(reactFlowNodesRef.current, flowNodes)) return;
    reactFlowNodesRef.current = flowNodes;
    setReactFlowNodes(flowNodes);
  }, [flowNodes]);
  const flowEdges = useMemo<BoardFlowEdge[]>(
    () =>
      board.edges.map(edge => ({
        id: edge.id,
        source: edge.from.nodeId,
        target: edge.to.nodeId,
        sourceHandle: edge.from.portId,
        targetHandle: edge.to.portId,
        type: "smoothstep",
        animated: edge.kind === "result" || isGenerateEdgeProcessing(edge, board.nodes),
        data: { kind: edge.kind, processing: isGenerateEdgeProcessing(edge, board.nodes) },
        className: `imagine-board-edge imagine-board-edge-${edge.kind}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(edge.kind), width: 18, height: 18 },
        style: { strokeWidth: selectedEdgeId === edge.id ? 3 : 2 },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- graph key gates processing animation without position churn
    [boardGraphContentKey, selectedEdgeId, themeMode],
  );

  const isValidBoardConnection = useCallback<IsValidConnection<BoardFlowEdge>>((connection) => {
    const refs = connectionPortRefs(connection);
    return refs ? isValidBoardPortConnection(board.nodes, refs.from, refs.to) : false;
  }, [board.nodes]);

  const handleConnect: OnConnect = (connection) => {
    const refs = connectionPortRefs(connection);
    if (!refs || !isValidBoardPortConnection(board.nodes, refs.from, refs.to)) {
      onConnectionError("端口类型不兼容：图片可连参考/Agent，Prompt 可连生成，生成结果可连资产。");
      return;
    }
    try {
      const targetNode = board.nodes.find(node => node.id === refs.to.nodeId);
      if (targetNode?.kind === "reference-group") {
        addAssetToReferenceGroup(refs.from.nodeId, refs.to.nodeId);
      }
      connectPorts(refs.from, refs.to);
    } catch (error) {
      onConnectionError(error instanceof Error ? error.message : "连接失败");
    }
  };

  const handleSelectionChange = useCallback<OnSelectionChangeFunc<BoardFlowNode, BoardFlowEdge>>(({ nodes, edges }) => {
    const ids = nodes.map(node => node.id);
    const edgeId = edges[0]?.id ?? null;
    const nodeId = ids[0] ?? null;
    const nextSelection = edgeId
      ? { edgeId, nodeId: null, nodeIds: ids }
      : { edgeId: null, nodeId, nodeIds: ids };
    if (sameBoardSelectionSnapshot(selectionRef.current, nextSelection)) return;
    selectionRef.current = nextSelection;
    updateSelectedNodeIds(ids);
    selectEdge(nextSelection.edgeId);
    selectNode(nextSelection.nodeId);
  }, [selectEdge, selectNode, updateSelectedNodeIds]);

  const handleNodeClick: NodeMouseHandler<BoardFlowNode> = () => {
    closeOverlayMenus();
  };

  const handleNodeDoubleClick: NodeMouseHandler<BoardFlowNode> = (_event, node) => {
    if (node.data.node.kind === "image-generate" || node.data.node.kind === "video-generate") {
      onExecuteGenerateNode(node.id);
    }
  };

  const handleNodeContextMenu: NodeMouseHandler<BoardFlowNode> = (event, node) => {
    event.preventDefault();
    closeOverlayMenus();
    setNodeContextMenu({ nodeId: node.id, clientX: event.clientX, clientY: event.clientY });
    selectNode(node.id);
    selectEdge(null);
    updateSelectedNodeIds([node.id]);
  };

  const handleReconnect = useCallback<OnReconnect<BoardFlowEdge>>((oldEdge, newConnection) => {
    const refs = connectionPortRefs(newConnection);
    if (!refs || !isValidBoardPortConnection(board.nodes, refs.from, refs.to)) {
      onConnectionError("端口类型不兼容：图片可连参考/Agent，Prompt 可连生成，生成结果可连资产。");
      return;
    }
    try {
      const targetNode = board.nodes.find(node => node.id === refs.to.nodeId);
      if (targetNode?.kind === "reference-group") {
        addAssetToReferenceGroup(refs.from.nodeId, refs.to.nodeId);
      }
      reconnectEdge(oldEdge.id, refs.from, refs.to);
    } catch (error) {
      onConnectionError(error instanceof Error ? error.message : "重连失败");
    }
  }, [addAssetToReferenceGroup, board.nodes, onConnectionError, reconnectEdge]);

  const handleEdgeClick: EdgeMouseHandler<BoardFlowEdge> = (_event, edge) => {
    closeOverlayMenus();
    selectEdge(edge.id);
    selectNode(null);
    updateSelectedNodeIds([]);
  };

  const handleNodeDragStart = useCallback<OnNodeDrag<BoardFlowNode>>(() => {
    isNodeDragActiveRef.current = true;
    pendingDragPositionByIdRef.current.clear();
  }, []);

  const handleNodeDragStop = useCallback<OnNodeDrag<BoardFlowNode>>((_event, node, nodes) => {
    isNodeDragActiveRef.current = false;
    const positionById = new Map(pendingDragPositionByIdRef.current);
    const draggedNodes = nodes.length > 0 ? nodes : [node];
    for (const draggedNode of draggedNodes) {
      positionById.set(draggedNode.id, draggedNode.position);
    }
    pendingDragPositionByIdRef.current.clear();
    beginUndoGesture();
    updateNodesPositions(Array.from(positionById, ([nodeId, position]) => ({ nodeId, position })));
    endUndoGesture();
  }, [beginUndoGesture, endUndoGesture, updateNodesPositions]);

  const handleNodesChange = useCallback<OnNodesChange<BoardFlowNode>>((changes) => {
    setReactFlowNodes(currentNodes => {
      const nextNodes = applyNodeChanges(changes, currentNodes);
      const resolvedNodes = sameFlowNodeList(currentNodes, nextNodes) ? currentNodes : nextNodes;
      reactFlowNodesRef.current = resolvedNodes;
      return resolvedNodes;
    });
    const settledPositions: Array<{ nodeId: string; position: BoardPoint }> = [];
    for (const change of changes) {
      if (change.type !== "position" || !change.position || change.dragging === true) continue;
      if (isNodeDragActiveRef.current) {
        pendingDragPositionByIdRef.current.set(change.id, change.position);
        continue;
      }
      settledPositions.push({ nodeId: change.id, position: change.position });
    }
    if (settledPositions.length === 0) return;
    updateNodesPositions(settledPositions);
  }, [updateNodesPositions]);

  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: BoardViewport): void => {
    if (sameBoardViewportModel(viewportRef.current, viewport)) return;
    viewportRef.current = viewport;
    setViewport(viewport);
  }, [setViewport]);


  const handleNodesDelete: OnNodesDelete<BoardFlowNode> = nodes => {
    for (const node of nodes) trashAndDeleteNode(node.id);
    updateSelectedNodeIds([]);
  };

  const deleteBoardEdge = useCallback((edgeId: string): void => {
    const edge = board.edges.find(item => item.id === edgeId);
    if (!edge) {
      deleteEdge(edgeId);
      return;
    }
    const targetNode = board.nodes.find(node => node.id === edge.to.nodeId);
    const sourceNode = board.nodes.find(node => node.id === edge.from.nodeId);
    if (targetNode?.kind === "reference-group" && sourceNode?.kind === "asset") {
      removeReferenceGroupItem(targetNode.id, sourceNode.asset.assetId);
      return;
    }
    deleteEdge(edgeId);
  }, [board.edges, board.nodes, deleteEdge, removeReferenceGroupItem]);

  const handleEdgesDelete: OnEdgesDelete<BoardFlowEdge> = edges => {
    for (const edge of edges) deleteBoardEdge(edge.id);
  };

  const snapToGrid = board.config.snapToGrid;

  const flowPositionFromClient = useCallback((clientX: number, clientY: number): BoardPoint => {
    const instance = flowInstanceRef.current;
    if (instance) {
      return instance.screenToFlowPosition(
        { x: clientX, y: clientY },
        { snapToGrid, snapGrid: BOARD_SNAP_GRID },
      );
    }
    const rect = flowHostRef.current?.getBoundingClientRect();
    const point = {
      x: ((clientX - (rect?.left ?? 0)) - board.viewport.x) / board.viewport.zoom,
      y: ((clientY - (rect?.top ?? 0)) - board.viewport.y) / board.viewport.zoom,
    };
    return snapBoardPoint(point, snapToGrid);
  }, [board.viewport.x, board.viewport.y, board.viewport.zoom, snapToGrid]);

  const centeredNodePosition = useCallback((point: BoardPoint, size: BoardSize): BoardPoint => {
    const centered = {
      x: point.x - size.width / 2,
      y: point.y - size.height / 2,
    };
    if (snapToGrid) return snapBoardPoint(centered, true);
    return {
      x: Math.round(centered.x),
      y: Math.round(centered.y),
    };
  }, [snapToGrid]);

  const visibleCenterPosition = useCallback((size: BoardSize): BoardPoint | undefined => {
    const rect = flowHostRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    const center = flowPositionFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return centeredNodePosition(center, size);
  }, [centeredNodePosition, flowPositionFromClient]);

  const addQuickNode = useCallback((kind: BoardInsertKind, position: BoardPoint): string => {
    if (kind === "prompt") return addPromptNode({ position });
    if (kind === "reference-group") return addReferenceGroupNode({ position });
    if (kind === "agent") return addAgentNode({ position });
    if (kind === "note") return addNoteNode({ position });
    if (kind === "video-generate") {
      return addGenerateNode({ kind: "video-generate", model: DEFAULT_VIDEO_MODEL, aspectRatio: "auto", position });
    }
    return addGenerateNode({
      kind: "image-generate",
      model: DEFAULT_BOARD_IMAGE_MODEL,
      aspectRatio: "1:1",
      imageResolution: "1024x1024",
      position,
    });
  }, [addAgentNode, addGenerateNode, addNoteNode, addPromptNode, addReferenceGroupNode]);

  const addQuickNodeAtPoint = useCallback((kind: BoardInsertKind, point: BoardPoint): void => {
    const item = BOARD_INSERT_CATALOG.find(current => current.kind === kind);
    if (!item) return;
    addQuickNode(kind, centeredNodePosition(point, item.size));
    setQuickInsertMenu(null);
  }, [addQuickNode, centeredNodePosition]);

  const addConnectedQuickNodeAtPoint = useCallback((kind: BoardInsertKind, point: BoardPoint, from: BoardPortRef): void => {
    if (kind === "image-generate") {
      addGenerateNodeWithConnection(
        {
          kind: "image-generate",
          model: from.portKind === "asset" ? DEFAULT_BOARD_REFERENCE_IMAGE_MODEL : DEFAULT_BOARD_IMAGE_MODEL,
          aspectRatio: "1:1",
          imageResolution: "1024x1024",
          position: centeredNodePosition(point, DEFAULT_GENERATE_NODE_SIZE),
        },
        from,
        from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn,
      );
      setQuickInsertMenu(null);
      return;
    }
    if (kind === "video-generate") {
      addGenerateNodeWithConnection(
        { kind: "video-generate", model: DEFAULT_VIDEO_MODEL, aspectRatio: "auto", position: centeredNodePosition(point, DEFAULT_GENERATE_NODE_SIZE) },
        from,
        from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn,
      );
      setQuickInsertMenu(null);
      return;
    }
    if (kind === "reference-group") {
      addReferenceGroupNodeWithAsset({ position: centeredNodePosition(point, DEFAULT_REFERENCE_GROUP_NODE_SIZE) }, from.nodeId);
      setQuickInsertMenu(null);
      return;
    }
  }, [addGenerateNodeWithConnection, addReferenceGroupNodeWithAsset, centeredNodePosition]);

  const quickInsertMenuItems = useMemo(() => {
    const from = quickInsertMenu?.connectionFrom;
    if (!from) return BOARD_INSERT_CATALOG;
    const sourceNode = board.nodes.find(node => node.id === from.nodeId);
    if (from.portKind === "prompt") {
      return BOARD_INSERT_CATALOG.filter(item => item.kind === "image-generate" || item.kind === "video-generate");
    }
    if (from.portKind !== "asset") return [];
    if (sourceNode?.kind === "asset") {
      return BOARD_INSERT_CATALOG.filter(item => item.kind === "image-generate" || item.kind === "video-generate" || item.kind === "reference-group");
    }
    if (sourceNode?.kind === "reference-group") {
      return BOARD_INSERT_CATALOG.filter(item => item.kind === "image-generate" || item.kind === "video-generate");
    }
    return [];
  }, [board.nodes, quickInsertMenu?.connectionFrom]);

  const pasteCopiedNode = useCallback((): void => {
    const copied = copiedNodeRef.current;
    if (!copied) return;
    const { node } = copied;
    const position = pastedNodePosition(node);
    const rememberPastedPosition = (): void => {
      copiedNodeRef.current = {
        node: {
          ...node,
          position,
          updatedAt: new Date().toISOString(),
        },
      };
    };
    if (node.kind === "asset") {
      addAssetNode({ asset: node.asset, position, size: node.size, title: node.title });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "prompt") {
      addPromptNode({ position, prompt: node.prompt, size: node.size, title: node.title });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "reference-group") {
      addReferenceGroupNode({ position, references: node.references, size: node.size, title: node.title });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "image-generate") {
      addGenerateNode({
        kind: "image-generate",
        aspectRatio: node.aspectRatio,
        customImageResolution: node.customImageResolution,
        imageQuality: node.imageQuality,
        imageResolution: node.imageResolution,
        model: node.model,
        position,
        prompt: node.prompt,
        size: node.size,
        thinkingLevel: node.thinkingLevel,
        title: node.title,
        variantCount: node.variantCount,
      });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "video-generate") {
      addGenerateNode({
        kind: "video-generate",
        aspectRatio: node.aspectRatio,
        model: node.model,
        position,
        prompt: node.prompt,
        size: node.size,
        title: node.title,
        variantCount: node.variantCount,
        videoDuration: node.videoDuration,
        videoPreset: node.videoPreset,
        videoResolution: node.videoResolution,
      });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "agent") {
      addAgentNode({ instruction: node.instruction, position, size: node.size, title: node.title });
      rememberPastedPosition();
      return;
    }
    addNoteNode({ body: node.body, position, size: node.size, title: node.title });
    rememberPastedPosition();
  }, [addAgentNode, addAssetNode, addGenerateNode, addNoteNode, addPromptNode, addReferenceGroupNode]);

  const handleConnectEnd = useCallback<OnConnectEnd>((event, connectionState) => {
    if (connectionState.isValid || !connectionState.fromNode || !connectionState.fromHandle) return;
    if (!(event instanceof MouseEvent) && !(event instanceof TouchEvent)) return;
    const clientPoint = event instanceof MouseEvent
      ? { x: event.clientX, y: event.clientY }
      : { x: event.changedTouches[0]?.clientX, y: event.changedTouches[0]?.clientY };
    if (typeof clientPoint.x !== "number" || typeof clientPoint.y !== "number") return;

    const sourceNodeId = connectionState.fromNode.id;
    const sourceHandleId = connectionState.fromHandle.id;
    if (!sourceNodeId || !sourceHandleId) return;
    const sourceKind = portKindFromHandle(sourceHandleId);
    const sourceDirection = handleDirectionFromHandle(sourceHandleId);
    if (sourceDirection !== "output") return;

    const flowPoint = flowPositionFromClient(clientPoint.x, clientPoint.y);
    if (sourceKind === "prompt") {
      setQuickInsertMenu({
        clientX: clientPoint.x,
        clientY: clientPoint.y,
        connectionFrom: { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "prompt" },
        position: flowPoint,
      });
      return;
    }
    if (sourceKind === "asset") {
      const sourceNode = board.nodes.find(node => node.id === sourceNodeId);
      if (sourceNode?.kind === "asset") {
        if (sourceNode.asset.type !== "image") {
          onConnectionError("参考组只支持图片资产。");
          return;
        }
        if (sourceHandleId === "asset-out") {
          setQuickInsertMenu({
            clientX: clientPoint.x,
            clientY: clientPoint.y,
            connectionFrom: { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "asset" },
            position: flowPoint,
          });
          return;
        }
        return;
      }
      if (sourceNode?.kind !== "reference-group") return;
      setQuickInsertMenu({
        clientX: clientPoint.x,
        clientY: clientPoint.y,
        connectionFrom: { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "asset" },
        position: flowPoint,
      });
      return;
    }
    if (sourceKind === "result") {
      const sourceNode = board.nodes.find(node => node.id === sourceNodeId);
      if (sourceNode?.kind !== "image-generate" && sourceNode?.kind !== "video-generate") return;
      if (!sourceNode.resultAssetId) {
        onConnectionError("生成结果尚未就绪");
        return;
      }
      const item = galleryItems.find(entry => entry.id === sourceNode.resultAssetId);
      if (!item || item.status !== "complete") {
        onConnectionError("找不到生成结果资产");
        return;
      }
      addAssetNodeWithConnection(
        {
          position: centeredNodePosition(flowPoint, DEFAULT_ASSET_NODE_SIZE),
          asset: storageItemToBoardAsset(item),
          title: item.prompt,
        },
        { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "result" },
      );
      return;
    }
  }, [addAssetNodeWithConnection, board.nodes, centeredNodePosition, flowPositionFromClient, galleryItems, onConnectionError]);

  const openQuickInsertMenu = useCallback((event: ReactMouseEvent | MouseEvent): void => {
    event.preventDefault();
    setNodeContextMenu(null);
    selectNode(null);
    selectEdge(null);
    updateSelectedNodeIds([]);
    setQuickInsertMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      position: flowPositionFromClient(event.clientX, event.clientY),
    });
  }, [flowPositionFromClient, selectEdge, selectNode, updateSelectedNodeIds]);

  const handleFlowDoubleClick = useCallback((event: ReactMouseEvent<HTMLElement>): void => {
    if (!(event.target instanceof Element) || !event.target.closest(".react-flow__pane")) return;
    if (
      event.target.closest(".react-flow__node") ||
      event.target.closest(".react-flow__edge") ||
      event.target.closest(".react-flow__handle") ||
      event.target.closest(".react-flow__controls") ||
      event.target.closest(".react-flow__minimap") ||
      event.target.closest(".imagine-board-quick-insert")
    ) {
      return;
    }
    openQuickInsertMenu(event);
  }, [openQuickInsertMenu]);

  const insertFromToolbar = useCallback((kind: BoardInsertKind) => {
    const item = BOARD_INSERT_CATALOG.find(current => current.kind === kind);
    if (!item) return;
    const position = visibleCenterPosition(item.size);
    if (!position) return;
    addQuickNode(kind, position);
  }, [addQuickNode, visibleCenterPosition]);

  const importFilesAtPoint = useCallback((files: File[], point: BoardPoint): void => {
    if (files.length === 0) return;
    void onImportBoardFiles(files, centeredNodePosition(point, DEFAULT_ASSET_NODE_SIZE));
    setQuickInsertMenu(null);
  }, [centeredNodePosition, onImportBoardFiles]);

  const importImageUrlsAtPoint = useCallback((urls: string[], point: BoardPoint): void => {
    if (urls.length === 0) return;
    void Promise.all(urls.map((url, index) => imageUrlToFile(url, index)))
      .then(files => onImportBoardFiles(files, centeredNodePosition(point, DEFAULT_ASSET_NODE_SIZE)))
      .catch(error => onConnectionError(error instanceof Error ? error.message : "图片拖入失败"));
    setQuickInsertMenu(null);
  }, [centeredNodePosition, onConnectionError, onImportBoardFiles]);

  const handleBoardDrop = useCallback((event: ReactDragEvent<HTMLElement>): void => {
    const point = flowPositionFromClient(event.clientX, event.clientY);
    const assetId = event.dataTransfer.getData(IMAGINE_BOARD_ASSET_DRAG_TYPE);
    if (assetId) {
      const item = galleryItems.find(entry => entry.id === assetId);
      if (item && item.status === "complete") {
        event.preventDefault();
        addAssetNode({
          position: centeredNodePosition(point, DEFAULT_ASSET_NODE_SIZE),
          asset: storageItemToBoardAsset(item),
          title: item.prompt,
        });
        closeOverlayMenus();
      }
      return;
    }

    const files = importableFiles(event.dataTransfer);
    if (files.length > 0) {
      event.preventDefault();
      importFilesAtPoint(files, point);
      return;
    }

    const urls = imageUrlsFromDataTransfer(event.dataTransfer);
    if (urls.length === 0) return;
    event.preventDefault();
    importImageUrlsAtPoint(urls, point);
  }, [addAssetNode, centeredNodePosition, closeOverlayMenus, flowPositionFromClient, galleryItems, importFilesAtPoint, importImageUrlsAtPoint]);

  const handleBoardDragOver = useCallback((event: ReactDragEvent<HTMLElement>): void => {
    if (
      !event.dataTransfer.types.includes(IMAGINE_BOARD_ASSET_DRAG_TYPE) &&
      !hasImportableFile(event.dataTransfer) &&
      !hasImportableImageUrl(event.dataTransfer)
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent): void => {
      if (event.defaultPrevented || isTextEntryTarget(event.target)) return;
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;
      const files = pasteImageFiles(clipboardData);
      if (files.length === 0) return;
      const position = visibleCenterPosition(DEFAULT_ASSET_NODE_SIZE);
      if (!position) return;
      event.preventDefault();
      void onImportBoardFiles(files, position);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onImportBoardFiles, visibleCenterPosition]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeOverlayMenus();
        return;
      }
      if (event.defaultPrevented || isTextEntryTarget(event.target)) return;

      const usesModifier = event.metaKey || event.ctrlKey;
      if (!usesModifier) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        const selectedNode = board.nodes.find(node => node.id === selectedNodeIds[0]);
        if (!selectedNode) return;
        copiedNodeRef.current = { node: selectedNode };
        event.preventDefault();
        return;
      }
      if (key === "v") {
        if (!copiedNodeRef.current) return;
        pasteCopiedNode();
        event.preventDefault();
        return;
      }
      if (key === "d") {
        if (selectedNodeIds.length === 0) return;
        duplicateNodes(selectedNodeIds);
        event.preventDefault();
        return;
      }
      if (key === "z" && event.shiftKey) {
        if (!canRedo) return;
        flushAllBoardText();
        redo();
        event.preventDefault();
        return;
      }
      if (key === "z" && !event.shiftKey) {
        if (!canUndo) return;
        flushAllBoardText();
        undo();
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    board.nodes,
    canRedo,
    canUndo,
    closeOverlayMenus,
    duplicateNode,
    duplicateNodes,
    pasteCopiedNode,
    redo,
    selectedNodeIds,
    undo,
  ]);

  return (
    <main className="imagine-workbench-shell imagine-theme-dark flex h-screen min-h-0 flex-col bg-[var(--iw-bg)] text-[var(--iw-text)]">
      <BoardToolbar
        boardId={board.id}
        boardSummaries={boardSummaries}
        boardTitle={board.title}
        showGrid={board.config.showGrid}
        showMiniMap={board.config.showMiniMap}
        snapToGrid={board.config.snapToGrid}
        nodeCount={board.nodes.length}
        canRedo={canRedo}
        canUndo={canUndo}
        saveError={saveError}
        saveStatus={saveStatus}
        trashedCount={trashedNodes.length}
        onRedo={redo}
        onRestoreTrash={trashedNodes.length > 0 ? () => restoreTrashedNode(0) : undefined}
        onInsert={insertFromToolbar}
        onUndo={undo}
        onBack={onBack}
        onClear={clearBoard}
        onCreateBoard={onCreateBoard}
        onDeleteBoard={onDeleteBoard}
        onOpenSettings={onOpenSettings}
        onRenameBoard={onRenameBoard}
        onSelectBoard={onSelectBoard}
        onToggleGrid={() => updateBoardConfig({ showGrid: !board.config.showGrid })}
        onToggleMiniMap={() => updateBoardConfig({ showMiniMap: !board.config.showMiniMap })}
        onToggleSnapToGrid={() => updateBoardConfig({ snapToGrid: !board.config.snapToGrid })}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]">
        <section
          ref={flowHostRef}
          tabIndex={-1}
          onDoubleClick={handleFlowDoubleClick}
          onDragOver={handleBoardDragOver}
          onDrop={handleBoardDrop}
          className="board-canvas relative min-h-0 bg-[var(--iw-board-canvas-bg)]"
        >
          <ReactFlow
            nodes={reactFlowNodes}
            edges={flowEdges}
            edgeTypes={edgeTypes}
            nodeTypes={nodeTypes}
            colorMode={themeMode}
            defaultViewport={board.viewport}
            minZoom={0.25}
            maxZoom={1.8}
            onlyRenderVisibleElements
            connectOnClick={false}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={48}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={reactFlowConnectionLineStyle}
            defaultEdgeOptions={reactFlowDefaultEdgeOptions}
            deleteKeyCode={reactFlowDeleteKeyCode}
            isValidConnection={isValidBoardConnection}
            nodesConnectable
            nodesDraggable
            snapToGrid={snapToGrid}
            snapGrid={BOARD_SNAP_GRID}
            nodesFocusable
            edgesFocusable
            edgesReconnectable
            elementsSelectable
            multiSelectionKeyCode="Shift"
            onReconnect={handleReconnect}
            onSelectionChange={handleSelectionChange}
            panOnDrag={reactFlowPanOnDrag}
            selectionOnDrag
            onConnect={handleConnect}
            onConnectEnd={handleConnectEnd}
            onEdgeClick={handleEdgeClick}
            onEdgeDoubleClick={(_event, edge) => deleteBoardEdge(edge.id)}
            onEdgesDelete={handleEdgesDelete}
            onInit={(instance) => {
              flowInstanceRef.current = instance;
            }}
            onMoveEnd={handleMoveEnd}
            onNodeClick={handleNodeClick}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onNodesChange={handleNodesChange}
            onNodesDelete={handleNodesDelete}
            onPaneClick={() => {
              flowHostRef.current?.focus();
              closeOverlayMenus();
              selectNode(null);
              selectEdge(null);
              updateSelectedNodeIds([]);
            }}
            onPaneContextMenu={openQuickInsertMenu}
            proOptions={reactFlowProOptions}
            zoomOnDoubleClick={false}
          >
            {board.config.showGrid && <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--iw-board-handle)" />}
            <Controls className="imagine-board-controls" />
            {board.config.showMiniMap && (
              <MiniMap
                className="imagine-board-minimap"
                nodeColor={getBoardVar("--iw-board-minimap-node", themeMode === "light" ? "#1e40af" : "#1d4ed8")}
                maskColor={getBoardVar("--iw-board-minimap-mask", themeMode === "light" ? "rgba(241, 245, 249, 0.75)" : "rgba(2,6,23,0.66)")}
                pannable
                zoomable
              />
            )}
          </ReactFlow>
          {board.nodes.length === 0 && <BoardEmptyHint />}
          {quickInsertMenu ? (
            <BoardQuickInsertMenu
              clientX={quickInsertMenu.clientX}
              clientY={quickInsertMenu.clientY}
              items={quickInsertMenuItems}
              position={quickInsertMenu.position}
              onPick={(kind, position) => {
                const quickKind = kind as BoardInsertKind;
                if (quickInsertMenu.connectionFrom) {
                  addConnectedQuickNodeAtPoint(quickKind, position, quickInsertMenu.connectionFrom);
                  return;
                }
                addQuickNodeAtPoint(quickKind, position);
              }}
            />
          ) : null}
          {nodeContextMenu ? (() => {
            const node = board.nodes.find(item => item.id === nodeContextMenu.nodeId);
            if (!node) return null;
            const compareReferenceUrl = node.kind === "asset" && node.asset.type === "image"
              ? assetCompareReferenceUrl(node.id, board.nodes, board.edges)
              : null;
            const actions = buildBoardNodeContextMenuActions({
              node,
              onCompare: compareReferenceUrl && node.kind === "asset"
                ? () => {
                  setAssetCompare({ originalUrl: compareReferenceUrl, resultUrl: node.asset.url });
                  closeOverlayMenus();
                }
                : undefined,
              onDelete: () => {
                trashAndDeleteNode(node.id);
                closeOverlayMenus();
              },
              onDuplicate: () => {
                duplicateNode(node.id);
                closeOverlayMenus();
              },
              onEditImage: node.kind === "asset" ? () => {
                onEditAssetImage(node.id);
                closeOverlayMenus();
              } : undefined,
              onExecute: node.kind === "image-generate" || node.kind === "video-generate"
                ? () => {
                  onExecuteGenerateNode(node.id);
                  closeOverlayMenus();
                }
                : undefined,
              onSendAgent: node.kind === "asset"
                ? () => {
                  onSendAssetToAgent(node.id);
                  closeOverlayMenus();
                }
                : node.kind === "agent"
                  ? () => {
                    onSendAgentNode(node.id);
                    closeOverlayMenus();
                  }
                  : undefined,
              onSetReference: node.kind === "asset" ? () => {
                onSetAssetAsReference(node.id);
                closeOverlayMenus();
              } : undefined,
            });
            return (
              <BoardNodeContextMenu
                actions={actions}
                clientX={nodeContextMenu.clientX}
                clientY={nodeContextMenu.clientY}
                node={node}
              />
            );
          })() : null}
        </section>
        {children}
      </div>
      {assetCompare && (
        <BoardAssetCompareOverlay
          originalUrl={assetCompare.originalUrl}
          resultUrl={assetCompare.resultUrl}
          onClose={() => setAssetCompare(null)}
        />
      )}
    </main>
  );
}
