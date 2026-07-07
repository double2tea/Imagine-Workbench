"use client";

import { Download, Grid2X2, Layers, Magnet, Map as MapIcon, Trash2, Ungroup, Upload } from "lucide-react";
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
  MiniMap,
  NodeToolbar,
  Panel,
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
import { buildStorageItem, type StorageItem } from "@/lib/db";
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
  DEFAULT_NOTE_NODE_SIZE,
  DEFAULT_REFERENCE_GROUP_NODE_SIZE,
  DEFAULT_RUNNINGHUB_APP_NODE_SIZE,
  boardNodeAbsolutePosition,
  boardNodesWithAbsolutePositions,
  snapBoardPoint,
  splitBoardImageGrid,
  sortBoardNodesForReactFlow,
  type BoardEdge,
  type BoardEdgeKind,
  type BoardAssetReference,
  type BoardImageGridSplitMode,
  type BoardNode as BoardNodeModel,
  type BoardPoint,
  type BoardPortKind,
  type BoardPortRef,
  type BoardRunningHubAppSchemaResult,
  type BoardSize,
  type BoardSummary,
  type BoardViewport,
  type CreateAssetNodeInput,
  type CreateResultNodeInput,
} from "@/lib/board";
import { BoardNodeCallbacksContext, type BoardNodeCallbacks } from "@/lib/board/callbacks";
import {
  BOARD_PORT_IDS,
  getBoardNodePortDefinitions,
  isValidBoardConnection as isValidBoardPortConnection,
} from "@/lib/board/ports";
import { BOARD_INSERT_CATALOG, type BoardInsertKind } from "@/lib/board/insert-catalog";
import { findConnectedResultNodeForSourceStack, resolveGenerationEventResultStackKey, selectedNodeIdsForContextMenu } from "@/lib/board/utils";
import { t, useTranslations } from "@/lib/i18n";
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
  onDeleteEdge: (edgeId: string) => void | Promise<void>;
  onEditAssetImage: (nodeId: string) => void;
  onImageQuickEdit: (nodeId: string, operation: ImageEditFeature) => void;
  onExecuteGenerateNode: (nodeId: string) => void;
  onExecutePromptNode: (nodeId: string) => void | Promise<void>;
  onFetchRunningHubAppSchema: (webappId: string) => Promise<BoardRunningHubAppSchemaResult>;
  onImportBoardFiles: (files: File[], position: BoardPoint) => void | Promise<void>;
  onMarkGeneratedAssetsViewed?: (assetIds: string[]) => void;
  onCreateBoard: () => void;
  onDeleteBoard: () => void;
  onDownloadAsset: (item: StorageItem, fileNameLabel?: string) => void;
  onDownloadSelectedAssets?: () => void;
  onExportMultiGrid: (nodeId: string) => void | Promise<void>;
  onOpenSettings: () => void;
  onOpenFullscreen: (item: StorageItem) => void;
  onOpenPanorama: (item: StorageItem) => void;
  onResolveOriginalAsset: (item: StorageItem) => Promise<StorageItem>;
  onSaveDerivedAsset: (item: StorageItem) => Promise<StorageItem | null>;
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
  externalSelectedNodeIds?: string[];
  selectedDownloadableCount?: number;
  storageTarget?: "indexeddb" | "postgres";
  viewedGeneratedAssetIds?: ReadonlySet<string>;
}

type BoardFlowEdge = Edge<{ kind: BoardEdgeKind; processing?: boolean; selected?: boolean }, "smoothstep">;
type BoardMoveHandler = NonNullable<ReactFlowProps<BoardFlowNode, BoardFlowEdge>["onMove"]>;
type BoardReconnectStartHandler = NonNullable<ReactFlowProps<BoardFlowNode, BoardFlowEdge>["onReconnectStart"]>;
type BoardReconnectEndHandler = NonNullable<ReactFlowProps<BoardFlowNode, BoardFlowEdge>["onReconnectEnd"]>;
type BoardSelectionStartHandler = NonNullable<ReactFlowProps<BoardFlowNode, BoardFlowEdge>["onSelectionStart"]>;
type BoardSelectionEndHandler = NonNullable<ReactFlowProps<BoardFlowNode, BoardFlowEdge>["onSelectionEnd"]>;

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

interface CopiedBoardNodeSelection {
  nodeIds: string[];
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

function clientPointFromMouseOrTouchEvent(event: MouseEvent | TouchEvent): { clientX: number; clientY: number } | null {
  if ("clientX" in event) return { clientX: event.clientX, clientY: event.clientY };
  const touch = event.changedTouches[0] ?? event.touches[0];
  return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
}

const nodeTypes = { board: BoardNode };
const DEFAULT_BOARD_IMAGE_MODEL = "modelscope:Qwen/Qwen-Image";
const DEFAULT_BOARD_REFERENCE_IMAGE_MODEL = "modelscope:Qwen/Qwen-Image-Edit";
const BOARD_VIEWPORT_POSITION_EPSILON = 0.5;
const BOARD_VIEWPORT_ZOOM_EPSILON = 0.001;
const BOARD_VIEWPORT_MOVE_SETTLE_MS = 140;
const BOARD_VISIBLE_RENDER_NODE_THRESHOLD = 120;
const SPLIT_ASSET_GRID_GAP = 72;
const SPLIT_ASSET_GENERATE_GAP = 96;

interface BoardSelectionSnapshot {
  edgeId: string | null;
  nodeId: string | null;
  nodeIds: string[];
}

type BoardReferenceFlowData = Pick<BoardFlowNode["data"], "generateInputSummary" | "generateReferences" | "promptReferences">;
type BoardMediaFlowData = Pick<BoardFlowNode["data"], "assetStackItems" | "compareReferenceUrl" | "connectedResultNodeId" | "hasResultConnection" | "isUnviewedGeneratedAsset" | "resultItems">;

interface MultiGridCellDropTarget {
  cellIndex: number;
  rect: DOMRect;
  nodeId: string;
}

const SELECTION_TOOLBAR_GAP = 44;
const EMPTY_STORAGE_ITEMS: StorageItem[] = [];
const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

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

function isGeneratedCompleteMediaItem(item: StorageItem | undefined): item is StorageItem & { type: "audio" | "image" | "video" } {
  return (
    item !== undefined &&
    (item.type === "audio" || item.type === "image" || item.type === "video") &&
    item.status === "complete" &&
    Boolean(item.sourceBoardNodeId)
  );
}

function isUnviewedGeneratedMediaItem(item: StorageItem | undefined, viewedAssetIds: ReadonlySet<string>): boolean {
  return isGeneratedCompleteMediaItem(item) && !viewedAssetIds.has(item.id);
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
    left.isBatchSelectionActive === right.isBatchSelectionActive &&
    left.isUnviewedGeneratedAsset === right.isUnviewedGeneratedAsset &&
    left.compareReferenceUrl === right.compareReferenceUrl &&
    sameGenerateInputSummary(left.generateInputSummary, right.generateInputSummary) &&
    sameGenerateTaskSummary(left.generateTaskSummary, right.generateTaskSummary) &&
    sameResultItemList(left.resultItems, right.resultItems) &&
    sameResultItemList(left.assetStackItems, right.assetStackItems) &&
    sameReferenceList(left.generateReferences, right.generateReferences) &&
    sameReferenceList(left.promptReferences, right.promptReferences)
  );
}

