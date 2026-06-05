import { Download, ImageDown, Maximize2, type LucideIcon, SkipBack, SkipForward, Clock3 } from "lucide-react";
import { useRef, useState } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import PreviewImage from "@/components/PreviewImage";
import type { BoardResultNode } from "@/lib/board";
import { buildStorageItem, type StorageItem } from "@/lib/db";
import { mediaReferenceFileExtension, mediaReferenceMimeFromDataUri } from "@/lib/media-references";
import { getVideoFrameCaptureLabel, type CapturedVideoFrame, type VideoFrameCaptureMode } from "@/lib/video-frame";

interface ResultBoardNodeProps {
  boardId: string;
  node: BoardResultNode;
  stackItems: StorageItem[];
  onCaptureVideoFrame?: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onMeasureAspectRatio?: (nodeId: string, aspectRatio: number) => void;
  onOpenFullscreen?: (item: StorageItem) => void;
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
    },
    { boardId },
  );
}

const frameCaptureActions: Array<{
  icon: LucideIcon;
  mode: VideoFrameCaptureMode;
}> = [
  { icon: SkipBack, mode: "first" },
  { icon: Clock3, mode: "current" },
  { icon: SkipForward, mode: "last" },
];

function boardAssetExtension(asset: BoardResultNode["asset"]): string {
  return mediaReferenceFileExtension(mediaReferenceMimeFromDataUri(asset.url), asset.type);
}

export default function ResultBoardNode({
  boardId,
  node,
  stackItems,
  onCaptureVideoFrame,
  onMeasureAspectRatio,
  onOpenFullscreen,
  onSelectStackAsset,
}: ResultBoardNodeProps) {
  const item = resultNodeToStorageItem(node, boardId);
  const hasStackSwitcher = stackItems.length > 1;
  const [isFrameMenuOpen, setIsFrameMenuOpen] = useState(false);
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);

  const captureVideoFrame = (mode: VideoFrameCaptureMode) => {
    setIsFrameMenuOpen(false);
    void captureVideoFrameRef.current?.(mode);
  };

  return (
    <div className="group/board-video relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
      <div className="absolute left-2 top-2 z-30 flex gap-1 opacity-0 transition-opacity duration-200 hover:opacity-100 group-hover/board-video:opacity-100">
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
      ) : node.asset.type === "audio" ? (
        <div className="flex h-full w-full items-center justify-center px-4">
          <audio src={node.asset.url} controls className="w-full" />
        </div>
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
          <div className="absolute bottom-[2.85rem] right-2 z-30 opacity-0 transition-opacity duration-200 group-hover/board-video:opacity-100">
            <button
              type="button"
              onClick={() => setIsFrameMenuOpen(prev => !prev)}
              className="flex h-8 items-center justify-center gap-1 rounded-md border border-white/15 bg-slate-950/86 px-2 text-cyan-100 shadow-lg backdrop-blur transition hover:bg-cyan-600 hover:text-white"
              title="截取视频帧"
            >
              <ImageDown className="h-4 w-4" />
              <span className="text-[11px] font-semibold">截帧</span>
            </button>
            {isFrameMenuOpen && (
              <div className="absolute bottom-full right-0 mb-1 grid min-w-24 gap-1 rounded-lg border border-white/12 bg-slate-950/94 p-1 text-xs text-slate-100 shadow-xl backdrop-blur">
                {frameCaptureActions.map(action => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.mode}
                      type="button"
                      onClick={() => captureVideoFrame(action.mode)}
                      className="flex h-8 items-center gap-2 rounded-md px-2 text-left transition hover:bg-white/10"
                    >
                      <Icon className="h-3.5 w-3.5 text-cyan-200" />
                      <span className="whitespace-nowrap">{getVideoFrameCaptureLabel(action.mode)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
