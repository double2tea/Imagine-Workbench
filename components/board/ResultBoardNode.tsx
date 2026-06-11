import { Image as ImageIcon, Music, Video } from "lucide-react";
import { memo, useMemo, useRef } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import BoardAudioWaveform from "@/components/board/BoardAudioWaveform";
import BoardMediaActionBar, { type BoardMediaActionGroup } from "@/components/board/BoardMediaActionBar";
import BoardMediaNodeShell from "@/components/board/BoardMediaNodeShell";
import PreviewImage from "@/components/PreviewImage";
import useBoardAudioItem from "@/components/board/useBoardAudioItem";
import useSelectedBoardVideoItem from "@/components/board/useSelectedBoardVideoItem";
import type { BoardResultNode } from "@/lib/board";
import { buildStorageItem, type StorageItem } from "@/lib/db";
import { imageQuickEditProcessingTitleFromPrompt } from "@/lib/image-quick-edit-targets";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import type { CapturedVideoFrame } from "@/lib/video-frame";
import {
  IMAGE_EDIT_OPERATION_ORDER,
  WORKBENCH_OPERATION_META,
  WorkbenchOperationIcon,
  imageEditOperationMeta,
  operationToneClassName,
} from "@/components/workbench/OperationControls";

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

function LightweightMediaPreview({ type }: { type: "audio" | "image" | "video" }) {
  const Icon = type === "audio" ? Music : type === "image" ? ImageIcon : Video;
  return (
    <div
      aria-label={type === "audio" ? "音频结果" : type === "image" ? "图片结果" : "视频结果"}
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
  const isComplete = item.status === "complete";
  const isImagePreviewUrl = item.url.startsWith("data:image/");
  const audioItem = useBoardAudioItem(item);
  const playableAudioItem = audioItem ?? (item.type === "audio" && item.url.trim() ? item : null);
  const videoItem = useSelectedBoardVideoItem(item, isSelected);
  const shouldRenderVideoPlayer = videoItem !== null;
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);
  const actionGroups: BoardMediaActionGroup[] = [
    {
      id: "edit",
      actions: item.type === "image" && isComplete
        ? IMAGE_EDIT_OPERATION_ORDER.map(operation => {
            const meta = imageEditOperationMeta(operation);
            const Icon = meta.Icon;
            return {
              id: operation,
              icon: <Icon className="h-3.5 w-3.5" />,
              onClick: () => onImageQuickEdit?.(node.id, operation),
              title: meta.label,
              toneClassName: operationToneClassName(meta.tone),
            };
          })
        : [],
    },
    {
      id: "media",
      actions: [
        ...(item.status === "complete" && onAnalyzeMedia
          ? [{
              id: "analyze",
              icon: <WorkbenchOperationIcon operation="analyze" />,
              onClick: () => void onAnalyzeMedia(node.id),
              title: WORKBENCH_OPERATION_META.analyze.title,
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.analyze.tone),
            }]
          : []),
        ...(item.type === "video" && isComplete && onCaptureVideoFrame && shouldRenderVideoPlayer
          ? [{
              id: "frame",
              icon: <WorkbenchOperationIcon operation="frame" />,
              onClick: () => void captureVideoFrameRef.current?.("current"),
              title: WORKBENCH_OPERATION_META.frame.title,
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.frame.tone),
            }]
          : []),
        ...(item.type === "audio" && isComplete && onSaveVoiceProfile
          ? [{
              id: "voice",
              icon: <WorkbenchOperationIcon operation="voice" />,
              onClick: () => onSaveVoiceProfile?.(item),
              title: WORKBENCH_OPERATION_META.voice.title,
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.voice.tone),
            }]
          : []),
      ],
    },
    {
      id: "view",
      actions: [
        ...(item.type === "image" && isComplete
          ? [{
              id: "panorama",
              icon: <WorkbenchOperationIcon operation="panorama" />,
              onClick: () => onOpenPanorama?.(item),
              title: WORKBENCH_OPERATION_META.panorama.title,
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.panorama.tone),
            }]
          : []),
        ...(isComplete
          ? [
              {
                id: "fullscreen",
                icon: <WorkbenchOperationIcon operation="fullscreen" />,
                onClick: () => onOpenFullscreen?.(item),
                title: WORKBENCH_OPERATION_META.fullscreen.title,
                toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.fullscreen.tone),
              },
              {
                id: "download",
                icon: <WorkbenchOperationIcon operation="download" />,
                onClick: () => onDownload?.(item),
                title: WORKBENCH_OPERATION_META.download.title,
                toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.download.tone),
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <BoardMediaNodeShell
      actionBar={<BoardMediaActionBar groups={actionGroups} visible={isSelected} />}
      activeStackAssetId={node.activeAssetId}
      isSelected={isSelected}
      onSelectStackAsset={onSelectStackAsset}
      progress={item.progress}
      processingLabel={imageQuickEditProcessingTitleFromPrompt(item.prompt) ?? undefined}
      stackItems={stackItems}
      status={item.status}
    >
      {item.type === "image" && item.url.trim() ? (
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
      ) : item.type === "audio" || item.type === "image" || item.type === "video" ? (
        <LightweightMediaPreview type={item.type} />
      ) : (
        null
      )}
    </BoardMediaNodeShell>
  );
});

export default ResultBoardNode;
