"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  Bot,
  FileText,
  ImagePlus,
  Layers,
  MessageSquareText,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
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
import type { BoardGenerateInputSummary } from "@/components/board/GenerateBoardNode";
import BoardEmptyHint from "@/components/board/BoardEmptyHint";
import BoardToolbar from "@/components/board/BoardToolbar";
import BoardAssetCompareOverlay from "@/components/board/BoardAssetCompareOverlay";
import type { StorageItem } from "@/lib/db";
import {
  assetCompareReferenceUrl,
  buildBoardPromptReferences,
  generateReferenceCandidates,
  isGenerateEdgeProcessing,
} from "@/lib/board/prompt-references";
import type { ThemeMode } from "@/components/workbench/WorkspaceHeader";
import type { CapturedVideoFrame } from "@/lib/video-frame";
import {
  DEFAULT_AGENT_NODE_SIZE,
  DEFAULT_ASSET_NODE_SIZE,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_NOTE_NODE_SIZE,
  DEFAULT_PROMPT_NODE_SIZE,
  DEFAULT_REFERENCE_GROUP_NODE_SIZE,
  type BoardEdge,
  type BoardEdgeKind,
  type BoardNode as BoardNodeModel,
  type BoardPoint,
  type BoardPortKind,
  type BoardPortRef,
  type BoardSize,
  type BoardSummary,
  type CreateAssetNodeInput,
} from "@/lib/board";
import { DEFAULT_VIDEO_MODEL, getModelCapability } from "@/lib/providers/model-catalog";

interface BoardWorkspaceProps {
  boardSummaries: BoardSummary[];
  controller: BoardStateController;
  children?: ReactNode;
  galleryItems?: StorageItem[];
  themeMode: ThemeMode;
  onBack: () => void;
  onCaptureVideoFrame: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onConnectionError: (message: string) => void;
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
  onToggleTheme: () => void;
}

type BoardFlowEdge = Edge<{ kind: BoardEdgeKind; processing?: boolean }, "smoothstep">;
type QuickInsertKind = "prompt" | "reference-group" | "image-generate" | "video-generate" | "agent" | "note";
type BoardHandleDirection = "input" | "output";

