import { Compass, Download, Eraser, Expand, Frame, Loader2, Maximize2, Mic2, Music, ScanSearch, Scissors, Video, WandSparkles } from "lucide-react";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import { memo, useMemo, useRef } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import BoardAudioWaveform from "@/components/board/BoardAudioWaveform";
import BoardMediaActionBar, { type BoardMediaActionGroup } from "@/components/board/BoardMediaActionBar";
import PreviewImage from "@/components/PreviewImage";
import useBoardAudioItem from "@/components/board/useBoardAudioItem";
import useSelectedBoardVideoItem from "@/components/board/useSelectedBoardVideoItem";
import type { BoardAssetNode } from "@/lib/board";
import { compactBoardModelLabel } from "@/lib/board/provenance";
import { buildStorageItem, type StorageItem } from "@/lib/db";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
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
  onImageQuickEdit?: (nodeId: string, operation: ImageEditFeature) => void;
  onMeasureAspectRatio?: (nodeId: string, aspectRatio: number) => void;
  onOpenFullscreen?: (item: StorageItem) => void;
  onOpenPanorama?: (item: StorageItem) => void;
  onSaveVoiceProfile?: (item: StorageItem) => void;
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

const AssetBoardNode = memo(function AssetBoardNode({
  activeStackAssetId,
  boardId,
  compareReferenceUrl,
  isSelected = false,
  node,
  onCaptureVideoFrame,
  onCompare,
  onDownload,
  onEditImage,
  onImageQuickEdit,
  onMeasureAspectRatio,
  onOpenFullscreen,
  onOpenPanorama,
  onSaveVoiceProfile,
  onSelectStackAsset,
  onSendToAgent,
  stackItems = [],
}: AssetBoardNodeProps) {
  const fallbackItem = useMemo(() => boardAssetToStorageItem(node, boardId), [boardId, node]);
  const item = useMemo(
    () => stackItems.find(stackItem => stackItem.id === node.asset.assetId) ?? fallbackItem,
    [fallbackItem, node.asset.assetId, node.asset.type, stackItems],
  );
  const stackCount = stackItems.length;
  const hasStackSwitcher = stackCount > 1;
  const isComplete = item.status === "complete";
  const isProcessing = item.status === "pending" || item.status === "processing";
  const isFailed = item.status === "failed";
  const shouldMeasureAspectRatio = !item.maskOriginalId;
  const voiceProfileSourceItem = node.asset.type === "audio"
    ? stackItems.find(stackItem => stackItem.id === node.asset.assetId && stackItem.type === "audio")
    : undefined;
  const isImagePreviewUrl = item.url.startsWith("data:image/");
  const audioItem = useBoardAudioItem(item);
  const playableAudioItem = audioItem ?? (item.type === "audio" && item.url.trim() ? item : null);
  const videoItem = useSelectedBoardVideoItem(item, isSelected);
  const shouldRenderVideoPlayer = videoItem !== null;
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);
  const actionGroups: BoardMediaActionGroup[] = [
    {
      id: "assist",
      actions: [
        ...(node.asset.type === "image" && isComplete && compareReferenceUrl && onCompare
          ? [{
              id: "compare",
              icon: <ScanSearch className="h-3.5 w-3.5" />,
              onClick: onCompare,
              title: "对比参考图",
              toneClassName: "text-blue-200 hover:border-blue-500/40 hover:bg-blue-600 hover:text-white",
            }]
          : []),
        ...(node.asset.type === "image" && isComplete
          ? [{
              id: "agent",
              icon: <AgentIdentityMark variant="inline" />,
              onClick: () => onSendToAgent?.(node.id),
              title: "发送给 Agent",
              toneClassName: "text-purple-200 hover:border-purple-500/40 hover:bg-purple-600 hover:text-white",
            }]
          : []),
        ...(node.asset.type === "video" && isComplete && onCaptureVideoFrame && shouldRenderVideoPlayer
          ? [{
              id: "frame",
              icon: <Frame className="h-3.5 w-3.5" />,
              onClick: () => void captureVideoFrameRef.current?.("current"),
              title: "截取当前帧",
              toneClassName: "text-cyan-200 hover:border-cyan-500/40 hover:bg-cyan-600 hover:text-white",
            }]
          : []),
        ...(isComplete && voiceProfileSourceItem
          ? [{
              id: "voice",
              icon: <Mic2 className="h-3.5 w-3.5" />,
              onClick: () => onSaveVoiceProfile?.(voiceProfileSourceItem),
              title: "保存为克隆音色",
              toneClassName: "text-cyan-200 hover:border-cyan-500/40 hover:bg-cyan-600 hover:text-white",
            }]
          : []),
      ],
    },
    {
      id: "edit",
      actions: node.asset.type === "image" && isComplete
        ? [
            {
              id: "mask-edit",
              icon: <Frame className="h-3.5 w-3.5" />,
              onClick: () => onEditImage?.(node.id),
              title: "局部编辑",
              toneClassName: "text-amber-200 hover:border-amber-500/40 hover:bg-amber-600 hover:text-white",
            },
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
      id: "view",
      actions: [
        ...(node.asset.type === "image" && isComplete
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
      <BoardMediaActionBar groups={actionGroups} />
      <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
      {hasStackSwitcher && (
        <div className="board-media-stack-badge pointer-events-none absolute right-2 top-2 z-30 rounded-md bg-slate-950/45 px-2 py-1 text-xs font-semibold text-white/90 opacity-80 shadow-lg backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100">
          {stackCount}
        </div>
      )}
      <div
        className="board-media-meta pointer-events-none absolute bottom-2 left-2 z-30 max-w-[calc(100%-1rem)] rounded-md bg-slate-950/60 px-2 py-1 text-[10px] font-semibold text-white/90 opacity-0 shadow-lg backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100"
        title={compactBoardModelLabel(item.model)}
      >
        <span className="block truncate">{item.type} · {compactBoardModelLabel(item.model)}</span>
      </div>
      {node.asset.type === "image" ? (
        <PreviewImage
          src={item.url}
          alt={node.title}
          draggable={false}
          className="board-media-preview h-full w-full select-none object-cover"
          onLoad={event => {
            const image = event.currentTarget;
            if (shouldMeasureAspectRatio && image.naturalWidth > 0 && image.naturalHeight > 0) {
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
      ) : playableAudioItem ? (
        <BoardAudioWaveform src={playableAudioItem.url} interactive={isSelected} />
      ) : (
        <LightweightMediaPreview type={node.asset.type} />
      )}
      {(isProcessing || isFailed) && (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-end bg-slate-950/45 p-3 text-white">
          <div className="rounded-md border border-white/15 bg-slate-950/72 px-3 py-2 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5">
                {!isFailed && <Loader2 className="h-3 w-3 animate-spin" />}
                {isFailed ? "编辑失败" : item.status === "pending" ? "任务已排队" : "编辑处理中"}
              </span>
              <span className="font-mono">{item.progress}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full ${isFailed ? "bg-rose-400" : "bg-sky-400"}`}
                style={{ width: `${item.progress}%` }}
              />
            </div>
          </div>
        </div>
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
});

export default AssetBoardNode;
