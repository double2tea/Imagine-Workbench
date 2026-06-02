import { Bot, Clock3, Download, ImageDown, ImageIcon, Paintbrush, Send, type LucideIcon, SkipBack, SkipForward, VideoIcon } from "lucide-react";
import { useRef, useState } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import PreviewImage from "@/components/PreviewImage";
import type { BoardAssetNode } from "@/lib/board";
import type { StorageItem } from "@/lib/db";
import { getVideoFrameCaptureLabel, type CapturedVideoFrame, type VideoFrameCaptureMode } from "@/lib/video-frame";

interface AssetBoardNodeProps {
  node: BoardAssetNode;
  onCaptureVideoFrame?: (nodeId: string, item: StorageItem, frame: CapturedVideoFrame) => void | Promise<void>;
  onEditImage?: (nodeId: string) => void;
  onSendToAgent?: (nodeId: string) => void;
  onSetAsReference?: (nodeId: string) => void;
}

function boardAssetToStorageItem(node: BoardAssetNode): StorageItem {
  return {
    id: node.asset.assetId,
    type: node.asset.type,
    url: node.asset.url,
    prompt: node.asset.prompt,
    model: node.asset.model,
    aspectRatio: "auto",
    createdAt: node.createdAt,
    status: "complete",
    progress: 100,
  };
}

const frameCaptureActions: Array<{
  icon: LucideIcon;
  mode: VideoFrameCaptureMode;
}> = [
  { icon: SkipBack, mode: "first" },
  { icon: Clock3, mode: "current" },
  { icon: SkipForward, mode: "last" },
];

export default function AssetBoardNode({ node, onCaptureVideoFrame, onEditImage, onSendToAgent, onSetAsReference }: AssetBoardNodeProps) {
  const item = boardAssetToStorageItem(node);
  const [isFrameMenuOpen, setIsFrameMenuOpen] = useState(false);
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);

  const captureVideoFrame = (mode: VideoFrameCaptureMode) => {
    setIsFrameMenuOpen(false);
    void captureVideoFrameRef.current?.(mode);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="group/board-video relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
        <div className="absolute right-2 top-2 z-30 flex gap-1 opacity-0 transition-opacity duration-200 hover:opacity-100 group-hover/board-video:opacity-100">
          {node.asset.type === "image" && (
            <>
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
                <Bot className="h-3.5 w-3.5" />
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
          <a
            href={node.asset.url}
            download={`${node.asset.assetId}.${node.asset.type === "image" ? "png" : "mp4"}`}
            className="imagine-board-asset-action nodrag hover:bg-slate-700 hover:text-white"
            title="下载"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
        {node.asset.type === "image" ? (
          <PreviewImage src={node.asset.url} alt={node.asset.prompt} className="h-full w-full object-contain" />
        ) : (
          <div className="relative h-full w-full">
            <VideoAssetPlayer
              item={item}
              loop={false}
              className="h-full w-full object-contain"
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
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-[var(--iw-border)] px-3 text-[10px] text-[var(--iw-faint)]">
        {node.asset.type === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : <VideoIcon className="h-3.5 w-3.5" />}
        <span className="truncate">{node.asset.prompt}</span>
      </div>
    </div>
  );
}
