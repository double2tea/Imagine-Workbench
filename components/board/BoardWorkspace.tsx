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
  type ReactFlowInstance,
  useReactFlow,
} from "@xyflow/react";
import type { BoardStateController } from "@/hooks/useBoardState";
import BoardNode, { type BoardFlowNode } from "@/components/board/BoardNode";
import type { BoardGenerateInputSummary } from "@/components/board/GenerateBoardNode";
import BoardEmptyHint from "@/components/board/BoardEmptyHint";
import BoardToolbar from "@/components/board/BoardToolbar";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { ThemeMode } from "@/components/workbench/WorkspaceHeader";
import type { StorageItem } from "@/lib/db";
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
} from "@/lib/board";
import { DEFAULT_VIDEO_MODEL, getModelCapability } from "@/lib/providers/model-catalog";

interface BoardWorkspaceProps {
  controller: BoardStateController;
  children?: ReactNode;
  themeMode: ThemeMode;
  onBack: () => void;
  onCaptureVideoFrame: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onConnectionError: (message: string) => void;
  onEditAssetImage: (nodeId: string) => void;
  onExecuteGenerateNode: (nodeId: string) => void;
  onImportBoardFiles: (files: File[], position: BoardPoint) => void | Promise<void>;
  onOpenSettings: () => void;
  onSendAssetToAgent: (nodeId: string) => void;
  onSendAgentNode: (nodeId: string) => void;
  onSetAssetAsReference: (nodeId: string) => void;
  onToggleTheme: () => void;
}

type BoardFlowEdge = Edge<{ kind: BoardEdgeKind }, "smoothstep">;
type QuickInsertKind = "prompt" | "reference-group" | "image-generate" | "video-generate" | "agent" | "note";
type BoardHandleDirection = "input" | "output";

