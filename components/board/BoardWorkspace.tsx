"use client";

import { Upload } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  BaseEdge,
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  MarkerType,
  MiniMap,
  PanOnScrollMode,
  ReactFlow,
  getSmoothStepPath,
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
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import BoardQuickInsertMenu, { type BoardQuickInsertMenuItem } from "@/components/board/BoardQuickInsertMenu";
import BoardNodeContextMenu, { buildBoardNodeContextMenuActions } from "@/components/board/BoardNodeContextMenu";
import { BoardMediaImportProvider } from "@/components/board/BoardMediaImportContext";
import {
  BOARD_MEDIA_FILE_ACCEPT,
  BOARD_QUICK_INSERT_IMPORT_KIND,
  BOARD_TRASH_LIMIT,
  IMAGINE_BOARD_ASSET_DRAG_TYPE,
  isTextEntryTarget,
} from "@/lib/board/interaction";
import type { BoardStateController } from "@/hooks/useBoardState";
import BoardNode, { type BoardFlowNode } from "@/components/board/BoardNode";
import type { BoardGenerateInputSummary, BoardGenerateTaskSummary } from "@/components/board/GenerateBoardNode";
import BoardEmptyHint from "@/components/board/BoardEmptyHint";
import BoardToolbar from "@/components/board/BoardToolbar";
import BoardAssetCompareOverlay from "@/components/board/BoardAssetCompareOverlay";
import type { WorkspaceNoticeType } from "@/components/workbench/WorkspaceNotices";
import { ensureHydratedStorageItem } from "@/lib/assets/ensure-hydrated";
import type { StorageItem } from "@/lib/db";
import {
  buildGalleryReferenceFingerprint,
  buildGalleryTaskFingerprint,
  buildBoardGraphContentKey,
} from "@/lib/board/graph-content-key";
import { flushAllBoardText } from "@/lib/board/text-flush-registry";
import {
  assetCompareReferenceUrl,
  buildBoardPromptReferenceGraphIndex,
  buildBoardPromptReferences,
  resolveBoardPromptReferenceGroup,
  type BoardPromptReferenceGraphIndex,
  type BoardPromptReference,
} from "@/lib/board/prompt-references";
import { useThemeModeSnapshot } from "@/lib/theme-mode";
import type { CapturedVideoFrame } from "@/lib/video-frame";
import {
  BOARD_SNAP_GRID,
  DEFAULT_AUDIO_ASSET_NODE_SIZE,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_REFERENCE_GROUP_NODE_SIZE,
  DEFAULT_RUNNINGHUB_APP_NODE_SIZE,
  snapBoardPoint,
  type BoardEdge,
  type BoardEdgeKind,
  type BoardNode as BoardNodeModel,
  type BoardPoint,
  type BoardPortKind,
  type BoardPortRef,
  type BoardRunningHubAppSchemaResult,
  type BoardSize,
  type BoardSummary,
  type BoardViewport,
  type CreateAssetNodeInput,
} from "@/lib/board";
import { BOARD_PORT_IDS, isValidBoardConnection as isValidBoardPortConnection } from "@/lib/board/ports";
import { BOARD_INSERT_CATALOG, type BoardInsertKind } from "@/lib/board/insert-catalog";
import { findResultNodeForSource, resultNodeDefaultPosition } from "@/lib/board/utils";
import type { GenerationTask } from "@/lib/generation-tasks";
import { DEFAULT_VIDEO_MODEL } from "@/lib/providers/model-catalog";

interface BoardWorkspaceProps {
  boardSummaries: BoardSummary[];
  controller: BoardStateController;
  children?: ReactNode;
  galleryItems?: StorageItem[];
  generationTasks?: GenerationTask[];
  onBack: () => void;
  onCaptureVideoFrame: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onConnectionError: (message: string) => void;
  onWorkspaceNotice: (type: WorkspaceNoticeType, message: string) => void;
  onCancelGenerateNode: (nodeId: string) => void;
  onEditAssetImage: (nodeId: string) => void;
  onExecuteGenerateNode: (nodeId: string) => void;
  onFetchRunningHubAppSchema: (webappId: string) => Promise<BoardRunningHubAppSchemaResult>;
  onImportBoardFiles: (files: File[], position: BoardPoint) => void | Promise<void>;
  onCreateBoard: () => void;
  onDeleteBoard: () => void;
  onOpenSettings: () => void;
  onOpenFullscreen: (item: StorageItem) => void;
  onRenameBoard: () => void;
  onSelectBoard: (boardId: string) => void;
  onSendAssetToAgent: (nodeId: string) => void;
  onSendAgentNode: (nodeId: string) => void;
  assetCompareRequest?: { originalUrl: string; resultUrl: string } | null;
  focusNodeRequest?: { nodeId: string; seq: number } | null;
  onAssetCompareRequestHandled?: () => void;
  onFocusNodeRequestHandled?: () => void;
  onSelectedNodeIdsChange?: (nodeIds: string[]) => void;
}

type BoardFlowEdge = Edge<{ kind: BoardEdgeKind; processing?: boolean }, "smoothstep">;

const MEDIA_NODE_MIN_HEIGHT = 220;
const MEDIA_NODE_MAX_HEIGHT = 330;
const MEDIA_NODE_MIN_WIDTH = 300;
const MEDIA_NODE_MAX_WIDTH = 540;
const MEDIA_NODE_TARGET_AREA = 130000;
type BoardHandleDirection = "input" | "output";

function mediaNodeSizeForAspectRatio(aspectRatio: number): BoardSize {
  let width = Math.sqrt(MEDIA_NODE_TARGET_AREA * aspectRatio);
  let height = width / aspectRatio;

  if (height > MEDIA_NODE_MAX_HEIGHT) {
    height = MEDIA_NODE_MAX_HEIGHT;
    width = height * aspectRatio;
  }
  if (height < MEDIA_NODE_MIN_HEIGHT) {
    height = MEDIA_NODE_MIN_HEIGHT;
    width = height * aspectRatio;
  }
  if (width > MEDIA_NODE_MAX_WIDTH) {
    width = MEDIA_NODE_MAX_WIDTH;
    height = width / aspectRatio;
  }
  if (width < MEDIA_NODE_MIN_WIDTH) {
    width = MEDIA_NODE_MIN_WIDTH;
    height = width / aspectRatio;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

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

function sameReferenceList(
  left: BoardFlowNode["data"]["generateReferences"],
  right: BoardFlowNode["data"]["generateReferences"],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((reference, index) => {
    const other = right[index];
    return (
      reference.id === other.id &&
      reference.role === other.role &&
      reference.sourceLabel === other.sourceLabel &&
      reference.type === other.type &&
      reference.url === other.url
    );
  });
}

function sameResultItemList(left: StorageItem[], right: StorageItem[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return item.id === other.id && item.status === other.status && item.url === other.url;
  });
}

function findPromptReferenceTargetNodeId(
  nodeId: string,
  nodes: BoardNodeModel[],
  edges: BoardEdge[],
): string | null {
  const node = nodes.find(item => item.id === nodeId);
  if (!node) return null;
  if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "runninghub-app") return node.id;
  if (node.kind !== "prompt") return null;

  const targetGenerateIds = Array.from(new Set(
    edges
      .filter(edge => edge.from.nodeId === node.id && edge.to.portId === BOARD_PORT_IDS.promptIn)
      .map(edge => edge.to.nodeId),
  ));
  return targetGenerateIds.length === 1 ? targetGenerateIds[0] ?? null : null;
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
    return (
      reference.id === other.id &&
      reference.role === other.role &&
      reference.sourceEdgeId === other.sourceEdgeId &&
      reference.type === other.type &&
      reference.url === other.url
    );
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
    left.activeResultAssetId === right.activeResultAssetId &&
    left.compareReferenceUrl === right.compareReferenceUrl &&
    sameGenerateInputSummary(left.generateInputSummary, right.generateInputSummary) &&
    sameGenerateTaskSummary(left.generateTaskSummary, right.generateTaskSummary) &&
    sameResultItemList(left.resultItems, right.resultItems) &&
    sameReferenceList(left.generateReferences, right.generateReferences) &&
    sameReferenceList(left.promptReferences, right.promptReferences)
  );
}

