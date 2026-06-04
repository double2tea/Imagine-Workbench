import { Check, Clock3, Copy, Film, ImageDown, Music, type LucideIcon, SkipBack, SkipForward, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import PreviewImage from "@/components/PreviewImage";
import type { StorageItem } from "@/lib/db";
import { formatDisplayedAspectRatio } from "@/lib/media-display";
import { getVideoFrameCaptureLabel, type CapturedVideoFrame, type VideoFrameCaptureMode } from "@/lib/video-frame";

interface FullscreenPreviewProps {
  item: StorageItem | null;
  items?: StorageItem[];
  onCaptureVideoFrame: (item: StorageItem, frame: CapturedVideoFrame) => void | Promise<unknown>;
  onClose: () => void;
  onSelectItem?: (item: StorageItem) => void;
}

type CopyStatus = "idle" | "copied" | "failed";
type CopyResult = { itemId: string; status: Exclude<CopyStatus, "idle"> } | null;

const frameCaptureActions: Array<{
  icon: LucideIcon;
  mode: VideoFrameCaptureMode;
}> = [
  { icon: SkipBack, mode: "first" },
  { icon: Clock3, mode: "current" },
  { icon: SkipForward, mode: "last" },
];

export default function FullscreenPreview({ item, items = [], onCaptureVideoFrame, onClose, onSelectItem }: FullscreenPreviewProps) {
  const [copyResult, setCopyResult] = useState<CopyResult>(null);
  const [isFrameMenuOpen, setIsFrameMenuOpen] = useState(false);
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);
  const previewItems = items.length > 0 ? items : item ? [item] : [];
  const showPreviewStrip = previewItems.length > 1 && Boolean(onSelectItem);

  const copyStatus: CopyStatus =
    copyResult !== null && copyResult.itemId === item?.id ? copyResult.status : "idle";

  const copyPrompt = (itemId: string, prompt: string) => {
    void navigator.clipboard.writeText(prompt).then(
      () => {
        setCopyResult({ itemId, status: "copied" });
        window.setTimeout(() => setCopyResult(null), 1600);
      },
      () => {
        setCopyResult({ itemId, status: "failed" });
        window.setTimeout(() => setCopyResult(null), 1600);
      },
    );
  };

  const captureVideoFrame = (mode: VideoFrameCaptureMode) => {
    setIsFrameMenuOpen(false);
    void captureVideoFrameRef.current?.(mode);
  };

  return (
    <AnimatePresence>
      {item && (
        <div className="fixed inset-0 z-50 flex bg-slate-950/95 p-2 backdrop-blur-md sm:p-4">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-lg border border-slate-800 bg-slate-900/90 p-2 text-slate-400 transition hover:text-white sm:right-6 sm:top-6"
            aria-label="关闭全屏预览"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3">
            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
              {item.type === "image" ? (
                <PreviewImage
                  src={item.url}
                  alt={item.prompt}
                  className="h-full w-full object-contain"
                />
              ) : item.type === "video" ? (
                <div className="group/fullscreen-video relative h-full w-full">
                  <VideoAssetPlayer
                    item={item}
                    autoPlay
                    className="h-full w-full object-contain"
                    onCaptureFrame={onCaptureVideoFrame}
                    onCaptureFrameRequestReady={request => {
                      captureVideoFrameRef.current = request;
                    }}
                  />
                  <div className="absolute bottom-[3.85rem] right-4 z-30 opacity-0 transition-opacity duration-200 group-hover/fullscreen-video:opacity-100 sm:right-6">
                    <button
                      type="button"
                      onClick={() => setIsFrameMenuOpen(prev => !prev)}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/15 bg-slate-950/86 px-2.5 text-cyan-100 shadow-lg backdrop-blur transition hover:bg-cyan-600 hover:text-white"
                      title="截取视频帧"
                    >
                      <ImageDown className="h-4.5 w-4.5" />
                      <span className="text-xs font-semibold">截帧</span>
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
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6">
                  <Music className="h-12 w-12 text-slate-500" />
                  <audio src={item.url} controls className="w-full max-w-2xl" />
                </div>
              )}
            </div>
            {showPreviewStrip && (
              <div className="no-scrollbar flex w-full max-w-6xl shrink-0 gap-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/78 px-3 py-2 shadow-xl backdrop-blur">
                {previewItems.map(previewItem => {
                  const isActive = previewItem.id === item.id;
                  return (
                    <button
                      key={previewItem.id}
                      type="button"
                      onClick={() => onSelectItem?.(previewItem)}
                      className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-slate-900 transition ${
                        isActive ? "border-cyan-300 ring-2 ring-cyan-400/35" : "border-slate-700 hover:border-slate-500"
                      }`}
                      aria-label={`切换到 ${previewItem.prompt || previewItem.id}`}
                    >
                      {previewItem.type === "image" ? (
                        <PreviewImage src={previewItem.url} alt={previewItem.prompt} className="h-full w-full object-cover" />
                      ) : previewItem.type === "video" ? (
                        <div className="flex h-full w-full items-center justify-center bg-slate-900">
                          <Film className="h-5 w-5 text-slate-300" />
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-900">
                          <Music className="h-5 w-5 text-slate-300" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex w-full max-w-6xl shrink-0 flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/88 px-3 py-2 text-slate-300 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="line-clamp-2 min-w-0 flex-1 text-xs italic leading-5 text-slate-200">
                &ldquo;{item.prompt}&rdquo;
              </p>
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                <span className="font-mono">ID: {item.id}</span>
                <span className="font-mono">模型: {item.model}</span>
                <span className="font-mono">比例: {formatDisplayedAspectRatio(item)}</span>
                <button
                  onClick={() => copyPrompt(item.id, item.prompt)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                  title="复制 prompt"
                >
                  {copyStatus === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制 Prompt"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
