"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AudioLines, ImagePlus, Layers, LayoutGrid, Music, Video, Workflow, X } from "lucide-react";
import { t } from "@/lib/i18n";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import MediaReferenceThumbnail from "@/components/reference/MediaReferenceThumbnail";
import type {
  BoardAgentNode,
  BoardNode as BoardNodeModel,
  BoardPortKind,
} from "@/lib/board";
import AgentBoardNode from "@/components/board/AgentBoardNode";
import AssetBoardNode from "@/components/board/AssetBoardNode";
import GenerateBoardNode, { type BoardGenerateInputSummary, type BoardGenerateTaskSummary } from "@/components/board/GenerateBoardNode";
import MultiGridBoardNode from "@/components/board/MultiGridBoardNode";
import NoteBoardNode from "@/components/board/NoteBoardNode";
import PromptBoardNode from "@/components/board/PromptBoardNode";
import ReferenceGroupBoardNode from "@/components/board/ReferenceGroupBoardNode";
import ResultBoardNode from "@/components/board/ResultBoardNode";
import RunningHubAppBoardNode from "@/components/board/RunningHubAppBoardNode";
import type { StorageItem } from "@/lib/db";
import type { BoardPromptReference } from "@/lib/board/prompt-references";
import { BOARD_PORT_IDS, getBoardNodePortDefinitions } from "@/lib/board/ports";
import { useBoardNodeCallbacks } from "@/lib/board/callbacks";

export interface BoardFlowNodeData extends Record<string, unknown> {
  boardId: string;
  compareReferenceUrl?: string | null;
  generateInputSummary?: BoardGenerateInputSummary;
  generateReferences?: BoardPromptReference[];
  generateTaskSummary?: BoardGenerateTaskSummary;
  connectedResultNodeId?: string;
  hasResultConnection?: boolean;
  isBatchSelectionActive?: boolean;
  isUnviewedGeneratedAsset?: boolean;
  node: BoardNodeModel;
  promptReferences?: BoardPromptReference[];
  assetStackItems?: StorageItem[];
  resultItems?: StorageItem[];
}

export type BoardFlowNode = Node<BoardFlowNodeData, "board">;

type BoardHandleZone = "edge" | "segment";

const EMPTY_BOARD_PROMPT_REFERENCES: BoardPromptReference[] = [];
const EMPTY_STORAGE_ITEMS: StorageItem[] = [];

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
  if (node.kind === "asset" || node.kind === "result") {
    if (node.asset.type === "image") return <ImagePlus className="imagine-tone-icon h-3.5 w-3.5" data-tone="accent" />;
    if (node.asset.type === "video") return <Video className="imagine-tone-icon h-3.5 w-3.5" data-tone="violet" />;
    return <Music className="imagine-tone-icon h-3.5 w-3.5" data-tone="info" />;
  }
  if (node.kind === "image-generate") return <ImagePlus className="imagine-tone-icon h-3.5 w-3.5" data-tone="accent" />;
  if (node.kind === "video-generate") return <Video className="imagine-tone-icon h-3.5 w-3.5" data-tone="violet" />;
  if (node.kind === "audio-operation") return <AudioLines className="imagine-tone-icon h-3.5 w-3.5" data-tone="info" />;
  if (node.kind === "runninghub-app") return <Workflow className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />;
  if (node.kind === "agent") return <AgentIdentityMark variant="inline" />;
  if (node.kind === "reference-group") return <Layers className="imagine-tone-icon h-3.5 w-3.5" data-tone="info" />;
  if (node.kind === "group") return <Layers className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />;
  if (node.kind === "multi-grid") return <LayoutGrid className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" />;
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
  return (
    <Handle
      id={id}
      type={type}
      position={position}
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
  if (kind === "asset" || kind === "result" || kind === "prompt" || kind === "runninghub-app") {
    return "overflow-visible";
  }
  if (kind === "group") return "overflow-visible";
  return "overflow-hidden";
}

