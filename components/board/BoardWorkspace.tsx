"use client";

import { Download, Upload } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  BaseEdge,
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  EdgeToolbar,
  MarkerType,
  MiniMap,
  NodeToolbar,
  PanOnScrollMode,
  Position,
  ReactFlow,
  SelectionMode,
  getSmoothStepPath,
  type Edge,
  type EdgeMouseHandler,
  type EdgeProps,
  type IsValidConnection,
  type NodeMouseHandler,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesChange,
  type OnNodesDelete,
  type OnReconnect,
  type OnSelectionChangeFunc,
  type ReactFlowProps,
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
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
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
import { generationTaskToGalleryItem } from "@/lib/generation-tasks";
import {
  BOARD_SNAP_GRID,
  DEFAULT_AUDIO_ASSET_NODE_SIZE,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_MULTI_GRID_NODE_SIZE,
  DEFAULT_REFERENCE_GROUP_NODE_SIZE,
  DEFAULT_RUNNINGHUB_APP_NODE_SIZE,
  boardNodeAbsolutePosition,
  boardNodesWithAbsolutePositions,
  snapBoardPoint,
  sortBoardNodesForReactFlow,
  type BoardEdge,
  type BoardEdgeKind,
  type BoardAssetReference,
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
import { BoardNodeCallbacksContext, type BoardNodeCallbacks } from "@/lib/board/callbacks";
import { BOARD_PORT_IDS, isValidBoardConnection as isValidBoardPortConnection } from "@/lib/board/ports";
import { BOARD_INSERT_CATALOG, type BoardInsertKind } from "@/lib/board/insert-catalog";
import { findResultNodeForSource } from "@/lib/board/utils";
import { findAvailableBoardNodePosition } from "@/lib/board/placement";
import type { GenerationTask } from "@/lib/generation-tasks";
import { DEFAULT_AUDIO_MODEL, DEFAULT_VIDEO_MODEL } from "@/lib/providers/model-catalog";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";

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
  onAnalyzeBoardMedia: (nodeId: string) => void | Promise<void>;
  onCancelAssetTask: (nodeId: string) => void;
  onCancelGenerateNode: (nodeId: string) => void;
  onEditAssetImage: (nodeId: string) => void;
  onImageQuickEdit: (nodeId: string, operation: ImageEditFeature) => void;
  onExecuteGenerateNode: (nodeId: string) => void;
  onFetchRunningHubAppSchema: (webappId: string) => Promise<BoardRunningHubAppSchemaResult>;
  onImportBoardFiles: (files: File[], position: BoardPoint) => void | Promise<void>;
  onCreateBoard: () => void;
  onDeleteBoard: () => void;
  onDownloadAsset: (item: StorageItem) => void;
  onDownloadSelectedAssets?: () => void;
  onExportMultiGrid: (nodeId: string) => void | Promise<void>;
  onOpenSettings: () => void;
  onOpenFullscreen: (item: StorageItem) => void;
  onOpenPanorama: (item: StorageItem) => void;
  onPromoteOriginalAsset: (item: StorageItem) => void;
  onResolveOriginalAsset: (item: StorageItem) => Promise<StorageItem>;
  onSaveVoiceProfile: (item: StorageItem) => void;
  onRenameBoard: () => void;
  onSelectBoard: (boardId: string) => void;
  onSendAssetToAgent: (nodeId: string) => void;
  onSendAgentNode: (nodeId: string) => void;
  assetCompareRequest?: { originalUrl: string; resultUrl: string } | null;
  focusNodeRequest?: { nodeId: string; seq: number } | null;
  onAssetCompareRequestHandled?: () => void;
  onFocusNodeRequestHandled?: () => void;
  onSelectedNodeIdsChange?: (nodeIds: string[]) => void;
  selectedDownloadableCount?: number;
}

type BoardFlowEdge = Edge<{ kind: BoardEdgeKind; processing?: boolean }, "smoothstep">;
type BoardReconnectStartHandler = NonNullable<ReactFlowProps<BoardFlowNode, BoardFlowEdge>["onReconnectStart"]>;
type BoardReconnectEndHandler = NonNullable<ReactFlowProps<BoardFlowNode, BoardFlowEdge>["onReconnectEnd"]>;

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
  selectedNodeIds: string[];
}

