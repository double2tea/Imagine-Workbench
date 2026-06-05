"use client";

import { memo } from "react";
import { Handle, Position, useConnection, type Node, type NodeProps } from "@xyflow/react";
import { ImagePlus, Layers, Music, Trash2, Video, Workflow } from "lucide-react";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import PreviewImage from "@/components/PreviewImage";
import type {
  BoardAgentNode,
  BoardGenerateNodeUpdate,
  BoardNode as BoardNodeModel,
  BoardPortKind,
  BoardReferenceRole,
  BoardRunningHubAppNodeUpdate,
  BoardRunningHubAppSchemaResult,
} from "@/lib/board";
import AgentBoardNode from "@/components/board/AgentBoardNode";
import AssetBoardNode from "@/components/board/AssetBoardNode";
import GenerateBoardNode, { type BoardGenerateInputSummary, type BoardGenerateTaskSummary } from "@/components/board/GenerateBoardNode";
import NoteBoardNode from "@/components/board/NoteBoardNode";
import PromptBoardNode from "@/components/board/PromptBoardNode";
import ReferenceGroupBoardNode from "@/components/board/ReferenceGroupBoardNode";
import RunningHubAppBoardNode from "@/components/board/RunningHubAppBoardNode";
import type { StorageItem } from "@/lib/db";
import { getMediaReferenceType } from "@/lib/media-references";
import type { BoardPromptReference } from "@/lib/board/prompt-references";
import { BOARD_PORT_IDS, getBoardNodePortDefinitions } from "@/lib/board/ports";
import type { CapturedVideoFrame } from "@/lib/video-frame";

export interface BoardFlowNodeData extends Record<string, unknown> {
  boardId: string;
  compareReferenceUrl?: string | null;
  generateInputSummary?: BoardGenerateInputSummary;
  generateReferences: BoardPromptReference[];
  generateTaskSummary?: BoardGenerateTaskSummary;
  hasResultConnection?: boolean;
  node: BoardNodeModel;
  onDelete: (nodeId: string) => void;
  onCancelGenerate: (nodeId: string) => void;
  onOpenAssetCompare?: (nodeId: string) => void;
  onOpenFullscreen: (item: StorageItem) => void;
  promptReferences: BoardPromptReference[];
  onCaptureVideoFrame: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onEditAssetImage: (nodeId: string) => void;
  onExecuteGenerate: (nodeId: string) => void;
  onFetchRunningHubAppSchema: (webappId: string) => Promise<BoardRunningHubAppSchemaResult>;
  onMoveReferenceGroupItem: (nodeId: string, assetId: string, direction: "up" | "down") => void;
  onMoveGenerateReferenceEdge: (nodeId: string, sourceEdgeId: string, targetEdgeId: string) => void;
  onMaterializeGenerateResult: (nodeId: string, assetId: string) => void;
  onRemoveReferenceGroupItem: (nodeId: string, assetId: string) => void;
  onSendAgent: (nodeId: string) => void;
  onSendAssetToAgent: (nodeId: string) => void;
  onSelectPromptReference: (nodeId: string, reference: BoardPromptReference) => void;
  onSelectGenerateResult: (nodeId: string, assetId: string) => void;
  onSetAssetAsReference: (nodeId: string) => void;
  onUpdateReferenceGroupItemRole: (nodeId: string, assetId: string, role: BoardReferenceRole) => void;
  onUpdateAgent: (nodeId: string, instruction: string) => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  onUpdateRunningHubApp: (nodeId: string, input: BoardRunningHubAppNodeUpdate) => void;
  onUpdateNote: (nodeId: string, body: string) => void;
  onUpdatePrompt: (nodeId: string, prompt: string) => void;
  resultItems: StorageItem[];
}

export type BoardFlowNode = Node<BoardFlowNodeData, "board">;

type BoardHandleZone = "edge" | "segment";

let referenceShelfDragImage: HTMLCanvasElement | null = null;

interface BoardHandleProps {
  id: string;
  kind: BoardPortKind;
  label: string;
  position: Position;
  top?: number;
  type: "source" | "target";
  zone?: BoardHandleZone;
  zoneHeight?: number;
}

function nodeIcon(node: BoardNodeModel) {
  if (node.kind === "image-generate") return <ImagePlus className="h-3.5 w-3.5 text-blue-300" />;
  if (node.kind === "video-generate") return <Video className="h-3.5 w-3.5 text-violet-300" />;
  if (node.kind === "runninghub-app") return <Workflow className="h-3.5 w-3.5 text-emerald-300" />;
  if (node.kind === "agent") return <AgentIdentityMark variant="inline" />;
  if (node.kind === "reference-group") return <Layers className="h-3.5 w-3.5 text-cyan-300" />;
  return null;
}