function getReferenceShelfDragImage(): HTMLCanvasElement {
  const dragImage = document.createElement("canvas");
  dragImage.width = 1;
  dragImage.height = 1;
  return dragImage;
}

function GenerateReferenceShelf({
  nodeId,
  onFocusReferenceSource,
  onMoveReference,
  onRemoveReference,
  references,
}: {
  nodeId: string;
  onFocusReferenceSource: (nodeId: string) => void;
  onMoveReference: (nodeId: string, sourceEdgeId: string, targetEdgeId: string) => void;
  onRemoveReference: (sourceEdgeId: string) => void;
  references: BoardGenerateInputSummary["referencePreviews"];
}) {
  if (references.length === 0) return null;
  const visibleReferences = references.slice(0, 6);
  const edgeUseCounts = new Map<string, number>();
  for (const reference of visibleReferences) {
    if (!reference.sourceEdgeId) continue;
    edgeUseCounts.set(reference.sourceEdgeId, (edgeUseCounts.get(reference.sourceEdgeId) ?? 0) + 1);
  }
  return (
    <div className="nodrag nopan absolute -top-12 left-0 z-40 flex max-w-full gap-1 overflow-hidden rounded-lg border border-blue-400/20 bg-slate-950/88 p-1 shadow-xl backdrop-blur">
      {visibleReferences.map((reference, index) => {
        const canManageEdge = typeof reference.sourceEdgeId === "string" && edgeUseCounts.get(reference.sourceEdgeId) === 1;
        const canReorder = canManageEdge;
        const sourceLabel = reference.sourceTitle ?? t("board.node.sourceNode");
        const roleLabel = reference.role === "start"
          ? t("board.node.videoReferenceModes.firstLast")
          : reference.role === "end"
            ? t("board.node.videoReferenceModes.reference")
            : t("board.node.videoReferenceModes.reference");
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
            className={`group/reference relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/15 bg-slate-900 ${
              canReorder ? "cursor-grab active:cursor-grabbing" : ""
            }`}
            title={`${roleLabel} ${index + 1} · ${sourceLabel}`}
          >
            <button
              type="button"
              disabled={!reference.sourceNodeId}
              onClick={(event) => {
                event.stopPropagation();
                if (reference.sourceNodeId) onFocusReferenceSource(reference.sourceNodeId);
              }}
              className="h-full w-full"
              title={`${sourceLabel} · ${t("board.node.jumpToSource")}`}
            >
              <MediaReferenceThumbnail reference={reference} alt="" className="h-full w-full" />
            </button>
            <span className="pointer-events-none absolute bottom-0 left-0 rounded-tr bg-black/65 px-1 text-[8px] font-semibold text-white">
              {roleLabel}
            </span>
            <span className="pointer-events-none absolute bottom-0 right-0 rounded-tl bg-black/65 px-1 text-[8px] font-semibold text-white">
              {index + 1}
            </span>
            {canManageEdge ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (reference.sourceEdgeId) onRemoveReference(reference.sourceEdgeId);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl border-b border-l border-white/25 bg-red-500/90 text-white opacity-0 transition hover:bg-red-400 focus-visible:opacity-100 group-hover/reference:opacity-100"
                title={t("board.node.removeReferenceConnection")}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            ) : null}
          </div>
        );
      })}
      {references.length > 6 ? (
        <span className="imagine-tone-chip flex h-9 items-center rounded-md border px-2 text-[10px] font-semibold" data-tone="accent">
          +{references.length - 6}
        </span>
      ) : null}
    </div>
  );
}

