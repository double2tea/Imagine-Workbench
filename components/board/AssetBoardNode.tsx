import { Image as ImageIcon, Music, Video } from "lucide-react";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import { memo, useMemo, useRef } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import BoardAudioWaveform from "@/components/board/BoardAudioWaveform";
import BoardMediaActionBar, { type BoardMediaActionGroup } from "@/components/board/BoardMediaActionBar";
import BoardMediaNodeShell from "@/components/board/BoardMediaNodeShell";
import PreviewImage from "@/components/PreviewImage";
import useBoardAudioItem from "@/components/board/useBoardAudioItem";
import useSelectedBoardVideoItem from "@/components/board/useSelectedBoardVideoItem";
import type { BoardAssetNode } from "@/lib/board";
import { buildStorageItem, type StorageItem } from "@/lib/db";
import { imageQuickEditProcessingTitleFromPrompt } from "@/lib/image-quick-edit-targets";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import type { CapturedVideoFrame } from "@/lib/video-frame";
import { useTranslations } from "@/lib/i18n";
import {
  IMAGE_EDIT_OPERATION_ORDER,
  WORKBENCH_OPERATION_META,
  WorkbenchOperationIcon,
  imageEditOperationMeta,
  operationToneClassName,
} from "@/components/workbench/OperationControls";

interface AssetBoardNodeProps {
  activeStackAssetId?: string;
  boardId: string;
  compareReferenceUrl?: string | null;
  isSelected?: boolean;
  node: BoardAssetNode;
  onCaptureVideoFrame?: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onAnalyzeMedia?: (nodeId: string) => void | Promise<void>;
  onCancelProcessing?: (nodeId: string) => void;
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

function LightweightMediaPreview({ type }: { type: "audio" | "image" | "video" }) {
  const Icon = type === "audio" ? Music : type === "image" ? ImageIcon : Video;
  return (
    <div
      aria-label={type === "audio" ? "Audio asset" : type === "image" ? "Image asset" : "Video asset"}
      className="board-media-preview flex h-full w-full items-center justify-center bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"
      role="img"
    >
      <Icon className="h-9 w-9 opacity-70" />
    </div>
  );
}

function resolveVideoCoverPreviewUrl(itemUrl: string, nodeUrl: string): string {
  if (itemUrl.startsWith("data:image/")) return itemUrl;
  return nodeUrl.startsWith("data:image/") ? nodeUrl : "";
}

const AssetBoardNode = memo(function AssetBoardNode({
  activeStackAssetId,
  boardId,
  compareReferenceUrl,
  isSelected = false,
  node,
  onAnalyzeMedia,
  onCancelProcessing,
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
  const { t } = useTranslations("board");
  const { t: creationT } = useTranslations("creation");
  const fallbackItem = useMemo(() => boardAssetToStorageItem(node, boardId), [boardId, node]);
  const item = useMemo(
    () => stackItems.find(stackItem => stackItem.id === node.asset.assetId) ?? fallbackItem,
    [fallbackItem, node.asset.assetId, node.asset.type, stackItems],
  );
  const isComplete = item.status === "complete";
  const shouldMeasureAspectRatio = !item.maskOriginalId;
  const voiceProfileSourceItem = node.asset.type === "audio"
    ? stackItems.find(stackItem => stackItem.id === node.asset.assetId && stackItem.type === "audio")
    : undefined;
  const videoCoverPreviewUrl = node.asset.type === "video" ? resolveVideoCoverPreviewUrl(item.url, node.asset.url) : "";
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
              icon: <WorkbenchOperationIcon operation="compare" />,
              onClick: onCompare,
              title: WORKBENCH_OPERATION_META.compare.title,
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.compare.tone),
            }]
          : []),
        ...(isComplete && onAnalyzeMedia
          ? [{
              id: "analyze",
              icon: <WorkbenchOperationIcon operation="analyze" />,
              onClick: () => void onAnalyzeMedia(node.id),
              title: WORKBENCH_OPERATION_META.analyze.title,
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.analyze.tone),
            }]
          : []),
        ...(node.asset.type === "image" && isComplete
          ? [{
              id: "agent",
              icon: <AgentIdentityMark variant="inline" />,
              onClick: () => onSendToAgent?.(node.id),
              title: "Send to Agent",
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.analyze.tone),
            }]
          : []),
        ...(node.asset.type === "video" && isComplete && onCaptureVideoFrame && shouldRenderVideoPlayer
          ? [{
              id: "frame",
              icon: <WorkbenchOperationIcon operation="frame" />,
              onClick: () => void captureVideoFrameRef.current?.("current"),
              title: WORKBENCH_OPERATION_META.frame.title,
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.frame.tone),
            }]
          : []),
        ...(isComplete && voiceProfileSourceItem
          ? [{
              id: "voice",
              icon: <WorkbenchOperationIcon operation="voice" />,
              onClick: () => onSaveVoiceProfile?.(voiceProfileSourceItem),
              title: WORKBENCH_OPERATION_META.voice.title,
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.voice.tone),
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
              icon: <WorkbenchOperationIcon operation="localEdit" />,
              onClick: () => onEditImage?.(node.id),
              title: WORKBENCH_OPERATION_META.localEdit.title,
              toneClassName: operationToneClassName(WORKBENCH_OPERATION_META.localEdit.tone),
            },
            ...IMAGE_EDIT_OPERATION_ORDER.map(operation => {
              const meta = imageEditOperationMeta(operation, creationT);
              const Icon = meta.Icon;
              return {
                id: operation,
                icon: <Icon className="h-3.5 w-3.5" />,
                onClick: () => onImageQuickEdit?.(node.id, operation),
                title: meta.label,
                toneClassName: operationToneClassName(meta.tone),
              };
            }),
          ]
        : [],
    },
    {
      id: "view",
      actions: [
        ...(node.asset.type === "image" && isComplete
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
        activeStackAssetId={activeStackAssetId ?? node.asset.assetId}
        isSelected={isSelected}
        onCancelProcessing={onCancelProcessing ? () => onCancelProcessing(node.id) : undefined}
        onDoubleClick={isComplete && onOpenFullscreen ? () => onOpenFullscreen(item) : undefined}
        onSelectStackAsset={onSelectStackAsset}
        processingLabel={imageQuickEditProcessingTitleFromPrompt(item.prompt, creationT) ?? undefined}
        stackItems={stackItems}
        status={item.status}
        statusLabel={item.errorMessage ?? (item.status === "failed" ? t("node.statusLabels.failed") : undefined)}
    >
      {node.asset.type === "image" && item.url.trim() ? (
        <PreviewImage
          src={item.url}
          alt={node.title}
          draggable={false}
          loading="eager"
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
      ) : node.asset.type === "video" && videoCoverPreviewUrl ? (
        <PreviewImage
          src={videoCoverPreviewUrl}
          alt={node.title}
          draggable={false}
          loading="eager"
          className="board-media-preview h-full w-full select-none object-cover"
        />
      ) : playableAudioItem ? (
        <BoardAudioWaveform src={playableAudioItem.url} interactive={isSelected} />
      ) : (
        <LightweightMediaPreview type={node.asset.type} />
      )}
    </BoardMediaNodeShell>
  );
});

export default AssetBoardNode;
