"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
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
} from "@xyflow/react";
import type { BoardStateController } from "@/hooks/useBoardState";
import BoardNode, { type BoardFlowNode } from "@/components/board/BoardNode";
import BoardToolbar from "@/components/board/BoardToolbar";
import type { BoardEdge, BoardEdgeKind, BoardNode as BoardNodeModel, BoardPortKind, BoardPortRef } from "@/lib/board";
import { DEFAULT_VIDEO_MODEL, getModelCapability } from "@/lib/providers/model-catalog";

interface BoardWorkspaceProps {
  controller: BoardStateController;
  children?: ReactNode;
  onBack: () => void;
  onConnectionError: (message: string) => void;
  onExecuteGenerateNode: (nodeId: string) => void;
  onOpenSettings: () => void;
  onSendAgentNode: (nodeId: string) => void;
}

type BoardFlowEdge = Edge<{ kind: BoardEdgeKind }, "smoothstep">;

const nodeTypes = { board: BoardNode };

function portKindFromHandle(handleId: string | null | undefined): BoardPortKind | null {
  if (!handleId) return null;
  if (handleId.startsWith("prompt-")) return "prompt";
  if (handleId.startsWith("agent-")) return "agent";
  if (handleId.startsWith("result-")) return "result";
  if (handleId.startsWith("asset-") || handleId === "reference-in") return "asset";
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
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle || !sourceKind || !targetKind) return null;
  return {
    from: { nodeId: connection.source, portId: connection.sourceHandle, portKind: sourceKind },
    to: { nodeId: connection.target, portId: connection.targetHandle, portKind: targetKind },
  };
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
  onBack,
  onConnectionError,
  onExecuteGenerateNode,
  onOpenSettings,
  onSendAgentNode,
}: BoardWorkspaceProps) {
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

  return (
    <main className="flex h-screen min-h-0 flex-col bg-slate-950 text-slate-100">
      <BoardToolbar
        nodeCount={board.nodes.length}
        saveStatus={saveStatus}
        onAddAgent={() => addAgentNode()}
        onAddImageGenerate={() => addGenerateNode({ kind: "image-generate", model: "modelscope:Qwen/Qwen-Image", aspectRatio: "1:1", imageResolution: "1024x1024" })}
        onAddNote={() => addNoteNode()}
        onAddPrompt={() => addPromptNode()}
        onAddVideoGenerate={() => addGenerateNode({ kind: "video-generate", model: DEFAULT_VIDEO_MODEL, aspectRatio: "auto" })}
        onBack={onBack}
        onClear={clearBoard}
        onOpenSettings={onOpenSettings}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-0 bg-slate-950">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            colorMode="dark"
            defaultViewport={board.viewport}
            minZoom={0.25}
            maxZoom={1.8}
            fitView={board.nodes.length === 0}
            onlyRenderVisibleElements
            connectOnClick
            connectionLineType={ConnectionLineType.SmoothStep}
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
            onMoveEnd={(_event, viewport) => setViewport(viewport)}
            onNodeClick={handleNodeClick}
            onNodeDrag={handleNodeDrag}
            onNodesDelete={handleNodesDelete}
            onPaneClick={() => {
              selectNode(null);
              selectEdge(null);
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(148,163,184,0.32)" />
            <Controls className="!border-slate-700 !bg-slate-900 !text-slate-100" />
            <MiniMap
              className="!border !border-slate-800 !bg-slate-950"
              nodeColor="#1d4ed8"
              maskColor="rgba(2,6,23,0.66)"
              pannable
              zoomable
            />
          </ReactFlow>
        </section>
        {children}
      </div>
    </main>
  );
}