function sameFlowNodeModel(left: BoardFlowNode, right: BoardFlowNode): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    sameFlowNodeDataModel(left.data, right.data) &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y
  );
}

function sameFlowNodeModelList(left: BoardFlowNode[], right: BoardFlowNode[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((node, index) => sameFlowNodeModel(node, right[index]));
}

function sameFlowNodeListByReference(left: BoardFlowNode[], right: BoardFlowNode[]): boolean {
  return left.length === right.length && left.every((node, index) => node === right[index]);
}

function boardSelectedNodeIdSet(selectedNodeId: string | null, selectedNodeIds: string[]): Set<string> {
  const ids = new Set(selectedNodeIds);
  if (selectedNodeId) ids.add(selectedNodeId);
  return ids;
}

function patchFlowNodeSelection(
  nodes: BoardFlowNode[],
  selectedNodeId: string | null,
  selectedNodeIds: string[],
): BoardFlowNode[] {
  const selectedIdSet = boardSelectedNodeIdSet(selectedNodeId, selectedNodeIds);
  let changed = false;
  const next = nodes.map(node => {
    const selected = selectedIdSet.has(node.id);
    if (node.selected === selected) return node;
    changed = true;
    return { ...node, selected };
  });
  return changed ? next : nodes;
}

function mergeFlowNodesFromBoard(
  current: BoardFlowNode[],
  flowNodes: BoardFlowNode[],
  selectedNodeId: string | null,
  selectedNodeIds: string[],
): BoardFlowNode[] {
  const selectedIdSet = boardSelectedNodeIdSet(selectedNodeId, selectedNodeIds);
  const previousById = new Map(current.map(node => [node.id, node]));
  return flowNodes.map(flowNode => {
    const selected = selectedIdSet.has(flowNode.id);
    const previous = previousById.get(flowNode.id);
    if (previous && sameFlowNodeModel(previous, flowNode)) {
      if (previous.selected === selected) return previous;
      return { ...previous, selected };
    }
    if (!previous) return { ...flowNode, selected };
    return {
      ...flowNode,
      selected,
      measured: previous.measured,
      dragging: previous.dragging,
      width: previous.width,
      height: previous.height,
    };
  });
}

function syncReactFlowNodesFromBoard(
  current: BoardFlowNode[],
  flowNodes: BoardFlowNode[],
  selectedNodeId: string | null,
  selectedNodeIds: string[],
): BoardFlowNode[] {
  const next = sameFlowNodeModelList(current, flowNodes)
    ? patchFlowNodeSelection(current, selectedNodeId, selectedNodeIds)
    : mergeFlowNodesFromBoard(current, flowNodes, selectedNodeId, selectedNodeIds);
  return sameFlowNodeListByReference(current, next) ? current : next;
}

function boardIntendedSelectionSnapshot(
  selectedEdgeId: string | null,
  selectedNodeId: string | null,
  selectedNodeIds: string[],
): BoardSelectionSnapshot {
  if (selectedEdgeId) {
    return { edgeId: selectedEdgeId, nodeId: null, nodeIds: [] };
  }
  const nodeIds = selectedNodeIds.length > 0
    ? selectedNodeIds
    : selectedNodeId
      ? [selectedNodeId]
      : [];
  return { edgeId: null, nodeId: nodeIds[0] ?? null, nodeIds };
}

const BoardEdgeComponent = memo(function BoardEdgeComponent({
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
  const showLabel = processing || selected;

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
      {showLabel ? (
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
            {selected ? (
              <button
                type="button"
                aria-label="删除连接"
                title="删除连接"
                onClick={() => void deleteElements({ edges: [{ id }] })}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-muted)] shadow-lg transition hover:border-red-400/40 hover:bg-red-500 hover:text-white"
              >
                <span className="text-sm leading-none">×</span>
              </button>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

const edgeTypes = { smoothstep: BoardEdgeComponent };
const reactFlowConnectionLineStyle = { stroke: "#60a5fa", strokeDasharray: "7 5", strokeWidth: 2.5 };
const reactFlowDefaultEdgeOptions = { type: "smoothstep" };
const reactFlowDeleteKeyCode = ["Backspace", "Delete"];
const reactFlowPanOnDrag = [1, 2];
const reactFlowProOptions = { hideAttribution: true };
const COARSE_POINTER_QUERY = "(pointer: coarse)";

function useCoarsePointer(): boolean {
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(COARSE_POINTER_QUERY);
    const updateCoarsePointer = (): void => setIsCoarsePointer(mediaQuery.matches);

    updateCoarsePointer();
    mediaQuery.addEventListener("change", updateCoarsePointer);
    return () => mediaQuery.removeEventListener("change", updateCoarsePointer);
  }, []);

  return isCoarsePointer;
}

const BOARD_QUICK_INSERT_IMPORT_ITEM: BoardQuickInsertMenuItem = {
  kind: BOARD_QUICK_INSERT_IMPORT_KIND,
  label: "导入媒体",
  icon: Upload,
  iconClassName: "text-emerald-300",
  iconSurfaceClassName: "bg-emerald-500/10 border-emerald-400/20",
};

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

function isBoardImportableMediaFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/");
}

function isBoardImportableMediaType(type: string): boolean {
  return type === "" || type.startsWith("image/") || type.startsWith("video/") || type.startsWith("audio/");
}

function importableFiles(dataTransfer: DataTransfer): File[] {
  const transferFiles = Array.from(dataTransfer.files).filter(isBoardImportableMediaFile);
  if (transferFiles.length > 0) return transferFiles;
  return Array.from(dataTransfer.items)
    .filter(item => item.kind === "file")
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null && isBoardImportableMediaFile(file));
}

function hasImportableFile(dataTransfer: DataTransfer): boolean {
  return (
    Array.from(dataTransfer.files).some(isBoardImportableMediaFile) ||
    Array.from(dataTransfer.items).some(item =>
      item.kind === "file" && isBoardImportableMediaType(item.type),
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

function pasteMediaFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.items)
    .filter(item => item.kind === "file" && isBoardImportableMediaType(item.type))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null && isBoardImportableMediaFile(file));
}

function storageItemToBoardAsset(item: StorageItem): CreateAssetNodeInput["asset"] {
  return {
    assetId: item.id,
    type: item.type,
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

function boardEdgeColors(): Record<BoardEdgeKind, string> {
  return {
    "agent-context": edgeColor("agent-context"),
    prompt: edgeColor("prompt"),
    reference: edgeColor("reference"),
    result: edgeColor("result"),
  };
}

function generateInputSummaryForNode(
  node: BoardNodeModel,
  index: BoardPromptReferenceGraphIndex,
): BoardGenerateInputSummary | undefined {
  if (node.kind !== "image-generate" && node.kind !== "video-generate" && node.kind !== "runninghub-app") return undefined;

  const incomingEdges = index.incomingEdgesByTargetNode.get(node.id) ?? [];
  const promptEdge = incomingEdges.find(edge => edge.to.portId === "prompt-in");
  const promptNode = promptEdge ? index.nodeById.get(promptEdge.from.nodeId) : undefined;
  const promptPreview = promptNode?.kind === "prompt" ? promptNode.prompt : null;
  const seenReferences = new Set<string>();
  const referencePreviews = incomingEdges
    .filter(edge => edge.to.portId === BOARD_PORT_IDS.referenceIn)
    .flatMap(edge => {
      const sourceNode = index.nodeById.get(edge.from.nodeId);
      if (sourceNode?.kind === "asset") {
        return [{
          id: sourceNode.asset.assetId,
          role: "general" as const,
          sourceEdgeId: edge.id,
          type: sourceNode.asset.type,
          url: sourceNode.asset.url,
        }];
      }
      if (sourceNode?.kind === "reference-group") {
        return sourceNode.references.map(reference => ({
          id: reference.assetId,
          role: reference.role,
          sourceEdgeId: edge.id,
          type: reference.type,
          url: reference.url,
        }));
      }
      return [];
    })
    .filter(reference => {
      const key = `${reference.id}:${reference.url}`;
      if (seenReferences.has(key)) return false;
      seenReferences.add(key);
      return true;
    });

  return {
    promptPreview,
    promptSourceTitle: promptNode?.kind === "prompt" ? promptNode.title : undefined,
    referenceCount: referencePreviews.length,
    referencePreviews,
  };
}

function isActiveGenerateTask(item: StorageItem): item is StorageItem & { status: "pending" | "processing" } {
  return item.status === "pending" || item.status === "processing";
}

function isActiveBoardGenerationTask(task: GenerationTask): task is GenerationTask & { status: "pending" | "processing" } {
  return task.status === "pending" || task.status === "processing";
}

function isCurrentGenerateStackItem(item: StorageItem, node: BoardNodeModel): boolean {
  return (
    (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "runninghub-app") &&
    item.sourceBoardNodeId === node.id &&
    (!node.resultStackKey || item.sourceBoardResultStackKey === node.resultStackKey)
  );
}

function isCurrentGenerateStackTask(task: GenerationTask, node: BoardNodeModel): boolean {
  return (
    (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "runninghub-app") &&
    task.source.boardNodeId === node.id &&
    (!node.resultStackKey || task.source.resultStackKey === node.resultStackKey)
  );
}

function buildGenerationTaskFingerprint(tasks: GenerationTask[]): string {
  return tasks
    .map(task => [
      task.id,
      task.status,
      task.progress,
      task.createdAt,
      task.source.boardNodeId ?? "",
      task.source.resultStackKey ?? "",
    ].join(":"))
    .join("|");
}

function isResultSourceNode(node: BoardNodeModel | undefined): node is Extract<BoardNodeModel, { kind: "image-generate" | "video-generate" | "runninghub-app" }> {
  return node?.kind === "image-generate" || node?.kind === "video-generate" || node?.kind === "runninghub-app";
}

async function copyImageUrlToClipboard(url: string): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("当前浏览器不支持复制图片到剪贴板");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`图片读取失败：HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("当前资产不是可复制的图片");
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

function pastedNodePosition(node: BoardNodeModel): BoardPoint {
  return {
    x: node.position.x + 36,
    y: node.position.y + 36,
  };
}

function batchConnectionToTarget(
  nodes: BoardNodeModel[],
  source: BoardNodeModel,
  target: BoardNodeModel,
): { from: BoardPortRef; to: BoardPortRef } | null {
  if (source.id === target.id) return null;
  const outputPort = (() => {
    if (source.kind === "prompt") return { portId: BOARD_PORT_IDS.promptOut, portKind: "prompt" as const };
    if (source.kind === "asset" || source.kind === "reference-group" || source.kind === "result") {
      return { portId: BOARD_PORT_IDS.assetOut, portKind: "asset" as const };
    }
    return null;
  })();
  if (!outputPort) return null;

  const inputPort = (() => {
    if (target.kind === "reference-group" && outputPort.portKind === "asset") {
      return { portId: BOARD_PORT_IDS.assetIn, portKind: "asset" as const };
    }
    if (target.kind === "agent" && outputPort.portKind === "asset") {
      return { portId: BOARD_PORT_IDS.agentContextIn, portKind: "agent" as const };
    }
    if (target.kind === "image-generate" || target.kind === "video-generate" || target.kind === "runninghub-app") {
      return outputPort.portKind === "prompt"
        ? { portId: BOARD_PORT_IDS.promptIn, portKind: "prompt" as const }
        : { portId: BOARD_PORT_IDS.referenceIn, portKind: "asset" as const };
    }
    return null;
  })();
  if (!inputPort) return null;

  const connection = {
    from: { nodeId: source.id, ...outputPort },
    to: { nodeId: target.id, ...inputPort },
  };
  return isValidBoardPortConnection(nodes, connection.from, connection.to) ? connection : null;
}

export default function BoardWorkspace({
  boardSummaries,
  children,
  controller,
  galleryItems = [],
  generationTasks = [],
  onBack,
  onCancelGenerateNode,
  onCaptureVideoFrame,
  onConnectionError,
  onWorkspaceNotice,
  onEditAssetImage,
  onExecuteGenerateNode,
  onFetchRunningHubAppSchema,
  onImportBoardFiles,
  onCreateBoard,
  onDeleteBoard,
  onOpenSettings,
  onOpenFullscreen,
  onRenameBoard,
  onSelectBoard,
  onSendAssetToAgent,
  onSendAgentNode,
  assetCompareRequest = null,
  focusNodeRequest = null,
  onAssetCompareRequestHandled,
  onFocusNodeRequestHandled,
  onSelectedNodeIdsChange,
}: BoardWorkspaceProps) {
  const themeMode = useThemeModeSnapshot();
  const isCoarsePointer = useCoarsePointer();
  const flowInstanceRef = useRef<ReactFlowInstance<BoardFlowNode, BoardFlowEdge> | null>(null);
  const flowHostRef = useRef<HTMLElement | null>(null);
  const mediaImportInputRef = useRef<HTMLInputElement>(null);
  const pendingImportPointRef = useRef<BoardPoint | null>(null);
  const copiedNodeRef = useRef<CopiedBoardNode | null>(null);
  const isNodeDragActiveRef = useRef(false);
  const pendingDragPositionByIdRef = useRef<Map<string, BoardPoint>>(new Map());
  const selectionRef = useRef<BoardSelectionSnapshot>({ edgeId: null, nodeId: null, nodeIds: [] });
  const isSyncingFlowNodesRef = useRef(false);
  const [quickInsertMenu, setQuickInsertMenu] = useState<QuickInsertMenu | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<BoardNodeContextMenuState | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [trashedNodes, setTrashedNodes] = useState<BoardTrashEntry[]>([]);
  const [assetCompare, setAssetCompare] = useState<{ originalUrl: string; resultUrl: string } | null>(null);
  const [flowReady, setFlowReady] = useState(false);
  const [isNodeDragActive, setIsNodeDragActive] = useState(false);
  const updateSelectedNodeIds = useCallback((nextIds: string[]): void => {
    setSelectedNodeIds(currentIds => {
      if (sameStringList(currentIds, nextIds)) return currentIds;
      return nextIds;
    });
  }, []);
  useEffect(() => {
    onSelectedNodeIdsChange?.(selectedNodeIds);
  }, [onSelectedNodeIdsChange, selectedNodeIds]);
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
  const generationTaskFingerprint = useMemo(
    () => buildGenerationTaskFingerprint(generationTasks),
    [generationTasks],
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
    addAssetToReferenceGroup,
    addGenerateNode,
    addGenerateNodeWithConnection,
    addNoteNode,
    addPromptNode,
    addReferenceGroupNode,
    addReferenceGroupNodeWithAsset,
    addReferenceGroupNodeWithAssets,
    addResultNodeWithConnection,
    addRunningHubAppNode,
    clearBoard,
    connectPorts,
    connectPortsBatch,
    deleteEdge,
    deleteNode,
    moveGenerateReferenceEdge,
    moveReferenceGroupItem,
    removeReferenceGroupItem,
    selectEdge,
    selectNode,
    setViewport,
    updateBoardConfig,
    updateReferenceGroupItemRole,
    updateAssetNodeAsset,
    updateResultNodeAsset,
    updateAgentInstruction,
    updateGenerateNode,
    updateRunningHubAppNode,
    updateNodeSize,
    updateNodeTitle,
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
  const boardPromptReferenceGraphIndex = useMemo(
    () => buildBoardPromptReferenceGraphIndex(board.nodes, board.edges),
    // graph key includes node content and edge order; positions do not affect reference resolution
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardGraphContentKey],
  );
  const boardNodePositionsKey = useMemo(
    () => board.nodes.map(node => `${node.id}:${node.position.x},${node.position.y}`).join("|"),
    [board.nodes],
  );
  const galleryItemById = useMemo(
    () => new Map(galleryItems.map(item => [item.id, item])),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reference fingerprint gates complete/url changes used by result stacks
    [galleryReferenceFingerprint],
  );

  const measureAssetAspectRatio = useCallback((nodeId: string, aspectRatio: number): void => {
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
    const node = boardPromptReferenceGraphIndex.nodeById.get(nodeId);
    if (node?.kind !== "asset" && node?.kind !== "result") return;
    const size = mediaNodeSizeForAspectRatio(aspectRatio);
    if (Math.abs(node.size.width - size.width) <= 1 && Math.abs(node.size.height - size.height) <= 1) return;
    updateNodeSize(nodeId, size);
  }, [boardPromptReferenceGraphIndex, updateNodeSize]);

  useEffect(() => {
    const undersizedGenerateNode = board.nodes.find(node =>
      (node.kind === "image-generate" || node.kind === "video-generate") &&
      (node.size.width < DEFAULT_GENERATE_NODE_SIZE.width || node.size.height < DEFAULT_GENERATE_NODE_SIZE.height),
    );
    if (undersizedGenerateNode) {
      updateNodeSize(undersizedGenerateNode.id, {
        width: Math.max(undersizedGenerateNode.size.width, DEFAULT_GENERATE_NODE_SIZE.width),
        height: Math.max(undersizedGenerateNode.size.height, DEFAULT_GENERATE_NODE_SIZE.height),
      });
      return;
    }

    const audioNode = board.nodes.find(node =>
      (node.kind === "asset" || node.kind === "result") &&
      node.asset.type === "audio" &&
      (Math.abs(node.size.width - DEFAULT_AUDIO_ASSET_NODE_SIZE.width) > 1 ||
        Math.abs(node.size.height - DEFAULT_AUDIO_ASSET_NODE_SIZE.height) > 1),
    );
    if (!audioNode) return;
    updateNodeSize(audioNode.id, DEFAULT_AUDIO_ASSET_NODE_SIZE);
  }, [board.nodes, updateNodeSize]);

  const closeOverlayMenus = useCallback(() => {
    setQuickInsertMenu(null);
    setNodeContextMenu(null);
  }, []);

  useEffect(() => {
    if (!focusNodeRequest) return;
    const instance = flowInstanceRef.current;
    if (!flowReady || !instance) return;
    const node = board.nodes.find(entry => entry.id === focusNodeRequest.nodeId);
    if (node) {
      const centerX = node.position.x + node.size.width / 2;
      const centerY = node.position.y + node.size.height / 2;
      void instance.setCenter(centerX, centerY, {
        zoom: Math.max(instance.getZoom(), 0.85),
        duration: 240,
      });
    }
    onFocusNodeRequestHandled?.();
  }, [board.nodes, flowReady, focusNodeRequest, onFocusNodeRequestHandled]);

  useEffect(() => {
    if (!assetCompareRequest) return;
    setAssetCompare(assetCompareRequest);
    onAssetCompareRequestHandled?.();
  }, [assetCompareRequest, onAssetCompareRequestHandled]);

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

  const connectSelectedBoardPromptReference = useCallback((nodeId: string, reference: BoardPromptReference): void => {
    if (resolveBoardPromptReferenceGroup(reference) !== "画板") return;
    const assetNode = board.nodes.find(item => item.kind === "asset" && item.asset.assetId === reference.id);
    if (!assetNode) return;
    const targetNodeId = findPromptReferenceTargetNodeId(nodeId, board.nodes, board.edges);
    if (!targetNodeId) return;

    const from: BoardPortRef = {
      nodeId: assetNode.id,
      portId: BOARD_PORT_IDS.assetOut,
      portKind: "asset",
    };
    const to: BoardPortRef = {
      nodeId: targetNodeId,
      portId: BOARD_PORT_IDS.referenceIn,
      portKind: "asset",
    };
    if (!isValidBoardPortConnection(board.nodes, from, to)) return;
    connectPorts(from, to);
  }, [board.edges, board.nodes, connectPorts]);

  const materializeGenerateResult = useCallback((nodeId: string, assetId: string): void => {
    const sourceNode = board.nodes.find(node => node.id === nodeId);
    if (!isResultSourceNode(sourceNode)) return;
    const item = galleryItems.find(entry => entry.id === assetId);
    if (!item || item.status !== "complete") {
      onConnectionError("找不到生成结果资产");
      return;
    }
    const resultNode = findResultNodeForSource(board.nodes, sourceNode.id);
    if (resultNode) {
      updateResultNodeAsset(resultNode.id, assetId);
      selectNode(resultNode.id);
      selectEdge(null);
      return;
    }
    const from: BoardPortRef = {
      nodeId: sourceNode.id,
      portId: BOARD_PORT_IDS.resultOut,
      portKind: "result",
    };
    const resultNodeId = addResultNodeWithConnection(
      {
        sourceNodeId: sourceNode.id,
        resultStackKey: sourceNode.resultStackKey ?? "",
        activeAssetId: assetId,
        resultAssetIds: [assetId],
        asset: storageItemToBoardAsset(item),
        position: resultNodeDefaultPosition(sourceNode),
      },
      from,
    );
    selectNode(resultNodeId);
    selectEdge(null);
  }, [addResultNodeWithConnection, board.nodes, galleryItems, onConnectionError, selectEdge, selectNode, updateResultNodeAsset]);

  const flowNodeDataById = useMemo(() => {
    const dataById = new Map<string, BoardFlowNode["data"]>();
    // Build result node index for generate nodes to look up
    const resultNodeBySourceId = new Map<string, BoardNodeModel & { kind: "result" }>();
    for (const node of board.nodes) {
      if (node.kind === "result") resultNodeBySourceId.set(node.sourceNodeId, node);
    }
    for (const node of board.nodes) {
      const connectedResultNode = node.kind === "result" ? node : resultNodeBySourceId.get(node.id);
      const resultAssetIds = node.kind === "result"
        ? node.resultAssetIds
        : connectedResultNode?.resultAssetIds;
      dataById.set(node.id, {
        boardId: board.id,
        generateInputSummary: generateInputSummaryForNode(node, boardPromptReferenceGraphIndex),
        hasResultConnection: connectedResultNode !== undefined,
        activeResultAssetId: connectedResultNode?.activeAssetId,
        assetStackItems: resultAssetIds
          ? resultAssetIds.map(id => galleryItemById.get(id)).filter((item): item is StorageItem => item !== undefined && item.status === "complete")
          : [],
        node,
        resultItems: connectedResultNode
          ? connectedResultNode.resultAssetIds.map(id => galleryItemById.get(id)).filter((item): item is StorageItem => item !== undefined && item.status === "complete")
          : [],
        generateReferences:
          node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "runninghub-app"
            ? buildBoardPromptReferences({
              nodes: board.nodes,
              edges: board.edges,
              focus: { kind: "generate", nodeId: node.id },
              galleryItems: galleryReferenceItems,
              index: boardPromptReferenceGraphIndex,
            })
            : [],
        promptReferences:
          node.kind === "prompt"
            ? buildBoardPromptReferences({
              nodes: board.nodes,
              edges: board.edges,
              focus: { kind: "prompt", nodeId: node.id },
              galleryItems: galleryReferenceItems,
              index: boardPromptReferenceGraphIndex,
            })
            : [],
        compareReferenceUrl:
          node.kind === "asset" && node.asset.type === "image"
            ? assetCompareReferenceUrl(node.id, board.nodes, board.edges, boardPromptReferenceGraphIndex)
            : null,
        onCaptureVideoFrame,
        onCancelGenerate: onCancelGenerateNode,
        onOpenAssetCompare: (nodeId: string) => {
          const assetNode = board.nodes.find(item => item.id === nodeId);
          if (assetNode?.kind !== "asset" || assetNode.asset.type !== "image") return;
          const originalUrl = assetCompareReferenceUrl(nodeId, board.nodes, board.edges, boardPromptReferenceGraphIndex);
          if (!originalUrl) return;
          setAssetCompare({ originalUrl, resultUrl: assetNode.asset.url });
        },
        onDelete: trashAndDeleteNode,
        onEditAssetImage,
        onExecuteGenerate: onExecuteGenerateNode,
        onFetchRunningHubAppSchema,
        onOpenFullscreen,
        onMaterializeGenerateResult: materializeGenerateResult,
        onMoveGenerateReferenceEdge: moveGenerateReferenceEdge,
        onMoveReferenceGroupItem: moveReferenceGroupItem,
        onRemoveReferenceGroupItem: removeReferenceGroupItem,
        onSendAgent: onSendAgentNode,
        onSendAssetToAgent,
        onSelectAssetStackResult: (nodeId: string, assetId: string) => {
          const item = galleryItemById.get(assetId);
          if (!item || item.status !== "complete") {
            onConnectionError("找不到生成结果资产");
            return;
          }
          updateResultNodeAsset(nodeId, assetId);
        },
        onSelectGenerateResult: (nodeId: string, assetId: string) => {
          const item = galleryItemById.get(assetId);
          const connectedResultNode = findResultNodeForSource(board.nodes, nodeId);
          if (item?.status === "complete" && connectedResultNode) {
            updateResultNodeAsset(connectedResultNode.id, assetId);
          }
        },
        onSelectPromptReference: connectSelectedBoardPromptReference,
        onUpdateReferenceGroupItemRole: updateReferenceGroupItemRole,
        onUpdateAgent: updateAgentInstruction,
        onUpdateGenerate: updateGenerateNode,
        onMeasureAssetAspectRatio: measureAssetAspectRatio,
        onUpdateNodeTitle: updateNodeTitle,
        onUpdateRunningHubApp: updateRunningHubAppNode,
        onUpdateNote: updateNoteBody,
        onUpdatePrompt: updatePromptNode,
      });
    }
    return dataById;
    // board.nodes / board.edges read when graph content changes; omit to skip position-only updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
      boardGraphContentKey,
      boardPromptReferenceGraphIndex,
      galleryReferenceFingerprint,
      galleryReferenceItems,
      galleryItemById,
    onCancelGenerateNode,
    onCaptureVideoFrame,
    onEditAssetImage,
    onExecuteGenerateNode,
    onFetchRunningHubAppSchema,
    onConnectionError,
    onOpenFullscreen,
    materializeGenerateResult,
    moveReferenceGroupItem,
    moveGenerateReferenceEdge,
    removeReferenceGroupItem,
    onSendAssetToAgent,
    onSendAgentNode,
    connectSelectedBoardPromptReference,
    measureAssetAspectRatio,
    trashAndDeleteNode,
    updateReferenceGroupItemRole,
    updateAssetNodeAsset,
    updateAgentInstruction,
    updateGenerateNode,
    updateNodeTitle,
    updateNoteBody,
    updatePromptNode,
    updateRunningHubAppNode,
  ]);

  const generateTaskByNodeId = useMemo(() => {
    const map = new Map<string, BoardGenerateTaskSummary>();
    const activeByNodeId = new Map<string, {
      createdAt: string;
      id: string;
      progress: number;
      status: "pending" | "processing";
    }>();

    for (const item of galleryItems) {
      if (!item.sourceBoardNodeId || !isActiveGenerateTask(item)) continue;
      const sourceNode = boardPromptReferenceGraphIndex.nodeById.get(item.sourceBoardNodeId);
      if (!sourceNode || !isCurrentGenerateStackItem(item, sourceNode)) continue;
      const current = activeByNodeId.get(sourceNode.id);
      if (!current || new Date(item.createdAt).getTime() > new Date(current.createdAt).getTime()) {
        activeByNodeId.set(sourceNode.id, {
          createdAt: item.createdAt,
          id: item.id,
          progress: Math.max(0, Math.min(100, item.progress)),
          status: item.status,
        });
      }
    }

    for (const task of generationTasks) {
      if (!isActiveBoardGenerationTask(task) || !task.source.boardNodeId) continue;
      const sourceNode = boardPromptReferenceGraphIndex.nodeById.get(task.source.boardNodeId);
      if (!sourceNode || !isCurrentGenerateStackTask(task, sourceNode)) continue;
      const current = activeByNodeId.get(sourceNode.id);
      if (!current || new Date(task.createdAt).getTime() > new Date(current.createdAt).getTime()) {
        activeByNodeId.set(sourceNode.id, {
          createdAt: task.createdAt,
          id: task.id,
          progress: Math.max(0, Math.min(100, task.progress)),
          status: task.status,
        });
      }
    }

    for (const [nodeId, task] of activeByNodeId) {
      map.set(nodeId, {
        id: task.id,
        progress: task.progress,
        status: task.status,
      });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- task fingerprint gates progress-only polls
  }, [boardGraphContentKey, boardPromptReferenceGraphIndex, galleryTaskFingerprint, generationTaskFingerprint]);

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
              node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "runninghub-app"
                ? generateTaskByNodeId.get(node.id)
                : undefined,
          },
        };
      }),
    // board.nodes read inside; graph + position keys gate rebuilds
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardGraphContentKey, boardNodePositionsKey, flowNodeDataById, generateTaskByNodeId],
  );
  const [reactFlowNodes, setReactFlowNodes, onNodesChange] = useNodesState<BoardFlowNode>([]);
  const reactFlowNodesRef = useRef<BoardFlowNode[]>(reactFlowNodes);
  useLayoutEffect(() => {
    reactFlowNodesRef.current = reactFlowNodes;
  }, [reactFlowNodes]);
  useLayoutEffect(() => {
    if (isNodeDragActiveRef.current) return;
    isSyncingFlowNodesRef.current = true;
    setReactFlowNodes(current => syncReactFlowNodesFromBoard(current, flowNodes, selectedNodeId, selectedNodeIds));
    queueMicrotask(() => {
      isSyncingFlowNodesRef.current = false;
    });
  }, [flowNodes, selectedNodeId, selectedNodeIds, setReactFlowNodes]);
  const flowEdgeColorByKind = useMemo(
    () => boardEdgeColors(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- theme mode is the only supported edge-token invalidator
    [themeMode],
  );
  const flowEdges = useMemo<BoardFlowEdge[]>(
    () =>
      board.edges.map(edge => {
        const sourceNode = boardPromptReferenceGraphIndex.nodeById.get(edge.from.nodeId);
        const processing = isResultSourceNode(sourceNode) && sourceNode.status === "processing";
        return {
          id: edge.id,
          source: edge.from.nodeId,
          target: edge.to.nodeId,
          sourceHandle: edge.from.portId,
          targetHandle: edge.to.portId,
          type: "smoothstep",
          animated: edge.kind === "result" || processing,
          data: { kind: edge.kind, processing },
          className: `imagine-board-edge imagine-board-edge-${edge.kind}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: flowEdgeColorByKind[edge.kind], width: 18, height: 18 },
          style: { strokeWidth: selectedEdgeId === edge.id ? 3 : 2 },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- graph key gates processing animation without position churn
    [boardGraphContentKey, boardPromptReferenceGraphIndex, flowEdgeColorByKind, selectedEdgeId],
  );

  const isValidBoardConnection = useCallback<IsValidConnection<BoardFlowEdge>>((connection) => {
    const refs = connectionPortRefs(connection);
    return refs ? isValidBoardPortConnection(board.nodes, refs.from, refs.to) : false;
  }, [board.nodes]);

  const readValidConnectionRefs = useCallback((connection: Connection) => {
    const refs = connectionPortRefs(connection);
    return refs && isValidBoardPortConnection(board.nodes, refs.from, refs.to) ? refs : null;
  }, [board.nodes]);

  const handleConnect = useCallback<OnConnect>((connection) => {
    const refs = readValidConnectionRefs(connection);
    if (!refs) {
      onConnectionError("端口类型不兼容：图片可连参考/Agent，Prompt 可连生成，生成结果可连资产。");
      return;
    }
    try {
      const targetNode = board.nodes.find(node => node.id === refs.to.nodeId);
      if (refs.from.portKind === "result" && targetNode?.kind === "asset") {
        onConnectionError("请将生成结果拖到空白处创建结果资产节点");
        return;
      }
      if (selectedNodeIds.length > 1 && selectedNodeIds.includes(refs.from.nodeId) && targetNode) {
        const connections = selectedNodeIds
          .map(nodeId => board.nodes.find(node => node.id === nodeId))
          .filter((node): node is BoardNodeModel => node !== undefined)
          .map(sourceNode => batchConnectionToTarget(board.nodes, sourceNode, targetNode))
          .filter((connection): connection is { from: BoardPortRef; to: BoardPortRef } => connection !== null);
        if (connections.length > 1) {
          connectPortsBatch(connections);
          selectNode(targetNode.id);
          selectEdge(null);
          updateSelectedNodeIds([targetNode.id]);
          return;
        }
      }
      if (targetNode?.kind === "reference-group") {
        addAssetToReferenceGroup(refs.from.nodeId, refs.to.nodeId);
      }
      connectPorts(refs.from, refs.to);
    } catch (error) {
      onConnectionError(error instanceof Error ? error.message : "连接失败");
    }
  }, [addAssetToReferenceGroup, board.nodes, connectPorts, connectPortsBatch, onConnectionError, readValidConnectionRefs, selectEdge, selectedNodeIds, selectNode, updateSelectedNodeIds]);

  const handleSelectionChange = useCallback<OnSelectionChangeFunc<BoardFlowNode, BoardFlowEdge>>(({ nodes, edges }) => {
    if (isSyncingFlowNodesRef.current) return;
    const ids = nodes.map(node => node.id);
    const edgeId = edges[0]?.id ?? null;
    const nodeId = ids[0] ?? null;
    if (
      ids.length === 0 &&
      !edgeId &&
      selectedNodeId &&
      board.nodes.some(node => node.id === selectedNodeId)
    ) {
      return;
    }
    const nextSelection = edgeId
      ? { edgeId, nodeId: null, nodeIds: ids }
      : { edgeId: null, nodeId, nodeIds: ids };
    const intendedSelection = boardIntendedSelectionSnapshot(selectedEdgeId, selectedNodeId, selectedNodeIds);
    if (sameBoardSelectionSnapshot(intendedSelection, nextSelection)) return;
    if (sameBoardSelectionSnapshot(selectionRef.current, nextSelection)) return;
    selectionRef.current = nextSelection;
    updateSelectedNodeIds(ids);
    selectEdge(nextSelection.edgeId);
    selectNode(nextSelection.nodeId);
  }, [board.nodes, selectEdge, selectedEdgeId, selectedNodeId, selectedNodeIds, selectNode, updateSelectedNodeIds]);

  const handleNodeClick = useCallback<NodeMouseHandler<BoardFlowNode>>(() => {
    closeOverlayMenus();
  }, [closeOverlayMenus]);

  const handleNodeDoubleClick = useCallback<NodeMouseHandler<BoardFlowNode>>((_event, node) => {
    if (node.data.node.kind === "image-generate" || node.data.node.kind === "video-generate" || node.data.node.kind === "runninghub-app") {
      onExecuteGenerateNode(node.id);
    }
  }, [onExecuteGenerateNode]);

  const handleNodeContextMenu = useCallback<NodeMouseHandler<BoardFlowNode>>((event, node) => {
    event.preventDefault();
    closeOverlayMenus();
    setNodeContextMenu({ nodeId: node.id, clientX: event.clientX, clientY: event.clientY });
    selectNode(node.id);
    selectEdge(null);
    if (selectedNodeIds.length <= 1) updateSelectedNodeIds([node.id]);
  }, [closeOverlayMenus, selectEdge, selectedNodeIds.length, selectNode, updateSelectedNodeIds]);

  const handleReconnect = useCallback<OnReconnect<BoardFlowEdge>>((oldEdge, newConnection) => {
    const refs = readValidConnectionRefs(newConnection);
    if (!refs) {
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
  }, [addAssetToReferenceGroup, onConnectionError, readValidConnectionRefs, reconnectEdge]);

  const handleEdgeClick = useCallback<EdgeMouseHandler<BoardFlowEdge>>((_event, edge) => {
    closeOverlayMenus();
    selectEdge(edge.id);
    selectNode(null);
    updateSelectedNodeIds([]);
  }, [closeOverlayMenus, selectEdge, selectNode, updateSelectedNodeIds]);

  const handleNodeDragStart = useCallback<OnNodeDrag<BoardFlowNode>>(() => {
    isNodeDragActiveRef.current = true;
    setIsNodeDragActive(true);
    pendingDragPositionByIdRef.current.clear();
  }, []);

  const handleNodeDragStop = useCallback<OnNodeDrag<BoardFlowNode>>((_event, node, nodes) => {
    isNodeDragActiveRef.current = false;
    setIsNodeDragActive(false);
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
    onNodesChange(changes);

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
  }, [onNodesChange, updateNodesPositions]);

  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: BoardViewport): void => {
    if (sameBoardViewportModel(viewportRef.current, viewport)) return;
    viewportRef.current = viewport;
    setViewport(viewport);
  }, [setViewport]);


  const handleNodesDelete = useCallback<OnNodesDelete<BoardFlowNode>>(nodes => {
    for (const node of nodes) trashAndDeleteNode(node.id);
    updateSelectedNodeIds([]);
  }, [trashAndDeleteNode, updateSelectedNodeIds]);

  const deleteBoardEdge = useCallback((edgeId: string): void => {
    deleteEdge(edgeId);
  }, [deleteEdge]);

  const handleEdgesDelete = useCallback<OnEdgesDelete<BoardFlowEdge>>(edges => {
    for (const edge of edges) deleteBoardEdge(edge.id);
  }, [deleteBoardEdge]);

  const handleEdgeDoubleClick = useCallback<EdgeMouseHandler<BoardFlowEdge>>((_event, edge) => {
    deleteBoardEdge(edge.id);
  }, [deleteBoardEdge]);

  const handleFlowInit = useCallback((instance: ReactFlowInstance<BoardFlowNode, BoardFlowEdge>): void => {
    flowInstanceRef.current = instance;
    setFlowReady(true);
  }, []);

  const handlePaneClick = useCallback((): void => {
    flowHostRef.current?.focus();
    closeOverlayMenus();
    selectNode(null);
    selectEdge(null);
    updateSelectedNodeIds([]);
  }, [closeOverlayMenus, selectEdge, selectNode, updateSelectedNodeIds]);

  const snapToGrid = board.config.snapToGrid;

  const flowPositionFromClient = useCallback((clientX: number, clientY: number): BoardPoint => {
    const instance = flowInstanceRef.current;
    if (instance) {
      const point = instance.screenToFlowPosition(
        { x: clientX, y: clientY },
        { snapToGrid },
      );
      return snapBoardPoint(point, snapToGrid);
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
    if (kind === "runninghub-app") return addRunningHubAppNode({ position });
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
  }, [addAgentNode, addGenerateNode, addNoteNode, addPromptNode, addReferenceGroupNode, addRunningHubAppNode]);

  const addQuickNodeAtPoint = useCallback((kind: BoardInsertKind, point: BoardPoint): void => {
    const item = BOARD_INSERT_CATALOG.find(current => current.kind === kind);
    if (!item) return;
    addQuickNode(kind, centeredNodePosition(point, item.size));
    setQuickInsertMenu(null);
  }, [addQuickNode, centeredNodePosition]);

  const addConnectedQuickNodeAtPoint = useCallback((kind: BoardInsertKind, point: BoardPoint, from: BoardPortRef): void => {
    if (kind === "image-generate") {
      try {
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
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : "连接失败");
      }
      return;
    }
    if (kind === "video-generate") {
      try {
        addGenerateNodeWithConnection(
          { kind: "video-generate", model: DEFAULT_VIDEO_MODEL, aspectRatio: "auto", position: centeredNodePosition(point, DEFAULT_GENERATE_NODE_SIZE) },
          from,
          from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn,
        );
        setQuickInsertMenu(null);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : "连接失败");
      }
      return;
    }
    if (kind === "reference-group") {
      const sourceNode = board.nodes.find(node => node.id === from.nodeId);
      if (sourceNode?.kind !== "asset" || sourceNode.asset.type !== "image") return;
      addReferenceGroupNodeWithAsset({ position: centeredNodePosition(point, DEFAULT_REFERENCE_GROUP_NODE_SIZE) }, from.nodeId);
      setQuickInsertMenu(null);
      return;
    }
    if (kind === "runninghub-app") {
      const nodeId = addRunningHubAppNode({ position: centeredNodePosition(point, DEFAULT_RUNNINGHUB_APP_NODE_SIZE) });
      connectPorts(from, {
        nodeId,
        portId: from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn,
        portKind: from.portKind === "prompt" ? "prompt" : "asset",
      });
      setQuickInsertMenu(null);
    }
  }, [addGenerateNodeWithConnection, addReferenceGroupNodeWithAsset, addRunningHubAppNode, board.nodes, centeredNodePosition, connectPorts, onConnectionError]);

  const quickInsertMenuItems = useMemo(() => {
    const from = quickInsertMenu?.connectionFrom;
    if (!from) return [BOARD_QUICK_INSERT_IMPORT_ITEM, ...BOARD_INSERT_CATALOG];
    const sourceNode = board.nodes.find(node => node.id === from.nodeId);
    if (from.portKind === "prompt") {
      return BOARD_INSERT_CATALOG.filter(item => item.kind === "image-generate" || item.kind === "video-generate" || item.kind === "runninghub-app");
    }
    if (from.portKind !== "asset") return [];
    if (sourceNode?.kind === "asset") {
      return BOARD_INSERT_CATALOG.filter(item =>
        item.kind === "image-generate" ||
        item.kind === "video-generate" ||
        item.kind === "reference-group" ||
        item.kind === "runninghub-app",
      );
    }
    if (sourceNode?.kind === "reference-group") {
      return BOARD_INSERT_CATALOG.filter(item => item.kind === "image-generate" || item.kind === "video-generate" || item.kind === "runninghub-app");
    }
    return [];
  }, [board.nodes, quickInsertMenu?.connectionFrom]);

  const groupSelectedAssetNodes = useCallback((): void => {
    const assetNodes = selectedNodeIds
      .map(nodeId => board.nodes.find(node => node.id === nodeId))
      .filter((node): node is BoardNodeModel & { kind: "asset" } => node?.kind === "asset");
    if (assetNodes.length < 2) {
      onConnectionError("请选择至少两个媒体资产再打组");
      return;
    }
    const bounds = assetNodes.reduce(
      (current, node) => ({
        maxX: Math.max(current.maxX, node.position.x + node.size.width),
        maxY: Math.max(current.maxY, node.position.y + node.size.height),
        minX: Math.min(current.minX, node.position.x),
        minY: Math.min(current.minY, node.position.y),
      }),
      { maxX: -Infinity, maxY: -Infinity, minX: Infinity, minY: Infinity },
    );
    const groupId = addReferenceGroupNodeWithAssets(
      {
        position: centeredNodePosition(
          {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2,
          },
          DEFAULT_REFERENCE_GROUP_NODE_SIZE,
        ),
        title: `参考组 (${assetNodes.length})`,
      },
      assetNodes.map(node => node.id),
    );
    updateSelectedNodeIds([groupId]);
    closeOverlayMenus();
  }, [addReferenceGroupNodeWithAssets, board.nodes, centeredNodePosition, closeOverlayMenus, onConnectionError, selectedNodeIds, updateSelectedNodeIds]);

  const connectSelectedNodesToTarget = useCallback((targetNodeId: string): void => {
    const targetNode = board.nodes.find(node => node.id === targetNodeId);
    if (!targetNode) return;
    const connections = selectedNodeIds
      .map(nodeId => board.nodes.find(node => node.id === nodeId))
      .filter((node): node is BoardNodeModel => node !== undefined)
      .map(sourceNode => batchConnectionToTarget(board.nodes, sourceNode, targetNode))
      .filter((connection): connection is { from: BoardPortRef; to: BoardPortRef } => connection !== null);
    if (connections.length === 0) {
      onConnectionError("所选节点没有可连接到此节点的端口");
      return;
    }
    connectPortsBatch(connections);
    selectNode(targetNode.id);
    selectEdge(null);
    updateSelectedNodeIds([targetNode.id]);
    closeOverlayMenus();
  }, [board.nodes, closeOverlayMenus, connectPortsBatch, onConnectionError, selectEdge, selectedNodeIds, selectNode, updateSelectedNodeIds]);

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
        videoReferenceMode: node.videoReferenceMode,
        videoResolution: node.videoResolution,
      });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "runninghub-app") {
      addRunningHubAppNode({
        accessPassword: node.accessPassword,
        bindings: node.bindings,
        outputType: node.outputType,
        position,
        prompt: node.prompt,
        size: node.size,
        targetId: node.targetId,
        targetType: node.targetType,
        title: node.title,
      });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "agent") {
      addAgentNode({ instruction: node.instruction, position, size: node.size, title: node.title });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "result") {
      addResultNodeWithConnection(
        {
          sourceNodeId: node.sourceNodeId,
          resultStackKey: node.resultStackKey,
          activeAssetId: node.activeAssetId,
          resultAssetIds: node.resultAssetIds,
          asset: node.asset,
          position,
          size: node.size,
          title: node.title,
        },
        { nodeId: node.sourceNodeId, portId: BOARD_PORT_IDS.resultOut, portKind: "result" },
      );
      rememberPastedPosition();
      return;
    }
    addNoteNode({ body: node.body, position, size: node.size, title: node.title });
    rememberPastedPosition();
  }, [addAgentNode, addAssetNode, addGenerateNode, addNoteNode, addPromptNode, addReferenceGroupNode, addResultNodeWithConnection, addRunningHubAppNode]);

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
      if (!isResultSourceNode(sourceNode) || sourceNode.status !== "complete") {
        onConnectionError("生成结果尚未就绪");
        return;
      }
      const connectedResultNode = findResultNodeForSource(board.nodes, sourceNode.id);
      if (connectedResultNode) {
        selectNode(connectedResultNode.id);
        selectEdge(null);
        return;
      }
      const from: BoardPortRef = { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "result" };
      const resultNodeId = addResultNodeWithConnection(
        {
          sourceNodeId: sourceNode.id,
          resultStackKey: sourceNode.resultStackKey ?? "",
          activeAssetId: "",
          resultAssetIds: [],
          asset: { assetId: "", type: "image", url: "", prompt: "", model: "" },
          position: centeredNodePosition(flowPoint, DEFAULT_ASSET_NODE_SIZE),
        },
        from,
      );
      selectNode(resultNodeId);
      selectEdge(null);
      return;
    }
  }, [addResultNodeWithConnection, board.nodes, centeredNodePosition, connectPorts, flowPositionFromClient, onConnectionError, selectEdge, selectNode]);

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

  const openMediaImportPicker = useCallback((point?: BoardPoint): void => {
    flowHostRef.current?.focus();
    const resolved = point ?? visibleCenterPosition(DEFAULT_ASSET_NODE_SIZE);
    if (!resolved) {
      onWorkspaceNotice("info", "无法确定导入位置，请先点击画布再试");
      return;
    }
    pendingImportPointRef.current = resolved;
    mediaImportInputRef.current?.click();
  }, [onWorkspaceNotice, visibleCenterPosition]);

  const handleMediaImportInputChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    const point = pendingImportPointRef.current;
    pendingImportPointRef.current = null;
    if (!point || files.length === 0) return;
    importFilesAtPoint(files, point);
  }, [importFilesAtPoint]);

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
        void ensureHydratedStorageItem(item).then(hydrated => {
          addAssetNode({
            position: centeredNodePosition(point, DEFAULT_ASSET_NODE_SIZE),
            asset: storageItemToBoardAsset(hydrated),
          });
          closeOverlayMenus();
        });
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
      const files = pasteMediaFiles(clipboardData);
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
    duplicateNodes,
    pasteCopiedNode,
    redo,
    selectedNodeIds,
    undo,
  ]);

  return (
    <BoardMediaImportProvider openImport={openMediaImportPicker}>
    <main className="imagine-workbench-shell imagine-theme-dark flex h-screen min-h-0 flex-col bg-[var(--iw-bg)] text-[var(--iw-text)]">
      <input
        ref={mediaImportInputRef}
        type="file"
        accept={BOARD_MEDIA_FILE_ACCEPT}
        multiple
        className="hidden"
        onChange={handleMediaImportInputChange}
      />
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
        onImportMedia={() => openMediaImportPicker()}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]">
        <section
          ref={flowHostRef}
          tabIndex={-1}
          onDoubleClick={handleFlowDoubleClick}
          onDragOver={handleBoardDragOver}
          onDrop={handleBoardDrop}
          className={`board-canvas relative min-h-0 bg-[var(--iw-board-canvas-bg)]${isNodeDragActive ? " is-node-dragging" : ""}`}
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
            panOnDrag={isCoarsePointer ? true : reactFlowPanOnDrag}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            selectionOnDrag={!isCoarsePointer}
            onConnect={handleConnect}
            onConnectEnd={handleConnectEnd}
            onEdgeClick={handleEdgeClick}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onEdgesDelete={handleEdgesDelete}
            onInit={handleFlowInit}
            onMoveEnd={handleMoveEnd}
            onNodeClick={handleNodeClick}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onNodesChange={handleNodesChange}
            onNodesDelete={handleNodesDelete}
            onPaneClick={handlePaneClick}
            onPaneContextMenu={openQuickInsertMenu}
            proOptions={reactFlowProOptions}
            zoomOnScroll={false}
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
                if (kind === BOARD_QUICK_INSERT_IMPORT_KIND) {
                  openMediaImportPicker(position);
                  setQuickInsertMenu(null);
                  return;
                }
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
            const copyableImageUrl = (node.kind === "asset" || node.kind === "result") && node.asset.type === "image"
              ? node.asset.url
              : null;
            const selectedAssetCount = selectedNodeIds.filter(nodeId => {
              const selectedNode = board.nodes.find(item => item.id === nodeId);
              return selectedNode?.kind === "asset";
            }).length;
            const selectedBatchConnectionCount = selectedNodeIds.filter(nodeId => {
              const selectedNode = board.nodes.find(item => item.id === nodeId);
              return selectedNode ? batchConnectionToTarget(board.nodes, selectedNode, node) !== null : false;
            }).length;
            const actions = buildBoardNodeContextMenuActions({
              node,
              onConnectSelected: selectedBatchConnectionCount > 0
                ? () => connectSelectedNodesToTarget(node.id)
                : undefined,
              onCompare: compareReferenceUrl && node.kind === "asset"
                ? () => {
                  setAssetCompare({ originalUrl: compareReferenceUrl, resultUrl: node.asset.url });
                  closeOverlayMenus();
                }
                : undefined,
              onCopyImage: copyableImageUrl
                ? () => {
                  void copyImageUrlToClipboard(copyableImageUrl).then(
                    () => onWorkspaceNotice("success", "图片已复制到剪贴板"),
                    error => onWorkspaceNotice("error", error instanceof Error ? error.message : "复制图片失败"),
                  );
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
              onGroupSelected: selectedAssetCount > 1
                ? groupSelectedAssetNodes
                : undefined,
              onExecute: node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "runninghub-app"
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
    </BoardMediaImportProvider>
  );
}
