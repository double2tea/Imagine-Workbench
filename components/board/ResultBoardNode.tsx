import { Compass, Download, Eraser, Expand, Frame, Maximize2, Mic2, Music, Scissors, Sparkles, Video, WandSparkles } from "lucide-react";
import { memo, useMemo, useRef } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import BoardAudioWaveform from "@/components/board/BoardAudioWaveform";
import BoardMediaActionBar, { type BoardMediaActionGroup } from "@/components/board/BoardMediaActionBar";
import PreviewImage from "@/components/PreviewImage";
import useBoardAudioItem from "@/components/board/useBoardAudioItem";
import useSelectedBoardVideoItem from "@/components/board/useSelectedBoardVideoItem";
import type { BoardResultNode } from "@/lib/board";
import { buildStorageItem, type StorageItem } from "@/lib/db";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import type { CapturedVideoFrame } from "@/lib/video-frame";

interface ResultBoardNodeProps {
  boardId: string;
  isSelected?: boolean;
  node: BoardResultNode;
  stackItems: StorageItem[];
  onAnalyzeMedia?: (nodeId: string) => void | Promise<void>;
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
  onAnalyzeMedia,
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
  const actionGroups: BoardMediaActionGroup[] = [
    {
      id: "edit",
      actions: item.type === "image"
        ? [
            {
              id: "redraw",
              icon: <WandSparkles className="h-3.5 w-3.5" />,
              onClick: () => onImageQuickEdit?.(node.id, "redraw"),
              title: "重绘",
              toneClassName: "text-sky-200 hover:border-sky-500/40 hover:bg-sky-600 hover:text-white",
            },
            {
              id: "erase",
              icon: <Eraser className="h-3.5 w-3.5" />,
              onClick: () => onImageQuickEdit?.(node.id, "erase"),
              title: "擦除",
              toneClassName: "text-rose-200 hover:border-rose-500/40 hover:bg-rose-600 hover:text-white",
            },
            {
              id: "outpaint",
              icon: <Expand className="h-3.5 w-3.5" />,
              onClick: () => onImageQuickEdit?.(node.id, "outpaint"),
              title: "扩图",
              toneClassName: "text-indigo-200 hover:border-indigo-500/40 hover:bg-indigo-600 hover:text-white",
            },
            {
              id: "cutout",
              icon: <Scissors className="h-3.5 w-3.5" />,
              onClick: () => onImageQuickEdit?.(node.id, "cutout"),
              title: "抠图",
              toneClassName: "text-emerald-200 hover:border-emerald-500/40 hover:bg-emerald-600 hover:text-white",
            },
          ]
        : [],
    },
    {
      id: "media",
      actions: [
        ...(item.status === "complete" && onAnalyzeMedia
          ? [{
              id: "analyze",
              icon: <Sparkles className="h-3.5 w-3.5" />,
              onClick: () => void onAnalyzeMedia(node.id),
              title: "分析媒体",
              toneClassName: "text-teal-200 hover:border-teal-500/40 hover:bg-teal-600 hover:text-white",
            }]
          : []),
        ...(item.type === "video" && onCaptureVideoFrame && shouldRenderVideoPlayer
          ? [{
              id: "frame",
              icon: <Frame className="h-3.5 w-3.5" />,
              onClick: () => void captureVideoFrameRef.current?.("current"),
              title: "截取当前帧",
              toneClassName: "text-cyan-200 hover:border-cyan-500/40 hover:bg-cyan-600 hover:text-white",
            }]
          : []),
        ...(item.type === "audio" && onSaveVoiceProfile
          ? [{
              id: "voice",
              icon: <Mic2 className="h-3.5 w-3.5" />,
              onClick: () => onSaveVoiceProfile?.(item),
              title: "保存为克隆音色",
              toneClassName: "text-cyan-200 hover:border-cyan-500/40 hover:bg-cyan-600 hover:text-white",
            }]
          : []),
      ],
    },
    {
      id: "view",
      actions: [
        ...(item.type === "image"
          ? [{
              id: "panorama",
              icon: <Compass className="h-3.5 w-3.5" />,
              onClick: () => onOpenPanorama?.(item),
              title: "360 全景查看",
              toneClassName: "imagine-panorama-action",
            }]
          : []),
        {
          id: "fullscreen",
          icon: <Maximize2 className="h-3.5 w-3.5" />,
          onClick: () => onOpenFullscreen?.(item),
          title: "全屏预览",
          toneClassName: "hover:bg-slate-700 hover:text-white",
        },
        {
          id: "download",
          icon: <Download className="h-3.5 w-3.5" />,
          onClick: () => onDownload?.(item),
          title: "下载",
          toneClassName: "hover:bg-slate-700 hover:text-white",
        },
      ],
    },
  ];

  return (
    <div className="board-media-node group/board-video relative h-full min-h-0 overflow-visible">
      <BoardMediaActionBar groups={actionGroups} visible={isSelected} />
      <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
        {hasStackSwitcher && (
          <div className="board-media-stack-badge pointer-events-none absolute right-2 top-2 z-30 rounded-md bg-slate-950/45 px-2 py-1 text-xs font-semibold text-white/90 opacity-80 shadow-lg backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100">
            {stackItems.length}
          </div>
        )}
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
      </div>
      {hasStackSwitcher && (
        <div
          className={[
            "board-media-stack-switcher nodrag absolute -bottom-8 left-1/2 z-40 flex -translate-x-1/2 gap-1.5 rounded-full border border-white/10 bg-slate-950/72 px-2.5 py-1.5 text-[10px] font-semibold text-white/90 shadow-xl backdrop-blur transition-opacity duration-200",
            isSelected
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0 group-hover/board-video:pointer-events-auto group-hover/board-video:opacity-100",
          ].join(" ")}
        >
          {stackItems.map((stackItem, index) => {
            const isActive = stackItem.id === node.activeAssetId;
            return (
              <button
                key={stackItem.id}
                type="button"
                className={[
                  "nodrag flex h-5 min-w-5 items-center justify-center rounded-full px-1 transition",
                  isActive ? "bg-white text-slate-950" : "bg-white/20 text-white/80 hover:bg-white/35 hover:text-white",
                ].join(" ")}
                title={`版本 ${index + 1}`}
                aria-label={`切换到版本 ${index + 1}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isActive) onSelectStackAsset?.(stackItem.id);
                }}
              >
                {isSelected ? index + 1 : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default ResultBoardNode;
