import { Check, Compass, Copy, FileText, Film, Mic2, Music, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import AudioWaveformPreview from "@/components/audio/AudioWaveformPreview";
import VideoFrameMenu from "@/components/assets/VideoFrameMenu";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import PanoramaOverlay from "@/components/panorama/PanoramaOverlay";
import PreviewImage from "@/components/PreviewImage";
import type { StorageItem } from "@/lib/db";
import { formatDisplayedAspectRatio } from "@/lib/media-display";
import type { PanoramaScreenshot } from "@/lib/panorama/capture";
import { transcriptFromDataUrl } from "@/lib/transcripts";
import type { CapturedVideoFrame, VideoFrameCaptureMode } from "@/lib/video-frame";
import { WORKBENCH_OVERLAY_TRANSITION, WORKBENCH_PANEL_TRANSITION } from "@/lib/workbench-motion";

interface FullscreenPreviewProps {
  item: StorageItem | null;
  items?: StorageItem[];
  onCaptureVideoFrame: (item: StorageItem, frame: CapturedVideoFrame) => void | Promise<unknown>;
  onSavePanoramaScreenshots: (item: StorageItem, screenshots: PanoramaScreenshot[]) => void | Promise<void>;
  onSaveVoiceProfile?: (item: StorageItem) => void;
  onClose: () => void;
  onSelectItem?: (item: StorageItem) => void;
}

type CopyStatus = "idle" | "copied" | "failed";
type CopyResult = { itemId: string; status: Exclude<CopyStatus, "idle"> } | null;

export default function FullscreenPreview({ item, items = [], onCaptureVideoFrame, onSavePanoramaScreenshots, onSaveVoiceProfile, onClose, onSelectItem }: FullscreenPreviewProps) {
  const [copyResult, setCopyResult] = useState<CopyResult>(null);
  const [isFrameMenuOpen, setIsFrameMenuOpen] = useState(false);
  const [panoramaItem, setPanoramaItem] = useState<StorageItem | null>(null);
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

  useEffect(() => {
    if (!item || panoramaItem?.id !== item.id) setPanoramaItem(null);
  }, [item, panoramaItem?.id]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key="fullscreen-preview"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={WORKBENCH_OVERLAY_TRANSITION}
          className="fixed inset-0 z-50 flex bg-slate-950/95 p-2 backdrop-blur-md sm:p-4"
        >
          <button
            onClick={onClose}
            className="imagine-motion-interactive absolute right-4 top-4 z-10 rounded-lg border border-slate-800 bg-slate-900/90 p-2 text-slate-400 hover:text-white sm:right-6 sm:top-6"
            aria-label="关闭全屏预览"
          >
            <X className="h-6 w-6" />
          </button>
          <motion.div
            initial={{ opacity: 0, scale: 0.985, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: 8 }}
            transition={WORKBENCH_PANEL_TRANSITION}
            className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3"
          >
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
                  <div className="absolute bottom-[3.85rem] right-4 z-30 opacity-0 transition-opacity duration-[160ms] group-hover/fullscreen-video:opacity-100 sm:right-6">
                    <VideoFrameMenu
                      align="right"
                      buttonClassName="flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/15 bg-slate-950/86 px-2.5 text-cyan-100 shadow-lg backdrop-blur transition hover:bg-cyan-600 hover:text-white"
                      isOpen={isFrameMenuOpen}
                      onSelect={captureVideoFrame}
                      onToggle={() => setIsFrameMenuOpen(prev => !prev)}
                      variant="full"
                    />
                  </div>
                </div>
              ) : item.type === "audio" ? (
                <div className="flex h-full w-full items-center justify-center px-4 sm:px-8">
                  <AudioWaveformPreview
                    src={item.url}
                    size="full"
                    tone="media"
                    className="h-[min(52vh,420px)] max-h-full w-full max-w-5xl rounded-2xl"
                  />
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center px-4 sm:px-8">
                  <div className="max-h-full w-full max-w-5xl overflow-auto rounded-2xl border border-slate-800 bg-slate-900/72 p-5 text-slate-100 shadow-2xl">
                    <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-cyan-100">
                      <FileText className="h-4 w-4" />
                      转写文本
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">
                      {transcriptFromDataUrl(item.url) || "无转写文本"}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {showPreviewStrip && (
              <div className="imagine-motion-surface-reveal no-scrollbar flex w-full max-w-6xl shrink-0 gap-2 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/78 px-3 py-2 shadow-xl backdrop-blur">
                {previewItems.map(previewItem => {
                  const isActive = previewItem.id === item.id;
                  return (
                    <button
                      key={previewItem.id}
                      type="button"
                      onClick={() => onSelectItem?.(previewItem)}
                      className={`imagine-motion-interactive relative h-14 w-20 shrink-0 overflow-hidden rounded-md border bg-slate-900 ${
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
                      ) : previewItem.type === "audio" ? (
                        <div className="flex h-full w-full items-center justify-center bg-slate-900">
                          <Music className="h-5 w-5 text-slate-300" />
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-900">
                          <FileText className="h-5 w-5 text-slate-300" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="imagine-motion-surface-reveal flex w-full max-w-6xl shrink-0 flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/88 px-3 py-2 text-slate-300 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="line-clamp-2 min-w-0 flex-1 text-xs italic leading-5 text-slate-200">
                &ldquo;{item.prompt}&rdquo;
              </p>
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                <span className="font-mono">ID: {item.id}</span>
                <span className="font-mono">模型: {item.model}</span>
                <span className="font-mono">比例: {formatDisplayedAspectRatio(item)}</span>
                {item.type === "image" && (
                  <button
                    type="button"
                    onClick={() => setPanoramaItem(item)}
                    className="imagine-panorama-action imagine-motion-interactive inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium"
                    title="360 查看"
                  >
                    <Compass className="h-3.5 w-3.5" />
                    360 查看
                  </button>
                )}
                {item.type === "audio" && onSaveVoiceProfile && (
                  <button
                    type="button"
                    onClick={() => onSaveVoiceProfile(item)}
                    className="imagine-motion-interactive inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-400/25 bg-cyan-500/10 px-2.5 text-xs font-medium text-cyan-100 hover:border-cyan-300/45 hover:bg-cyan-500/20 hover:text-white"
                    title="保存为克隆音色"
                  >
                    <Mic2 className="h-3.5 w-3.5" />
                    保存音色
                  </button>
                )}
                <button
                  onClick={() => copyPrompt(item.id, item.prompt)}
                  className="imagine-motion-interactive inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white"
                  title="复制 prompt"
                >
                  {copyStatus === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制 Prompt"}
                </button>
              </div>
            </div>
          </motion.div>
          {panoramaItem && (
            <PanoramaOverlay
              item={panoramaItem}
              onClose={() => setPanoramaItem(null)}
              onSaveScreenshots={onSavePanoramaScreenshots}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