interface QuickInsertMenu {
  clientX: number;
  clientY: number;
  position: BoardPoint;
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
        <button
          type="button"
          aria-label="删除连接"
          title="删除连接"
          onClick={() => void deleteElements({ edges: [{ id }] })}
          className={`nodrag nopan flex h-6 w-6 items-center justify-center rounded-full border border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-muted)] shadow-lg transition hover:border-red-400/40 hover:bg-red-500 hover:text-white ${
            selected ? "opacity-100" : "opacity-70"
          }`}
          style={{
            pointerEvents: "all",
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          <span className="text-sm leading-none">×</span>
        </button>
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

function pasteImageFiles(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.items)
    .filter(item => item.kind === "file" && item.type.startsWith("image/"))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null);
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof Element && (
    target.closest("textarea") !== null ||
    target.closest("input") !== null ||
    target.closest("[contenteditable='true']") !== null
  );
}

function boardNodeReferences(node: BoardNodeModel | undefined): ReferenceImageRef[] {
  if (node?.kind === "asset" && node.asset.type === "image") {
    return [{ id: node.asset.assetId, role: "general", url: node.asset.url }];
  }
  if (node?.kind === "reference-group") {
    return node.references.map(reference => ({ id: reference.assetId, role: reference.role, url: reference.url }));
  }
  return [];
}

function uniqueReferences(references: ReferenceImageRef[]): ReferenceImageRef[] {
  const seen = new Set<string>();
  const unique: ReferenceImageRef[] = [];
  for (const reference of references) {
    const key = `${reference.id}:${reference.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(reference);
  }
  return unique;
}

function referenceSignature(references: ReferenceImageRef[]): string {
  return references
    .map(reference => `${reference.id}:${reference.role ?? "general"}:${reference.url}`)
    .join("\n");
}

function generateReferenceCandidates(nodes: BoardNodeModel[], edges: BoardEdge[], generateNodeId: string): ReferenceImageRef[] {
  return uniqueReferences(
    edges
      .filter(edge => edge.to.nodeId === generateNodeId && edge.to.portId === "reference-in")
      .flatMap(edge => boardNodeReferences(nodes.find(node => node.id === edge.from.nodeId))),
  );
}

function promptReferenceCandidates(nodes: BoardNodeModel[], edges: BoardEdge[], promptNodeId: string): ReferenceImageRef[] {
  const targetGenerateIds = Array.from(new Set(
    edges
      .filter(edge => edge.from.nodeId === promptNodeId && edge.to.portId === "prompt-in")
      .map(edge => edge.to.nodeId),
  ));
  if (targetGenerateIds.length === 1) return generateReferenceCandidates(nodes, edges, targetGenerateIds[0]);
  if (targetGenerateIds.length > 1) {
    const candidateGroups = targetGenerateIds.map(generateNodeId => generateReferenceCandidates(nodes, edges, generateNodeId));
    const firstSignature = referenceSignature(candidateGroups[0] ?? []);
    return candidateGroups.every(references => referenceSignature(references) === firstSignature) ? candidateGroups[0] ?? [] : [];
  }
  return uniqueReferences(nodes.flatMap(node => boardNodeReferences(node)));
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

export default function BoardWorkspace({
  children,
  controller,
  themeMode,
  onBack,
  onCaptureVideoFrame,
  onConnectionError,
  onEditAssetImage,
  onExecuteGenerateNode,
  onImportBoardFiles,
  onOpenSettings,
  onSendAssetToAgent,
  onSendAgentNode,
  onSetAssetAsReference,
  onToggleTheme,
}: BoardWorkspaceProps) {
  const flowInstanceRef = useRef<ReactFlowInstance<BoardFlowNode, BoardFlowEdge> | null>(null);
  const flowHostRef = useRef<HTMLElement | null>(null);
  const [quickInsertMenu, setQuickInsertMenu] = useState<QuickInsertMenu | null>(null);
  const {
    board,
    saveStatus,
    selectedEdgeId,
    selectedNodeId,
    addAgentNode,
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
    updateReferenceGroupItemRole,
    updateAgentInstruction,
    updateGenerateNode,
    updateNodePosition,
    updateNoteBody,
    updatePromptNode,
  } = controller;

  const flowNodes = useMemo<BoardFlowNode[]>(
    () =>
      board.nodes.map(node => ({
        id: node.id,
        type: "board",
        position: node.position,
        width: node.size.width,
        height: node.size.height,
        selected: selectedNodeId === node.id,
        data: {
          generateInputSummary: generateInputSummaryForNode(node, board.nodes, board.edges),
          hasResultConnection: hasResultConnection(node.id, board.edges),
          node,
          promptReferences: node.kind === "prompt" ? promptReferenceCandidates(board.nodes, board.edges, node.id) : [],
          onCaptureVideoFrame,
          onDelete: deleteNode,
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
      deleteNode,
      onCaptureVideoFrame,
      onEditAssetImage,
      onExecuteGenerateNode,
      moveReferenceGroupItem,
      removeReferenceGroupItem,
      onSendAssetToAgent,
      onSendAgentNode,
      onSetAssetAsReference,
      selectedNodeId,
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
        animated: edge.kind === "result",
        data: { kind: edge.kind },
        className: `imagine-board-edge imagine-board-edge-${edge.kind}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(edge.kind, themeMode), width: 18, height: 18 },
        style: { strokeWidth: selectedEdgeId === edge.id ? 3 : 2 },
      })),
    [board.edges, selectedEdgeId, themeMode],
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

  const handleNodeClick: NodeMouseHandler<BoardFlowNode> = (_event, node) => {
    selectNode(node.id);
    selectEdge(null);
  };

  const handleEdgeClick: EdgeMouseHandler<BoardFlowEdge> = (_event, edge) => {
    selectEdge(edge.id);
    selectNode(null);
  };

  const handleNodesChange = useCallback<OnNodesChange<BoardFlowNode>>((changes) => {
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        updateNodePosition(change.id, change.position);
      }
    }
  }, [updateNodePosition]);


  const handleNodesDelete: OnNodesDelete<BoardFlowNode> = nodes => {
    for (const node of nodes) deleteNode(node.id);
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
  }, [addAssetToReferenceGroup, addQuickNode, board.nodes, centeredNodePosition, connectPorts, flowPositionFromClient, onConnectionError]);

  const openQuickInsertMenu = useCallback((event: ReactMouseEvent | MouseEvent): void => {
    event.preventDefault();
    selectNode(null);
    selectEdge(null);
    setQuickInsertMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      position: flowPositionFromClient(event.clientX, event.clientY),
    });
  }, [flowPositionFromClient, selectEdge, selectNode]);

  const handleFlowDoubleClick = useCallback((event: ReactMouseEvent<HTMLElement>): void => {
    if (!(event.target instanceof Element) || !event.target.closest(".react-flow__pane")) return;
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

  const handleBoardDrop = useCallback((event: ReactDragEvent<HTMLElement>): void => {
    const files = importableFiles(event.dataTransfer);
    if (files.length === 0) return;
    event.preventDefault();
    importFilesAtPoint(files, flowPositionFromClient(event.clientX, event.clientY));
  }, [flowPositionFromClient, importFilesAtPoint]);

  const handleBoardDragOver = useCallback((event: ReactDragEvent<HTMLElement>): void => {
    if (!hasImportableFile(event.dataTransfer)) return;
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

  return (
    <main className={`imagine-workbench-shell imagine-theme-${themeMode} flex h-screen min-h-0 flex-col bg-[var(--iw-bg)] text-[var(--iw-text)]`}>
      <BoardToolbar
        nodeCount={board.nodes.length}
        saveStatus={saveStatus}
        themeMode={themeMode}
        onAddAgent={addAgentAtCenter}
        onAddImageGenerate={addImageGenerateAtCenter}
        onAddNote={addNoteAtCenter}
        onAddPrompt={addPromptAtCenter}
        onAddReferenceGroup={addReferenceGroupAtCenter}
        onAddVideoGenerate={addVideoGenerateAtCenter}
        onBack={onBack}
        onClear={clearBoard}
        onOpenSettings={onOpenSettings}
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
            connectOnClick
            connectionMode={ConnectionMode.Loose}
            connectionRadius={28}
            connectionLineType={ConnectionLineType.SmoothStep}
            connectionLineStyle={{ stroke: "#60a5fa", strokeDasharray: "7 5", strokeWidth: 2.5 }}
            defaultEdgeOptions={{ type: "smoothstep" }}
            deleteKeyCode={["Backspace", "Delete"]}
            isValidConnection={isValidBoardConnection}
            nodesConnectable
            nodesDraggable
            nodesFocusable
            edgesFocusable
            edgesReconnectable={false}
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
            onNodesChange={handleNodesChange}
            onNodesDelete={handleNodesDelete}
            onPaneClick={() => {
              flowHostRef.current?.focus();
              setQuickInsertMenu(null);
              selectNode(null);
              selectEdge(null);
            }}
            onPaneContextMenu={openQuickInsertMenu}
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--iw-board-handle)" />
            <Controls className="imagine-board-controls" />
            <MiniMap
              className="imagine-board-minimap"
              nodeColor={getBoardVar("--iw-board-minimap-node", themeMode === "light" ? "#1e40af" : "#1d4ed8")}
              maskColor={getBoardVar("--iw-board-minimap-mask", themeMode === "light" ? "rgba(241, 245, 249, 0.75)" : "rgba(2,6,23,0.66)")}
              pannable
              zoomable
            />
          </ReactFlow>
          {board.nodes.length === 0 && <BoardEmptyHint />}
          {quickInsertMenu && (
            <div
              className="imagine-board-quick-insert fixed z-50 grid w-44 gap-1.5 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] p-2 text-[var(--iw-text)]"
              style={{ left: quickInsertMenu.clientX, top: quickInsertMenu.clientY }}
            >
              {quickInsertItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => addQuickNodeAtPoint(item.kind, quickInsertMenu.position)}
                    className="imagine-header-button relative flex !h-10 !min-h-10 items-center gap-2.5 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-left text-xs font-semibold text-[var(--iw-text)] transition"
                    data-accent="amber"
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${item.iconSurfaceClassName}`}>
                      <Icon className={`h-3.5 w-3.5 ${item.iconClassName}`} />
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
        {children}
      </div>
    </main>
  );
}
