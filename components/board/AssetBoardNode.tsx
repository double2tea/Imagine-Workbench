import { Compass, Download, ImageDown, Maximize2, Music, Paintbrush, SlidersHorizontal, Video } from "lucide-react";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import { useMemo, useRef } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import BoardAudioWaveform from "@/components/board/BoardAudioWaveform";
import PreviewImage from "@/components/PreviewImage";
import useSelectedBoardVideoItem from "@/components/board/useSelectedBoardVideoItem";
import type { BoardAssetNode } from "@/lib/board";
import { buildStorageItem, type StorageItem } from "@/lib/db";
import type { CapturedVideoFrame } from "@/lib/video-frame";

interface AssetBoardNodeProps {
  activeStackAssetId?: string;
  boardId: string;
  compareReferenceUrl?: string | null;
  isSelected?: boolean;
  node: BoardAssetNode;
  onCaptureVideoFrame?: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onCompare?: () => void;
  onDownload?: (item: StorageItem) => void;
  onEditImage?: (nodeId: string) => void;
  onMeasureAspectRatio?: (nodeId: string, aspectRatio: number) => void;
  onOpenFullscreen?: (item: StorageItem) => void;
  onOpenPanorama?: (item: StorageItem) => void;
  onSelectStackAsset?: (assetId: string) => void;
  onSendToAgent?: (nodeId: string) => void;
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
      sourceBoardNodeId: node.id,
    },
    { boardId },
  );
}

function LightweightMediaPreview({ type }: { type: "audio" | "video" }) {
  const Icon = type === "audio" ? Music : Video;
  return (
    <div
      aria-label={type === "audio" ? "音频资产" : "视频资产"}
      className="board-media-preview flex h-full w-full items-center justify-center bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"
      role="img"
    >
      <Icon className="h-9 w-9 opacity-70" />
    </div>
  );
}

export default function AssetBoardNode({
  activeStackAssetId,
  boardId,
  compareReferenceUrl,
  isSelected = false,
  node,
  onCaptureVideoFrame,
  onCompare,
  onDownload,
  onEditImage,
  onMeasureAspectRatio,
  onOpenFullscreen,
  onOpenPanorama,
  onSelectStackAsset,
  onSendToAgent,
  stackItems = [],
}: AssetBoardNodeProps) {
  const item = useMemo(() => boardAssetToStorageItem(node, boardId), [boardId, node]);
  const stackCount = stackItems.length;
  const hasStackSwitcher = stackCount > 1;
  const isImagePreviewUrl = item.url.startsWith("data:image/");
  const shouldRenderAudio = node.asset.type === "audio" && isSelected && item.url.trim();
  const videoItem = useSelectedBoardVideoItem(item, isSelected);
  const shouldRenderVideoPlayer = videoItem !== null;
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);

  return (
    <div className="board-media-node group/board-video relative h-full min-h-0 overflow-visible">
      <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
        <div className="board-media-controls absolute left-2 top-2 z-30 flex gap-1 opacity-0 transition-opacity duration-200 hover:opacity-100 group-hover/board-video:opacity-100">
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
            <button
              type="button"
              onClick={() => onOpenPanorama?.(item)}
              className="imagine-board-asset-action imagine-panorama-action nodrag"
              title="360 全景查看"
            >
              <Compass className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {node.asset.type === "video" && onCaptureVideoFrame && shouldRenderVideoPlayer && (
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
        <button
          type="button"
          onClick={() => onDownload?.(item)}
          className="imagine-board-asset-action nodrag hover:bg-slate-700 hover:text-white"
          title="下载"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      {hasStackSwitcher && (
        <div className="board-media-stack-badge pointer-events-none absolute right-2 top-2 z-30 rounded-md bg-slate-950/45 px-2 py-1 text-xs font-semibold text-white/90 opacity-80 shadow-lg backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100">
          {stackCount}
        </div>
      )}
      {node.asset.type === "image" ? (
        <PreviewImage
          src={node.asset.url}
          alt={node.title}
          draggable={false}
          className="board-media-preview h-full w-full select-none object-cover"
          onLoad={event => {
            const image = event.currentTarget;
            if (image.naturalWidth > 0 && image.naturalHeight > 0) {
              onMeasureAspectRatio?.(node.id, image.naturalWidth / image.naturalHeight);
            }
          }}
        />
      ) : node.asset.type === "video" && shouldRenderVideoPlayer ? (
        <div className="board-media-player relative h-full w-full">
          <VideoAssetPlayer
            item={videoItem}
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
            showFullscreenButton={false}
          />
        </div>
      ) : node.asset.type === "video" && isImagePreviewUrl ? (
        <PreviewImage
          src={item.url}
          alt={node.title}
          draggable={false}
          className="board-media-preview h-full w-full select-none object-cover"
        />
      ) : node.asset.type === "audio" && shouldRenderAudio ? (
        <BoardAudioWaveform src={node.asset.url} />
      ) : (
        <LightweightMediaPreview type={node.asset.type} />
      )}
      </div>
      {hasStackSwitcher && (
        <div className="board-media-stack-switcher nodrag absolute -bottom-8 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-full border border-white/10 bg-slate-950/72 px-3 py-2 opacity-0 shadow-xl backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100">
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