function sameReusableFlowNodeData(
  existing: BoardFlowNode["data"],
  cachedData: BoardFlowNode["data"],
  node: BoardNodeModel,
  taskSummary: BoardGenerateTaskSummary | undefined,
): boolean {
  return (
    existing.node === node &&
    sameGenerateTaskSummary(existing.generateTaskSummary, taskSummary) &&
    sameReferenceList(existing.generateReferences, cachedData.generateReferences) &&
    sameReferenceList(existing.promptReferences, cachedData.promptReferences) &&
    sameGenerateInputSummary(existing.generateInputSummary, cachedData.generateInputSummary) &&
    existing.connectedResultNodeId === cachedData.connectedResultNodeId &&
    existing.hasResultConnection === cachedData.hasResultConnection &&
    existing.isBatchSelectionActive === cachedData.isBatchSelectionActive &&
    existing.isUnviewedGeneratedAsset === cachedData.isUnviewedGeneratedAsset &&
    sameResultItemList(existing.resultItems, cachedData.resultItems) &&
    sameResultItemList(existing.assetStackItems, cachedData.assetStackItems) &&
    existing.compareReferenceUrl === cachedData.compareReferenceUrl &&
    existing.boardId === cachedData.boardId
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

const boardEdgeKindLabelKeys: Record<BoardEdgeKind, string> = {
  "agent-context": "board.node.edgeKinds.agentContext",
  prompt: "board.node.edgeKinds.prompt",
  reference: "board.node.edgeKinds.reference",
  result: "board.node.edgeKinds.result",
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
  const visuallySelected = selected || data?.selected === true;
  const showLabel = processing || visuallySelected;
  const selectionHaloStyle: CSSProperties = { ...style, strokeWidth: 7 };

  return (
    <>
      {visuallySelected ? (
        <BaseEdge
          id={`${id}-selection`}
          path={edgePath}
          style={selectionHaloStyle}
          interactionWidth={0}
          className={`imagine-board-edge-selection-path imagine-board-edge-selection-path-${kind}`}
        />
      ) : null}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
        interactionWidth={36}
        className={[
          "imagine-board-edge-path",
          `imagine-board-edge-path-${kind}`,
          visuallySelected ? "imagine-board-edge-path-selected" : "",
        ].filter(Boolean).join(" ")}
      />
      {showLabel ? (
        <EdgeToolbar
          edgeId={id}
          x={labelX}
          y={labelY}
          isVisible
          className={[
            "board-edge-toolbar nodrag nopan flex items-center gap-1",
            `board-edge-toolbar-${kind}`,
            visuallySelected ? "board-edge-toolbar-selected" : "",
            processing ? "board-edge-toolbar-processing" : "",
          ].filter(Boolean).join(" ")}
        >
          {visuallySelected ? (
            <span className="board-edge-kind-pill rounded-full border px-2 py-0.5 text-[9px] font-semibold">
              {t(boardEdgeKindLabelKeys[kind])}
            </span>
          ) : null}
          {processing ? (
            <span className="board-edge-processing-pill rounded-full border px-2 py-0.5 text-[9px] font-semibold">
              {t("board.workspace.processing")}
            </span>
          ) : null}
          {visuallySelected ? (
            <button
              type="button"
              aria-label={t("board.workspace.deleteConnection")}
              title={t("board.workspace.deleteConnection")}
              onClick={() => void deleteElements({ edges: [{ id }] })}
              className="board-edge-delete-button flex h-5 w-5 items-center justify-center rounded-full border transition"
            >
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </EdgeToolbar>
      ) : null}
    </>
  );
});

const edgeTypes = { smoothstep: BoardEdgeComponent };
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
  label: "Import media",
  icon: Upload,
  tone: "success",
};

function portKindFromHandle(handleId: string | null | undefined): BoardPortKind | null {
  if (!handleId) return null;
  if (handleId === BOARD_PORT_IDS.promptIn || handleId === BOARD_PORT_IDS.promptOut) return "prompt";
  if (handleId === BOARD_PORT_IDS.agentContextIn) return "agent";
  if (handleId === BOARD_PORT_IDS.resultOut || handleId === BOARD_PORT_IDS.noteIn) return "result";
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
    handleId === BOARD_PORT_IDS.noteIn ||
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

  const resolvedSourceKind = connection.sourceHandle === BOARD_PORT_IDS.noteIn && targetKind === "prompt" ? "prompt" : sourceKind;
  const sourceRef: BoardPortRef = { nodeId: connection.source, portId: connection.sourceHandle, portKind: resolvedSourceKind };
  const resolvedTargetKind = connection.targetHandle === BOARD_PORT_IDS.noteIn && sourceKind === "prompt" ? "prompt" : targetKind;
  const targetRef: BoardPortRef = { nodeId: connection.target, portId: connection.targetHandle, portKind: resolvedTargetKind };
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
    throw new Error(`Image drag failed (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("Dropped URL is not an image");
  }
  return new File([blob], `board-drag-image-${index}.${extensionFromImageType(blob.type)}`, { type: blob.type });
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Image read result is not a Data URL"));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Image read failed"));
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:image/")) return url;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image split failed to read source (HTTP ${response.status})`);
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("Split source URL is not an image");
  }
  return readBlobAsDataUrl(blob);
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

function makeClientId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomUUID()}`;
}

function splitAssetTitle(sourceTitle: string, index: number): string {
  return `${sourceTitle} - ${String(index + 1).padStart(2, "0")}`;
}

function aspectRatioFromSize(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

interface SplitAssetGridLayout {
  bounds: BoardSize;
  positions: BoardPoint[];
}

function splitAssetGridLayout(
  nodes: BoardNodeModel[],
  sourcePosition: BoardPoint,
  sourceSize: BoardSize,
  sizes: BoardSize[],
): SplitAssetGridLayout {
  const count = sizes.length;
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / columns);
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(...sizes.filter((_, index) => index % columns === column).map(size => size.width)),
  );
  const rowHeights = Array.from({ length: rows }, (_, row) =>
    Math.max(...sizes.filter((_, index) => Math.floor(index / columns) === row).map(size => size.height)),
  );
  const bounds = {
    width: columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * SPLIT_ASSET_GRID_GAP,
    height: rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rows - 1) * SPLIT_ASSET_GRID_GAP,
  };
  const origin = findAvailableBoardNodePosition(
    boardNodesWithAbsolutePositions(nodes),
    { x: sourcePosition.x + sourceSize.width + SPLIT_ASSET_GENERATE_GAP, y: sourcePosition.y },
    bounds,
  );
  const positions = sizes.map((_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = origin.x + columnWidths.slice(0, column).reduce((sum, width) => sum + width + SPLIT_ASSET_GRID_GAP, 0);
    const y = origin.y + rowHeights.slice(0, row).reduce((sum, height) => sum + height + SPLIT_ASSET_GRID_GAP, 0);
    return { x: Math.round(x), y: Math.round(y) };
  });
  return { bounds, positions };
}

function selectedImageGenerateNodeId(
  nodes: readonly BoardNodeModel[],
  selectedNodeId: string | null,
  selectedNodeIds: readonly string[],
  sourceNodeId: string,
): string | null {
  const candidates = [...selectedNodeIds, ...(selectedNodeId ? [selectedNodeId] : [])];
  for (const nodeId of candidates) {
    if (nodeId === sourceNodeId) continue;
    const node = nodes.find(candidate => candidate.id === nodeId);
    if (node?.kind === "image-generate") return node.id;
  }
  return null;
}

function getBoardVar(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const cs = getComputedStyle(document.querySelector(".imagine-workbench-shell") || document.documentElement);
  const val = cs.getPropertyValue(varName).trim();
  return val || fallback;
}

function referencePreviewsFromEdges(
  index: BoardPromptReferenceGraphIndex,
  edges: readonly BoardEdge[],
  options: { includeEdgeControls: boolean },
): BoardGenerateInputSummary["referencePreviews"] {
  return edges.flatMap(edge => {
    const sourceNode = index.nodeById.get(edge.from.nodeId);
    const sourceEdgeId = options.includeEdgeControls ? edge.id : undefined;
    if (isBoardMediaSourceNode(sourceNode)) {
      return [{
        id: sourceNode.asset.assetId,
        role: "general" as const,
        sourceEdgeId,
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
        sourceEdgeId,
        sourceNodeId: sourceNode.id,
        sourceTitle: sourceNode.title,
        type: reference.type,
        url: reference.url,
      }));
    }
    return [];
  });
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
  const promptReferencePreviews = promptNode?.kind === "prompt"
    ? referencePreviewsFromEdges(
      index,
      (index.incomingEdgesByTargetNode.get(promptNode.id) ?? []).filter(edge => edge.to.portId === BOARD_PORT_IDS.assetIn),
      { includeEdgeControls: false },
    )
    : [];
  const directReferencePreviews = referencePreviewsFromEdges(
    index,
    incomingEdges.filter(edge => edge.to.portId === BOARD_PORT_IDS.referenceIn),
    { includeEdgeControls: true },
  );
  const referencePreviews = [...promptReferencePreviews, ...directReferencePreviews]
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

function resultSourceStackMapKey(sourceNodeId: string, resultStackKey: string): string {
  return `${sourceNodeId}\t${resultStackKey}`;
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
    throw new Error("Browser does not support copying image to clipboard");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Image read failed: HTTP ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("Current asset is not a copyable image");
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
    if (target.kind === "note" && outputPort.portKind === "prompt") {
      return { portId: BOARD_PORT_IDS.noteIn, portKind: "prompt" as const };
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

function isBoardMediaSourceNode(node: BoardNodeModel | undefined): node is BoardNodeModel & { kind: "asset" | "result" } {
  return node?.kind === "asset" || node?.kind === "result";
}

type ResultSourceNodeModel = Extract<BoardNodeModel, { kind: "image-generate" | "video-generate" | "audio-operation" | "runninghub-app" }>;

function resultNodeSnapshotForSource(
  sourceNode: ResultSourceNodeModel,
  galleryItemById: ReadonlyMap<string, StorageItem>,
): Pick<CreateResultNodeInput, "activeAssetId" | "asset" | "resultAssetIds"> | null {
  const currentResultAssetIds = sourceNode.resultAssetIds ?? (sourceNode.resultAssetId ? [sourceNode.resultAssetId] : []);
  const activeAssetId = sourceNode.resultAssetId ?? currentResultAssetIds.at(-1);
  if (!activeAssetId) return null;
  const item = galleryItemById.get(activeAssetId);
  if (!isMediaReferenceItem(item)) return null;
  const resultAssetIds = currentResultAssetIds.includes(activeAssetId)
    ? currentResultAssetIds
    : [...currentResultAssetIds, activeAssetId];
  return {
    activeAssetId,
    resultAssetIds,
    asset: {
      assetId: item.id,
      type: item.type,
      url: item.url,
      prompt: item.prompt,
      model: item.model,
    },
  };
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
    if (!isBoardMediaSourceNode(node) || node.asset.type !== "image") return [];
    if (seenAssetIds.has(node.asset.assetId)) return [];
    seenAssetIds.add(node.asset.assetId);
    return [node.asset];
  });
}

function referenceGroupMediaNodeIds(
  nodes: BoardNodeModel[],
  sourceNodeId: string,
  selectedNodeIds: string[],
): string[] {
  const sourceNode = nodes.find(node => node.id === sourceNodeId);
  if (!isBoardMediaSourceNode(sourceNode)) return [];
  const nodeIds = selectedNodeIds.length > 1 && selectedNodeIds.includes(sourceNodeId)
    ? selectedNodeIds
    : [sourceNodeId];
  const seenNodeIds = new Set<string>();
  return nodeIds.filter(nodeId => {
    if (seenNodeIds.has(nodeId)) return false;
    seenNodeIds.add(nodeId);
    const node = nodes.find(item => item.id === nodeId);
    return isBoardMediaSourceNode(node);
  });
}

function selectedReferenceGroupMediaNodeIds(
  nodes: BoardNodeModel[],
  contextNodeId: string,
  selectedNodeIds: string[],
): string[] {
  const nodeIds = selectedNodeIds.includes(contextNodeId) ? selectedNodeIds : [contextNodeId];
  return referenceGroupMediaNodeIds(nodes, contextNodeId, nodeIds);
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
  const cell = document.elementsFromPoint(clientX, clientY)
    .map(element => element.closest<HTMLElement>("[data-multi-grid-id][data-multi-grid-cell-index]"))
    .find((element): element is HTMLElement => element instanceof HTMLElement);
  const nodeId = cell?.dataset.multiGridId;
  if (!nodeId) return null;
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
  onDeleteEdge,
  onEditAssetImage,
  onImageQuickEdit,
  onExecuteGenerateNode,
  onExecutePromptNode,
  onFetchRunningHubAppSchema,
  onImportBoardFiles,
  onMarkGeneratedAssetsViewed,
  onCreateBoard,
  onDeleteBoard,
  onDownloadAsset,
  onDownloadSelectedAssets,
  onExportMultiGrid,
  onOpenSettings,
  onOpenFullscreen,
  onOpenPanorama,
  onResolveOriginalAsset,
  onSaveDerivedAsset,
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
  externalSelectedNodeIds,
  selectedDownloadableCount = 0,
  storageTarget = "indexeddb",
  viewedGeneratedAssetIds = EMPTY_STRING_SET,
}: BoardWorkspaceProps) {
  const themeMode = useThemeModeSnapshot();
  const { t: tb } = useTranslations("board");
  const { t: tc } = useTranslations("common");
  const isCoarsePointer = useCoarsePointer();
  const flowInstanceRef = useRef<ReactFlowInstance<BoardFlowNode, BoardFlowEdge> | null>(null);
  const flowHostRef = useRef<HTMLElement | null>(null);
  const mediaImportInputRef = useRef<HTMLInputElement>(null);
  const pendingImportPointRef = useRef<BoardPoint | null>(null);
  const copiedNodeRef = useRef<CopiedBoardNode | CopiedBoardNodeSelection | null>(null);
  const isNodeDragActiveRef = useRef(false);
  const isViewportMoveActiveRef = useRef(false);
  const viewportMoveEndTimerRef = useRef<number | null>(null);
  const isSelectionMoveActiveRef = useRef(false);
  const selectionMoveEndTimerRef = useRef<number | null>(null);
  const selectionMoveEndCleanupRef = useRef<(() => void) | null>(null);
  const structureMutationEndTimerRef = useRef<number | null>(null);
  const structureMutationSignatureRef = useRef<{ boardId: string; nodeIds: string } | null>(null);
  const multiGridDropFrameRef = useRef<number | null>(null);
  const pendingMultiGridDropPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const pendingDragPositionByIdRef = useRef<Map<string, BoardPoint>>(new Map());
  const selectionRef = useRef<BoardSelectionSnapshot>({ edgeId: null, nodeId: null, nodeIds: [] });
  const protectedEdgeSelectionRef = useRef<string | null>(null);
  const isSyncingFlowNodesRef = useRef(false);
  const prevFlowDataRef = useRef<Map<string, BoardFlowNode["data"]>>(new Map());
  const [quickInsertMenu, setQuickInsertMenu] = useState<QuickInsertMenu | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<BoardNodeContextMenuState | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [trashedNodes, setTrashedNodes] = useState<BoardTrashEntry[]>([]);
  const [assetCompare, setAssetCompare] = useState<{ originalUrl: string; resultUrl: string } | null>(null);
  const [flowReady, setFlowReady] = useState(false);
  const [isConnectionActive, setIsConnectionActive] = useState(false);
  const [activeMultiGridDropTarget, setActiveMultiGridDropTarget] = useState<MultiGridCellDropTarget | null>(null);
  const setCanvasInteractionClass = useCallback((className: string, isActive: boolean): void => {
    flowHostRef.current?.classList.toggle(className, isActive);
  }, []);
  const setViewportMoveActive = useCallback((isActive: boolean): void => {
    if (isViewportMoveActiveRef.current === isActive) return;
    isViewportMoveActiveRef.current = isActive;
    setCanvasInteractionClass("is-viewport-moving", isActive);
  }, [setCanvasInteractionClass]);
  const setSelectionMoveActive = useCallback((isActive: boolean): void => {
    if (isSelectionMoveActiveRef.current === isActive) return;
    isSelectionMoveActiveRef.current = isActive;
    setCanvasInteractionClass("is-selection-moving", isActive);
  }, [setCanvasInteractionClass]);
  const beginStructureMutation = useCallback((): void => {
    setCanvasInteractionClass("is-structure-mutating", true);
    if (structureMutationEndTimerRef.current !== null) window.clearTimeout(structureMutationEndTimerRef.current);
    structureMutationEndTimerRef.current = window.setTimeout(() => {
      structureMutationEndTimerRef.current = null;
      setCanvasInteractionClass("is-structure-mutating", false);
    }, 180);
  }, [setCanvasInteractionClass]);
  const beginViewportMove = useCallback((): void => {
    if (viewportMoveEndTimerRef.current !== null) {
      window.clearTimeout(viewportMoveEndTimerRef.current);
      viewportMoveEndTimerRef.current = null;
    }
    setViewportMoveActive(true);
  }, [setViewportMoveActive]);
  const scheduleViewportMoveEnd = useCallback((): void => {
    if (viewportMoveEndTimerRef.current !== null) window.clearTimeout(viewportMoveEndTimerRef.current);
    viewportMoveEndTimerRef.current = window.setTimeout(() => {
      viewportMoveEndTimerRef.current = null;
      setViewportMoveActive(false);
    }, BOARD_VIEWPORT_MOVE_SETTLE_MS);
  }, [setViewportMoveActive]);
  const clearSelectionMoveEndListeners = useCallback((): void => {
    selectionMoveEndCleanupRef.current?.();
    selectionMoveEndCleanupRef.current = null;
  }, []);
  const scheduleSelectionMoveEnd = useCallback((): void => {
    clearSelectionMoveEndListeners();
    if (selectionMoveEndTimerRef.current !== null) window.clearTimeout(selectionMoveEndTimerRef.current);
    selectionMoveEndTimerRef.current = window.setTimeout(() => {
      selectionMoveEndTimerRef.current = null;
      setSelectionMoveActive(false);
    }, BOARD_VIEWPORT_MOVE_SETTLE_MS);
  }, [clearSelectionMoveEndListeners, setSelectionMoveActive]);
  const beginSelectionMove = useCallback((): void => {
    clearSelectionMoveEndListeners();
    if (selectionMoveEndTimerRef.current !== null) {
      window.clearTimeout(selectionMoveEndTimerRef.current);
      selectionMoveEndTimerRef.current = null;
    }
    const scheduleEnd = (): void => scheduleSelectionMoveEnd();
    window.addEventListener("mouseup", scheduleEnd, { capture: true, once: true });
    window.addEventListener("pointerup", scheduleEnd, { capture: true, once: true });
    window.addEventListener("blur", scheduleEnd, { once: true });
    selectionMoveEndCleanupRef.current = () => {
      window.removeEventListener("mouseup", scheduleEnd, { capture: true });
      window.removeEventListener("pointerup", scheduleEnd, { capture: true });
      window.removeEventListener("blur", scheduleEnd);
    };
    setSelectionMoveActive(true);
  }, [clearSelectionMoveEndListeners, scheduleSelectionMoveEnd, setSelectionMoveActive]);
  useEffect(() => () => {
    if (structureMutationEndTimerRef.current !== null) window.clearTimeout(structureMutationEndTimerRef.current);
    if (viewportMoveEndTimerRef.current !== null) window.clearTimeout(viewportMoveEndTimerRef.current);
    if (selectionMoveEndTimerRef.current !== null) window.clearTimeout(selectionMoveEndTimerRef.current);
    clearSelectionMoveEndListeners();
    setCanvasInteractionClass("is-node-dragging", false);
    setCanvasInteractionClass("is-viewport-moving", false);
    setCanvasInteractionClass("is-selection-moving", false);
    setCanvasInteractionClass("is-structure-mutating", false);
  }, [clearSelectionMoveEndListeners, setCanvasInteractionClass]);
  const updateSelectedNodeIds = useCallback((nextIds: string[]): void => {
    setSelectedNodeIds(currentIds => {
      if (sameStringList(currentIds, nextIds)) return currentIds;
      return nextIds;
    });
  }, []);
  useEffect(() => {
    if (!externalSelectedNodeIds) return;
    updateSelectedNodeIds(externalSelectedNodeIds);
  }, [externalSelectedNodeIds, updateSelectedNodeIds]);
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
    addAssetNodes,
    addAssetToMultiGrid,
    addAssetToReferenceGroup,
    extractMultiGridItemToAssetNode,
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
    deleteNodes,
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
  const boardStructureNodeIds = useMemo(
    () => board.nodes.map(node => node.id).join("\u001f"),
    [board.nodes],
  );
  useLayoutEffect(() => {
    if (saveStatus === "loading") return;
    const previousSignature = structureMutationSignatureRef.current;
    const nextSignature = { boardId: board.id, nodeIds: boardStructureNodeIds };
    structureMutationSignatureRef.current = nextSignature;
    if (!previousSignature || previousSignature.boardId !== nextSignature.boardId) return;
    if (previousSignature.nodeIds === nextSignature.nodeIds) return;
    beginStructureMutation();
  }, [beginStructureMutation, board.id, boardStructureNodeIds, saveStatus]);
  const hasMultiGridNodes = useMemo(
    () => board.nodes.some(node => node.kind === "multi-grid"),
    [board.nodes],
  );
  const selectOnlyNodeIds = useCallback((nodeIds: string[]): void => {
    selectEdge(null);
    selectNode(nodeIds[0] ?? null);
    updateSelectedNodeIds(nodeIds);
  }, [selectEdge, selectNode, updateSelectedNodeIds]);
  const clearSelection = useCallback((): void => {
    selectOnlyNodeIds([]);
  }, [selectOnlyNodeIds]);
  useEffect(() => {
    const liveNodeIds = new Set(board.nodes.map(node => node.id));
    setSelectedNodeIds(currentIds => {
      const nextIds = currentIds.filter(nodeId => liveNodeIds.has(nodeId));
      return sameStringList(currentIds, nextIds) ? currentIds : nextIds;
    });
  }, [board.nodes]);
  useEffect(() => {
    if (!selectedNodeId || selectedNodeIds.length > 1) return;
    if (!board.nodes.some(node => node.id === selectedNodeId)) return;
    updateSelectedNodeIds([selectedNodeId]);
  }, [board.nodes, selectedNodeId, selectedNodeIds.length, updateSelectedNodeIds]);
  const selectedGroupNodeIds = useMemo(
    () => selectedNodeIds.filter(nodeId => board.nodes.some(node => node.id === nodeId && node.kind === "group")),
    [board.nodes, selectedNodeIds],
  );
  const canDownloadSelectedAssets = selectedDownloadableCount > 0 && onDownloadSelectedAssets !== undefined;
  const selectionToolbarWidthClass = selectedGroupNodeIds.length > 0 || canDownloadSelectedAssets
    ? "w-[330px]"
    : "w-[240px]";
  const viewportRef = useRef<BoardViewport>(board.viewport);
  const mobileViewportFittedGraphKeyRef = useRef<string | null>(null);
  const boardGraphContentKey = useMemo(
    () => buildBoardGraphContentKey(board.nodes, board.edges),
    [board.nodes, board.edges],
  );
  const reactFlowConnectionLineStyle = useMemo(
    () => ({
      stroke: getBoardVar("--iw-board-edge-reference", "#60a5fa"),
      strokeDasharray: "7 5",
      strokeWidth: 2,
    }),
    [themeMode],
  );
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
  useEffect(() => {
    const instance = flowInstanceRef.current;
    if (!instance || !flowReady || board.nodes.length === 0) return;
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;
    const fitKey = `${board.id}:${boardGraphContentKey}`;
    if (mobileViewportFittedGraphKeyRef.current === fitKey) return;
    mobileViewportFittedGraphKeyRef.current = fitKey;
    const frameId = window.requestAnimationFrame(() => {
      void instance.fitView({ padding: 0.2, duration: 0, maxZoom: 0.72 });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [board.id, board.nodes.length, boardGraphContentKey, flowReady]);
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
    const node = boardPromptReferenceGraphIndex.nodeById.get(assetNodeId);
    if (node?.kind !== "asset" || node.asset.type !== "image") return null;
    const sourceEdge = (boardPromptReferenceGraphIndex.incomingEdgesByTargetNode.get(assetNodeId) ?? [])
      .find(edge => edge.from.portId === BOARD_PORT_IDS.assetOut && edge.to.portId === BOARD_PORT_IDS.assetIn);
    if (!sourceEdge) return null;
    const sourceNode = boardPromptReferenceGraphIndex.nodeById.get(sourceEdge.from.nodeId);
    if (!isBoardMediaSourceNode(sourceNode) || sourceNode.asset.type !== "image") return null;
    return { id: sourceNode.asset.assetId, role: "general", type: "image", url: sourceNode.asset.url };
  }, [boardPromptReferenceGraphIndex]);

  const resolveCompareReferenceUrl = useCallback(async (reference: ReferenceImageRef): Promise<string> => {
    const item = galleryItemById.get(reference.id);
    if (!item) return reference.url;
    return (await onResolveOriginalAsset(item)).url;
  }, [galleryItemById, onResolveOriginalAsset]);

  const handleSplitImageGrid = useCallback((nodeId: string, mode: BoardImageGridSplitMode): void => {
    const sourceNode = board.nodes.find(node => node.id === nodeId);
    if (!sourceNode || (sourceNode.kind !== "asset" && sourceNode.kind !== "result") || sourceNode.asset.type !== "image") {
      onWorkspaceNotice("error", tb("workspace.selectImageNode"));
      return;
    }
    const sourceAssetId = sourceNode.kind === "result" ? sourceNode.activeAssetId : sourceNode.asset.assetId;
    const storedItem = promotableItemForNode(sourceNode);
    const sourceItem = storedItem ?? (
      sourceAssetId === sourceNode.asset.assetId
        ? buildStorageItem(
          {
            id: sourceNode.asset.assetId,
            type: "image",
            url: sourceNode.asset.url,
            prompt: sourceNode.asset.prompt,
            model: sourceNode.asset.model,
            aspectRatio: "auto",
            createdAt: sourceNode.createdAt,
            status: "complete",
            progress: 100,
            sourceBoardNodeId: sourceNode.id,
            ...(sourceNode.kind === "result" ? { sourceBoardResultStackKey: sourceNode.resultStackKey } : {}),
          },
          { boardId: board.id },
        )
        : null
    );
    if (!sourceItem) {
      onWorkspaceNotice("error", tb("workspace.originalImageReadFailed"));
      return;
    }

    void (async () => {
      const originalItem = await onResolveOriginalAsset(sourceItem);
      const sourceUrl = await imageUrlToDataUrl(originalItem.url);
      const split = await splitBoardImageGrid(sourceUrl, mode);
      const splitCount = split.crops.length;
      const createdAt = new Date().toISOString();
      const sourceTitle = sourceNode.title || sourceItem.prompt || sourceItem.id;
      const pendingItems = split.crops.map(crop => buildStorageItem(
        {
          id: makeClientId(`grid_split_${crop.index}`),
          type: "image",
          url: crop.url,
          prompt: splitAssetTitle(sourceTitle, crop.index),
          model: "grid-split",
          aspectRatio: aspectRatioFromSize(crop.rect.width, crop.rect.height),
          createdAt,
          status: "complete",
          progress: 100,
          operationName: "grid-split",
          sourceBoardNodeId: sourceNode.id,
          cropDerivative: {
            sourceAssetId: sourceItem.id,
            sourceWidth: split.sourceWidth,
            sourceHeight: split.sourceHeight,
            splitIndex: crop.index,
            splitCount,
            cropRect: crop.rect,
          },
        },
        { boardId: board.id },
      ));
      const savedItems: StorageItem[] = [];
      for (const pendingItem of pendingItems) {
        const savedItem = await onSaveDerivedAsset(pendingItem);
        if (!savedItem) throw new Error(tb("workspace.gridSplitFailed"));
        savedItems.push(savedItem);
      }

      const sourcePosition = boardNodeAbsolutePosition(board.nodes, sourceNode.id) ?? sourceNode.position;
      const splitSizes = split.crops.map(crop => mediaNodeSizeForAspectRatio(crop.rect.width / crop.rect.height));
      const splitLayout = splitAssetGridLayout(board.nodes, sourcePosition, sourceNode.size, splitSizes);
      const assetNodeIds = addAssetNodes(savedItems.map((item, index) => ({
        asset: storageItemToBoardAsset(item),
        position: splitLayout.positions[index],
        size: splitSizes[index],
        title: splitAssetTitle(sourceTitle, index),
      })));
      const targetNodeId = selectedImageGenerateNodeId(board.nodes, selectedNodeId, selectedNodeIds, sourceNode.id);
      beginStructureMutation();
      if (targetNodeId) {
        const sourceRefs = assetNodeIds.map(assetNodeId => ({
          nodeId: assetNodeId,
          portId: BOARD_PORT_IDS.assetOut,
          portKind: "asset" as const,
        }));
        connectPortsBatch(sourceRefs.map(from => ({
          from,
          to: {
            nodeId: targetNodeId,
            portId: BOARD_PORT_IDS.referenceIn,
            portKind: "asset" as const,
          },
        })));
        selectOnlyNodeIds([targetNodeId]);
      } else {
        selectOnlyNodeIds(assetNodeIds);
      }
      onWorkspaceNotice(
        "success",
        tb(targetNodeId ? "workspace.gridSplitCreatedAndConnected" : "workspace.gridSplitCreated", {
          count: savedItems.length,
        }),
      );
    })().catch(error => {
      onWorkspaceNotice("error", error instanceof Error ? error.message : tb("workspace.gridSplitFailed"));
    });
  }, [
    addAssetNodes,
    beginStructureMutation,
    board.id,
    board.nodes,
    connectPortsBatch,
    onResolveOriginalAsset,
    onSaveDerivedAsset,
    onWorkspaceNotice,
    promotableItemForNode,
    selectOnlyNodeIds,
    selectedNodeId,
    selectedNodeIds,
    tb,
  ]);

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

  const availableCenteredNodePosition = useCallback((point: BoardPoint, size: BoardSize): BoardPoint => {
    return findAvailableBoardNodePosition(
      boardNodesWithAbsolutePositions(board.nodes),
      centeredNodePosition(point, size),
      size,
    );
  }, [board.nodes, centeredNodePosition]);

  const isPointInsideFlowHost = useCallback((clientX: number, clientY: number): boolean => {
    const rect = flowHostRef.current?.getBoundingClientRect();
    return Boolean(
      rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }, []);

  const handleExtractMultiGridItem = useCallback((nodeId: string, assetId: string, clientX: number, clientY: number): void => {
    if (!isPointInsideFlowHost(clientX, clientY)) return;
    const position = centeredNodePosition(flowPositionFromClient(clientX, clientY), DEFAULT_ASSET_NODE_SIZE);
    const extractedNodeId = extractMultiGridItemToAssetNode(nodeId, assetId, position);
    if (!extractedNodeId) return;
    selectOnlyNodeIds([extractedNodeId]);
    closeOverlayMenus();
  }, [
    centeredNodePosition,
    closeOverlayMenus,
    extractMultiGridItemToAssetNode,
    flowPositionFromClient,
    isPointInsideFlowHost,
    selectOnlyNodeIds,
  ]);

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
    selectOnlyNodeIds([node.id]);
    const instance = flowInstanceRef.current;
    if (!flowReady || !instance) return;
    const centerX = node.position.x + node.size.width / 2;
    const centerY = node.position.y + node.size.height / 2;
    void instance.setCenter(centerX, centerY, {
      zoom: Math.max(instance.getZoom(), 0.85),
      duration: 240,
    });
  }, [board.nodes, flowReady, selectOnlyNodeIds]);

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
    deleteNodes([nodeId]);
    setSelectedNodeIds(current => {
      const next = current.filter(id => id !== nodeId);
      return sameStringList(current, next) ? current : next;
    });
  }, [board.edges, board.nodes, deleteNodes, galleryItemById, onCancelAssetTask]);

  const restoreTrashedNode = useCallback((index: number) => {
    const entry = trashedNodes[index];
    if (!entry) return;
    try {
      restoreNodeWithEdges(entry.node, entry.edges);
      selectOnlyNodeIds([entry.node.id]);
      setTrashedNodes(current => current.filter((_item, itemIndex) => itemIndex !== index));
    } catch (error) {
      onConnectionError(error instanceof Error ? error.message : tb("workspace.restoreNodeFailed"));
    }
  }, [onConnectionError, restoreNodeWithEdges, selectOnlyNodeIds, tb, trashedNodes]);

  const connectSelectedBoardPromptReference = useCallback((nodeId: string, reference: BoardPromptReference): void => {
    if (resolveBoardPromptReferenceGroup(reference) !== "board") return;
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
    beginStructureMutation();
    connectPorts(from, to);
  }, [beginStructureMutation, board.edges, board.nodes, connectPorts]);

  const resultNodeBySourceStack = useMemo(() => {
    const resultNodeBySourceStack = new Map<string, BoardNodeModel & { kind: "result" }>();
    for (const node of board.nodes) {
      if (node.kind !== "result") continue;
      const hasLiveEdge = board.edges.some(edge =>
        edge.from.nodeId === node.sourceNodeId &&
        edge.from.portId === BOARD_PORT_IDS.resultOut &&
        edge.to.nodeId === node.id &&
        edge.to.portId === BOARD_PORT_IDS.assetIn
      );
      if (hasLiveEdge) resultNodeBySourceStack.set(resultSourceStackMapKey(node.sourceNodeId, node.resultStackKey ?? ""), node);
    }
    return resultNodeBySourceStack;
    // board.nodes read inside; graph content key gates source/result stack changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardGraphContentKey, board.edges]);

  const resultSourceNodes = useMemo(() => {
    const sourceIds = new Set<string>();
    for (const edge of board.edges) {
      if (edge.from.portId === BOARD_PORT_IDS.resultOut) {
        sourceIds.add(edge.from.nodeId);
      }
    }
    return sourceIds;
  }, [board.edges]);

  const activeResultSourceStacks = useMemo(() => {
    const sourceStacks = new Set<string>();
    for (const item of galleryItems) {
      if (!item.sourceBoardNodeId || !isActiveGenerateTask(item)) continue;
      const sourceNode = boardPromptReferenceGraphIndex.nodeById.get(item.sourceBoardNodeId);
      if (!isResultSourceNode(sourceNode)) continue;
      const resultStackKey = resolveGenerationEventResultStackKey(sourceNode.resultStackKey, item.sourceBoardResultStackKey);
      if (resultStackKey === undefined) continue;
      sourceStacks.add(resultSourceStackMapKey(sourceNode.id, resultStackKey));
    }
    for (const task of generationTasks) {
      if (!isActiveBoardGenerationTask(task) || !task.source.boardNodeId) continue;
      const sourceNode = boardPromptReferenceGraphIndex.nodeById.get(task.source.boardNodeId);
      if (!isResultSourceNode(sourceNode)) continue;
      const resultStackKey = resolveGenerationEventResultStackKey(sourceNode.resultStackKey, task.source.resultStackKey);
      if (resultStackKey === undefined) continue;
      sourceStacks.add(resultSourceStackMapKey(sourceNode.id, resultStackKey));
    }
    return sourceStacks;
  }, [boardPromptReferenceGraphIndex, galleryItems, generationTasks]);

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
      const connectedResultNode = node.kind === "result"
        ? node
        : isResultSourceNode(node)
          ? resultNodeBySourceStack.get(resultSourceStackMapKey(node.id, node.resultStackKey ?? ""))
          : undefined;
      const hasResultConnection = Boolean(connectedResultNode) || resultSourceNodes.has(node.id);
      const data: BoardMediaFlowData = {};
      if (node.kind === "asset") {
        data.assetStackItems = storageItemStackForAssetId(node.asset.assetId, galleryItemById);
        data.compareReferenceUrl = node.asset.type === "image"
          ? assetCompareReferenceUrl(node.id, board.nodes, board.edges, boardPromptReferenceGraphIndex)
          : null;
        const item = galleryItemById.get(node.asset.assetId);
        if (isUnviewedGeneratedMediaItem(item, viewedGeneratedAssetIds)) data.isUnviewedGeneratedAsset = true;
      } else if (node.kind === "result") {
        data.assetStackItems = storageItemsForAssetIds(node.resultAssetIds, galleryItemById);
        const item = galleryItemById.get(node.activeAssetId);
        if (isUnviewedGeneratedMediaItem(item, viewedGeneratedAssetIds)) data.isUnviewedGeneratedAsset = true;
      }
      if (connectedResultNode) {
        data.connectedResultNodeId = connectedResultNode.id;
        data.resultItems = storageItemsForAssetIds(connectedResultNode.resultAssetIds, galleryItemById);
      }
      if (hasResultConnection) data.hasResultConnection = true;
      if (Object.keys(data).length > 0) dataById.set(node.id, data);
    }
    return dataById;
    // board.nodes/edges read inside; graph content + gallery item fingerprints gate result/media display data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    boardGraphContentKey,
    boardPromptReferenceGraphIndex,
    galleryReferenceFingerprint,
    galleryTaskFingerprint,
    galleryItemById,
    resultNodeBySourceStack,
    resultSourceNodes,
    viewedGeneratedAssetIds,
  ]);

  const flowNodeDataById = useMemo(() => {
    const dataById = new Map<string, BoardFlowNode["data"]>();
    const isBatchSelectionActive = selectedNodeIds.length > 1;
    for (const node of board.nodes) {
      dataById.set(node.id, {
        boardId: board.id,
        isBatchSelectionActive,
        node,
        ...referenceFlowDataByNodeId.get(node.id),
        ...mediaFlowDataByNodeId.get(node.id),
      });
    }
    return dataById;
    // board.nodes read inside; graph content gates data shape, geometry is merged in flowNodes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id, boardGraphContentKey, referenceFlowDataByNodeId, mediaFlowDataByNodeId, selectedNodeIds.length]);

  const boardNodeCallbacks = useMemo<BoardNodeCallbacks>(() => ({
    onCaptureVideoFrame,
    onCancelAssetTask,
    onCancelGenerate: onCancelGenerateNode,
    onDelete: trashAndDeleteNode,
    onDownloadAsset,
    onEditAssetImage,
    onImageQuickEdit,
    onExecuteGenerate: onExecuteGenerateNode,
    onExecutePrompt: onExecutePromptNode,
    onFetchRunningHubAppSchema,
    onFocusNode: focusReferenceSourceNode,
    onFocusReferenceSource: focusReferenceSourceNode,
    onAnalyzeBoardMedia,
    onSplitImageGrid: handleSplitImageGrid,
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
    onExtractMultiGridItem: handleExtractMultiGridItem,
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
        error => onWorkspaceNotice("error", error instanceof Error ? error.message : tc("notices.originalMediaReadFailed")),
      );
    },
    onSelectAssetStackResult: (nodeId: string, assetId: string) => {
      const item = galleryItemById.get(assetId);
      if (!item || item.status !== "complete") {
        onConnectionError(tb("workspace.noResultAsset"));
        return;
      }
      onMarkGeneratedAssetsViewed?.([assetId]);
      updateResultNodeAsset(nodeId, storageItemToBoardAsset(item));
    },
  }), [
    onCancelAssetTask, onCancelGenerateNode, onCaptureVideoFrame, trashAndDeleteNode, onDownloadAsset, onEditAssetImage, onImageQuickEdit,
    onExecuteGenerateNode, onExecutePromptNode, onFetchRunningHubAppSchema, focusReferenceSourceNode, onAnalyzeBoardMedia, handleSplitImageGrid, onOpenFullscreen,
    onOpenPanorama, onSaveVoiceProfile, moveGenerateReferenceEdge, moveReferenceGroupItem,
    deleteEdge, removeReferenceGroupItem, onSendAgentNode, onSendAssetToAgent, connectSelectedBoardPromptReference,
    updateReferenceGroupItemRole, updateAgentInstruction, updateGenerateNode, handleExtractMultiGridItem, updateMultiGridNode,
    updateMultiGridItemTransform, onExportMultiGrid, measureAssetAspectRatio,
    updateNodeSize,
    updateNodeTitle, updateRunningHubAppNode, updateNoteBody, updatePromptNode,
    assetCompareReferenceForNode, board.nodes, board.edges, boardPromptReferenceGraphIndex, galleryItemById, onConnectionError,
    onMarkGeneratedAssetsViewed, onResolveOriginalAsset, onWorkspaceNotice, promotableItemForNode, resolveCompareReferenceUrl, updateResultNodeAsset,
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
        if (existing && sameReusableFlowNodeData(existing, cachedData, node, taskSummary)) {
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
  useLayoutEffect(() => {
    if (isNodeDragActiveRef.current) return;
    const nextNodes = syncReactFlowNodesFromBoard(reactFlowNodesRef.current, flowNodes, selectedNodeId, selectedNodeIds);
    if (nextNodes === reactFlowNodesRef.current) {
      return;
    }
    skipPositionSyncRef.current = true;
    isSyncingFlowNodesRef.current = true;
    setReactFlowNodes(nextNodes);
    queueMicrotask(() => {
      isSyncingFlowNodesRef.current = false;
      skipPositionSyncRef.current = false;
    });
  }, [flowNodes, selectedNodeId, selectedNodeIds, setReactFlowNodes]);
  const flowEdges = useMemo<BoardFlowEdge[]>(
    () => {
      const nodePortIdsById = new Map<string, Set<string>>();
      for (const node of board.nodes) {
        const hasResultConnection = resultSourceNodes.has(node.id);
        nodePortIdsById.set(
          node.id,
          new Set(getBoardNodePortDefinitions(node, { hasResultConnection }).map(port => port.id)),
        );
      }
      const result: BoardFlowEdge[] = [];
      for (const edge of board.edges) {
        const sourceNode = boardPromptReferenceGraphIndex.nodeById.get(edge.from.nodeId);
        const targetNode = boardPromptReferenceGraphIndex.nodeById.get(edge.to.nodeId);
        const sourcePortIds = nodePortIdsById.get(edge.from.nodeId);
        const targetPortIds = nodePortIdsById.get(edge.to.nodeId);
        const sourcePortKind = portKindFromHandle(edge.from.portId);
        const targetPortKind = portKindFromHandle(edge.to.portId);
        if (
          !sourceNode ||
          !targetNode ||
          !sourcePortIds?.has(edge.from.portId) ||
          !targetPortIds?.has(edge.to.portId) ||
          sourcePortKind === null ||
          targetPortKind === null ||
          !isValidBoardPortConnection(board.nodes, edge.from, edge.to)
        ) continue;
        const processing =
          edge.kind === "result" &&
          targetNode.kind === "result" &&
          targetNode.sourceNodeId === sourceNode.id &&
          activeResultSourceStacks.has(resultSourceStackMapKey(sourceNode.id, targetNode.resultStackKey ?? ""));
        const isSelected = selectedEdgeId === edge.id;
        result.push({
          id: edge.id,
          source: edge.from.nodeId,
          target: edge.to.nodeId,
          sourceHandle: edge.from.portId,
          targetHandle: edge.to.portId,
          type: "smoothstep",
          animated: edge.kind === "result" || processing,
          data: { kind: edge.kind, processing, selected: isSelected },
          className: `imagine-board-edge imagine-board-edge-${edge.kind}${processing ? " imagine-board-edge-processing" : ""}`,
          style: { strokeWidth: isSelected ? 2.4 : 1.8 },
        });
      }
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- graph key gates processing animation without position churn
    [activeResultSourceStacks, board.nodes, boardGraphContentKey, boardPromptReferenceGraphIndex, resultSourceNodes, selectedEdgeId],
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
          onConnectionError(tb("workspace.multiGridOnlyImage"));
          return;
        }
        references.forEach(reference => addAssetToMultiGrid(rawTargetNode.id, reference));
        selectOnlyNodeIds([rawTargetNode.id]);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : tb("workspace.connectFailed"));
      }
      return;
    }

    const refs = readValidConnectionRefs(connection);
    if (!refs) {
      onConnectionError(tb("workspace.connectionIncompatible"));
      return;
    }
    try {
      const targetNode = board.nodes.find(node => node.id === refs.to.nodeId);
      if (refs.from.portKind === "result" && targetNode?.kind === "asset") {
        onConnectionError(tb("workspace.dragResultToBlank"));
        return;
      }
      if (targetNode?.kind === "multi-grid") {
        const references = multiGridImageReferences(board.nodes, refs.from, [refs.from.nodeId]);
        if (references.length === 0) {
          onConnectionError(tb("workspace.multiGridOnlyImage"));
          return;
        }
        references.forEach(reference => addAssetToMultiGrid(targetNode.id, reference));
        selectOnlyNodeIds([targetNode.id]);
        return;
      }
      if (selectedNodeIds.length > 1 && selectedNodeIds.includes(refs.from.nodeId) && targetNode) {
        const connections = selectedNodeIds
          .map(nodeId => board.nodes.find(node => node.id === nodeId))
          .filter((node): node is BoardNodeModel => node !== undefined)
          .map(sourceNode => batchConnectionToTarget(board.nodes, sourceNode, targetNode))
          .filter((connection): connection is { from: BoardPortRef; to: BoardPortRef } => connection !== null);
        if (connections.length > 1) {
          beginStructureMutation();
          connectPortsBatch(connections);
          selectOnlyNodeIds([targetNode.id]);
          return;
        }
      }
      beginStructureMutation();
      if (targetNode?.kind === "reference-group") {
        addAssetToReferenceGroup(refs.from.nodeId, refs.to.nodeId);
      }
      connectPorts(refs.from, refs.to);
    } catch (error) {
      onConnectionError(error instanceof Error ? error.message : tb("workspace.connectFailed"));
    }
  }, [addAssetToMultiGrid, addAssetToReferenceGroup, beginStructureMutation, board.nodes, connectPorts, connectPortsBatch, onConnectionError, readValidConnectionRefs, selectOnlyNodeIds, selectedNodeIds, tb]);

  const handleSelectionChange = useCallback<OnSelectionChangeFunc<BoardFlowNode, BoardFlowEdge>>(({ nodes, edges }) => {
    if (isSyncingFlowNodesRef.current) return;
    const ids = nodes.map(node => node.id);
    const edgeId = edges[0]?.id ?? null;
    const nodeId = ids[0] ?? null;
    if (ids.length === 0 && !edgeId && protectedEdgeSelectionRef.current) {
      return;
    }
    if (edgeId || nodeId) {
      protectedEdgeSelectionRef.current = null;
    }
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
    onSelectedNodeIdsChange?.(ids);
    selectEdge(nextSelection.edgeId);
    selectNode(nextSelection.nodeId);
  }, [board.nodes, onSelectedNodeIdsChange, selectEdge, selectedEdgeId, selectedNodeId, selectedNodeIds, selectNode, updateSelectedNodeIds]);

  const handleNodeClick = useCallback<NodeMouseHandler<BoardFlowNode>>(() => {
    closeOverlayMenus();
    protectedEdgeSelectionRef.current = null;
  }, [closeOverlayMenus]);

  const openNodeContextMenu = useCallback((nodeId: string, clientX: number, clientY: number): void => {
    closeOverlayMenus();
    setNodeContextMenu({ nodeId, clientX, clientY });
    selectNode(nodeId);
    selectEdge(null);
    updateSelectedNodeIds(selectedNodeIdsForContextMenu(selectedNodeIds, nodeId));
  }, [closeOverlayMenus, selectEdge, selectedNodeIds, selectNode, updateSelectedNodeIds]);

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
          onConnectionError(tb("workspace.multiGridOnlyImage"));
          return;
        }
        beginStructureMutation();
        references.forEach(reference => addAssetToMultiGrid(rawTargetNode.id, reference));
        deleteEdge(oldEdge.id);
        selectOnlyNodeIds([rawTargetNode.id]);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : tb("workspace.reconnectFailed"));
      }
      return;
    }

    const refs = readValidConnectionRefs(newConnection);
    if (!refs) {
      onConnectionError(tb("workspace.connectionIncompatible"));
      return;
    }
    try {
      const targetNode = board.nodes.find(node => node.id === refs.to.nodeId);
      if (targetNode?.kind === "multi-grid") {
        const references = multiGridImageReferences(board.nodes, refs.from, [refs.from.nodeId]);
        if (references.length === 0) {
          onConnectionError(tb("workspace.multiGridOnlyImage"));
          return;
        }
        beginStructureMutation();
        references.forEach(reference => addAssetToMultiGrid(targetNode.id, reference));
        deleteEdge(oldEdge.id);
        selectOnlyNodeIds([targetNode.id]);
        return;
      }
      beginStructureMutation();
      if (targetNode?.kind === "reference-group") {
        addAssetToReferenceGroup(refs.from.nodeId, refs.to.nodeId);
      }
      reconnectEdge(oldEdge.id, refs.from, refs.to);
    } catch (error) {
      onConnectionError(error instanceof Error ? error.message : tb("workspace.reconnectFailed"));
    }
  }, [addAssetToMultiGrid, addAssetToReferenceGroup, beginStructureMutation, board.nodes, deleteEdge, onConnectionError, readValidConnectionRefs, reconnectEdge, selectOnlyNodeIds, tb]);

  const handleReconnectStart = useCallback<BoardReconnectStartHandler>(() => {
    setIsConnectionActive(true);
  }, []);

  const handleReconnectEnd = useCallback<BoardReconnectEndHandler>(() => {
    setIsConnectionActive(false);
  }, []);

  const handleEdgeClick = useCallback<EdgeMouseHandler<BoardFlowEdge>>((event, edge) => {
    event.preventDefault();
    event.stopPropagation();
    closeOverlayMenus();
    protectedEdgeSelectionRef.current = edge.id;
    selectionRef.current = { edgeId: edge.id, nodeId: null, nodeIds: [] };
    selectEdge(edge.id);
    selectNode(null);
    updateSelectedNodeIds([]);
  }, [closeOverlayMenus, selectEdge, selectNode, updateSelectedNodeIds]);

  const handleNodeDragStart = useCallback<OnNodeDrag<BoardFlowNode>>(() => {
    isNodeDragActiveRef.current = true;
    setCanvasInteractionClass("is-node-dragging", true);
    pendingDragPositionByIdRef.current.clear();
  }, [setCanvasInteractionClass]);

  const handleNodeDrag = useCallback<OnNodeDrag<BoardFlowNode>>((event, node) => {
    const source = node.data.node;
    if (!hasMultiGridNodes || (source.kind !== "asset" && source.kind !== "result") || source.asset.type !== "image") {
      clearActiveMultiGridDropTarget();
      return;
    }
    const clientPoint = clientPointFromMouseOrTouchEvent(event);
    if (!clientPoint) return;
    scheduleActiveMultiGridDropTarget(clientPoint.clientX, clientPoint.clientY);
  }, [clearActiveMultiGridDropTarget, hasMultiGridNodes, scheduleActiveMultiGridDropTarget]);

  const handleNodeDragStop = useCallback<OnNodeDrag<BoardFlowNode>>((event, node, nodes) => {
    isNodeDragActiveRef.current = false;
    setCanvasInteractionClass("is-node-dragging", false);
    clearActiveMultiGridDropTarget();
    const positionById = new Map(pendingDragPositionByIdRef.current);
    const draggedNodes = nodes.length > 0 ? nodes : [node];
    const source = node.data.node;
    const clientPoint = clientPointFromMouseOrTouchEvent(event);
    const dropTarget = draggedNodes.length === 1
      ? clientPoint ? multiGridCellDropTargetFromClient(board.nodes, clientPoint.clientX, clientPoint.clientY) : null
      : null;
    if (
      dropTarget &&
      source.id !== dropTarget.nodeId &&
      (source.kind === "asset" || source.kind === "result") &&
      source.asset.type === "image"
    ) {
      pendingDragPositionByIdRef.current.clear();
      addAssetToMultiGrid(dropTarget.nodeId, source.asset, dropTarget.cellIndex);
      selectOnlyNodeIds([dropTarget.nodeId]);
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
  }, [addAssetToMultiGrid, beginUndoGesture, board.nodes, clearActiveMultiGridDropTarget, endUndoGesture, selectOnlyNodeIds, setCanvasInteractionClass, updateNodesPositions]);

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

  const handleMoveStart = useCallback<BoardMoveHandler>(() => {
    beginViewportMove();
  }, [beginViewportMove]);

  const handleMove = useCallback<BoardMoveHandler>(() => {
    beginViewportMove();
    scheduleViewportMoveEnd();
  }, [beginViewportMove, scheduleViewportMoveEnd]);

  const handleMoveEnd = useCallback<BoardMoveHandler>((_event, viewport): void => {
    scheduleViewportMoveEnd();
    if (sameBoardViewportModel(viewportRef.current, viewport)) return;
    viewportRef.current = viewport;
    setViewport(viewport);
  }, [scheduleViewportMoveEnd, setViewport]);

  const handleSelectionStart = useCallback<BoardSelectionStartHandler>(() => {
    beginSelectionMove();
  }, [beginSelectionMove]);

  const handleSelectionEnd = useCallback<BoardSelectionEndHandler>(() => {
    scheduleSelectionMoveEnd();
  }, [scheduleSelectionMoveEnd]);

  const handleCanvasInteractionEnd = useCallback((): void => {
    if (!isSelectionMoveActiveRef.current) return;
    scheduleSelectionMoveEnd();
  }, [scheduleSelectionMoveEnd]);

  const handleNodesDelete = useCallback<OnNodesDelete<BoardFlowNode>>(nodes => {
    const deletableNodeIds: string[] = [];
    const nextTrashEntries: BoardTrashEntry[] = [];
    for (const flowNode of nodes) {
      const node = board.nodes.find(item => item.id === flowNode.id);
      if (!node) continue;
      if (node.kind === "asset") {
        const item = galleryItemById.get(node.asset.assetId);
        if (item && isActiveGenerateTask(item)) {
          onCancelAssetTask(node.id);
          continue;
        }
      }
      deletableNodeIds.push(node.id);
      nextTrashEntries.push({
        node: structuredClone(node),
        edges: structuredClone(board.edges.filter(edge => edge.from.nodeId === node.id || edge.to.nodeId === node.id)),
      });
    }
    if (deletableNodeIds.length === 0) return;
    if (nextTrashEntries.length > 0) {
      setTrashedNodes(current => [...nextTrashEntries, ...current].slice(0, BOARD_TRASH_LIMIT));
    }
    deleteNodes(deletableNodeIds);
    const deletableNodeIdSet = new Set(deletableNodeIds);
    setSelectedNodeIds(current => {
      const next = current.filter(nodeId => !deletableNodeIdSet.has(nodeId));
      return sameStringList(current, next) ? current : next;
    });
  }, [board.edges, board.nodes, deleteNodes, galleryItemById, onCancelAssetTask]);

  const deleteBoardEdge = useCallback((edgeId: string): void => {
    beginStructureMutation();
    void onDeleteEdge(edgeId);
  }, [beginStructureMutation, onDeleteEdge]);

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
    protectedEdgeSelectionRef.current = null;
    clearSelection();
  }, [clearSelection, closeOverlayMenus]);

  const onlyRenderVisibleBoardElements = board.nodes.length >= BOARD_VISIBLE_RENDER_NODE_THRESHOLD;
  const shouldRenderMiniMap = board.config.showMiniMap;

  const visibleCenterPosition = useCallback((size: BoardSize): BoardPoint | undefined => {
    const rect = flowHostRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    const center = flowPositionFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return availableCenteredNodePosition(center, size);
  }, [availableCenteredNodePosition, flowPositionFromClient]);

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
    const nodeId = addQuickNode(kind, availableCenteredNodePosition(point, item.size));
    selectOnlyNodeIds([nodeId]);
    setQuickInsertMenu(null);
  }, [addQuickNode, availableCenteredNodePosition, selectOnlyNodeIds]);

  const addConnectedQuickNodeAtPoint = useCallback((kind: BoardInsertKind, point: BoardPoint, from: BoardPortRef, selectionSnapshot: string[]): void => {
    if (kind === "image-generate") {
      try {
        const targetPortId = from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn;
        const connections = quickInsertSourceRefs(board.nodes, from, selectionSnapshot)
          .map(sourceRef => ({ from: sourceRef, targetPortId }));
        const nodeId = addGenerateNodeWithConnections(
          {
            kind: "image-generate",
            model: from.portKind === "asset" ? DEFAULT_BOARD_REFERENCE_IMAGE_MODEL : DEFAULT_BOARD_IMAGE_MODEL,
            aspectRatio: "1:1",
            imageResolution: "1024x1024",
            position: availableCenteredNodePosition(point, DEFAULT_GENERATE_NODE_SIZE),
          },
          connections,
        );
        selectOnlyNodeIds([nodeId]);
        setQuickInsertMenu(null);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : tb("workspace.connectFailed"));
      }
      return;
    }
    if (kind === "video-generate") {
      try {
        const targetPortId = from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn;
        const connections = quickInsertSourceRefs(board.nodes, from, selectionSnapshot)
          .map(sourceRef => ({ from: sourceRef, targetPortId }));
        const nodeId = addGenerateNodeWithConnections(
          { kind: "video-generate", model: DEFAULT_VIDEO_MODEL, aspectRatio: "auto", position: availableCenteredNodePosition(point, DEFAULT_GENERATE_NODE_SIZE) },
          connections,
        );
        selectOnlyNodeIds([nodeId]);
        setQuickInsertMenu(null);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : tb("workspace.connectFailed"));
      }
      return;
    }
    if (kind === "audio-operation") {
      try {
        const targetPortId = from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn;
        const connections = quickInsertSourceRefs(board.nodes, from, selectionSnapshot)
          .map(sourceRef => ({ from: sourceRef, targetPortId }));
        const nodeId = addGenerateNodeWithConnections(
          { kind: "audio-operation", model: DEFAULT_AUDIO_MODEL, position: availableCenteredNodePosition(point, DEFAULT_GENERATE_NODE_SIZE) },
          connections,
        );
        selectOnlyNodeIds([nodeId]);
        setQuickInsertMenu(null);
      } catch (error) {
        onConnectionError(error instanceof Error ? error.message : tb("workspace.connectFailed"));
      }
      return;
    }
    if (kind === "reference-group") {
      const assetNodeIds = referenceGroupMediaNodeIds(board.nodes, from.nodeId, selectionSnapshot);
      if (assetNodeIds.length === 0) return;
      const nodeId = addReferenceGroupNodeWithAssets({ position: availableCenteredNodePosition(point, DEFAULT_REFERENCE_GROUP_NODE_SIZE) }, assetNodeIds);
      selectOnlyNodeIds([nodeId]);
      setQuickInsertMenu(null);
      return;
    }
    if (kind === "multi-grid") {
      const references = multiGridImageReferences(board.nodes, from, selectionSnapshot);
      if (references.length === 0) return;
      const nodeId = addMultiGridNode({ position: availableCenteredNodePosition(point, DEFAULT_MULTI_GRID_NODE_SIZE) });
      references.forEach(reference => addAssetToMultiGrid(nodeId, reference));
      selectOnlyNodeIds([nodeId]);
      setQuickInsertMenu(null);
      return;
    }
    if (kind === "runninghub-app") {
      const nodeId = addRunningHubAppNode({ position: availableCenteredNodePosition(point, DEFAULT_RUNNINGHUB_APP_NODE_SIZE) });
      connectPorts(from, {
        nodeId,
        portId: from.portKind === "prompt" ? BOARD_PORT_IDS.promptIn : BOARD_PORT_IDS.referenceIn,
        portKind: from.portKind === "prompt" ? "prompt" : "asset",
      });
      selectOnlyNodeIds([nodeId]);
      setQuickInsertMenu(null);
      return;
    }
    if (kind === "note" && from.portKind === "prompt") {
      const nodeId = addNoteNode({ position: availableCenteredNodePosition(point, DEFAULT_NOTE_NODE_SIZE) });
      connectPorts(from, { nodeId, portId: BOARD_PORT_IDS.noteIn, portKind: "prompt" });
      selectOnlyNodeIds([nodeId]);
      setQuickInsertMenu(null);
    }
  }, [addAssetToMultiGrid, addGenerateNodeWithConnections, addMultiGridNode, addNoteNode, addReferenceGroupNodeWithAssets, addRunningHubAppNode, availableCenteredNodePosition, board.nodes, connectPorts, onConnectionError, selectOnlyNodeIds]);

  const quickInsertMenuItems = useMemo(() => {
    const from = quickInsertMenu?.connectionFrom;
    if (!from) return [BOARD_QUICK_INSERT_IMPORT_ITEM, ...BOARD_INSERT_CATALOG];
    const sourceNode = board.nodes.find(node => node.id === from.nodeId);
    if (from.portKind === "prompt") {
      return BOARD_INSERT_CATALOG.filter(item => item.kind === "note" || item.kind === "image-generate" || item.kind === "video-generate" || item.kind === "audio-operation" || item.kind === "runninghub-app");
    }
    if (from.portKind !== "asset") return [];
    if (isBoardMediaSourceNode(sourceNode)) {
      return BOARD_INSERT_CATALOG.filter(item =>
        item.kind === "image-generate" ||
        item.kind === "video-generate" ||
        item.kind === "audio-operation" ||
        item.kind === "reference-group" ||
        (sourceNode.asset.type === "image" && item.kind === "multi-grid") ||
        item.kind === "runninghub-app",
      );
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
        onConnectionError(tb("workspace.noMultiGridImages"));
        return;
      }
      references.forEach(reference => addAssetToMultiGrid(targetNode.id, reference));
      selectOnlyNodeIds([targetNode.id]);
      closeOverlayMenus();
      return;
    }
    const connections = selectedNodeIds
      .map(nodeId => board.nodes.find(node => node.id === nodeId))
      .filter((node): node is BoardNodeModel => node !== undefined)
      .map(sourceNode => batchConnectionToTarget(board.nodes, sourceNode, targetNode))
      .filter((connection): connection is { from: BoardPortRef; to: BoardPortRef } => connection !== null);
    if (connections.length === 0) {
      onConnectionError(tb("workspace.noConnectablePorts"));
      return;
    }
    beginStructureMutation();
    connectPortsBatch(connections);
    selectOnlyNodeIds([targetNode.id]);
    closeOverlayMenus();
  }, [addAssetToMultiGrid, beginStructureMutation, board.nodes, closeOverlayMenus, connectPortsBatch, onConnectionError, selectOnlyNodeIds, selectedNodeIds, tb]);

  const createReferenceGroupFromSelected = useCallback((contextNodeId: string): void => {
    const contextNode = board.nodes.find(node => node.id === contextNodeId);
    if (!contextNode) return;
    const assetNodeIds = selectedReferenceGroupMediaNodeIds(board.nodes, contextNodeId, selectedNodeIds);
    if (assetNodeIds.length === 0) {
      onConnectionError(tb("workspace.selectImageAssetNodes"));
      return;
    }
    const contextPosition = boardNodeAbsolutePosition(board.nodes, contextNode.id) ?? contextNode.position;
    const groupId = addReferenceGroupNodeWithAssets({
      position: {
        x: contextPosition.x + contextNode.size.width + 72,
        y: contextPosition.y,
      },
    }, assetNodeIds);
    selectOnlyNodeIds([groupId]);
    closeOverlayMenus();
  }, [addReferenceGroupNodeWithAssets, board.nodes, closeOverlayMenus, onConnectionError, selectOnlyNodeIds, selectedNodeIds, tb]);

  const createGroupFromSelected = useCallback((contextNodeId: string): void => {
    const nodeIds = selectedNodeIds.includes(contextNodeId)
      ? selectedNodeIds
      : [...selectedNodeIds, contextNodeId];
    if (nodeIds.length < 2) {
      onConnectionError(tb("workspace.atLeastTwoNodesToGroup"));
      return;
    }
    const groupId = groupNodes(nodeIds);
    if (!groupId) {
      onConnectionError(tb("workspace.atLeastTwoNodesToGroup"));
      return;
    }
    selectOnlyNodeIds([groupId]);
    closeOverlayMenus();
  }, [closeOverlayMenus, groupNodes, onConnectionError, selectOnlyNodeIds, selectedNodeIds, tb]);

  const createGroupFromSelectionToolbar = useCallback((): void => {
    if (selectedNodeIds.length < 2) {
      onConnectionError(tb("workspace.atLeastTwoNodesToGroup"));
      return;
    }
    const groupId = groupNodes(selectedNodeIds);
    if (!groupId) {
      onConnectionError(tb("workspace.atLeastTwoNodesToGroup"));
      return;
    }
    selectOnlyNodeIds([groupId]);
    closeOverlayMenus();
  }, [closeOverlayMenus, groupNodes, onConnectionError, selectOnlyNodeIds, selectedNodeIds, tb]);

  const ungroupSelectedGroups = useCallback((): void => {
    if (selectedGroupNodeIds.length === 0) return;
    selectedGroupNodeIds.forEach(ungroupNode);
    clearSelection();
    closeOverlayMenus();
  }, [clearSelection, closeOverlayMenus, selectedGroupNodeIds, ungroupNode]);

  const ungroupSelectedNode = useCallback((nodeId: string): void => {
    ungroupNode(nodeId);
    clearSelection();
    closeOverlayMenus();
  }, [clearSelection, closeOverlayMenus, ungroupNode]);

  const pasteCopiedNode = useCallback((): void => {
    const copied = copiedNodeRef.current;
    if (!copied) return;
    if ("nodeIds" in copied) {
      const pastedIds = duplicateNodes(copied.nodeIds);
      if (pastedIds.length === 0) return;
      copiedNodeRef.current = { nodeIds: pastedIds };
      selectOnlyNodeIds(pastedIds);
      return;
    }
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
      const nodeId = addAssetNode({ asset: node.asset, position, size: node.size, title: node.title });
      selectOnlyNodeIds([nodeId]);
      rememberPastedPosition();
      return;
    }
    if (node.kind === "prompt") {
      const nodeId = addPromptNode({ position, prompt: node.prompt, size: node.size, title: node.title });
      selectOnlyNodeIds([nodeId]);
      rememberPastedPosition();
      return;
    }
    if (node.kind === "reference-group") {
      const nodeId = addReferenceGroupNode({ position, references: node.references, size: node.size, title: node.title });
      selectOnlyNodeIds([nodeId]);
      rememberPastedPosition();
      return;
    }
    if (node.kind === "group") {
      const nodeId = addGroupNode({ position, size: node.size, title: node.title });
      selectOnlyNodeIds([nodeId]);
      rememberPastedPosition();
      return;
    }
    if (node.kind === "multi-grid") {
      const nodeId = addMultiGridNode({
        aspectRatio: node.aspectRatio,
        gridSize: node.gridSize,
        items: structuredClone(node.items),
        position,
        size: node.size,
        title: node.title,
      });
      selectOnlyNodeIds([nodeId]);
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
      const nodeId = inputConnections.length > 0
        ? addGenerateNodeWithConnections(input, inputConnections)
        : addGenerateNode(input);
      selectOnlyNodeIds([nodeId]);
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
      const nodeId = inputConnections.length > 0
        ? addGenerateNodeWithConnections(input, inputConnections)
        : addGenerateNode(input);
      selectOnlyNodeIds([nodeId]);
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
        variantCount: 1,
        voiceCloneConsentAccepted: node.voiceCloneConsentAccepted,
        voiceProfileId: node.voiceProfileId,
      } as const;
      const nodeId = inputConnections.length > 0
        ? addGenerateNodeWithConnections(input, inputConnections)
        : addGenerateNode(input);
      selectOnlyNodeIds([nodeId]);
      rememberPastedPosition();
      return;
    }
    if (node.kind === "runninghub-app") {
      const nodeId = addRunningHubAppNode({
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
      selectOnlyNodeIds([nodeId]);
      rememberPastedPosition();
      return;
    }
    if (node.kind === "agent") {
      const nodeId = addAgentNode({ instruction: node.instruction, position, size: node.size, title: node.title });
      selectOnlyNodeIds([nodeId]);
      rememberPastedPosition();
      return;
    }
    if (node.kind === "result") {
      const nodeId = addAssetNode({ asset: node.asset, position, size: node.size, title: node.title });
      selectOnlyNodeIds([nodeId]);
      rememberPastedPosition();
      return;
    }
    const nodeId = addNoteNode({ body: node.body, position, size: node.size, source: node.source, title: node.title, variant: node.variant });
    selectOnlyNodeIds([nodeId]);
    rememberPastedPosition();
  }, [addAgentNode, addAssetNode, addGenerateNode, addGenerateNodeWithConnections, addGroupNode, addMultiGridNode, addNoteNode, addPromptNode, addReferenceGroupNode, addRunningHubAppNode, board.nodes, duplicateNodes, selectOnlyNodeIds]);

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
          onConnectionError(tb("workspace.multiGridOnlyImage"));
          return;
        }
        const dropTarget = multiGridCellDropTargetFromClient(board.nodes, clientPoint.x, clientPoint.y);
        references.forEach(reference => addAssetToMultiGrid(
          targetNode.id,
          reference,
          dropTarget?.nodeId === targetNode.id ? dropTarget.cellIndex : undefined,
        ));
        selectOnlyNodeIds([targetNode.id]);
        return;
      }
      const connections = batchConnectionsFromSourceToTarget(board.nodes, sourceNodeId, targetNode, selectedNodeIds);
      if (connections.length === 0) {
        onConnectionError(tb("workspace.noConnectablePorts"));
        return;
      }
      beginStructureMutation();
      connectPortsBatch(connections);
      selectOnlyNodeIds([targetNode.id]);
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
      if (isBoardMediaSourceNode(sourceNode)) {
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
        onConnectionError(tb("workspace.resultNotReady"));
        return;
      }
      const connectedResultNode = findConnectedResultNodeForSourceStack(board.nodes, board.edges, sourceNode.id, sourceNode.resultStackKey ?? "");
      if (connectedResultNode) {
        selectOnlyNodeIds([connectedResultNode.id]);
        return;
      }
      const from: BoardPortRef = { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "result" };
      const resultSnapshot = resultNodeSnapshotForSource(sourceNode, galleryItemById);
      if (!resultSnapshot) {
        onConnectionError(tb("workspace.resultNotReady"));
        return;
      }
      const resultNodeId = addResultNodeWithConnection(
        {
          sourceNodeId: sourceNode.id,
          resultStackKey: sourceNode.resultStackKey ?? "",
          ...resultSnapshot,
          position: centeredNodePosition(flowPoint, DEFAULT_ASSET_NODE_SIZE),
        },
        from,
      );
      selectOnlyNodeIds([resultNodeId]);
      return;
    }
  }, [addAssetToMultiGrid, addResultNodeWithConnection, beginStructureMutation, board.edges, board.nodes, centeredNodePosition, connectPortsBatch, flowPositionFromClient, galleryItemById, onConnectionError, selectOnlyNodeIds, selectedNodeIds, tb]);

  const openQuickInsertMenu = useCallback((event: ReactMouseEvent | MouseEvent): void => {
    event.preventDefault();
    setNodeContextMenu(null);
    clearSelection();
    setQuickInsertMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      position: flowPositionFromClient(event.clientX, event.clientY),
      selectedNodeIds: [],
    });
  }, [clearSelection, flowPositionFromClient]);

  const openEmptyStateQuickInsertMenu = useCallback((): void => {
    const rect = flowHostRef.current?.getBoundingClientRect();
    if (!rect) {
      onWorkspaceNotice("info", tb("workspace.cannotDetermineInsertPosition"));
      return;
    }
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    setNodeContextMenu(null);
    clearSelection();
    setQuickInsertMenu({
      clientX,
      clientY,
      position: flowPositionFromClient(clientX, clientY),
      selectedNodeIds: [],
    });
  }, [clearSelection, flowPositionFromClient, onWorkspaceNotice, tb]);

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
      event.target.closest(".imagine-board-minimap") ||
      event.target.closest(".imagine-board-quick-insert")
    ) {
      return;
    }
    openQuickInsertMenu(event);
  }, [openQuickInsertMenu]);

  const importFilesAtPoint = useCallback((files: File[], point: BoardPoint): void => {
    if (files.length === 0) return;
    void onImportBoardFiles(files, centeredNodePosition(point, DEFAULT_ASSET_NODE_SIZE));
    setQuickInsertMenu(null);
  }, [centeredNodePosition, onImportBoardFiles]);

  const openMediaImportPicker = useCallback((point?: BoardPoint): void => {
    flowHostRef.current?.focus();
    const resolved = point ?? visibleCenterPosition(DEFAULT_ASSET_NODE_SIZE);
    if (!resolved) {
      onWorkspaceNotice("info", tb("workspace.cannotDetermineImportPosition"));
      return;
    }
    pendingImportPointRef.current = resolved;
    mediaImportInputRef.current?.click();
  }, [onWorkspaceNotice, visibleCenterPosition, tb]);

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
      .catch(error => onConnectionError(error instanceof Error ? error.message : tb("workspace.imageDragFailed")));
    setQuickInsertMenu(null);
  }, [centeredNodePosition, onConnectionError, onImportBoardFiles, tb]);

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
            selectOnlyNodeIds([dropTarget.nodeId]);
            closeOverlayMenus();
            return;
          }
          const nodeId = addAssetNode({
            position: centeredNodePosition(point, DEFAULT_ASSET_NODE_SIZE),
            asset,
          });
          selectOnlyNodeIds([nodeId]);
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
  }, [addAssetNode, addAssetToMultiGrid, board.nodes, centeredNodePosition, clearActiveMultiGridDropTarget, closeOverlayMenus, flowPositionFromClient, galleryItems, importFilesAtPoint, importImageUrlsAtPoint, selectOnlyNodeIds]);

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
        if (selectedNodeIds.length > 1) {
          const nodeIds = selectedNodeIds.filter(nodeId => board.nodes.some(node => node.id === nodeId));
          if (nodeIds.length === 0) return;
          copiedNodeRef.current = { nodeIds };
          event.preventDefault();
          return;
        }
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
        const duplicatedNodeIds = duplicateNodes(selectedNodeIds);
        if (duplicatedNodeIds.length > 0) selectOnlyNodeIds(duplicatedNodeIds);
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
    selectOnlyNodeIds,
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
        name="board-media-import"
        aria-label={tb("workspace.importBoardMediaFileLabel")}
        className="hidden"
        onChange={handleMediaImportInputChange}
      />
      <BoardToolbar
        boardId={board.id}
        boardSummaries={boardSummaries}
        boardTitle={board.title}
        nodeCount={board.nodes.length}
        canRedo={canRedo}
        canUndo={canUndo}
        saveError={saveError}
        saveStatus={saveStatus}
        storageTarget={storageTarget}
        trashedCount={trashedNodes.length}
        onRedo={redo}
        onRestoreTrash={trashedNodes.length > 0 ? () => restoreTrashedNode(0) : undefined}
        onUndo={undo}
        onBack={onBack}
        onClear={clearBoard}
        onCreateBoard={onCreateBoard}
        onDeleteBoard={onDeleteBoard}
        onOpenSettings={onOpenSettings}
        onRenameBoard={onRenameBoard}
        onSelectBoard={onSelectBoard}
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
          onMouseUpCapture={handleCanvasInteractionEnd}
          onPointerCancelCapture={handleCanvasInteractionEnd}
          onPointerUpCapture={handleCanvasInteractionEnd}
          className={`board-canvas relative min-h-0 bg-[var(--iw-board-canvas-bg)]${isConnectionActive ? " is-connecting" : ""}`}
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
            onSelectionEnd={handleSelectionEnd}
            onSelectionStart={handleSelectionStart}
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
            onMove={handleMove}
            onMoveEnd={handleMoveEnd}
            onMoveStart={handleMoveStart}
            onNodeClick={handleNodeClick}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeDrag={handleNodeDrag}
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
            <Panel position="bottom-left" className="imagine-board-view-controls nodrag nopan">
              <button
                type="button"
                onClick={() => updateBoardConfig({ showGrid: !board.config.showGrid })}
                className="imagine-board-view-toggle"
                data-state={board.config.showGrid ? "on" : "off"}
                aria-pressed={board.config.showGrid}
                aria-label={board.config.showGrid ? tb("workspace.gridToggleHide") : tb("workspace.gridToggleShow")}
                title={board.config.showGrid ? tb("workspace.gridToggleHide") : tb("workspace.gridToggleShow")}
              >
                <Grid2X2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateBoardConfig({ snapToGrid: !board.config.snapToGrid })}
                className="imagine-board-view-toggle"
                data-state={board.config.snapToGrid ? "on" : "off"}
                aria-pressed={board.config.snapToGrid}
                aria-label={board.config.snapToGrid ? tb("workspace.snapToggleOff") : tb("workspace.snapToggleOn")}
                title={board.config.snapToGrid ? tb("workspace.snapToggleOff") : tb("workspace.snapToggleOn")}
              >
                <Magnet className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => updateBoardConfig({ showMiniMap: !board.config.showMiniMap })}
                className="imagine-board-view-toggle"
                data-state={board.config.showMiniMap ? "on" : "off"}
                aria-pressed={board.config.showMiniMap}
                aria-label={board.config.showMiniMap ? tb("workspace.miniMapToggleHide") : tb("workspace.miniMapToggleShow")}
                title={board.config.showMiniMap ? tb("workspace.miniMapToggleHide") : tb("workspace.miniMapToggleShow")}
              >
                <MapIcon className="h-3.5 w-3.5" />
              </button>
            </Panel>
            {shouldRenderMiniMap && (
              <MiniMap
                className="imagine-board-minimap"
                nodeColor={getBoardVar("--iw-board-minimap-node", "#1d4ed8")}
                maskColor={getBoardVar("--iw-board-minimap-mask", "rgba(2,6,23,0.66)")}
                pannable
                zoomable
              />
            )}
            {selectedNodeIds.length > 1 ? (
              <NodeToolbar
                nodeId={selectedNodeIds}
                isVisible
                position={Position.Top}
                offset={SELECTION_TOOLBAR_GAP}
                align="center"
                className="pointer-events-none z-40 max-w-[calc(100vw_-_24px)]"
                style={{ contain: "layout paint style" }}
              >
                <div className={`pointer-events-auto flex h-10 ${selectionToolbarWidthClass} shrink-0 items-center gap-2 rounded-xl border border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-surface-raised)_88%,transparent)] px-2.5 text-[11px] font-semibold text-[var(--iw-text)] shadow-[var(--iw-card-shadow)] backdrop-blur-md`}>
                  <span className="min-w-0 flex-1 truncate px-1 text-[var(--iw-muted)]">
                    {tb("workspace.selectedCount", { count: selectedNodeIds.length })}
                    {selectedDownloadableCount > 0 ? ` · ${tb("workspace.downloadableCount", { count: selectedDownloadableCount })}` : ""}
                  </span>
                  {selectedGroupNodeIds.length === 0 ? (
                    <button
                      type="button"
                      onClick={createGroupFromSelectionToolbar}
                      className="imagine-secondary-action flex h-7 w-[66px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold transition hover:border-[var(--iw-tone-success-border)] hover:bg-[color-mix(in_srgb,var(--iw-tone-success-bg)_24%,transparent)] hover:text-[var(--iw-tone-success-text)]"
                      title={tb("workspace.groupTooltip")}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      {tb("workspace.groupNodes")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={ungroupSelectedGroups}
                      className="imagine-secondary-action flex h-7 w-[82px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold transition hover:border-[var(--iw-tone-warning-border)] hover:bg-[color-mix(in_srgb,var(--iw-tone-warning-bg)_24%,transparent)] hover:text-[var(--iw-tone-warning-text)]"
                      title={tb("workspace.ungroupTooltip")}
                    >
                      <Ungroup className="h-3.5 w-3.5" />
                      {tb("workspace.ungroupNodes")}
                    </button>
                  )}
                  {canDownloadSelectedAssets ? (
                    <button
                      type="button"
                      onClick={onDownloadSelectedAssets}
                      className="imagine-secondary-action flex h-7 w-[86px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold transition hover:border-[var(--iw-tone-accent-border)] hover:bg-[color-mix(in_srgb,var(--iw-tone-accent-bg)_24%,transparent)] hover:text-[var(--iw-tone-accent-text)]"
                      title={tb("workspace.downloadZipTooltip")}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {tb("workspace.batchDownload")}
                    </button>
                  ) : null}
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
              t: tb,
              onConnectSelected: selectedBatchConnectionCount > 0
                ? () => connectSelectedNodesToTarget(node.id)
                : undefined,
              onGroupSelected: selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id)
                ? () => createGroupFromSelected(node.id)
                : undefined,
              onUngroup: node.kind === "group"
                ? () => ungroupSelectedNode(node.id)
                : undefined,
              onCreateReferenceGroup: isBoardMediaSourceNode(node)
                ? () => createReferenceGroupFromSelected(node.id)
                : undefined,
              onCompare: compareReference && node.kind === "asset"
                ? () => {
                  if (!mediaItem) return;
                  void Promise.all([resolveCompareReferenceUrl(compareReference), onResolveOriginalAsset(mediaItem)]).then(
                    ([originalUrl, originalItem]) => setAssetCompare({ originalUrl, resultUrl: originalItem.url }),
                    error => onWorkspaceNotice("error", error instanceof Error ? error.message : tb("notices.originalMediaReadFailed")),
                  );
                  closeOverlayMenus();
                }
                : undefined,
              onCopyImage: copyableImageItem
                ? () => {
                  void onResolveOriginalAsset(copyableImageItem).then(
                    originalItem => copyImageUrlToClipboard(originalItem.url),
                  ).then(
                    () => onWorkspaceNotice("success", tb("workspace.imageCopiedToClipboard")),
                    error => onWorkspaceNotice("error", error instanceof Error ? error.message : tb("workspace.imageCopyFailed")),
                  );
                  closeOverlayMenus();
                }
                : undefined,
              onDelete: () => {
                trashAndDeleteNode(node.id);
                closeOverlayMenus();
              },
              onDuplicate: () => {
                const duplicatedNodeId = duplicateNode(node.id);
                if (duplicatedNodeId) selectOnlyNodeIds([duplicatedNodeId]);
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
              onExecute: node.kind === "prompt" || node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app"
                ? () => {
                  if (node.kind === "prompt") {
                    void onExecutePromptNode(node.id);
                  } else {
                    onExecuteGenerateNode(node.id);
                  }
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
