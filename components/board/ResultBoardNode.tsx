import { Compass, Download, ImageDown, Maximize2, Music, Video } from "lucide-react";
import { useRef } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import BoardAudioWaveform from "@/components/board/BoardAudioWaveform";
import PreviewImage from "@/components/PreviewImage";
import type { BoardResultNode } from "@/lib/board";
import { buildStorageItem, type StorageItem } from "@/lib/db";
import type { CapturedVideoFrame } from "@/lib/video-frame";

interface ResultBoardNodeProps {
  boardId: string;
  isSelected?: boolean;
  node: BoardResultNode;
  stackItems: StorageItem[];
  onCaptureVideoFrame?: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onDownload?: (item: StorageItem) => void;
  onMeasureAspectRatio?: (nodeId: string, aspectRatio: number) => void;
  onOpenFullscreen?: (item: StorageItem) => void;
  onOpenPanorama?: (item: StorageItem) => void;
  onSelectStackAsset?: (assetId: string) => void;
}

function resultNodeToStorageItem(node: BoardResultNode, boardId: string): StorageItem {
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
      sourceBoardResultStackKey: node.resultStackKey,
    },
    { boardId },
  );
}

function LightweightMediaPreview({ type }: { type: "audio" | "video" }) {
  const Icon = type === "audio" ? Music : Video;
  return (
    <div
      aria-label={type === "audio" ? "音频结果" : "视频结果"}
      className="flex h-full w-full items-center justify-center bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"
      role="img"
    >
      <Icon className="h-9 w-9 opacity-70" />
    </div>
  );
}

export default function ResultBoardNode({
  boardId,
  isSelected = false,
  node,
  stackItems,
  onCaptureVideoFrame,
  onDownload,
  onMeasureAspectRatio,
  onOpenFullscreen,
  onOpenPanorama,
  onSelectStackAsset,
}: ResultBoardNodeProps) {
  const item = resultNodeToStorageItem(node, boardId);
  const hasStackSwitcher = stackItems.length > 1;
  const isImagePreviewUrl = item.url.startsWith("data:image/");
  const isPlayableVideoUrl =
    item.url.startsWith("data:video/") ||
    item.url.startsWith("blob:") ||
    item.url.startsWith("http://") ||
    item.url.startsWith("https://");
  const shouldRenderAudio = node.asset.type === "audio" && isSelected && item.url.trim();
  const shouldRenderVideoPlayer = node.asset.type === "video" && isSelected && isPlayableVideoUrl;
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);

  return (
    <div className="group/board-video relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
      <div className="absolute left-2 top-2 z-30 flex gap-1 opacity-0 transition-opacity duration-200 hover:opacity-100 group-hover/board-video:opacity-100">
        {node.asset.type === "image" && (
          <button
            type="button"
            onClick={() => onOpenPanorama?.(item)}
            className="imagine-board-asset-action imagine-panorama-action nodrag"
            title="360 全景查看"
          >
            <Compass className="h-3.5 w-3.5" />
          </button>
        )}
        {node.asset.type === "video" && onCaptureVideoFrame && isSelected && isPlayableVideoUrl && (
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
        <div className="pointer-events-none absolute right-2 top-2 z-30 rounded-md bg-slate-950/80 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100">
          {stackItems.length}
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
      ) : node.asset.type === "video" && isImagePreviewUrl ? (
        <PreviewImage
          src={item.url}
          alt={node.title}
          className="h-full w-full object-cover"
        />
      ) : node.asset.type === "audio" && shouldRenderAudio ? (
        <BoardAudioWaveform src={node.asset.url} />
      ) : node.asset.type === "video" && shouldRenderVideoPlayer ? (
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
            showFullscreenButton={false}
          />
        </div>
      ) : (
        <LightweightMediaPreview type={node.asset.type} />
      )}
      {hasStackSwitcher && (
        <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-2 opacity-0 transition-opacity duration-200 group-hover/board-video:opacity-100">
          {stackItems.map((stackItem, index) => {
            const isActive = stackItem.id === node.activeAssetId;
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
