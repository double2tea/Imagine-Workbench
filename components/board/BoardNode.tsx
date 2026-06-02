"use client";

import { memo } from "react";
import { Handle, Position, useConnection, type Node, type NodeProps } from "@xyflow/react";
import { Bot, ImagePlus, Layers, Trash2, Video } from "lucide-react";
import type {
  BoardAgentNode,
  BoardGenerateNodeUpdate,
  BoardNode as BoardNodeModel,
  BoardPortKind,
  BoardReferenceRole,
} from "@/lib/board";
import AgentBoardNode from "@/components/board/AgentBoardNode";
import AssetBoardNode from "@/components/board/AssetBoardNode";
import GenerateBoardNode, { type BoardGenerateInputSummary } from "@/components/board/GenerateBoardNode";
import NoteBoardNode from "@/components/board/NoteBoardNode";
import PromptBoardNode from "@/components/board/PromptBoardNode";
import ReferenceGroupBoardNode from "@/components/board/ReferenceGroupBoardNode";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { StorageItem } from "@/lib/db";
import { getModelCapability } from "@/lib/providers/model-catalog";
import type { CapturedVideoFrame } from "@/lib/video-frame";

export interface BoardFlowNodeData extends Record<string, unknown> {
  compareReferenceUrl?: string | null;
  generateInputSummary?: BoardGenerateInputSummary;
  generateReferences: ReferenceImageRef[];
  hasResultConnection?: boolean;
  node: BoardNodeModel;
  onDelete: (nodeId: string) => void;
  onOpenAssetCompare?: (nodeId: string) => void;
  promptReferences: ReferenceImageRef[];
  onCaptureVideoFrame: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onEditAssetImage: (nodeId: string) => void;
  onExecuteGenerate: (nodeId: string) => void;
  onMoveReferenceGroupItem: (nodeId: string, assetId: string, direction: "up" | "down") => void;
  onRemoveReferenceGroupItem: (nodeId: string, assetId: string) => void;
  onSendAgent: (nodeId: string) => void;
  onSendAssetToAgent: (nodeId: string) => void;
  onSetAssetAsReference: (nodeId: string) => void;
  onUpdateReferenceGroupItemRole: (nodeId: string, assetId: string, role: BoardReferenceRole) => void;
  onUpdateAgent: (nodeId: string, instruction: string) => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  onUpdateNote: (nodeId: string, body: string) => void;
  onUpdatePrompt: (nodeId: string, prompt: string) => void;
}

export type BoardFlowNode = Node<BoardFlowNodeData, "board">;

interface BoardHandleProps {
  id: string;
  kind: BoardPortKind;
  label: string;
  position: Position;
  top?: number;
  type: "source" | "target";
}

function nodeIcon(node: BoardNodeModel) {
  if (node.kind === "image-generate") return <ImagePlus className="h-3.5 w-3.5 text-blue-300" />;
  if (node.kind === "video-generate") return <Video className="h-3.5 w-3.5 text-violet-300" />;
  if (node.kind === "agent") return <Bot className="h-3.5 w-3.5 text-purple-300" />;
  if (node.kind === "reference-group") return <Layers className="h-3.5 w-3.5 text-cyan-300" />;
  return null;
}

function handleClass(kind: BoardPortKind): string {
  if (kind === "prompt") return "!border-teal-200 !bg-teal-400";
  if (kind === "agent") return "!border-purple-200 !bg-purple-400";
  if (kind === "result") return "!border-emerald-200 !bg-emerald-400";
  return "!border-blue-200 !bg-blue-400";
}

function BoardHandle({ id, kind, label, position, top, type }: BoardHandleProps) {
  return (
    <Handle
      id={id}
      type={type}
      position={position}
      className={`board-node-handle board-node-handle-${kind} !z-20 !h-5 !w-5 !border-2 ${handleClass(kind)}`}
      style={typeof top === "number" ? { top } : undefined}
      title={label}
    />
  );
}

function nodeBodyOverflowClass(kind: BoardNodeModel["kind"]): string {
  if (kind === "prompt" || kind === "image-generate" || kind === "video-generate") {
    return "overflow-visible";
  }
  return "overflow-hidden";
}

function supportsReferenceInput(node: BoardNodeModel): boolean {
  if (node.kind !== "image-generate" && node.kind !== "video-generate") return false;
  try {
    return getModelCapability(node.model, node.kind === "image-generate" ? "image" : "video").supportsReferences;
  } catch {
    return false;
  }
}

