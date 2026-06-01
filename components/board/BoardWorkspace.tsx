"use client";

import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  Bot,
  FileText,
  ImagePlus,
  MessageSquareText,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type IsValidConnection,
  type NodeMouseHandler,
  type OnConnect,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { BoardStateController } from "@/hooks/useBoardState";
import BoardNode, { type BoardFlowNode } from "@/components/board/BoardNode";
import BoardToolbar from "@/components/board/BoardToolbar";
import type { ThemeMode } from "@/components/workbench/WorkspaceHeader";
import {
  DEFAULT_AGENT_NODE_SIZE,
  DEFAULT_GENERATE_NODE_SIZE,
  DEFAULT_NOTE_NODE_SIZE,
  DEFAULT_PROMPT_NODE_SIZE,
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
  onConnectionError: (message: string) => void;
  onExecuteGenerateNode: (nodeId: string) => void;
  onOpenSettings: () => void;
  onSendAgentNode: (nodeId: string) => void;
  onToggleTheme: () => void;
}

type BoardFlowEdge = Edge<{ kind: BoardEdgeKind }, "smoothstep">;
type QuickInsertKind = "prompt" | "image-generate" | "video-generate" | "agent" | "note";
type BoardHandleDirection = "input" | "output";

interface QuickInsertMenu {
  clientX: number;
  clientY: number;
  position: BoardPoint;
}

const nodeTypes = { board: BoardNode };
const DEFAULT_BOARD_IMAGE_MODEL = "modelscope:Qwen/Qwen-Image";

const quickInsertItems: Array<{ icon: LucideIcon; iconClassName: string; iconSurfaceClassName: string; kind: QuickInsertKind; label: string; size: BoardSize }> = [
  { icon: MessageSquareText, iconClassName: "text-teal-300", iconSurfaceClassName: "bg-teal-500/10 border-teal-400/20", kind: "prompt", label: "提示", size: DEFAULT_PROMPT_NODE_SIZE },
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

function edgeColor(kind: BoardEdge["kind"]): string {
  if (kind === "prompt") return "#2dd4bf";
  if (kind === "reference") return "#60a5fa";
  if (kind === "agent-context") return "#a78bfa";
  return "#34d399";
}

export default function BoardWorkspace({
  children,
  controller,
  themeMode,
  onBack,
  onConnectionError,
  onExecuteGenerateNode,
  onOpenSettings,
  onSendAgentNode,
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
    addGenerateNode,
    addNoteNode,
    addPromptNode,
    clearBoard,
    connectPorts,
    deleteEdge,
    deleteNode,
    selectEdge,
    selectNode,
    setViewport,
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
          node,
          onDelete: deleteNode,
          onExecuteGenerate: onExecuteGenerateNode,
          onSendAgent: onSendAgentNode,
          onUpdateAgent: updateAgentInstruction,
          onUpdateGenerate: updateGenerateNode,
          onUpdateNote: updateNoteBody,
          onUpdatePrompt: updatePromptNode,
        },
      })),
    [
      board.nodes,
      deleteNode,
      onExecuteGenerateNode,
      onSendAgentNode,
      selectedNodeId,
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
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(edge.kind), width: 18, height: 18 },
        style: { stroke: edgeColor(edge.kind), strokeWidth: selectedEdgeId === edge.id ? 3 : 2 },
      })),
    [board.edges, selectedEdgeId],
  );

  const isValidBoardConnection = useCallback<IsValidConnection<BoardFlowEdge>>((connection) => {
    const refs = connectionPortRefs(connection);
    if (!isCompatiblePortConnection(refs)) return false;
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

  const handleNodeDrag: OnNodeDrag<BoardFlowNode> = (_event, node) => {
    updateNodePosition(node.id, node.position);
  };

  const handleNodesDelete: OnNodesDelete<BoardFlowNode> = nodes => {
    for (const node of nodes) deleteNode(node.id);
  };

  const handleEdgesDelete: OnEdgesDelete<BoardFlowEdge> = edges => {
    for (const edge of edges) deleteEdge(edge.id);
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
  }, [addAgentNode, addGenerateNode, addNoteNode, addPromptNode]);

  const addQuickNodeAtPoint = useCallback((kind: QuickInsertKind, point: BoardPoint): void => {
    const item = quickInsertItems.find(current => current.kind === kind);
    if (!item) return;
    addQuickNode(kind, centeredNodePosition(point, item.size));
    setQuickInsertMenu(null);
  }, [addQuickNode, centeredNodePosition]);

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

  return (
    <main className={`imagine-workbench-shell imagine-theme-${themeMode} flex h-screen min-h-0 flex-col bg-slate-950 text-slate-100`}>
      <BoardToolbar
        nodeCount={board.nodes.length}
        saveStatus={saveStatus}
        themeMode={themeMode}
        onAddAgent={addAgentAtCenter}
        onAddImageGenerate={addImageGenerateAtCenter}
        onAddNote={addNoteAtCenter}
        onAddPrompt={addPromptAtCenter}
        onAddVideoGenerate={addVideoGenerateAtCenter}
        onBack={onBack}
        onClear={clearBoard}
        onOpenSettings={onOpenSettings}
        onToggleTheme={onToggleTheme}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section ref={flowHostRef} onDoubleClick={handleFlowDoubleClick} className="board-canvas relative min-h-0 bg-slate-950">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
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
            onEdgeClick={handleEdgeClick}
            onEdgeDoubleClick={(_event, edge) => deleteEdge(edge.id)}
            onEdgesDelete={handleEdgesDelete}
            onInit={(instance) => {
              flowInstanceRef.current = instance;
            }}
            onMoveEnd={(_event, viewport) => setViewport(viewport)}
            onNodeClick={handleNodeClick}
            onNodeDrag={handleNodeDrag}
            onNodesDelete={handleNodesDelete}
            onPaneClick={() => {
              setQuickInsertMenu(null);
              selectNode(null);
              selectEdge(null);
            }}
            onPaneContextMenu={openQuickInsertMenu}
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={themeMode === "light" ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.32)"} />
            <Controls className="!border-slate-700 !bg-slate-900 !text-slate-100" />
            <MiniMap
              className="!border !border-slate-800 !bg-slate-950"
              nodeColor={themeMode === "light" ? "#1e40af" : "#1d4ed8"}
              maskColor={themeMode === "light" ? "rgba(241, 245, 249, 0.75)" : "rgba(2,6,23,0.66)"}
              pannable
              zoomable
            />
          </ReactFlow>
          {quickInsertMenu && (
            <div
              className="board-quick-insert-menu imagine-board-quick-insert fixed z-50 grid w-44 gap-1.5 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] p-2 text-[var(--iw-text)]"
              style={{ left: quickInsertMenu.clientX, top: quickInsertMenu.clientY }}
            >
              {quickInsertItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => addQuickNodeAtPoint(item.kind, quickInsertMenu.position)}
                    className="imagine-header-button relative flex !h-10 !min-h-10 items-center gap-2.5 !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-left text-xs font-semibold text-[var(--iw-text)] transition hover:border-[var(--iw-board-accent-amber)] hover:bg-[var(--iw-panel)]"
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