interface QuickInsertMenu {
  clientX: number;
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

const quickInsertItems: Array<{ icon: LucideIcon; iconClassName: string; iconSurfaceClassName: string; kind: QuickInsertKind; label: string; size: BoardSize }> = [
  { icon: MessageSquareText, iconClassName: "text-teal-300", iconSurfaceClassName: "bg-teal-500/10 border-teal-400/20", kind: "prompt", label: "提示", size: DEFAULT_PROMPT_NODE_SIZE },
  { icon: Layers, iconClassName: "text-cyan-300", iconSurfaceClassName: "bg-cyan-500/10 border-cyan-400/20", kind: "reference-group", label: "参考组", size: DEFAULT_REFERENCE_GROUP_NODE_SIZE },
  { icon: ImagePlus, iconClassName: "text-blue-300", iconSurfaceClassName: "bg-blue-500/10 border-blue-400/20", kind: "image-generate", label: "图片", size: DEFAULT_GENERATE_NODE_SIZE },
  { icon: Video, iconClassName: "text-violet-300", iconSurfaceClassName: "bg-violet-500/10 border-violet-400/20", kind: "video-generate", label: "视频", size: DEFAULT_GENERATE_NODE_SIZE },
  { icon: Bot, iconClassName: "text-purple-300", iconSurfaceClassName: "bg-purple-500/10 border-purple-400/20", kind: "agent", label: "智能体", size: DEFAULT_AGENT_NODE_SIZE },
  { icon: FileText, iconClassName: "text-amber-300", iconSurfaceClassName: "bg-amber-500/10 border-amber-400/20", kind: "note", label: "笔记", size: DEFAULT_NOTE_NODE_SIZE },
];

function portKindFromHandle(handleId: string | null | undefined): BoardPortKind | null {
  if (!handleId) return null;
  if (handleId.startsWith("prompt-")) return "prompt";
  if (handleId.startsWith("agent-")) return "agent";
  if (handleId.startsWith("result-")) return "result";
  if (handleId.startsWith("asset-") || handleId === "reference-in") return "asset";
  return null;
}

function handleDirectionFromHandle(handleId: string | null | undefined): BoardHandleDirection | null {
  if (!handleId) return null;
  if (handleId.endsWith("-out")) return "output";
  if (handleId.endsWith("-in") || handleId === "reference-in" || handleId === "agent-context-in") return "input";
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

function isCompatiblePortConnection(refs: { from: BoardPortRef; to: BoardPortRef } | null): refs is { from: BoardPortRef; to: BoardPortRef } {
  if (!refs || refs.from.nodeId === refs.to.nodeId) return false;
  if (refs.from.portKind === "asset" && refs.to.portKind === "asset") return true;
  if (refs.from.portKind === "prompt" && refs.to.portKind === "prompt") return true;
  if (refs.from.portKind === "result" && refs.to.portKind === "asset") return true;
  return refs.from.portKind === "asset" && refs.to.portKind === "agent";
}

function targetAcceptsReference(nodes: BoardNodeModel[], targetNodeId: string): boolean {
  const targetNode = nodes.find(node => node.id === targetNodeId);
  if (targetNode?.kind !== "image-generate" && targetNode?.kind !== "video-generate") return true;
  try {
    return getModelCapability(targetNode.model, targetNode.kind === "image-generate" ? "image" : "video").supportsReferences;
  } catch {
    return false;
  }
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

  const response = await fetch("/api/board/import-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
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

function edgeColor(kind: BoardEdge["kind"], themeMode: ThemeMode): string {
  void themeMode;
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
    referenceCount: references.length,
    referencePreviews: references.map(reference => ({
      id: reference.id,
      role: reference.role,
      url: reference.url,
    })),
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
  themeMode,
  onBack,
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
  onToggleTheme,
}: BoardWorkspaceProps) {
  const flowInstanceRef = useRef<ReactFlowInstance<BoardFlowNode, BoardFlowEdge> | null>(null);
  const flowHostRef = useRef<HTMLElement | null>(null);
  const copiedNodeRef = useRef<CopiedBoardNode | null>(null);
  const [quickInsertMenu, setQuickInsertMenu] = useState<QuickInsertMenu | null>(null);
  const [nodeContextMenu, setNodeContextMenu] = useState<BoardNodeContextMenuState | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [trashedNodes, setTrashedNodes] = useState<BoardTrashEntry[]>([]);
  const [assetCompare, setAssetCompare] = useState<{ originalUrl: string; resultUrl: string } | null>(null);
  const galleryReferenceItems = useMemo(
    () => galleryItems.map(item => ({ id: item.id, status: item.status, type: item.type, url: item.url })),
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
    reconnectEdge,
    restoreNodeWithEdges,
    addAgentNode,
    addAssetNode,
    addAssetToReferenceGroup,
    addGenerateNode,
    addNoteNode,
    addPromptNode,
    addReferenceGroupNode,
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
    updateNodePosition,
    updateNoteBody,
    updatePromptNode,
  } = controller;

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
    setSelectedNodeIds(current => current.filter(id => id !== nodeId));
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

  const flowNodes = useMemo<BoardFlowNode[]>(
    () =>
      board.nodes.map(node => ({
        id: node.id,
        type: "board",
        position: node.position,
        width: node.size.width,
        height: node.size.height,
        selected: selectedNodeIds.includes(node.id),
        data: {
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
        },
      })),
    [
      board.nodes,
      board.edges,
      galleryReferenceItems,
      onCaptureVideoFrame,
      onEditAssetImage,
      onExecuteGenerateNode,
      moveReferenceGroupItem,
      removeReferenceGroupItem,
      onSendAssetToAgent,
      onSendAgentNode,
      onSetAssetAsReference,
      selectedNodeIds,
      trashAndDeleteNode,
      updateReferenceGroupItemRole,
      updateAgentInstruction,
      updateGenerateNode,
      updateNoteBody,
      updatePromptNode,
    ],
  );

  const flowEdges = useMemo<BoardFlowEdge[]>(
    () =>
      board.edges.map(edge => ({
        id: edge.id,
        source: edge.from.nodeId,
        target: edge.to.nodeId,
        sourceHandle: edge.from.portId,
        targetHandle: edge.to.portId,
        type: "smoothstep",
        selected: selectedEdgeId === edge.id,
        animated: edge.kind === "result" || isGenerateEdgeProcessing(edge, board.nodes),
        data: { kind: edge.kind, processing: isGenerateEdgeProcessing(edge, board.nodes) },
        className: `imagine-board-edge imagine-board-edge-${edge.kind}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(edge.kind, themeMode), width: 18, height: 18 },
        style: { strokeWidth: selectedEdgeId === edge.id ? 3 : 2 },
      })),
    [board.edges, board.nodes, selectedEdgeId, themeMode],
  );

  const isValidBoardConnection = useCallback<IsValidConnection<BoardFlowEdge>>((connection) => {
    const refs = connectionPortRefs(connection);
    if (!isCompatiblePortConnection(refs)) return false;
    const targetNode = board.nodes.find(node => node.id === refs.to.nodeId);
    if (targetNode?.kind === "reference-group") {
      const sourceNode = board.nodes.find(node => node.id === refs.from.nodeId);
      return refs.to.portId === "asset-in" && sourceNode?.kind === "asset" && sourceNode.asset.type === "image";
    }
    if (refs.to.portId !== "reference-in") return true;
    return targetAcceptsReference(board.nodes, refs.to.nodeId);
  }, [board.nodes]);

  const handleConnect: OnConnect = (connection) => {
    const refs = connectionPortRefs(connection);
    if (!refs || !isCompatiblePortConnection(refs)) {
      onConnectionError("端口类型不兼容：图片可连参考/Agent，Prompt 可连生成，生成结果可连资产。");
      return;
    }
    if (refs.to.portId === "reference-in" && !targetAcceptsReference(board.nodes, refs.to.nodeId)) {
      onConnectionError("当前生成模型不支持参考图输入。");
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

  const handleSelectionChange = useCallback<OnSelectionChangeFunc<BoardFlowNode, BoardFlowEdge>>(({ nodes }) => {
    const ids = nodes.map(node => node.id);
    setSelectedNodeIds(ids);
    selectNode(ids[0] ?? null);
  }, [selectNode]);

  const handleNodeClick: NodeMouseHandler<BoardFlowNode> = (event, node) => {
    closeOverlayMenus();
    if (event.shiftKey) {
      setSelectedNodeIds(current => (
        current.includes(node.id) ? current.filter(id => id !== node.id) : [...current, node.id]
      ));
    } else {
      setSelectedNodeIds([node.id]);
    }
    selectNode(node.id);
    selectEdge(null);
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
    setSelectedNodeIds([node.id]);
  };

  const handleReconnect = useCallback<OnReconnect<BoardFlowEdge>>((oldEdge, newConnection) => {
    const refs = connectionPortRefs(newConnection);
    if (!refs || !isCompatiblePortConnection(refs)) {
      onConnectionError("端口类型不兼容：图片可连参考/Agent，Prompt 可连生成，生成结果可连资产。");
      return;
    }
    if (refs.to.portId === "reference-in" && !targetAcceptsReference(board.nodes, refs.to.nodeId)) {
      onConnectionError("当前生成模型不支持参考图输入。");
      return;
    }
    try {
      reconnectEdge(oldEdge.id, refs.from, refs.to);
    } catch (error) {
      onConnectionError(error instanceof Error ? error.message : "重连失败");
    }
  }, [board.nodes, onConnectionError, reconnectEdge]);

  const handleEdgeClick: EdgeMouseHandler<BoardFlowEdge> = (_event, edge) => {
    closeOverlayMenus();
    selectEdge(edge.id);
    selectNode(null);
    setSelectedNodeIds([]);
  };

  const handleNodesChange = useCallback<OnNodesChange<BoardFlowNode>>((changes) => {
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        updateNodePosition(change.id, change.position);
      }
    }
  }, [updateNodePosition]);


  const handleNodesDelete: OnNodesDelete<BoardFlowNode> = nodes => {
    for (const node of nodes) trashAndDeleteNode(node.id);
    setSelectedNodeIds([]);
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

  const flowPositionFromClient = useCallback((clientX: number, clientY: number): BoardPoint => {
    const instance = flowInstanceRef.current;
    if (instance) {
      return instance.screenToFlowPosition({ x: clientX, y: clientY }, { snapToGrid: false });
    }
    const rect = flowHostRef.current?.getBoundingClientRect();
    return {
      x: ((clientX - (rect?.left ?? 0)) - board.viewport.x) / board.viewport.zoom,
      y: ((clientY - (rect?.top ?? 0)) - board.viewport.y) / board.viewport.zoom,
    };
  }, [board.viewport]);

  const centeredNodePosition = useCallback((point: BoardPoint, size: BoardSize): BoardPoint => ({
    x: Math.round(point.x - size.width / 2),
    y: Math.round(point.y - size.height / 2),
  }), []);

  const visibleCenterPosition = useCallback((size: BoardSize): BoardPoint | undefined => {
    const rect = flowHostRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    const center = flowPositionFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return centeredNodePosition(center, size);
  }, [centeredNodePosition, flowPositionFromClient]);

  const addQuickNode = useCallback((kind: QuickInsertKind, position: BoardPoint): string => {
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

  const addQuickNodeAtPoint = useCallback((kind: QuickInsertKind, point: BoardPoint): void => {
    const item = quickInsertItems.find(current => current.kind === kind);
    if (!item) return;
    addQuickNode(kind, centeredNodePosition(point, item.size));
    setQuickInsertMenu(null);
  }, [addQuickNode, centeredNodePosition]);

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
      const nodeId = addQuickNode("image-generate", centeredNodePosition(flowPoint, DEFAULT_GENERATE_NODE_SIZE));
      connectPorts(
        { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "prompt" },
        { nodeId, portId: "prompt-in", portKind: "prompt" },
      );
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
          const nodeId = addQuickNode("image-generate", centeredNodePosition(flowPoint, DEFAULT_GENERATE_NODE_SIZE));
          connectPorts(
            { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "asset" },
            { nodeId, portId: "reference-in", portKind: "asset" },
          );
          return;
        }
        const nodeId = addQuickNode("reference-group", centeredNodePosition(flowPoint, DEFAULT_REFERENCE_GROUP_NODE_SIZE));
        addAssetToReferenceGroup(sourceNodeId, nodeId);
        connectPorts(
          { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "asset" },
          { nodeId, portId: "asset-in", portKind: "asset" },
        );
        return;
      }
      if (sourceNode?.kind !== "reference-group") return;
      const nodeId = addQuickNode("image-generate", centeredNodePosition(flowPoint, DEFAULT_GENERATE_NODE_SIZE));
      connectPorts(
        { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "asset" },
        { nodeId, portId: "reference-in", portKind: "asset" },
      );
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
      const nodeId = addAssetNode({
        position: centeredNodePosition(flowPoint, DEFAULT_ASSET_NODE_SIZE),
        asset: storageItemToBoardAsset(item),
        title: item.prompt,
      });
      connectPorts(
        { nodeId: sourceNodeId, portId: sourceHandleId, portKind: "result" },
        { nodeId, portId: "asset-in", portKind: "asset" },
      );
      return;
    }
  }, [addAssetNode, addAssetToReferenceGroup, addQuickNode, board.nodes, centeredNodePosition, connectPorts, flowPositionFromClient, galleryItems, onConnectionError]);

  const openQuickInsertMenu = useCallback((event: ReactMouseEvent | MouseEvent): void => {
    event.preventDefault();
    setNodeContextMenu(null);
    selectNode(null);
    selectEdge(null);
    setSelectedNodeIds([]);
    setQuickInsertMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      position: flowPositionFromClient(event.clientX, event.clientY),
    });
  }, [flowPositionFromClient, selectEdge, selectNode]);

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

  const addPromptAtCenter = useCallback(() => {
    addPromptNode({ position: visibleCenterPosition(DEFAULT_PROMPT_NODE_SIZE) });
  }, [addPromptNode, visibleCenterPosition]);

  const addReferenceGroupAtCenter = useCallback(() => {
    addReferenceGroupNode({ position: visibleCenterPosition(DEFAULT_REFERENCE_GROUP_NODE_SIZE) });
  }, [addReferenceGroupNode, visibleCenterPosition]);

  const addImageGenerateAtCenter = useCallback(() => {
    addGenerateNode({
      kind: "image-generate",
      model: DEFAULT_BOARD_IMAGE_MODEL,
      aspectRatio: "1:1",
      imageResolution: "1024x1024",
      position: visibleCenterPosition(DEFAULT_GENERATE_NODE_SIZE),
    });
  }, [addGenerateNode, visibleCenterPosition]);

  const addVideoGenerateAtCenter = useCallback(() => {
    addGenerateNode({
      kind: "video-generate",
      model: DEFAULT_VIDEO_MODEL,
      aspectRatio: "auto",
      position: visibleCenterPosition(DEFAULT_GENERATE_NODE_SIZE),
    });
  }, [addGenerateNode, visibleCenterPosition]);

  const addAgentAtCenter = useCallback(() => {
    addAgentNode({ position: visibleCenterPosition(DEFAULT_AGENT_NODE_SIZE) });
  }, [addAgentNode, visibleCenterPosition]);

  const addNoteAtCenter = useCallback(() => {
    addNoteNode({ position: visibleCenterPosition(DEFAULT_NOTE_NODE_SIZE) });
  }, [addNoteNode, visibleCenterPosition]);

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

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedEdgeId) {
          deleteBoardEdge(selectedEdgeId);
          event.preventDefault();
          return;
        }
        const targets = selectedNodeIds.length > 0
          ? selectedNodeIds
          : selectedNodeId
            ? [selectedNodeId]
            : [];
        if (targets.length === 0) return;
        for (const nodeId of targets) trashAndDeleteNode(nodeId);
        setSelectedNodeIds([]);
        event.preventDefault();
        return;
      }

      const usesModifier = event.metaKey || event.ctrlKey;
      if (!usesModifier) return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        const selectedNode = board.nodes.find(node => node.id === (selectedNodeIds[0] ?? selectedNodeId));
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
        const targets = selectedNodeIds.length > 0
          ? selectedNodeIds
          : selectedNodeId
            ? [selectedNodeId]
            : [];
        if (targets.length === 0) return;
        for (const nodeId of targets) duplicateNode(nodeId);
        event.preventDefault();
        return;
      }
      if (key === "z" && event.shiftKey) {
        if (!canRedo) return;
        redo();
        event.preventDefault();
        return;
      }
      if (key === "z" && !event.shiftKey) {
        if (!canUndo) return;
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
    deleteBoardEdge,
    duplicateNode,
    pasteCopiedNode,
    redo,
    selectedEdgeId,
    selectedNodeId,
    selectedNodeIds,
    trashAndDeleteNode,
    undo,
  ]);

  return (
    <main className={`imagine-workbench-shell imagine-theme-${themeMode} flex h-screen min-h-0 flex-col bg-[var(--iw-bg)] text-[var(--iw-text)]`}>
      <BoardToolbar
        boardId={board.id}
        boardSummaries={boardSummaries}
        boardTitle={board.title}
        showGrid={board.config.showGrid}
        showMiniMap={board.config.showMiniMap}
        nodeCount={board.nodes.length}
        canRedo={canRedo}
        canUndo={canUndo}
        saveError={saveError}
        saveStatus={saveStatus}
        trashedCount={trashedNodes.length}
        onRedo={redo}
        onRestoreTrash={trashedNodes.length > 0 ? () => restoreTrashedNode(0) : undefined}
        themeMode={themeMode}
        onAddAgent={addAgentAtCenter}
        onUndo={undo}
        onAddImageGenerate={addImageGenerateAtCenter}
        onAddNote={addNoteAtCenter}
        onAddPrompt={addPromptAtCenter}
        onAddReferenceGroup={addReferenceGroupAtCenter}
        onAddVideoGenerate={addVideoGenerateAtCenter}
        onBack={onBack}
        onClear={clearBoard}
        onCreateBoard={onCreateBoard}
        onDeleteBoard={onDeleteBoard}
        onOpenSettings={onOpenSettings}
        onRenameBoard={onRenameBoard}
        onSelectBoard={onSelectBoard}
        onToggleGrid={() => updateBoardConfig({ showGrid: !board.config.showGrid })}
        onToggleMiniMap={() => updateBoardConfig({ showMiniMap: !board.config.showMiniMap })}
        onToggleTheme={onToggleTheme}
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
            nodes={flowNodes}
            edges={flowEdges}
            edgeTypes={edgeTypes}
            nodeTypes={nodeTypes}
            colorMode={themeMode}
            defaultViewport={board.viewport}
            minZoom={0.25}
            maxZoom={1.8}
            fitView={board.nodes.length === 0}
            onlyRenderVisibleElements
            connectOnClick={false}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={48}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={{ stroke: "#60a5fa", strokeDasharray: "7 5", strokeWidth: 2.5 }}
            defaultEdgeOptions={{ type: "smoothstep" }}
            deleteKeyCode={["Backspace", "Delete"]}
            isValidConnection={isValidBoardConnection}
            nodesConnectable
            nodesDraggable
            nodesFocusable
            edgesFocusable
            edgesReconnectable
            elementsSelectable
            multiSelectionKeyCode="Shift"
            onReconnect={handleReconnect}
            onSelectionChange={handleSelectionChange}
            panOnDrag={[1, 2]}
            selectionOnDrag
            onConnect={handleConnect}
            onConnectEnd={handleConnectEnd}
            onEdgeClick={handleEdgeClick}
            onEdgeDoubleClick={(_event, edge) => deleteBoardEdge(edge.id)}
            onEdgesDelete={handleEdgesDelete}
            onInit={(instance) => {
              flowInstanceRef.current = instance;
            }}
            onMoveEnd={(_event, viewport) => setViewport(viewport)}
            onNodeClick={handleNodeClick}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeDragStart={() => beginUndoGesture()}
            onNodeDragStop={() => endUndoGesture()}
            onNodesChange={handleNodesChange}
            onNodesDelete={handleNodesDelete}
            onPaneClick={() => {
              flowHostRef.current?.focus();
              closeOverlayMenus();
              selectNode(null);
              selectEdge(null);
              setSelectedNodeIds([]);
            }}
            onPaneContextMenu={openQuickInsertMenu}
            proOptions={{ hideAttribution: true }}
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
              items={quickInsertItems}
              position={quickInsertMenu.position}
              onPick={(kind, position) => addQuickNodeAtPoint(kind as QuickInsertKind, position)}
            />
          ) : null}
          {nodeContextMenu ? (() => {
            const node = board.nodes.find(item => item.id === nodeContextMenu.nodeId);
            if (!node) return null;
            const actions = buildBoardNodeContextMenuActions({
              node,
              onCompare: node.kind === "asset" && node.asset.type === "image"
                ? () => {
                  const originalUrl = assetCompareReferenceUrl(node.id, board.nodes, board.edges);
                  if (!originalUrl) return;
                  setAssetCompare({ originalUrl, resultUrl: node.asset.url });
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