function BoardNode({ data, selected }: NodeProps<BoardFlowNode>) {
  const c = useBoardNodeCallbacks();
  const { node } = data;
  const connectedResultNodeId = data.connectedResultNodeId;
  const focusConnectedResultNode = connectedResultNodeId ? () => c.onFocusNode(connectedResultNodeId) : undefined;
  const isMediaNode = node.kind === "asset" || node.kind === "result";
  const isBatchSelectionActive = data.isBatchSelectionActive === true;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(node.title);
  const ports = useMemo(
    () => getBoardNodePortDefinitions(node, { hasResultConnection: data.hasResultConnection }),
    [data.hasResultConnection, node],
  );

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(currentTitle => currentTitle === node.title ? currentTitle : node.title);
    }
  }, [isEditingTitle, node.title]);

  const commitTitleEdit = () => {
    setIsEditingTitle(false);
    if (draftTitle !== node.title) c.onUpdateNodeTitle(node.id, draftTitle);
  };

  const handleForPort = (port: (typeof ports)[number]) => {
    if (port.id === BOARD_PORT_IDS.promptIn) {
      return (
        <BoardHandle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          kind={port.kind}
          label={port.label}
          top={78}
          zone="segment"
          zoneHeight={64}
        />
      );
    }
    if (port.id === BOARD_PORT_IDS.referenceIn) {
      return (
        <BoardHandle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          kind={port.kind}
          label={port.label}
          top={126}
          zone="segment"
          zoneHeight={64}
        />
      );
    }
    if (port.id === BOARD_PORT_IDS.agentContextIn) {
      return (
        <BoardHandle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          kind={port.kind}
          label={port.label}
          top={92}
          zone="segment"
          zoneHeight={72}
        />
      );
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

  if (node.kind === "group") {
    return (
      <article
        className="board-node-shell board-group-node-shell relative h-full rounded-lg"
        data-kind={node.kind}
        data-selected={selected ? "true" : "false"}
        style={{ height: node.size.height, width: node.size.width }}
      >
        <div className="absolute -top-3 left-3 z-10 flex h-8 max-w-full items-center gap-2">
          {isEditingTitle ? (
            <input
              autoFocus
              className="nodrag board-group-node-title-input pointer-events-auto"
              value={draftTitle}
              onBlur={commitTitleEdit}
              onChange={event => setDraftTitle(event.target.value)}
              onDoubleClick={event => event.stopPropagation()}
              onKeyDown={event => {
                if (event.key === "Enter") commitTitleEdit();
                if (event.key === "Escape") {
                  setDraftTitle(node.title);
                  setIsEditingTitle(false);
                }
              }}
              onPointerDown={event => event.stopPropagation()}
            />
          ) : (
            <h2
              className="board-group-node-title pointer-events-auto flex min-w-0 items-center gap-2 truncate"
              title="Double-click to rename"
              onDoubleClick={event => {
                event.stopPropagation();
                setDraftTitle(node.title);
                setIsEditingTitle(true);
              }}
            >
              {nodeIcon(node)}
              <span className="truncate">{node.title}</span>
            </h2>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`board-node-shell imagine-board-node h-full !overflow-visible !rounded-lg ${selected ? "imagine-board-node-selected" : ""}`}
      data-kind={node.kind}
      data-selected={selected ? "true" : "false"}
      style={{ height: node.size.height, width: node.size.width }}
    >
      {node.kind !== "multi-grid" && ports.map(handleForPort)}
      {selected && (node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation" || node.kind === "runninghub-app") ? (
        <GenerateReferenceShelf
          nodeId={node.id}
          references={data.generateInputSummary?.referencePreviews ?? []}
          onFocusReferenceSource={c.onFocusReferenceSource}
          onMoveReference={c.onMoveGenerateReferenceEdge}
          onRemoveReference={c.onRemoveGenerateReferenceEdge}
        />
      ) : null}

      <div
        className={[
          "flex items-center",
          isMediaNode
            ? "pointer-events-none absolute -top-5 left-1 z-30 h-5 max-w-[calc(100%-0.5rem)] gap-1 board-asset-node-chrome"
            : "h-9 gap-2 rounded-t-lg px-3 imagine-board-node-header",
        ].join(" ")}
      >
        {isEditingTitle ? (
          <input
            autoFocus
            className={[
              "nodrag pointer-events-auto min-w-0 rounded-md border border-blue-400 bg-[var(--iw-panel)] font-semibold text-[var(--iw-text)] outline-none ring-2 ring-blue-500/20",
              isMediaNode ? "h-5 w-36 px-1.5 text-[10px]" : "h-7 w-full px-2 text-xs",
            ].join(" ")}
            value={draftTitle}
            onBlur={commitTitleEdit}
            onChange={event => setDraftTitle(event.target.value)}
            onDoubleClick={event => event.stopPropagation()}
            onKeyDown={event => {
              if (event.key === "Enter") commitTitleEdit();
              if (event.key === "Escape") {
                setDraftTitle(node.title);
                setIsEditingTitle(false);
              }
            }}
            onPointerDown={event => event.stopPropagation()}
          />
        ) : (
          <h2
            className={[
              "pointer-events-auto flex min-w-0 items-center truncate font-semibold text-[var(--iw-text)]",
              isMediaNode
                ? "gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-[var(--iw-muted)] [&>svg]:h-3 [&>svg]:w-3"
                : "gap-2 text-xs",
            ].join(" ")}
            title="Double-click to rename"
            onDoubleClick={event => {
              event.stopPropagation();
              setDraftTitle(node.title);
              setIsEditingTitle(true);
            }}
          >
            {nodeIcon(node)}
            <span className="truncate">{node.title}</span>
          </h2>
        )}
      </div>
      <div
        className={[
          isMediaNode ? "h-full rounded-lg" : "h-[calc(100%-2.25rem)] rounded-b-lg",
          "min-h-0",
          nodeBodyOverflowClass(node.kind),
        ].join(" ")}
      >
        {node.kind === "asset" && (
          <AssetBoardNode
            boardId={data.boardId}
            isBatchSelectionActive={isBatchSelectionActive}
            isSelected={selected === true}
            isUnviewed={data.isUnviewedGeneratedAsset === true}
            node={node}
            activeStackAssetId={node.asset.assetId}
            stackItems={data.assetStackItems ?? EMPTY_STORAGE_ITEMS}
            compareReferenceUrl={data.compareReferenceUrl}
            onAnalyzeMedia={c.onAnalyzeBoardMedia}
            onCancelProcessing={c.onCancelAssetTask}
            onCaptureVideoFrame={c.onCaptureVideoFrame}
            onCompare={c.onOpenAssetCompare ? () => c.onOpenAssetCompare?.(node.id) : undefined}
            onEditImage={c.onEditAssetImage}
            onImageQuickEdit={c.onImageQuickEdit}
            onDownload={item => c.onDownloadAsset(item, node.title)}
            onMeasureAspectRatio={c.onMeasureAssetAspectRatio}
            onOpenFullscreen={c.onOpenFullscreen}
            onOpenPanorama={c.onOpenPanorama}
            onSaveVoiceProfile={c.onSaveVoiceProfile}
            onSelectStackAsset={assetId => c.onSelectAssetStackResult(node.id, assetId)}
            onSendToAgent={c.onSendAssetToAgent}
            onSplitImageGrid={c.onSplitImageGrid}
          />
        )}
        {node.kind === "result" && (
          <ResultBoardNode
            boardId={data.boardId}
            isBatchSelectionActive={isBatchSelectionActive}
            isSelected={selected === true}
            isUnviewed={data.isUnviewedGeneratedAsset === true}
            node={node}
            stackItems={data.assetStackItems ?? EMPTY_STORAGE_ITEMS}
            onAnalyzeMedia={c.onAnalyzeBoardMedia}
            onCaptureVideoFrame={c.onCaptureVideoFrame}
            onImageQuickEdit={c.onImageQuickEdit}
            onDownload={item => c.onDownloadAsset(item, node.title)}
            onMeasureAspectRatio={c.onMeasureAssetAspectRatio}
            onOpenFullscreen={c.onOpenFullscreen}
            onOpenPanorama={c.onOpenPanorama}
            onSaveVoiceProfile={c.onSaveVoiceProfile}
            onSelectStackAsset={assetId => c.onSelectAssetStackResult(node.id, assetId)}
            onSplitImageGrid={c.onSplitImageGrid}
          />
        )}
        {node.kind === "prompt" && (
          <PromptBoardNode
            node={node}
            references={data.promptReferences ?? EMPTY_BOARD_PROMPT_REFERENCES}
            onChange={prompt => c.onUpdatePrompt(node.id, prompt)}
            onExecute={() => c.onExecutePrompt(node.id)}
            onSelectReference={reference => c.onSelectPromptReference(node.id, reference)}
          />
        )}
        {node.kind === "reference-group" && (
          <ReferenceGroupBoardNode
            node={node}
            onMove={(assetId, direction) => c.onMoveReferenceGroupItem(node.id, assetId, direction)}
            onRemove={assetId => c.onRemoveReferenceGroupItem(node.id, assetId)}
            onRoleChange={(assetId, role) => c.onUpdateReferenceGroupItemRole(node.id, assetId, role)}
          />
        )}
        {node.kind === "multi-grid" && (
          <MultiGridBoardNode
            node={node}
            onExtractItem={(assetId, clientX, clientY) => c.onExtractMultiGridItem(node.id, assetId, clientX, clientY)}
            onExport={() => c.onExportMultiGrid(node.id)}
            onResize={size => c.onUpdateNodeSize(node.id, size)}
            onUpdate={input => c.onUpdateMultiGrid(node.id, input)}
            onUpdateItemTransform={(assetId, transform) => c.onUpdateMultiGridItemTransform(node.id, assetId, transform)}
          />
        )}
        {(node.kind === "image-generate" || node.kind === "video-generate" || node.kind === "audio-operation") && (
          <GenerateBoardNode
            hasResultConnection={data.hasResultConnection}
            inputSummary={data.generateInputSummary}
            node={node}
            references={data.generateReferences ?? EMPTY_BOARD_PROMPT_REFERENCES}
            resultItems={data.resultItems ?? EMPTY_STORAGE_ITEMS}
            showReferencePreviews={false}
            taskSummary={data.generateTaskSummary}
            onCancel={() => c.onCancelGenerate(node.id)}
            onExecute={() => c.onExecuteGenerate(node.id)}
            onFocusResultNode={focusConnectedResultNode}
            onSelectReference={reference => c.onSelectPromptReference(node.id, reference)}
            onUpdate={input => c.onUpdateGenerate(node.id, input)}
          />
        )}
        {node.kind === "runninghub-app" && (
          <RunningHubAppBoardNode
            hasResultConnection={data.hasResultConnection}
            inputSummary={data.generateInputSummary}
            node={node}
            references={data.generateReferences ?? EMPTY_BOARD_PROMPT_REFERENCES}
            onExecute={() => c.onExecuteGenerate(node.id)}
            onFetchAppSchema={c.onFetchRunningHubAppSchema}
            onFocusResultNode={focusConnectedResultNode}
            onSelectReference={reference => c.onSelectPromptReference(node.id, reference)}
            onUpdate={input => c.onUpdateRunningHubApp(node.id, input)}
            resultItems={data.resultItems ?? EMPTY_STORAGE_ITEMS}
          />
        )}
        {node.kind === "agent" && (
          <AgentBoardNode
            node={node as BoardAgentNode}
            onSend={() => c.onSendAgent(node.id)}
            onUpdate={(instruction) => c.onUpdateAgent(node.id, instruction)}
          />
        )}
        {node.kind === "note" && <NoteBoardNode node={node} onChange={body => c.onUpdateNote(node.id, body)} />}
      </div>
    </article>
  );
}

function sameBoardNodeProps(previous: NodeProps<BoardFlowNode>, next: NodeProps<BoardFlowNode>): boolean {
  return previous.selected === next.selected && previous.data === next.data;
}

export default memo(BoardNode, sameBoardNodeProps);