function handleClass(kind: BoardPortKind): string {
  if (kind === "prompt") return "!border-teal-200 !bg-teal-400";
  if (kind === "agent") return "!border-purple-200 !bg-purple-400";
  if (kind === "result") return "!border-emerald-200 !bg-emerald-400";
  return "!border-blue-200 !bg-blue-400";
}

function BoardHandle({ id, kind, label, position, top, type, zone = "edge", zoneHeight }: BoardHandleProps) {
  const isEdgeZone = zone === "edge";
  const segmentHeight = zoneHeight ?? 72;
  const connectionInProgress = useConnection(connection => connection.inProgress);
  return (
    <Handle
      id={id}
      type={type}
      position={position}
      data-connecting={connectionInProgress ? "true" : "false"}
      className={[
        "board-node-handle",
        `board-node-handle-${kind}`,
        isEdgeZone ? "board-connection-zone-edge" : "board-connection-zone-segment",
        "!z-20 !border-2",
        handleClass(kind),
      ].join(" ")}
      style={{
        ...(typeof top === "number" ? { top } : isEdgeZone ? { top: "50%" } : undefined),
        height: isEdgeZone ? "calc(100% - 2.25rem)" : segmentHeight,
        width: isEdgeZone ? 18 : 16,
      }}
      title={label}
    />
  );
}

function nodeBodyOverflowClass(kind: BoardNodeModel["kind"]): string {
  if (kind === "prompt" || kind === "runninghub-app") {
    return "overflow-visible";
  }
  return "overflow-hidden";
}

function getReferenceShelfDragImage(): HTMLCanvasElement {
  if (!referenceShelfDragImage) {
    referenceShelfDragImage = document.createElement("canvas");
    referenceShelfDragImage.width = 1;
    referenceShelfDragImage.height = 1;
  }
  return referenceShelfDragImage;
}