interface CopiedBoardNode {
  inputEdges: BoardEdge[];
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
const BOARD_VISIBLE_RENDER_NODE_THRESHOLD = 48;

interface BoardSelectionSnapshot {
  edgeId: string | null;
  nodeId: string | null;
  nodeIds: string[];
}

type BoardReferenceFlowData = Pick<BoardFlowNode["data"], "generateInputSummary" | "generateReferences" | "promptReferences">;
type BoardMediaFlowData = Pick<BoardFlowNode["data"], "assetStackItems" | "compareReferenceUrl" | "connectedResultNodeId" | "hasResultConnection" | "resultItems">;

interface MultiGridCellDropTarget {
  cellIndex: number;
  rect: DOMRect;
  nodeId: string;
}

const SELECTION_TOOLBAR_GAP = 44;
const EMPTY_STORAGE_ITEMS: StorageItem[] = [];

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
      left.parentId === right.parentId &&
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
  if (left === right) return true;
  if (!left || !right) return false;
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

function isMediaReferenceItem(item: StorageItem | undefined): item is StorageItem & { type: "image" | "video" | "audio" } {
  return item !== undefined && item.status === "complete" && (item.type === "image" || item.type === "video" || item.type === "audio");
}

function resolveBoardPromptReferenceUrls(
  references: BoardPromptReference[],
  galleryItemById: ReadonlyMap<string, StorageItem>,
): BoardPromptReference[] {
  return references.map(reference => {
    const item = galleryItemById.get(reference.id);
    if (!isMediaReferenceItem(item)) return reference;
    if (reference.type === item.type && reference.url === item.url) return reference;
    return { ...reference, type: item.type, url: item.url };
  });
}

function storageItemsForAssetIds(
  assetIds: string[],
  galleryItemById: ReadonlyMap<string, StorageItem>,
): StorageItem[] {
  const items = assetIds
    .map(id => galleryItemById.get(id))
    .filter((item): item is StorageItem => item !== undefined);
  return items.length > 0 ? items : EMPTY_STORAGE_ITEMS;
}

function storageItemStackForAssetId(
  assetId: string,
  galleryItemById: ReadonlyMap<string, StorageItem>,
): StorageItem[] {
  const item = galleryItemById.get(assetId);
  return item ? [item] : EMPTY_STORAGE_ITEMS;
}

function sameResultItemList(left: StorageItem[] | undefined, right: StorageItem[] | undefined): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
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
  if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app") return node.id;
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
      reference.sourceNodeId === other.sourceNodeId &&
      reference.sourceTitle === other.sourceTitle &&
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
    left.connectedResultNodeId === right.connectedResultNodeId &&
    left.hasResultConnection === right.hasResultConnection &&
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
    left.parentId === right.parentId &&
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

const boardEdgeKindLabels: Record<BoardEdgeKind, string> = {
  "agent-context": "Agent",
  prompt: "Prompt",
  reference: "Reference",
  result: "Result",
};

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
        <EdgeToolbar edgeId={id} x={labelX} y={labelY} isVisible className={`board-edge-toolbar board-edge-toolbar-${kind} nodrag nopan flex items-center gap-1`}>
          {selected ? (
            <span className="board-edge-kind-pill rounded-full border px-2 py-0.5 text-[9px] font-semibold">
              {boardEdgeKindLabels[kind]}
            </span>
          ) : null}
          {processing ? (
            <span className="board-edge-processing-pill rounded-full border px-2 py-0.5 text-[9px] font-semibold">
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
        </EdgeToolbar>
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
  if (item.type === "transcript") {
    throw new Error("Transcript items cannot be placed as board media assets");
  }
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
  if (node.kind !== "image-generate" && node.kind !== "video-generate" && node.kind !== "audio-operation" && node.kind !== "runninghub-app") return undefined;

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
          sourceNodeId: sourceNode.id,
          sourceTitle: sourceNode.title,
          type: sourceNode.asset.type,
          url: sourceNode.asset.url,
        }];
      }
      if (sourceNode?.kind === "reference-group") {
        return sourceNode.references.map(reference => ({
          id: reference.assetId,
          role: reference.role,
          sourceEdgeId: edge.id,
          sourceNodeId: sourceNode.id,
          sourceTitle: sourceNode.title,
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
    (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app") &&
    item.sourceBoardNodeId === node.id &&
    (!node.resultStackKey || item.sourceBoardResultStackKey === node.resultStackKey)
  );
}

function isCurrentGenerateStackTask(task: GenerationTask, node: BoardNodeModel): boolean {
  return (
    (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app") &&
    task.source.boardNodeId === node.id &&
    (!node.resultStackKey || task.source.resultStackKey === node.resultStackKey)
  );
}

function buildGenerationTaskFingerprint(tasks: GenerationTask[]): string {
  return tasks
    .map(task => [
      task.id,
      task.status,
      Math.round(task.progress / 10) * 10,
      task.source.boardNodeId ?? "",
      task.source.resultStackKey ?? "",
    ].join(":"))
    .join("|");
}

function isResultSourceNode(node: BoardNodeModel | undefined): node is Extract<BoardNodeModel, { kind: "image-generate" | "video-generate" | "audio-operation" | "runninghub-app" }> {
  return node?.kind === "image-generate" || node?.kind === "video-generate" || node?.kind === "audio-operation" || node?.kind === "runninghub-app";
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

function pastedNodePosition(nodes: BoardNodeModel[], node: BoardNodeModel): BoardPoint {
  const position = boardNodeAbsolutePosition(nodes, node.id) ?? node.position;
  return findAvailableBoardNodePosition(
    boardNodesWithAbsolutePositions(nodes),
    { x: position.x + node.size.width + 48, y: position.y },
    node.size,
  );
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
    if (target.kind === "prompt" && outputPort.portKind === "asset") {
      return { portId: BOARD_PORT_IDS.assetIn, portKind: "asset" as const };
    }
    if (target.kind === "image-generate" || target.kind === "video-generate" || target.kind === "audio-operation" || target.kind === "runninghub-app") {
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

function multiGridImageReferences(
  nodes: BoardNodeModel[],
  from: BoardPortRef,
  selectedNodeIds: string[],
): BoardAssetReference[] {
  if (from.portKind !== "asset") return [];
  const nodeIds = selectedNodeIds.length > 1 && selectedNodeIds.includes(from.nodeId)
    ? selectedNodeIds
    : [from.nodeId];
  const seenAssetIds = new Set<string>();
  return nodeIds.flatMap(nodeId => {
    const node = nodes.find(item => item.id === nodeId);
    if ((node?.kind !== "asset" && node?.kind !== "result") || node.asset.type !== "image") return [];
    if (seenAssetIds.has(node.asset.assetId)) return [];
    seenAssetIds.add(node.asset.assetId);
    return [node.asset];
  });
}

function referenceGroupAssetNodeIds(
  nodes: BoardNodeModel[],
  sourceNodeId: string,
  selectedNodeIds: string[],
): string[] {
  const sourceNode = nodes.find(node => node.id === sourceNodeId);
  if (sourceNode?.kind !== "asset" || sourceNode.asset.type !== "image") return [];
  const nodeIds = selectedNodeIds.length > 1 && selectedNodeIds.includes(sourceNodeId)
    ? selectedNodeIds
    : [sourceNodeId];
  const seenNodeIds = new Set<string>();
  return nodeIds.filter(nodeId => {
    if (seenNodeIds.has(nodeId)) return false;
    seenNodeIds.add(nodeId);
    const node = nodes.find(item => item.id === nodeId);
    return node?.kind === "asset" && node.asset.type === "image";
  });
}

function selectedReferenceGroupAssetNodeIds(
  nodes: BoardNodeModel[],
  contextNodeId: string,
  selectedNodeIds: string[],
): string[] {
  const nodeIds = selectedNodeIds.includes(contextNodeId) ? selectedNodeIds : [contextNodeId];
  return referenceGroupAssetNodeIds(nodes, contextNodeId, nodeIds);
}

function quickInsertSourceRefs(
  nodes: BoardNodeModel[],
  from: BoardPortRef,
  selectedNodeIds: string[],
): BoardPortRef[] {
  if (from.portKind !== "asset" || !selectedNodeIds.includes(from.nodeId)) return [from];
  const seenNodeIds = new Set<string>();
  const refs = selectedNodeIds.flatMap(nodeId => {
    if (seenNodeIds.has(nodeId)) return [];
    seenNodeIds.add(nodeId);
    const node = nodes.find(item => item.id === nodeId);
    if (node?.kind !== "asset" && node?.kind !== "reference-group" && node?.kind !== "result") return [];
    return [{ nodeId, portId: BOARD_PORT_IDS.assetOut, portKind: "asset" as const }];
  });
  return refs.length > 0 ? refs : [from];
}

function boardNodeAtPoint(
  nodes: BoardNodeModel[],
  point: BoardPoint,
  sourceNodeId: string,
): BoardNodeModel | null {
  const orderedNodes = sortBoardNodesForReactFlow(nodes);
  for (let index = orderedNodes.length - 1; index >= 0; index -= 1) {
    const node = orderedNodes[index];
    if (!node || node.id === sourceNodeId) continue;
    const position = boardNodeAbsolutePosition(nodes, node.id);
    if (!position) continue;
    if (
      point.x >= position.x &&
      point.x <= position.x + node.size.width &&
      point.y >= position.y &&
      point.y <= position.y + node.size.height
    ) {
      return node;
    }
  }
  return null;
}

function multiGridCellDropTargetFromClient(
  nodes: BoardNodeModel[],
  clientX: number,
  clientY: number,
): MultiGridCellDropTarget | null {
  const element = document.elementFromPoint(clientX, clientY);
  const cell = element?.closest<HTMLElement>("[data-multi-grid-id][data-multi-grid-cell-index]");
  const nodeId = cell?.dataset.multiGridId;
  if (!cell || !nodeId) return null;
  const node = nodes.find(item => item.id === nodeId);
  if (node?.kind !== "multi-grid") return null;
  const cellIndex = Number(cell.dataset.multiGridCellIndex);
  if (!Number.isInteger(cellIndex)) return null;
  return { cellIndex, nodeId, rect: cell.getBoundingClientRect() };
}

function sameMultiGridCellDropTarget(
  left: MultiGridCellDropTarget | null,
  right: MultiGridCellDropTarget | null,
): boolean {
  return (
    left?.nodeId === right?.nodeId &&
    left?.cellIndex === right?.cellIndex &&
    left?.rect.left === right?.rect.left &&
    left?.rect.top === right?.rect.top &&
    left?.rect.width === right?.rect.width &&
    left?.rect.height === right?.rect.height
  );
}

function batchConnectionsFromSourceToTarget(
  nodes: BoardNodeModel[],
  sourceNodeId: string,
  targetNode: BoardNodeModel,
  selectedNodeIds: string[],
): Array<{ from: BoardPortRef; to: BoardPortRef }> {
  const sourceNodeIds = selectedNodeIds.includes(sourceNodeId) ? selectedNodeIds : [sourceNodeId];
  return sourceNodeIds
    .map(nodeId => nodes.find(node => node.id === nodeId))
    .filter((node): node is BoardNodeModel => node !== undefined)
    .map(sourceNode => batchConnectionToTarget(nodes, sourceNode, targetNode))
    .filter((connection): connection is { from: BoardPortRef; to: BoardPortRef } => connection !== null);
}

export default function BoardWorkspace({
  boardSummaries,
  children,
  controller,
  galleryItems = [],
  generationTasks = [],
  onBack,
  onCancelAssetTask,
  onCancelGenerateNode,
  onCaptureVideoFrame,
  onConnectionError,
  onWorkspaceNotice,
  onAnalyzeBoardMedia,
  onEditAssetImage,
  onImageQuickEdit,
  onExecuteGenerateNode,
  onFetchRunningHubAppSchema,
  onImportBoardFiles,
  onCreateBoard,
  onDeleteBoard,
  onDownloadAsset,
  onDownloadSelectedAssets,
  onExportMultiGrid,
  onOpenSettings,
  onOpenFullscreen,
  onOpenPanorama,
  onPromoteOriginalAsset,
  onResolveOriginalAsset,
  onSaveVoiceProfile,
  onRenameBoard,
  onSelectBoard,
  onSendAssetToAgent,
  onSendAgentNode,
  assetCompareRequest = null,
  focusNodeRequest = null,
  onAssetCompareRequestHandled,
  onFocusNodeRequestHandled,
  onSelectedNodeIdsChange,
  selectedDownloadableCount = 0,
}: BoardWorkspaceProps) {
  const themeMode = useThemeModeSnapshot();
  const isCoarsePointer = useCoarsePointer();
  const flowInstanceRef = useRef<ReactFlowInstance<BoardFlowNode, BoardFlowEdge> | null>(null);
  const flowHostRef = useRef<HTMLElement | null>(null);
  const mediaImportInputRef = useRef<HTMLInputElement>(null);
  const pendingImportPointRef = useRef<BoardPoint | null>(null);
  const copiedNodeRef = useRef<CopiedBoardNode | null>(null);
  const hoverPromoteTimerRef = useRef<number | null>(null);
  const isNodeDragActiveRef = useRef(false);
  const multiGridDropFrameRef = useRef<number | null>(null);
  const pendingMultiGridDropPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const pendingDragPositionByIdRef = useRef<Map<string, BoardPoint>>(new Map());
  const selectionRef = useRef<BoardSelectionSnapshot>({ edgeId: null, nodeId: null, nodeIds: [] });
  const isSyncingFlowNodesRef = useRef(false);
  const prevFlowDataRef = useRef<Map<string, BoardFlowNode["data"]>>(new Map());
  const prevFlowNodesRef = useRef<BoardFlowNode[] | null>(null);
  const [quickInsertMenu, setQuickInsertMenu] = useState<QuickInsertMenu | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<BoardNodeContextMenuState | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [trashedNodes, setTrashedNodes] = useState<BoardTrashEntry[]>([]);
  const [assetCompare, setAssetCompare] = useState<{ originalUrl: string; resultUrl: string } | null>(null);
  const [flowReady, setFlowReady] = useState(false);
  const [isConnectionActive, setIsConnectionActive] = useState(false);
  const [isNodeDragActive, setIsNodeDragActive] = useState(false);
  const [activeMultiGridDropTarget, setActiveMultiGridDropTarget] = useState<MultiGridCellDropTarget | null>(null);
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
    groupNodes,
    reconnectEdge,
    restoreNodeWithEdges,
    addAgentNode,
    addAssetNode,
    addAssetToMultiGrid,
    addAssetToReferenceGroup,
    addGenerateNode,
    addGenerateNodeWithConnections,
    addGroupNode,
    addMultiGridNode,
    addNoteNode,
    addPromptNode,
    addReferenceGroupNode,
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
    updateResultNodeAsset,
    updateAgentInstruction,
    updateGenerateNode,
    updateMultiGridNode,
    updateMultiGridItemTransform,
    updateRunningHubAppNode,
    ungroupNode,
    updateNodeSize,
    updateNodeTitle,
    updateNodesPositions,
    updateNoteBody,
    updatePromptNode,
  } = controller;
  const viewportRef = useRef<BoardViewport>(board.viewport);
  const setFlowHostRef = useCallback((element: HTMLElement | null): void => {
    flowHostRef.current = element;
  }, []);
  useLayoutEffect(() => {
    viewportRef.current = board.viewport;
    selectionRef.current = { edgeId: selectedEdgeId, nodeId: selectedNodeId, nodeIds: selectedNodeIds };
  }, [board.viewport, selectedEdgeId, selectedNodeId, selectedNodeIds]);
  useEffect(() => {
    const instance = flowInstanceRef.current;
    if (!instance || !flowReady || sameBoardViewportModel(instance.getViewport(), board.viewport)) return;
    void instance.setViewport(board.viewport, { duration: 0 });
  }, [board.id, board.viewport, flowReady]);
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
  const boardNodeGeometryKey = useMemo(
    () => board.nodes.map(node => `${node.id}:${node.parentId ?? ""}:${node.position.x},${node.position.y}:${node.size.width}x${node.size.height}`).join("|"),
    [board.nodes],
  );
  const galleryItemById = useMemo(
    () => {
      const taskItems = generationTasks
        .map(generationTaskToGalleryItem)
        .filter((item): item is StorageItem => item !== null);
      return new Map([...galleryItems, ...taskItems].map(item => [item.id, item]));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reference fingerprint gates complete/url changes; task fingerprint gates pending/processing progress
    [galleryReferenceFingerprint, galleryTaskFingerprint, generationTasks],
  );

  const promotableItemForNode = useCallback((node: BoardNodeModel): StorageItem | null => {
    if (node.kind === "asset") return galleryItemById.get(node.asset.assetId) ?? null;
    if (node.kind === "result") return galleryItemById.get(node.activeAssetId) ?? null;
    return null;
  }, [galleryItemById]);

  const assetCompareReferenceForNode = useCallback((assetNodeId: string): ReferenceImageRef | null => {
    const resultEdge = (boardPromptReferenceGraphIndex.incomingEdgesByTargetNode.get(assetNodeId) ?? [])
      .find(edge => edge.from.portId === "result-out");
    if (!resultEdge) return null;
    return boardPromptReferenceGraphIndex.referenceCandidatesByGenerateNode.get(resultEdge.from.nodeId)?.[0] ?? null;
  }, [boardPromptReferenceGraphIndex]);

  const resolveCompareReferenceUrl = useCallback(async (reference: ReferenceImageRef): Promise<string> => {
    const item = galleryItemById.get(reference.id);
    if (!item) return reference.url;
    return (await onResolveOriginalAsset(item)).url;
  }, [galleryItemById, onResolveOriginalAsset]);

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
      (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation") &&
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

  const focusReferenceSourceNode = useCallback((nodeId: string): void => {
    const node = board.nodes.find(entry => entry.id === nodeId);
    if (!node) return;
    selectNode(node.id);
    updateSelectedNodeIds([node.id]);
    const instance = flowInstanceRef.current;
    if (!flowReady || !instance) return;
    const centerX = node.position.x + node.size.width / 2;
    const centerY = node.position.y + node.size.height / 2;
    void instance.setCenter(centerX, centerY, {
      zoom: Math.max(instance.getZoom(), 0.85),
      duration: 240,
    });
  }, [board.nodes, flowReady, selectNode, updateSelectedNodeIds]);

  useEffect(() => {
    if (!assetCompareRequest) return;
    setAssetCompare(assetCompareRequest);
    onAssetCompareRequestHandled?.();
  }, [assetCompareRequest, onAssetCompareRequestHandled]);

  const trashAndDeleteNode = useCallback((nodeId: string) => {
    const node = board.nodes.find(item => item.id === nodeId);
    if (node?.kind === "asset") {
      const item = galleryItemById.get(node.asset.assetId);
      if (item && isActiveGenerateTask(item)) {
        onCancelAssetTask(nodeId);
        return;
      }
    }
    if (node) {
      const edges = board.edges.filter(edge => edge.from.nodeId === nodeId || edge.to.nodeId === nodeId);
      setTrashedNodes(current => [{ node: structuredClone(node), edges: structuredClone(edges) }, ...current].slice(0, BOARD_TRASH_LIMIT));
    }
    deleteNode(nodeId);
    setSelectedNodeIds(current => {
      const next = current.filter(id => id !== nodeId);
      return sameStringList(current, next) ? current : next;
    });
  }, [board.edges, board.nodes, deleteNode, galleryItemById, onCancelAssetTask]);

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

  const resultNodeBySourceId = useMemo(() => {
    const resultNodeBySourceId = new Map<string, BoardNodeModel & { kind: "result" }>();
    for (const node of board.nodes) {
      if (node.kind === "result") resultNodeBySourceId.set(node.sourceNodeId, node);
    }
    return resultNodeBySourceId;
    // board.nodes read inside; graph content key gates source/result stack changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardGraphContentKey]);

  const referenceFlowDataByNodeId = useMemo(() => {
    const dataById = new Map<string, BoardReferenceFlowData>();
    for (const node of board.nodes) {
      if (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app") {
        dataById.set(node.id, {
          generateInputSummary: generateInputSummaryForNode(node, boardPromptReferenceGraphIndex),
          generateReferences: resolveBoardPromptReferenceUrls(buildBoardPromptReferences({
            nodes: board.nodes,
            edges: board.edges,
            focus: { kind: "generate", nodeId: node.id },
            galleryItems: galleryReferenceItems,
            index: boardPromptReferenceGraphIndex,
          }), galleryItemById),
        });
      } else if (node.kind === "prompt") {
        dataById.set(node.id, {
          promptReferences: resolveBoardPromptReferenceUrls(buildBoardPromptReferences({
            nodes: board.nodes,
            edges: board.edges,
            focus: { kind: "prompt", nodeId: node.id },
            galleryItems: galleryReferenceItems,
            index: boardPromptReferenceGraphIndex,
          }), galleryItemById),
        });
      }
    }
    return dataById;
    // board.nodes/edges read inside; graph content + gallery reference fingerprints gate rebuilds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardGraphContentKey, boardPromptReferenceGraphIndex, galleryReferenceFingerprint, galleryReferenceItems, galleryItemById]);

  const mediaFlowDataByNodeId = useMemo(() => {
    const dataById = new Map<string, BoardMediaFlowData>();
    for (const node of board.nodes) {
      const connectedResultNode = node.kind === "result" ? node : resultNodeBySourceId.get(node.id);
      const data: BoardMediaFlowData = {};
      if (node.kind === "asset") {
        data.assetStackItems = storageItemStackForAssetId(node.asset.assetId, galleryItemById);
        data.compareReferenceUrl = node.asset.type === "image"
          ? assetCompareReferenceUrl(node.id, board.nodes, board.edges, boardPromptReferenceGraphIndex)
          : null;
      } else if (node.kind === "result") {
        data.assetStackItems = storageItemsForAssetIds(node.resultAssetIds, galleryItemById);
      }
      if (connectedResultNode) {
        data.connectedResultNodeId = connectedResultNode.id;
        data.hasResultConnection = true;
        data.resultItems = storageItemsForAssetIds(connectedResultNode.resultAssetIds, galleryItemById);
      }
      if (Object.keys(data).length > 0) dataById.set(node.id, data);
    }
    return dataById;
    // board.nodes/edges read inside; graph content + gallery item fingerprints gate result/media display data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardGraphContentKey, boardPromptReferenceGraphIndex, galleryReferenceFingerprint, galleryTaskFingerprint, galleryItemById, resultNodeBySourceId]);

  const flowNodeDataById = useMemo(() => {
    const dataById = new Map<string, BoardFlowNode["data"]>();
    for (const node of board.nodes) {
      dataById.set(node.id, {
        boardId: board.id,
        node,
        ...referenceFlowDataByNodeId.get(node.id),
        ...mediaFlowDataByNodeId.get(node.id),
      });
    }
    return dataById;
    // board.nodes read inside; graph content gates data shape, geometry is merged in flowNodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id, boardGraphContentKey, referenceFlowDataByNodeId, mediaFlowDataByNodeId]);

  const boardNodeCallbacks = useMemo<BoardNodeCallbacks>(() => ({
    onCaptureVideoFrame,
    onCancelAssetTask,
    onCancelGenerate: onCancelGenerateNode,
    onDelete: trashAndDeleteNode,
    onDownloadAsset,
    onEditAssetImage,
    onImageQuickEdit,
    onExecuteGenerate: onExecuteGenerateNode,
    onFetchRunningHubAppSchema,
    onFocusNode: focusReferenceSourceNode,
    onFocusReferenceSource: focusReferenceSourceNode,
    onAnalyzeBoardMedia,
    onOpenFullscreen,
    onOpenPanorama,
    onSaveVoiceProfile,
    onMoveGenerateReferenceEdge: moveGenerateReferenceEdge,
    onMoveReferenceGroupItem: moveReferenceGroupItem,
    onRemoveGenerateReferenceEdge: deleteEdge,
    onRemoveReferenceGroupItem: removeReferenceGroupItem,
    onSendAgent: onSendAgentNode,
    onSendAssetToAgent,
    onSelectPromptReference: connectSelectedBoardPromptReference,
    onUpdateReferenceGroupItemRole: updateReferenceGroupItemRole,
    onUpdateAgent: updateAgentInstruction,
    onUpdateGenerate: updateGenerateNode,
    onUpdateMultiGrid: updateMultiGridNode,
    onUpdateMultiGridItemTransform: updateMultiGridItemTransform,
    onUpdateNodeSize: updateNodeSize,
    onExportMultiGrid,
    onMeasureAssetAspectRatio: measureAssetAspectRatio,
    onUpdateNodeTitle: updateNodeTitle,
    onUpdateRunningHubApp: updateRunningHubAppNode,
    onUpdateNote: updateNoteBody,
    onUpdatePrompt: updatePromptNode,
    onOpenAssetCompare: (nodeId: string) => {
      const assetNode = board.nodes.find(item => item.id === nodeId);
      if (assetNode?.kind !== "asset" || assetNode.asset.type !== "image") return;
      const compareReference = assetCompareReferenceForNode(nodeId);
      if (!compareReference) return;
      const item = promotableItemForNode(assetNode);
      if (!item) return;
      void Promise.all([resolveCompareReferenceUrl(compareReference), onResolveOriginalAsset(item)]).then(
        ([originalUrl, originalItem]) => setAssetCompare({ originalUrl, resultUrl: originalItem.url }),
        error => onWorkspaceNotice("error", error instanceof Error ? error.message : "原始媒体读取失败"),
      );
    },
    onSelectAssetStackResult: (nodeId: string, assetId: string) => {
      const item = galleryItemById.get(assetId);
      if (!item || item.status !== "complete") {
        onConnectionError("找不到生成结果资产");
        return;
      }
      updateResultNodeAsset(nodeId, assetId);
    },
  }), [
    onCancelAssetTask, onCancelGenerateNode, onCaptureVideoFrame, trashAndDeleteNode, onDownloadAsset, onEditAssetImage, onImageQuickEdit,
    onExecuteGenerateNode, onFetchRunningHubAppSchema, focusReferenceSourceNode, onAnalyzeBoardMedia, onOpenFullscreen,
    onOpenPanorama, onSaveVoiceProfile, moveGenerateReferenceEdge, moveReferenceGroupItem,
    deleteEdge, removeReferenceGroupItem, onSendAgentNode, onSendAssetToAgent, connectSelectedBoardPromptReference,
    updateReferenceGroupItemRole, updateAgentInstruction, updateGenerateNode, updateMultiGridNode,
    updateMultiGridItemTransform, onExportMultiGrid, measureAssetAspectRatio,
    updateNodeSize,
    updateNodeTitle, updateRunningHubAppNode, updateNoteBody, updatePromptNode,
    assetCompareReferenceForNode, board.nodes, board.edges, boardPromptReferenceGraphIndex, galleryItemById, onConnectionError,
    onResolveOriginalAsset, onWorkspaceNotice, promotableItemForNode, resolveCompareReferenceUrl, updateResultNodeAsset,
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
      // Round progress to nearest 10 to avoid full recomputation on tiny progress bumps
      const roundedProgress = Math.round(task.progress / 10) * 10;
      map.set(nodeId, {
        id: task.id,
        progress: roundedProgress,
        status: task.status,
      });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- task fingerprint gates progress-only polls
  }, [boardGraphContentKey, boardPromptReferenceGraphIndex, galleryTaskFingerprint, generationTaskFingerprint]);

  const flowNodes = useMemo<BoardFlowNode[]>(
    () => {
      const prevData = prevFlowDataRef.current;
      const nextData = new Map<string, BoardFlowNode["data"]>();
      const result = sortBoardNodesForReactFlow(board.nodes).map(node => {
        const cachedData = flowNodeDataById.get(node.id);
        if (!cachedData) {
          throw new Error(`Missing flow data for board node ${node.id}`);
        }
        const taskSummary =
          node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app"
            ? generateTaskByNodeId.get(node.id)
            : undefined;
        const existing = prevData.get(node.id);
        let data: BoardFlowNode["data"];
        if (
          existing &&
          existing.node === node &&
          existing.generateTaskSummary === taskSummary &&
          existing.generateReferences === cachedData.generateReferences &&
          existing.promptReferences === cachedData.promptReferences &&
          existing.generateInputSummary === cachedData.generateInputSummary &&
          existing.connectedResultNodeId === cachedData.connectedResultNodeId &&
          existing.hasResultConnection === cachedData.hasResultConnection &&
          existing.resultItems === cachedData.resultItems &&
          existing.assetStackItems === cachedData.assetStackItems &&
          existing.compareReferenceUrl === cachedData.compareReferenceUrl &&
          existing.boardId === cachedData.boardId
        ) {
          data = existing;
        } else {
          data = {
            ...cachedData,
            node,
            generateTaskSummary: taskSummary,
          };
        }
        nextData.set(node.id, data);
        return {
          id: node.id,
          type: "board" as const,
          parentId: node.parentId,
          position: node.position,
          data,
        };
      });
      prevFlowDataRef.current = nextData;
      return result;
    },
    // board.nodes read inside; graph content + geometry keys gate rebuilds
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boardGraphContentKey, boardNodeGeometryKey, flowNodeDataById, generateTaskByNodeId],
  );
  const [reactFlowNodes, setReactFlowNodes, onNodesChange] = useNodesState<BoardFlowNode>([]);
  const reactFlowNodesRef = useRef<BoardFlowNode[]>(reactFlowNodes);
  const clearActiveMultiGridDropTarget = useCallback((): void => {
    if (multiGridDropFrameRef.current !== null) {
      window.cancelAnimationFrame(multiGridDropFrameRef.current);
      multiGridDropFrameRef.current = null;
    }
    pendingMultiGridDropPointRef.current = null;
    setActiveMultiGridDropTarget(null);
  }, []);
  const scheduleActiveMultiGridDropTarget = useCallback((clientX: number, clientY: number): void => {
    pendingMultiGridDropPointRef.current = { clientX, clientY };
    if (multiGridDropFrameRef.current !== null) return;
    multiGridDropFrameRef.current = window.requestAnimationFrame(() => {
      multiGridDropFrameRef.current = null;
      const point = pendingMultiGridDropPointRef.current;
      pendingMultiGridDropPointRef.current = null;
      const target = point ? multiGridCellDropTargetFromClient(board.nodes, point.clientX, point.clientY) : null;
      setActiveMultiGridDropTarget(current => sameMultiGridCellDropTarget(current, target) ? current : target);
    });
  }, [board.nodes]);
  useEffect(() => () => {
    if (multiGridDropFrameRef.current !== null) window.cancelAnimationFrame(multiGridDropFrameRef.current);
  }, []);
  useLayoutEffect(() => {
    reactFlowNodesRef.current = reactFlowNodes;
  }, [reactFlowNodes]);
  const hasInitialSyncRef = useRef(false);
  useLayoutEffect(() => {
    if (isNodeDragActiveRef.current) return;
    if (
      flowNodes === prevFlowNodesRef.current &&
      hasInitialSyncRef.current
    ) return;
    prevFlowNodesRef.current = flowNodes;
    skipPositionSyncRef.current = true;
    isSyncingFlowNodesRef.current = true;
    setReactFlowNodes(current => syncReactFlowNodesFromBoard(current, flowNodes, selectedNodeId, selectedNodeIds));
    queueMicrotask(() => {
      isSyncingFlowNodesRef.current = false;
      hasInitialSyncRef.current = true;
      skipPositionSyncRef.current = false;
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
          animated: !isNodeDragActive && (edge.kind === "result" || processing),
          data: { kind: edge.kind, processing },
          className: `imagine-board-edge imagine-board-edge-${edge.kind}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: flowEdgeColorByKind[edge.kind], width: 18, height: 18 },
          style: { strokeWidth: selectedEdgeId === edge.id ? 3 : 2 },
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- graph key gates processing animation without position churn
    [boardGraphContentKey, boardPromptReferenceGraphIndex, flowEdgeColorByKind, isNodeDragActive, selectedEdgeId],
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
    const rawRefs = connectionPortRefs(connection);
    const rawTargetNode = rawRefs ? board.nodes.find(node => node.id === rawRefs.to.nodeId) : undefined;
    if (rawTargetNode?.kind === "multi-grid") {
      try {
        const references = rawRefs ? multiGridImageReferences(board.nodes, rawRefs.from, [rawRefs.from.nodeId]) : [];
        if (references.length === 0) {
          onConnectionError("多宫格只支持图片资产");
          return;
        }
        references.forEach(reference => addAssetToMultiGrid(rawTargetNode.id, reference));
        selectNode(rawTargetNode.id);
        selectEdge(null);
        updateSelectedNodeIds([rawTargetNode.id]);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : "连接失败");
      }
      return;
    }

    const refs = readValidConnectionRefs(connection);
    if (!refs) {
      onConnectionError("端口类型不兼容：媒体可连 Prompt、参考/Agent，Prompt 可连生成，生成结果可连资产。");
      return;
    }
    try {
      const targetNode = board.nodes.find(node => node.id === refs.to.nodeId);
      if (refs.from.portKind === "result" && targetNode?.kind === "asset") {
        onConnectionError("请将生成结果拖到空白处创建结果资产节点");
        return;
      }
      if (targetNode?.kind === "multi-grid") {
        const references = multiGridImageReferences(board.nodes, refs.from, [refs.from.nodeId]);
        if (references.length === 0) {
          onConnectionError("多宫格只支持图片资产");
          return;
        }
        references.forEach(reference => addAssetToMultiGrid(targetNode.id, reference));
        selectNode(targetNode.id);
        selectEdge(null);
        updateSelectedNodeIds([targetNode.id]);
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
  }, [addAssetToMultiGrid, addAssetToReferenceGroup, board.nodes, connectPorts, connectPortsBatch, onConnectionError, readValidConnectionRefs, selectEdge, selectedNodeIds, selectNode, updateSelectedNodeIds]);

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

  const clearHoverPromoteTimer = useCallback((): void => {
    if (hoverPromoteTimerRef.current === null) return;
    window.clearTimeout(hoverPromoteTimerRef.current);
    hoverPromoteTimerRef.current = null;
  }, []);

  const handleNodeMouseEnter = useCallback<NodeMouseHandler<BoardFlowNode>>((_event, node) => {
    if (isNodeDragActiveRef.current) return;
    const item = promotableItemForNode(node.data.node);
    if (!item || item.status !== "complete") return;
    clearHoverPromoteTimer();
    hoverPromoteTimerRef.current = window.setTimeout(() => {
      hoverPromoteTimerRef.current = null;
      onPromoteOriginalAsset(item);
    }, 650);
  }, [clearHoverPromoteTimer, onPromoteOriginalAsset, promotableItemForNode]);

  const handleNodeMouseLeave = useCallback<NodeMouseHandler<BoardFlowNode>>(() => {
    clearHoverPromoteTimer();
  }, [clearHoverPromoteTimer]);

  useEffect(() => clearHoverPromoteTimer, [clearHoverPromoteTimer]);

  const openNodeContextMenu = useCallback((nodeId: string, clientX: number, clientY: number): void => {
    closeOverlayMenus();
    setNodeContextMenu({ nodeId, clientX, clientY });
    selectNode(nodeId);
    selectEdge(null);
    if (selectedNodeIds.length <= 1) updateSelectedNodeIds([nodeId]);
  }, [closeOverlayMenus, selectEdge, selectedNodeIds.length, selectNode, updateSelectedNodeIds]);

  const handleNodeContextMenu = useCallback<NodeMouseHandler<BoardFlowNode>>((event, node) => {
    event.preventDefault();
    openNodeContextMenu(node.id, event.clientX, event.clientY);
  }, [openNodeContextMenu]);

  const handleReconnect = useCallback<OnReconnect<BoardFlowEdge>>((oldEdge, newConnection) => {
    const rawRefs = connectionPortRefs(newConnection);
    const rawTargetNode = rawRefs ? board.nodes.find(node => node.id === rawRefs.to.nodeId) : undefined;
    if (rawTargetNode?.kind === "multi-grid") {
      try {
        const references = rawRefs ? multiGridImageReferences(board.nodes, rawRefs.from, [rawRefs.from.nodeId]) : [];
        if (references.length === 0) {
          onConnectionError("多宫格只支持图片资产");
          return;
        }
        references.forEach(reference => addAssetToMultiGrid(rawTargetNode.id, reference));
        deleteEdge(oldEdge.id);
        selectNode(rawTargetNode.id);
        selectEdge(null);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : "重连失败");
      }
      return;
    }

    const refs = readValidConnectionRefs(newConnection);
    if (!refs) {
      onConnectionError("端口类型不兼容：媒体可连 Prompt、参考/Agent，Prompt 可连生成，生成结果可连资产。");
      return;
    }
    try {
      const targetNode = board.nodes.find(node => node.id === refs.to.nodeId);
      if (targetNode?.kind === "multi-grid") {
        const references = multiGridImageReferences(board.nodes, refs.from, [refs.from.nodeId]);
        if (references.length === 0) {
          onConnectionError("多宫格只支持图片资产");
          return;
        }
        references.forEach(reference => addAssetToMultiGrid(targetNode.id, reference));
        deleteEdge(oldEdge.id);
        selectNode(targetNode.id);
        selectEdge(null);
        return;
      }
      if (targetNode?.kind === "reference-group") {
        addAssetToReferenceGroup(refs.from.nodeId, refs.to.nodeId);
      }
      reconnectEdge(oldEdge.id, refs.from, refs.to);
    } catch (error) {
      onConnectionError(error instanceof Error ? error.message : "重连失败");
    }
  }, [addAssetToMultiGrid, addAssetToReferenceGroup, board.nodes, deleteEdge, onConnectionError, readValidConnectionRefs, reconnectEdge, selectEdge, selectNode]);

  const handleReconnectStart = useCallback<BoardReconnectStartHandler>(() => {
    setIsConnectionActive(true);
  }, []);

  const handleReconnectEnd = useCallback<BoardReconnectEndHandler>(() => {
    setIsConnectionActive(false);
  }, []);

  const handleEdgeClick = useCallback<EdgeMouseHandler<BoardFlowEdge>>((_event, edge) => {
    closeOverlayMenus();
    selectEdge(edge.id);
    selectNode(null);
    updateSelectedNodeIds([]);
  }, [closeOverlayMenus, selectEdge, selectNode, updateSelectedNodeIds]);

  const handleNodeDragStart = useCallback<OnNodeDrag<BoardFlowNode>>(() => {
    isNodeDragActiveRef.current = true;
    setIsNodeDragActive(true);
    clearHoverPromoteTimer();
    pendingDragPositionByIdRef.current.clear();
  }, [clearHoverPromoteTimer]);

  const handleNodeDrag = useCallback<OnNodeDrag<BoardFlowNode>>((event, node) => {
    const source = node.data.node;
    if ((source.kind !== "asset" && source.kind !== "result") || source.asset.type !== "image") {
      clearActiveMultiGridDropTarget();
      return;
    }
    scheduleActiveMultiGridDropTarget(event.clientX, event.clientY);
  }, [clearActiveMultiGridDropTarget, scheduleActiveMultiGridDropTarget]);

  const handleNodeDragStop = useCallback<OnNodeDrag<BoardFlowNode>>((event, node, nodes) => {
    isNodeDragActiveRef.current = false;
    setIsNodeDragActive(false);
    clearActiveMultiGridDropTarget();
    const positionById = new Map(pendingDragPositionByIdRef.current);
    const draggedNodes = nodes.length > 0 ? nodes : [node];
    const source = node.data.node;
    const dropTarget = draggedNodes.length === 1
      ? multiGridCellDropTargetFromClient(board.nodes, event.clientX, event.clientY)
      : null;
    if (
      dropTarget &&
      source.id !== dropTarget.nodeId &&
      (source.kind === "asset" || source.kind === "result") &&
      source.asset.type === "image"
    ) {
      pendingDragPositionByIdRef.current.clear();
      addAssetToMultiGrid(dropTarget.nodeId, source.asset, dropTarget.cellIndex);
      selectNode(dropTarget.nodeId);
      selectEdge(null);
      updateSelectedNodeIds([dropTarget.nodeId]);
      skipPositionSyncRef.current = false;
      return;
    }
    for (const draggedNode of draggedNodes) {
      positionById.set(draggedNode.id, draggedNode.position);
    }
    pendingDragPositionByIdRef.current.clear();
    beginUndoGesture();
    updateNodesPositions(Array.from(positionById, ([nodeId, position]) => ({ nodeId, position })));
    endUndoGesture();
    skipPositionSyncRef.current = false;
  }, [addAssetToMultiGrid, beginUndoGesture, board.nodes, clearActiveMultiGridDropTarget, endUndoGesture, selectEdge, selectNode, updateNodesPositions, updateSelectedNodeIds]);

  const skipPositionSyncRef = useRef(false);
  const handleNodesChange = useCallback<OnNodesChange<BoardFlowNode>>((changes) => {
    onNodesChange(changes);

    const settledPositions: Array<{ nodeId: string; position: BoardPoint }> = [];
    for (const change of changes) {
      if (change.type !== "position" || !change.position || change.dragging === true) continue;
      if (skipPositionSyncRef.current) continue;
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
  const onlyRenderVisibleBoardElements = board.nodes.length >= BOARD_VISIBLE_RENDER_NODE_THRESHOLD || isNodeDragActive;
  const shouldRenderMiniMap = board.config.showMiniMap && !isNodeDragActive;

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
    if (kind === "multi-grid") return addMultiGridNode({ position });
    if (kind === "agent") return addAgentNode({ position });
    if (kind === "note") return addNoteNode({ position });
    if (kind === "runninghub-app") return addRunningHubAppNode({ position });
    if (kind === "audio-operation") {
      return addGenerateNode({ kind: "audio-operation", model: DEFAULT_AUDIO_MODEL, position });
    }
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
  }, [addAgentNode, addGenerateNode, addMultiGridNode, addNoteNode, addPromptNode, addReferenceGroupNode, addRunningHubAppNode]);

  const addQuickNodeAtPoint = useCallback((kind: BoardInsertKind, point: BoardPoint): void => {
    const item = BOARD_INSERT_CATALOG.find(current => current.kind === kind);
    if (!item) return;
    addQuickNode(kind, centeredNodePosition(point, item.size));
    setQuickInsertMenu(null);
  }, [addQuickNode, centeredNodePosition]);

  const addConnectedQuickNodeAtPoint = useCallback((kind: BoardInsertKind, point: BoardPoint, from: BoardPortRef, selectionSnapshot: string[]): void => {
    if (kind === "image-generate") {
      try {
        const targetPortId = from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn;
        const connections = quickInsertSourceRefs(board.nodes, from, selectionSnapshot)
          .map(sourceRef => ({ from: sourceRef, targetPortId }));
        addGenerateNodeWithConnections(
          {
            kind: "image-generate",
            model: from.portKind === "asset" ? DEFAULT_BOARD_REFERENCE_IMAGE_MODEL : DEFAULT_BOARD_IMAGE_MODEL,
            aspectRatio: "1:1",
            imageResolution: "1024x1024",
            position: centeredNodePosition(point, DEFAULT_GENERATE_NODE_SIZE),
          },
          connections,
        );
        setQuickInsertMenu(null);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : "连接失败");
      }
      return;
    }
    if (kind === "video-generate") {
      try {
        const targetPortId = from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn;
        const connections = quickInsertSourceRefs(board.nodes, from, selectionSnapshot)
          .map(sourceRef => ({ from: sourceRef, targetPortId }));
        addGenerateNodeWithConnections(
          { kind: "video-generate", model: DEFAULT_VIDEO_MODEL, aspectRatio: "auto", position: centeredNodePosition(point, DEFAULT_GENERATE_NODE_SIZE) },
          connections,
        );
        setQuickInsertMenu(null);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : "连接失败");
      }
      return;
    }
    if (kind === "audio-operation") {
      try {
        const targetPortId = from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn;
        const connections = quickInsertSourceRefs(board.nodes, from, selectionSnapshot)
          .map(sourceRef => ({ from: sourceRef, targetPortId }));
        addGenerateNodeWithConnections(
          { kind: "audio-operation", model: DEFAULT_AUDIO_MODEL, position: centeredNodePosition(point, DEFAULT_GENERATE_NODE_SIZE) },
          connections,
        );
        setQuickInsertMenu(null);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : "连接失败");
      }
      return;
    }
    if (kind === "reference-group") {
      const assetNodeIds = referenceGroupAssetNodeIds(board.nodes, from.nodeId, selectionSnapshot);
      if (assetNodeIds.length === 0) return;
      addReferenceGroupNodeWithAssets({ position: centeredNodePosition(point, DEFAULT_REFERENCE_GROUP_NODE_SIZE) }, assetNodeIds);
      setQuickInsertMenu(null);
      return;
    }
    if (kind === "multi-grid") {
      const references = multiGridImageReferences(board.nodes, from, selectionSnapshot);
      if (references.length === 0) return;
      const nodeId = addMultiGridNode({ position: centeredNodePosition(point, DEFAULT_MULTI_GRID_NODE_SIZE) });
      references.forEach(reference => addAssetToMultiGrid(nodeId, reference));
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
  }, [addAssetToMultiGrid, addGenerateNodeWithConnections, addMultiGridNode, addReferenceGroupNodeWithAssets, addRunningHubAppNode, board.nodes, centeredNodePosition, connectPorts, onConnectionError]);

  const quickInsertMenuItems = useMemo(() => {
    const from = quickInsertMenu?.connectionFrom;
    if (!from) return [BOARD_QUICK_INSERT_IMPORT_ITEM, ...BOARD_INSERT_CATALOG];
    const sourceNode = board.nodes.find(node => node.id === from.nodeId);
    if (from.portKind === "prompt") {
      return BOARD_INSERT_CATALOG.filter(item => item.kind === "image-generate" || item.kind === "video-generate" || item.kind === "audio-operation" || item.kind === "runninghub-app");
    }
    if (from.portKind !== "asset") return [];
    if (sourceNode?.kind === "asset") {
      return BOARD_INSERT_CATALOG.filter(item =>
        item.kind === "image-generate" ||
        item.kind === "video-generate" ||
        item.kind === "audio-operation" ||
        item.kind === "reference-group" ||
        (sourceNode.asset.type === "image" && item.kind === "multi-grid") ||
        item.kind === "runninghub-app",
      );
    }
    if (sourceNode?.kind === "result") {
      return BOARD_INSERT_CATALOG.filter(item => sourceNode.asset.type === "image" && item.kind === "multi-grid");
    }
    if (sourceNode?.kind === "reference-group") {
      return BOARD_INSERT_CATALOG.filter(item => item.kind === "image-generate" || item.kind === "video-generate" || item.kind === "audio-operation" || item.kind === "runninghub-app");
    }
    return [];
  }, [board.nodes, quickInsertMenu?.connectionFrom]);

  const connectSelectedNodesToTarget = useCallback((targetNodeId: string): void => {
    const targetNode = board.nodes.find(node => node.id === targetNodeId);
    if (!targetNode) return;
    if (targetNode.kind === "multi-grid") {
      const references = selectedNodeIds.flatMap(nodeId => {
        const node = board.nodes.find(item => item.id === nodeId);
        if ((node?.kind !== "asset" && node?.kind !== "result") || node.asset.type !== "image") return [];
        return [node.asset];
      });
      if (references.length === 0) {
        onConnectionError("所选节点没有可加入多宫格的图片");
        return;
      }
      references.forEach(reference => addAssetToMultiGrid(targetNode.id, reference));
      selectNode(targetNode.id);
      selectEdge(null);
      updateSelectedNodeIds([targetNode.id]);
      closeOverlayMenus();
      return;
    }
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
  }, [addAssetToMultiGrid, board.nodes, closeOverlayMenus, connectPortsBatch, onConnectionError, selectEdge, selectedNodeIds, selectNode, updateSelectedNodeIds]);

  const createReferenceGroupFromSelected = useCallback((contextNodeId: string): void => {
    const contextNode = board.nodes.find(node => node.id === contextNodeId);
    if (!contextNode) return;
    const assetNodeIds = selectedReferenceGroupAssetNodeIds(board.nodes, contextNodeId, selectedNodeIds);
    if (assetNodeIds.length === 0) {
      onConnectionError("请选择图片资产节点");
      return;
    }
    addReferenceGroupNodeWithAssets({
      position: {
        x: contextNode.position.x + contextNode.size.width + 72,
        y: contextNode.position.y,
      },
    }, assetNodeIds);
    closeOverlayMenus();
  }, [addReferenceGroupNodeWithAssets, board.nodes, closeOverlayMenus, onConnectionError, selectedNodeIds]);

  const createGroupFromSelected = useCallback((contextNodeId: string): void => {
    const nodeIds = selectedNodeIds.includes(contextNodeId)
      ? selectedNodeIds
      : [...selectedNodeIds, contextNodeId];
    const groupId = groupNodes(nodeIds);
    if (!groupId) {
      onConnectionError("至少选择两个节点才能打组");
      return;
    }
    updateSelectedNodeIds([groupId]);
    closeOverlayMenus();
  }, [closeOverlayMenus, groupNodes, onConnectionError, selectedNodeIds, updateSelectedNodeIds]);

  const ungroupSelectedNode = useCallback((nodeId: string): void => {
    ungroupNode(nodeId);
    updateSelectedNodeIds([]);
    closeOverlayMenus();
  }, [closeOverlayMenus, ungroupNode, updateSelectedNodeIds]);

  const pasteCopiedNode = useCallback((): void => {
    const copied = copiedNodeRef.current;
    if (!copied) return;
    const { inputEdges, node } = copied;
    const position = pastedNodePosition(board.nodes, node);
    const rememberPastedPosition = (): void => {
      copiedNodeRef.current = {
        inputEdges,
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
    if (node.kind === "group") {
      addGroupNode({ position, size: node.size, title: node.title });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "multi-grid") {
      addMultiGridNode({
        aspectRatio: node.aspectRatio,
        gridSize: node.gridSize,
        items: structuredClone(node.items),
        position,
        size: node.size,
        title: node.title,
      });
      rememberPastedPosition();
      return;
    }
    if (node.kind === "image-generate") {
      const inputConnections = inputEdges
        .map(edge => ({ from: edge.from, targetPortId: edge.to.portId }))
        .filter((connection): connection is { from: BoardPortRef; targetPortId: typeof BOARD_PORT_IDS.promptIn | typeof BOARD_PORT_IDS.referenceIn } =>
          connection.targetPortId === BOARD_PORT_IDS.promptIn || connection.targetPortId === BOARD_PORT_IDS.referenceIn,
        );
      const input = {
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
      } as const;
      if (inputConnections.length > 0) addGenerateNodeWithConnections(input, inputConnections);
      else addGenerateNode(input);
      rememberPastedPosition();
      return;
    }
    if (node.kind === "video-generate") {
      const inputConnections = inputEdges
        .map(edge => ({ from: edge.from, targetPortId: edge.to.portId }))
        .filter((connection): connection is { from: BoardPortRef; targetPortId: typeof BOARD_PORT_IDS.promptIn | typeof BOARD_PORT_IDS.referenceIn } =>
          connection.targetPortId === BOARD_PORT_IDS.promptIn || connection.targetPortId === BOARD_PORT_IDS.referenceIn,
        );
      const input = {
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
      } as const;
      if (inputConnections.length > 0) addGenerateNodeWithConnections(input, inputConnections);
      else addGenerateNode(input);
      rememberPastedPosition();
      return;
    }
    if (node.kind === "audio-operation") {
      const inputConnections = inputEdges
        .map(edge => ({ from: edge.from, targetPortId: edge.to.portId }))
        .filter((connection): connection is { from: BoardPortRef; targetPortId: typeof BOARD_PORT_IDS.promptIn | typeof BOARD_PORT_IDS.referenceIn } =>
          connection.targetPortId === BOARD_PORT_IDS.promptIn || connection.targetPortId === BOARD_PORT_IDS.referenceIn,
        );
      const input = {
        kind: "audio-operation",
        audioFormat: node.audioFormat,
        audioMode: node.audioMode,
        audioStylePrompt: node.audioStylePrompt,
        asrLanguage: node.asrLanguage,
        model: node.model,
        position,
        prompt: node.prompt,
        size: node.size,
        title: node.title,
        variantCount: node.variantCount,
        voiceCloneConsentAccepted: node.voiceCloneConsentAccepted,
        voiceProfileId: node.voiceProfileId,
      } as const;
      if (inputConnections.length > 0) addGenerateNodeWithConnections(input, inputConnections);
      else addGenerateNode(input);
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
    addNoteNode({ body: node.body, position, size: node.size, source: node.source, title: node.title, variant: node.variant });
    rememberPastedPosition();
  }, [addAgentNode, addAssetNode, addGenerateNode, addGenerateNodeWithConnections, addGroupNode, addMultiGridNode, addNoteNode, addPromptNode, addReferenceGroupNode, addResultNodeWithConnection, addRunningHubAppNode, board.nodes]);

  const handleConnectStart = useCallback<OnConnectStart>(() => {
    setIsConnectionActive(true);
  }, []);

  const handleConnectEnd = useCallback<OnConnectEnd>((event, connectionState) => {
    setIsConnectionActive(false);
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
    const targetNode = boardNodeAtPoint(board.nodes, flowPoint, sourceNodeId);
    if (targetNode) {
      if (targetNode.kind === "multi-grid") {
        if (!sourceKind) return;
        const from: BoardPortRef = { nodeId: sourceNodeId, portId: sourceHandleId, portKind: sourceKind };
        const references = multiGridImageReferences(board.nodes, from, [sourceNodeId]);
        if (references.length === 0) {
          onConnectionError("多宫格只支持图片资产");
          return;
        }
        const dropTarget = multiGridCellDropTargetFromClient(board.nodes, clientPoint.x, clientPoint.y);
        references.forEach(reference => addAssetToMultiGrid(
          targetNode.id,
          reference,
          dropTarget?.nodeId === targetNode.id ? dropTarget.cellIndex : undefined,
        ));
        selectNode(targetNode.id);
        selectEdge(null);
        updateSelectedNodeIds([targetNode.id]);
        return;
      }
      const connections = batchConnectionsFromSourceToTarget(board.nodes, sourceNodeId, targetNode, selectedNodeIds);
      if (connections.length === 0) {
        onConnectionError("所选节点没有可连接到此节点的端口");
        return;
      }
      connectPortsBatch(connections);
      selectNode(targetNode.id);
      selectEdge(null);
      updateSelectedNodeIds([targetNode.id]);
      return;
    }

    if (sourceKind === "prompt") {
      setQuickInsertMenu({
        clientX: clientPoint.x,
        clientY: clientPoint.y,
        connectionFrom: { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "prompt" },
        position: flowPoint,
        selectedNodeIds,
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
            selectedNodeIds,
          });
          return;
        }
        return;
      }
      if (sourceNode?.kind === "result") {
        if (sourceNode.asset.type === "image" && sourceHandleId === "asset-out") {
          setQuickInsertMenu({
            clientX: clientPoint.x,
            clientY: clientPoint.y,
            connectionFrom: { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "asset" },
            position: flowPoint,
            selectedNodeIds,
          });
        }
        return;
      }
      if (sourceNode?.kind !== "reference-group") return;
      setQuickInsertMenu({
        clientX: clientPoint.x,
        clientY: clientPoint.y,
        connectionFrom: { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "asset" },
        position: flowPoint,
        selectedNodeIds,
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
  }, [addAssetToMultiGrid, addResultNodeWithConnection, board.nodes, centeredNodePosition, connectPortsBatch, flowPositionFromClient, onConnectionError, selectEdge, selectedNodeIds, selectNode, updateSelectedNodeIds]);

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
      selectedNodeIds: [],
    });
  }, [flowPositionFromClient, selectEdge, selectNode, updateSelectedNodeIds]);

  const openEmptyStateQuickInsertMenu = useCallback((): void => {
    const rect = flowHostRef.current?.getBoundingClientRect();
    if (!rect) {
      onWorkspaceNotice("info", "无法确定插入位置，请先双击画布");
      return;
    }
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    setNodeContextMenu(null);
    selectNode(null);
    selectEdge(null);
    updateSelectedNodeIds([]);
    setQuickInsertMenu({
      clientX,
      clientY,
      position: flowPositionFromClient(clientX, clientY),
      selectedNodeIds: [],
    });
  }, [flowPositionFromClient, onWorkspaceNotice, selectEdge, selectNode, updateSelectedNodeIds]);

  const handleCanvasContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>): void => {
    if (event.defaultPrevented || isTextEntryTarget(event.target)) return;
    event.preventDefault();
    const position = flowPositionFromClient(event.clientX, event.clientY);
    const node = boardNodeAtPoint(board.nodes, position, "");
    if (node) {
      openNodeContextMenu(node.id, event.clientX, event.clientY);
      return;
    }
    openQuickInsertMenu(event);
  }, [board.nodes, flowPositionFromClient, openNodeContextMenu, openQuickInsertMenu]);

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
    const dropTarget = multiGridCellDropTargetFromClient(board.nodes, event.clientX, event.clientY);
    clearActiveMultiGridDropTarget();
    if (assetId) {
      const item = galleryItems.find(entry => entry.id === assetId);
      if (item && item.status === "complete") {
        event.preventDefault();
        void ensureHydratedStorageItem(item).then(hydrated => {
          const asset = storageItemToBoardAsset(hydrated);
          if (dropTarget && asset.type === "image") {
            addAssetToMultiGrid(dropTarget.nodeId, asset, dropTarget.cellIndex);
            selectNode(dropTarget.nodeId);
            selectEdge(null);
            updateSelectedNodeIds([dropTarget.nodeId]);
            closeOverlayMenus();
            return;
          }
          addAssetNode({
            position: centeredNodePosition(point, DEFAULT_ASSET_NODE_SIZE),
            asset,
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
  }, [addAssetNode, addAssetToMultiGrid, board.nodes, centeredNodePosition, clearActiveMultiGridDropTarget, closeOverlayMenus, flowPositionFromClient, galleryItems, importFilesAtPoint, importImageUrlsAtPoint, selectEdge, selectNode, updateSelectedNodeIds]);

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
    if (event.dataTransfer.types.includes(IMAGINE_BOARD_ASSET_DRAG_TYPE)) {
      scheduleActiveMultiGridDropTarget(event.clientX, event.clientY);
      return;
    }
    clearActiveMultiGridDropTarget();
  }, [clearActiveMultiGridDropTarget, scheduleActiveMultiGridDropTarget]);

  const handleBoardDragLeave = useCallback((event: ReactDragEvent<HTMLElement>): void => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    clearActiveMultiGridDropTarget();
  }, [clearActiveMultiGridDropTarget]);

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
        copiedNodeRef.current = {
          inputEdges: board.edges.filter(edge =>
            edge.to.nodeId === selectedNode.id &&
            (edge.kind === "prompt" || edge.kind === "reference")
          ),
          node: selectedNode,
        };
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

  const multiGridDropOverlayStyle = useMemo<CSSProperties | undefined>(() => {
    if (!activeMultiGridDropTarget) return undefined;
    return {
      height: activeMultiGridDropTarget.rect.height,
      left: activeMultiGridDropTarget.rect.left,
      top: activeMultiGridDropTarget.rect.top,
      width: activeMultiGridDropTarget.rect.width,
    };
  }, [activeMultiGridDropTarget]);

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
          ref={setFlowHostRef}
          tabIndex={-1}
          onContextMenu={handleCanvasContextMenu}
          onDoubleClick={handleFlowDoubleClick}
          onDragLeave={handleBoardDragLeave}
          onDragOver={handleBoardDragOver}
          onDrop={handleBoardDrop}
          className={`board-canvas relative min-h-0 bg-[var(--iw-board-canvas-bg)]${isNodeDragActive ? " is-node-dragging" : ""}${isConnectionActive ? " is-connecting" : ""}`}
        >
          <BoardNodeCallbacksContext.Provider value={boardNodeCallbacks}>
          <ReactFlow
            nodes={reactFlowNodes}
            edges={flowEdges}
            edgeTypes={edgeTypes}
            nodeTypes={nodeTypes}
            colorMode={themeMode}
            defaultViewport={board.viewport}
            minZoom={0.25}
            maxZoom={1.8}
            onlyRenderVisibleElements={onlyRenderVisibleBoardElements}
            elevateEdgesOnSelect
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
            selectionMode={SelectionMode.Partial}
            onReconnect={handleReconnect}
            onReconnectStart={handleReconnectStart}
            onReconnectEnd={handleReconnectEnd}
            onSelectionChange={handleSelectionChange}
            panOnDrag={isCoarsePointer ? true : reactFlowPanOnDrag}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            selectionOnDrag={!isCoarsePointer}
            onConnect={handleConnect}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
            onEdgeClick={handleEdgeClick}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onEdgesDelete={handleEdgesDelete}
            onInit={handleFlowInit}
            onMoveEnd={handleMoveEnd}
            onNodeClick={handleNodeClick}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeDrag={handleNodeDrag}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
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
            {shouldRenderMiniMap && (
              <MiniMap
                className="imagine-board-minimap"
                nodeColor={getBoardVar("--iw-board-minimap-node", themeMode === "light" ? "#1e40af" : "#1d4ed8")}
                maskColor={getBoardVar("--iw-board-minimap-mask", themeMode === "light" ? "rgba(241, 245, 249, 0.75)" : "rgba(2,6,23,0.66)")}
                pannable
                zoomable
              />
            )}
            {!isNodeDragActive && selectedNodeIds.length > 1 && selectedDownloadableCount > 0 && onDownloadSelectedAssets ? (
              <NodeToolbar
                nodeId={selectedNodeIds}
                isVisible
                position={Position.Top}
                offset={SELECTION_TOOLBAR_GAP}
                align="center"
                className="pointer-events-none z-40 max-w-[calc(100vw_-_24px)]"
                style={{ contain: "layout paint style" }}
              >
                <div className="pointer-events-auto flex h-10 w-[260px] shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/88 px-2.5 text-[11px] font-semibold text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.28)] backdrop-blur-md ring-1 ring-white/5">
                  <span className="min-w-0 flex-1 truncate px-1 text-slate-300">
                    已选 {selectedNodeIds.length} 个 · 可下载 {selectedDownloadableCount} 个
                  </span>
                  <button
                    type="button"
                    onClick={onDownloadSelectedAssets}
                    className="flex h-7 w-[86px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/10 text-[11px] font-semibold text-slate-100 transition hover:border-blue-300/40 hover:bg-blue-500/20 hover:text-white"
                    title="下载所选媒体为 ZIP"
                  >
                    <Download className="h-3.5 w-3.5" />
                    批量下载
                  </button>
                </div>
              </NodeToolbar>
            ) : null}
          </ReactFlow>
          </BoardNodeCallbacksContext.Provider>
          {multiGridDropOverlayStyle && (
            <div
              aria-hidden="true"
              className="multi-grid-drop-cell-overlay"
              style={multiGridDropOverlayStyle}
            />
          )}
          {saveStatus !== "loading" && board.nodes.length === 0 && (
            <BoardEmptyHint onQuickInsert={openEmptyStateQuickInsertMenu} />
          )}
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
                  addConnectedQuickNodeAtPoint(quickKind, position, quickInsertMenu.connectionFrom, quickInsertMenu.selectedNodeIds);
                  return;
                }
                addQuickNodeAtPoint(quickKind, position);
              }}
            />
          ) : null}
          {nodeContextMenu ? (() => {
            const node = board.nodes.find(item => item.id === nodeContextMenu.nodeId);
            if (!node) return null;
            const compareReference = node.kind === "asset" && node.asset.type === "image"
              ? assetCompareReferenceForNode(node.id)
              : null;
            const mediaItem = promotableItemForNode(node);
            const copyableImageItem = mediaItem && (node.kind === "asset" || node.kind === "result") && node.asset.type === "image"
              ? mediaItem
              : null;
            const selectedBatchConnectionCount = selectedNodeIds.filter(nodeId => {
              const selectedNode = board.nodes.find(item => item.id === nodeId);
              return selectedNode ? batchConnectionToTarget(board.nodes, selectedNode, node) !== null : false;
            }).length;
            const actions = buildBoardNodeContextMenuActions({
              node,
              onConnectSelected: selectedBatchConnectionCount > 0
                ? () => connectSelectedNodesToTarget(node.id)
                : undefined,
              onGroupSelected: selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id)
                ? () => createGroupFromSelected(node.id)
                : undefined,
              onUngroup: node.kind === "group"
                ? () => ungroupSelectedNode(node.id)
                : undefined,
              onCreateReferenceGroup: node.kind === "asset" && node.asset.type === "image"
                ? () => createReferenceGroupFromSelected(node.id)
                : undefined,
              onCompare: compareReference && node.kind === "asset"
                ? () => {
                  if (!mediaItem) return;
                  void Promise.all([resolveCompareReferenceUrl(compareReference), onResolveOriginalAsset(mediaItem)]).then(
                    ([originalUrl, originalItem]) => setAssetCompare({ originalUrl, resultUrl: originalItem.url }),
                    error => onWorkspaceNotice("error", error instanceof Error ? error.message : "原始媒体读取失败"),
                  );
                  closeOverlayMenus();
                }
                : undefined,
              onCopyImage: copyableImageItem
                ? () => {
                  void onResolveOriginalAsset(copyableImageItem).then(
                    originalItem => copyImageUrlToClipboard(originalItem.url),
                  ).then(
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
              onSaveVoiceProfile: node.kind === "asset" && node.asset.type === "audio" && galleryItemById.has(node.asset.assetId)
                ? () => {
                  const item = galleryItemById.get(node.asset.assetId);
                  if (!item) return;
                  onSaveVoiceProfile(item);
                  closeOverlayMenus();
                }
                : undefined,
              onExecute: node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app"
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
