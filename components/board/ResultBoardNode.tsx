import { Compass, Download, ImageDown, Maximize2, Mic2, Music, Paintbrush, Scissors, Video, X } from "lucide-react";
import { memo, useMemo, useRef } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import BoardAudioWaveform from "@/components/board/BoardAudioWaveform";
import PreviewImage from "@/components/PreviewImage";
import useBoardAudioItem from "@/components/board/useBoardAudioItem";
import useSelectedBoardVideoItem from "@/components/board/useSelectedBoardVideoItem";
import type { BoardResultNode } from "@/lib/board";
import { compactBoardModelLabel } from "@/lib/board/provenance";
import { buildStorageItem, type StorageItem } from "@/lib/db";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import type { CapturedVideoFrame } from "@/lib/video-frame";

interface ResultBoardNodeProps {
  boardId: string;
  isSelected?: boolean;
  node: BoardResultNode;
  stackItems: StorageItem[];
  onCaptureVideoFrame?: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onDownload?: (item: StorageItem) => void;
  onImageQuickEdit?: (nodeId: string, operation: ImageEditFeature) => void;
  onMeasureAspectRatio?: (nodeId: string, aspectRatio: number) => void;
  onOpenFullscreen?: (item: StorageItem) => void;
  onOpenPanorama?: (item: StorageItem) => void;
  onSaveVoiceProfile?: (item: StorageItem) => void;
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
      className="board-media-preview flex h-full w-full items-center justify-center bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"
      role="img"
    >
      <Icon className="h-9 w-9 opacity-70" />
    </div>
  );
}

const ResultBoardNode = memo(function ResultBoardNode({
  boardId,
  isSelected = false,
  node,
  stackItems,
  onCaptureVideoFrame,
  onDownload,
  onImageQuickEdit,
  onMeasureAspectRatio,
  onOpenFullscreen,
  onOpenPanorama,
  onSaveVoiceProfile,
  onSelectStackAsset,
}: ResultBoardNodeProps) {
  const fallbackItem = useMemo(() => resultNodeToStorageItem(node, boardId), [boardId, node]);
  const item = useMemo(
    () => stackItems.find(stackItem => stackItem.id === node.activeAssetId) ?? fallbackItem,
    [fallbackItem, node.activeAssetId, stackItems],
  );
  const hasStackSwitcher = stackItems.length > 1;
  const isImagePreviewUrl = item.url.startsWith("data:image/");
  const audioItem = useBoardAudioItem(item);
  const playableAudioItem = audioItem ?? (item.type === "audio" && item.url.trim() ? item : null);
  const videoItem = useSelectedBoardVideoItem(item, isSelected);
  const shouldRenderVideoPlayer = videoItem !== null;
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);

  return (
    <div className="board-media-node group/board-video relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
      <div className="board-media-controls absolute left-2 top-2 z-30 flex gap-1 opacity-0 transition-opacity duration-200 hover:opacity-100 group-hover/board-video:opacity-100">
        {item.type === "image" && (
          <>
            <button
              type="button"
              onClick={() => onImageQuickEdit?.(node.id, "redraw")}
              className="imagine-board-asset-action nodrag text-sky-200 hover:border-sky-500/40 hover:bg-sky-600 hover:text-white"
              title="重绘"
            >
              <Paintbrush className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onImageQuickEdit?.(node.id, "erase")}
              className="imagine-board-asset-action nodrag text-rose-200 hover:border-rose-500/40 hover:bg-rose-600 hover:text-white"
              title="擦除"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onImageQuickEdit?.(node.id, "outpaint")}
              className="imagine-board-asset-action nodrag text-indigo-200 hover:border-indigo-500/40 hover:bg-indigo-600 hover:text-white"
              title="扩图"
            >
              <ImageDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onImageQuickEdit?.(node.id, "cutout")}
              className="imagine-board-asset-action nodrag text-emerald-200 hover:border-emerald-500/40 hover:bg-emerald-600 hover:text-white"
              title="抠图"
            >
              <Scissors className="h-3.5 w-3.5" />
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
        {item.type === "video" && onCaptureVideoFrame && shouldRenderVideoPlayer && (
          <button
            type="button"
            onClick={() => void captureVideoFrameRef.current?.("current")}
            className="imagine-board-asset-action nodrag text-cyan-200 hover:border-cyan-500/40 hover:bg-cyan-600 hover:text-white"
            title="截取当前帧"
          >
            <ImageDown className="h-3.5 w-3.5" />
          </button>
        )}
        {item.type === "audio" && onSaveVoiceProfile && (
          <button
            type="button"
            onClick={() => onSaveVoiceProfile?.(item)}
            className="imagine-board-asset-action nodrag text-cyan-200 hover:border-cyan-500/40 hover:bg-cyan-600 hover:text-white"
            title="保存为克隆音色"
          >
            <Mic2 className="h-3.5 w-3.5" />
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
          {stackItems.length}
        </div>
      )}
      <div
        className="board-media-meta pointer-events-none absolute bottom-2 left-2 z-30 max-w-[calc(100%-1rem)] rounded-md bg-slate-950/72 px-2 py-1 text-[10px] font-semibold text-white/90 opacity-0 shadow-lg backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100"
        title={compactBoardModelLabel(item.model)}
      >
        <span className="block truncate">{item.type} · {compactBoardModelLabel(item.model)}</span>
      </div>
      {item.type === "image" ? (
        <PreviewImage
          src={item.url}
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
      ) : item.type === "video" && shouldRenderVideoPlayer ? (
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
      ) : item.type === "video" && isImagePreviewUrl ? (
        <PreviewImage
          src={item.url}
          alt={node.title}
          draggable={false}
          className="board-media-preview h-full w-full select-none object-cover"
        />
      ) : playableAudioItem ? (
        <BoardAudioWaveform src={playableAudioItem.url} interactive={isSelected} />
      ) : item.type === "audio" || item.type === "video" ? (
        <LightweightMediaPreview type={item.type} />
      ) : (
        <LightweightMediaPreview type="audio" />
      )}
      {hasStackSwitcher && (
        <div className="board-media-stack-switcher nodrag absolute -bottom-8 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-full border border-white/10 bg-slate-950/72 px-3 py-2 opacity-0 shadow-xl backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100">
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
});

export default ResultBoardNode;