function GenerateReferenceShelf({
  nodeId,
  onMoveReference,
  references,
}: {
  nodeId: string;
  onMoveReference: (nodeId: string, sourceEdgeId: string, targetEdgeId: string) => void;
  references: BoardGenerateInputSummary["referencePreviews"];
}) {
  if (references.length === 0) return null;
  return (
    <div className="nodrag nopan absolute -top-12 left-0 z-40 flex max-w-full gap-1 overflow-hidden rounded-lg border border-blue-400/20 bg-slate-950/88 p-1 shadow-xl backdrop-blur">
      {references.slice(0, 6).map((reference, index) => {
        const type = getMediaReferenceType(reference);
        const canReorder = typeof reference.sourceEdgeId === "string";
        return (
          <div
            key={`${reference.id}:${reference.url}:${index}`}
            draggable={canReorder}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onDragStart={(event) => {
              if (!reference.sourceEdgeId) return;
              event.stopPropagation();
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-imagine-reference-edge-id", reference.sourceEdgeId);
              event.dataTransfer.setDragImage(getReferenceShelfDragImage(), 0, 0);
            }}
            onDragOver={(event) => {
              if (!canReorder) return;
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              if (!reference.sourceEdgeId) return;
              event.preventDefault();
              event.stopPropagation();
              const sourceEdgeId = event.dataTransfer.getData("application/x-imagine-reference-edge-id");
              if (!sourceEdgeId) return;
              onMoveReference(nodeId, sourceEdgeId, reference.sourceEdgeId);
            }}
            onDragEnd={(event) => {
              event.stopPropagation();
            }}
            className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/15 bg-slate-900 ${
              canReorder ? "cursor-grab active:cursor-grabbing" : ""
            }`}
            title={reference.role ? `参考 ${index + 1} · ${reference.role}` : `参考 ${index + 1}`}
          >
            {type === "image" ? (
              <PreviewImage src={reference.url} alt="" className="h-full w-full object-cover" />
            ) : type === "video" ? (
              <div className="flex h-full w-full items-center justify-center">
                <Video className="h-4 w-4 text-violet-200" />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Music className="h-4 w-4 text-cyan-200" />
              </div>
            )}
            <span className="absolute bottom-0 right-0 rounded-tl bg-black/65 px-1 text-[8px] font-semibold text-white">
              {index + 1}
            </span>
          </div>
        );
      })}
      {references.length > 6 ? (
        <span className="flex h-9 items-center rounded-md border border-white/10 px-2 text-[10px] font-semibold text-blue-100">
          +{references.length - 6}
        </span>
      ) : null}
    </div>
  );
}

function BoardNode({ data, selected }: NodeProps<BoardFlowNode>) {
  const { node } = data;
  const ports = getBoardNodePortDefinitions(node, { hasResultConnection: data.hasResultConnection });
  const handleForPort = (port: (typeof ports)[number]) => {
    if (port.id === BOARD_PORT_IDS.promptIn) {
      return <BoardHandle key={port.id} id={port.id} type="target" position={Position.Left} kind={port.kind} label={port.label} top={78} zone="segment" zoneHeight={64} />;
    }
    if (port.id === BOARD_PORT_IDS.referenceIn) {
      return <BoardHandle key={port.id} id={port.id} type="target" position={Position.Left} kind={port.kind} label={port.label} top={126} zone="segment" zoneHeight={64} />;
    }
    if (port.id === BOARD_PORT_IDS.agentContextIn) {
      return <BoardHandle key={port.id} id={port.id} type="target" position={Position.Left} kind={port.kind} label={port.label} top={92} zone="segment" zoneHeight={72} />;
    }
    return (
      <BoardHandle
        key={port.id}
        id={port.id}
        type={port.direction === "output" ? "source" : "target"}
        position={port.direction === "output" ? Position.Right : Position.Left}
        kind={port.kind}
        label={port.label}
      />
    );
  };

  return (
    <article
      className={`board-node-shell imagine-board-node h-full !overflow-visible !rounded-lg ${selected ? "imagine-board-node-selected" : ""}`}
      data-kind={node.kind}
      data-selected={selected ? "true" : "false"}
      style={{ height: node.size.height, width: node.size.width }}
    >
      {ports.map(handleForPort)}
      {selected && (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "runninghub-app") ? (
        <GenerateReferenceShelf
          nodeId={node.id}
          references={data.generateInputSummary?.referencePreviews ?? []}
          onMoveReference={data.onMoveGenerateReferenceEdge}
        />
      ) : null}

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
            boardId={data.boardId}
            node={node}
            compareReferenceUrl={data.compareReferenceUrl}
            onCaptureVideoFrame={data.onCaptureVideoFrame}
            onCompare={data.onOpenAssetCompare ? () => data.onOpenAssetCompare?.(node.id) : undefined}
            onEditImage={data.onEditAssetImage}
            onOpenFullscreen={data.onOpenFullscreen}
            onSendToAgent={data.onSendAssetToAgent}
            onSetAsReference={data.onSetAssetAsReference}
          />
        )}
        {node.kind === "prompt" && (
          <PromptBoardNode
            node={node}
            references={data.promptReferences}
            onChange={prompt => data.onUpdatePrompt(node.id, prompt)}
            onSelectReference={reference => data.onSelectPromptReference(node.id, reference)}
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
            hasResultConnection={data.hasResultConnection}
            inputSummary={data.generateInputSummary}
            node={node}
            references={data.generateReferences}
            resultItems={data.resultItems}
            showReferencePreviews={false}
            taskSummary={data.generateTaskSummary}
            onCancel={() => data.onCancelGenerate(node.id)}
            onExecute={() => data.onExecuteGenerate(node.id)}
            onMaterializeResult={assetId => data.onMaterializeGenerateResult(node.id, assetId)}
            onOpenResult={data.onOpenFullscreen}
            onSelectResult={assetId => data.onSelectGenerateResult(node.id, assetId)}
            onSelectReference={reference => data.onSelectPromptReference(node.id, reference)}
            onUpdate={input => data.onUpdateGenerate(node.id, input)}
          />
        )}
        {node.kind === "runninghub-app" && (
          <RunningHubAppBoardNode
            hasResultConnection={data.hasResultConnection}
            inputSummary={data.generateInputSummary}
            node={node}
            references={data.generateReferences}
            onExecute={() => data.onExecuteGenerate(node.id)}
            onFetchAppSchema={data.onFetchRunningHubAppSchema}
            onMaterializeResult={assetId => data.onMaterializeGenerateResult(node.id, assetId)}
            onOpenResult={data.onOpenFullscreen}
            onSelectResult={assetId => data.onSelectGenerateResult(node.id, assetId)}
            onSelectReference={reference => data.onSelectPromptReference(node.id, reference)}
            onUpdate={input => data.onUpdateRunningHubApp(node.id, input)}
            resultItems={data.resultItems}
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
