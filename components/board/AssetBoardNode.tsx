import { Download, ImageDown, Maximize2, Paintbrush, Send, SlidersHorizontal } from "lucide-react";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import { useRef } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import BoardAudioWaveform from "@/components/board/BoardAudioWaveform";
import PreviewImage from "@/components/PreviewImage";
import type { BoardAssetNode } from "@/lib/board";
import { buildStorageItem, type StorageItem } from "@/lib/db";
import { mediaReferenceFileExtension, mediaReferenceMimeFromDataUri } from "@/lib/media-references";
import type { CapturedVideoFrame } from "@/lib/video-frame";

interface AssetBoardNodeProps {
  activeStackAssetId?: string;
  boardId: string;
  compareReferenceUrl?: string | null;
  node: BoardAssetNode;
  onCaptureVideoFrame?: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onCompare?: () => void;
  onEditImage?: (nodeId: string) => void;
  onMeasureAspectRatio?: (nodeId: string, aspectRatio: number) => void;
  onOpenFullscreen?: (item: StorageItem) => void;
  onSelectStackAsset?: (assetId: string) => void;
  onSendToAgent?: (nodeId: string) => void;
  onSetAsReference?: (nodeId: string) => void;
  stackItems?: StorageItem[];
}

function boardAssetToStorageItem(node: BoardAssetNode, boardId: string): StorageItem {
  return buildStorageItem(
    {
      id: node.asset.assetId,
      type: node.asset.type,
      url: node.asset.url,
      prompt: node.asset.prompt,
      model: node.asset.model,
      aspectRatio: "auto",
      createdAt: node.createdAt,
      status: "complete",
      progress: 100,
    },
    { boardId },
  );
}

function boardAssetExtension(asset: BoardAssetNode["asset"]): string {
  return mediaReferenceFileExtension(mediaReferenceMimeFromDataUri(asset.url), asset.type);
}

export default function AssetBoardNode({
  activeStackAssetId,
  boardId,
  compareReferenceUrl,
  node,
  onCaptureVideoFrame,
  onCompare,
  onEditImage,
  onMeasureAspectRatio,
  onOpenFullscreen,
  onSelectStackAsset,
  onSendToAgent,
  onSetAsReference,
  stackItems = [],
}: AssetBoardNodeProps) {
  const item = boardAssetToStorageItem(node, boardId);
  const stackCount = stackItems.length;
  const hasStackSwitcher = stackCount > 1;
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);

  return (
    <div className="group/board-video relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
      <div className="absolute left-2 top-2 z-30 flex gap-1 opacity-0 transition-opacity duration-200 hover:opacity-100 group-hover/board-video:opacity-100">
        {node.asset.type === "image" && (
          <>
            {compareReferenceUrl && onCompare && (
              <button
                type="button"
                onClick={onCompare}
                className="imagine-board-asset-action nodrag text-blue-200 hover:border-blue-500/40 hover:bg-blue-600 hover:text-white"
                title="对比参考图"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onSetAsReference?.(node.id)}
              className="imagine-board-asset-action nodrag text-cyan-200 hover:border-cyan-500/40 hover:bg-cyan-600 hover:text-white"
              title="设为参考图"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSendToAgent?.(node.id)}
              className="imagine-board-asset-action nodrag text-purple-200 hover:border-purple-500/40 hover:bg-purple-600 hover:text-white"
              title="发送给 Agent"
            >
              <AgentIdentityMark variant="inline" />
            </button>
            <button
              type="button"
              onClick={() => onEditImage?.(node.id)}
              className="imagine-board-asset-action nodrag text-amber-200 hover:border-amber-500/40 hover:bg-amber-600 hover:text-white"
              title="局部编辑"
            >
              <Paintbrush className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {node.asset.type === "video" && onCaptureVideoFrame && (
          <button
            type="button"
            onClick={() => void captureVideoFrameRef.current?.("current")}
            className="imagine-board-asset-action nodrag text-cyan-200 hover:border-cyan-500/40 hover:bg-cyan-600 hover:text-white"
            title="截取当前帧"
          >
            <ImageDown className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenFullscreen?.(item)}
          className="imagine-board-asset-action nodrag hover:bg-slate-700 hover:text-white"
          title="全屏预览"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <a
          href={node.asset.url}
          download={`${node.asset.assetId}.${boardAssetExtension(node.asset)}`}
          className="imagine-board-asset-action nodrag hover:bg-slate-700 hover:text-white"
          title="下载"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
      {hasStackSwitcher && (
        <div className="pointer-events-none absolute right-2 top-2 z-30 rounded-md bg-slate-950/80 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100">
          {stackCount}
        </div>
      )}
      {node.asset.type === "image" ? (
        <PreviewImage
          src={node.asset.url}
          alt={node.title}
          className="h-full w-full object-cover"
          onLoad={event => {
            const image = event.currentTarget;
            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
              onMeasureAspectRatio?.(node.id, image.naturalWidth / image.naturalHeight);
            }
          }}
        />
      ) : node.asset.type === "audio" ? (
        <BoardAudioWaveform src={node.asset.url} />
      ) : (
        <div className="relative h-full w-full">
          <VideoAssetPlayer
            item={item}
            controlsVisibility="hover"
            loop={false}
            className="h-full w-full object-cover"
            onAspectRatio={aspectRatio => onMeasureAspectRatio?.(node.id, aspectRatio)}
            onCaptureFrame={
              onCaptureVideoFrame
                ? (sourceItem, frame) => onCaptureVideoFrame(node.id, sourceItem, frame)
                : undefined
            }
            onCaptureFrameRequestReady={request => {
              captureVideoFrameRef.current = request;
            }}
          />
        </div>
      )}
      {hasStackSwitcher && (
        <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-2 opacity-0 transition-opacity duration-200 group-hover/board-video:opacity-100">
          {stackItems.map((stackItem, index) => {
            const isActive = stackItem.id === (activeStackAssetId ?? node.asset.assetId);
            return (
              <button
                key={stackItem.id}
                type="button"
                className={[
                  "nodrag h-2 rounded-full transition",
                  isActive ? "w-9 bg-white" : "w-7 bg-white/35 hover:bg-white/70",
                ].join(" ")}
                title={`版本 ${index + 1}`}
                aria-label={`切换到版本 ${index + 1}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isActive) onSelectStackAsset?.(stackItem.id);
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