function BoardNode({ data, selected }: NodeProps<BoardFlowNode>) {
  const { node } = data;
  const connectionInProgress = useConnection(connection => connection.inProgress);

  return (
    <article
      className={`board-node-shell imagine-board-node h-full !overflow-visible !rounded-lg ${selected ? "imagine-board-node-selected" : ""}`}
      data-kind={node.kind}
      data-connecting={connectionInProgress ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      style={{ height: node.size.height, width: node.size.width }}
    >
      {node.kind === "asset" && (
        <>
          <BoardHandle id="asset-in" type="target" position={Position.Left} kind="asset" label="资产输入" />
          <BoardHandle id="asset-out" type="source" position={Position.Right} kind="asset" label="资产输出" />
        </>
      )}
      {node.kind === "prompt" && (
        <BoardHandle id="prompt-out" type="source" position={Position.Right} kind="prompt" label="提示输出" />
      )}
      {node.kind === "reference-group" && (
        <>
          <BoardHandle id="asset-in" type="target" position={Position.Left} kind="asset" label="图片输入" />
          <BoardHandle id="asset-out" type="source" position={Position.Right} kind="asset" label="参考组输出" />
        </>
      )}
      {(node.kind === "image-generate" || node.kind === "video-generate") && (
        <>
          <BoardHandle id="prompt-in" type="target" position={Position.Left} kind="prompt" label="提示输入" top={78} />
          {supportsReferenceInput(node) && <BoardHandle id="reference-in" type="target" position={Position.Left} kind="asset" label="参考输入" top={126} />}
          {(node.status === "complete" || Boolean(node.resultAssetId) || data.hasResultConnection) && (
            <BoardHandle id="result-out" type="source" position={Position.Right} kind="result" label="结果输出" />
          )}
        </>
      )}
      {node.kind === "agent" && (
        <BoardHandle id="agent-context-in" type="target" position={Position.Left} kind="agent" label="Agent 上下文输入" top={92} />
      )}

      <div className="flex h-9 items-center justify-between gap-2 rounded-t-lg imagine-board-node-header px-3">
        <h2 className="flex min-w-0 items-center gap-2 truncate text-xs font-semibold">
          {nodeIcon(node)}
          <span className="truncate">{node.title}</span>
        </h2>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            data.onDelete(node.id);
          }}
          className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--iw-muted)] transition hover:bg-red-500/10 hover:text-red-300"
          title="删除节点"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className={`h-[calc(100%-2.25rem)] min-h-0 rounded-b-lg ${nodeBodyOverflowClass(node.kind)}`}>
        {node.kind === "asset" && (
          <AssetBoardNode
            node={node}
            compareReferenceUrl={data.compareReferenceUrl}
            onCaptureVideoFrame={data.onCaptureVideoFrame}
            onCompare={data.onOpenAssetCompare ? () => data.onOpenAssetCompare?.(node.id) : undefined}
            onEditImage={data.onEditAssetImage}
            onSendToAgent={data.onSendAssetToAgent}
            onSetAsReference={data.onSetAssetAsReference}
          />
        )}
        {node.kind === "prompt" && (
          <PromptBoardNode
            node={node}
            references={data.promptReferences}
            onChange={prompt => data.onUpdatePrompt(node.id, prompt)}
          />
        )}
        {node.kind === "reference-group" && (
          <ReferenceGroupBoardNode
            node={node}
            onMove={(assetId, direction) => data.onMoveReferenceGroupItem(node.id, assetId, direction)}
            onRemove={assetId => data.onRemoveReferenceGroupItem(node.id, assetId)}
            onRoleChange={(assetId, role) => data.onUpdateReferenceGroupItemRole(node.id, assetId, role)}
          />
        )}
        {(node.kind === "image-generate" || node.kind === "video-generate") && (
          <GenerateBoardNode
            inputSummary={data.generateInputSummary}
            node={node}
            references={data.generateReferences}
            onExecute={() => data.onExecuteGenerate(node.id)}
            onUpdate={input => data.onUpdateGenerate(node.id, input)}
          />
        )}
        {node.kind === "agent" && (
          <AgentBoardNode
            node={node as BoardAgentNode}
            onSend={() => data.onSendAgent(node.id)}
            onUpdate={(instruction) => data.onUpdateAgent(node.id, instruction)}
          />
        )}
        {node.kind === "note" && <NoteBoardNode node={node} onChange={body => data.onUpdateNote(node.id, body)} />}
      </div>
    </article>
  );
}

export default memo(BoardNode);
