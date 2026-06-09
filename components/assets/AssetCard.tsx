import {
  Clock3,
  Compass,
  Download,
  FileText,
  ImageDown,
  Image as ImageIcon,
  Scissors,
  type LucideIcon,
  Maximize2,
  MoreHorizontal,
  Mic2,
  Music,
  Paintbrush,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  SkipBack,
  SkipForward,
  Trash2,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import AudioWaveformPreview from "@/components/audio/AudioWaveformPreview";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import PreviewImage from "@/components/PreviewImage";
import { makeReferenceDropToken, REFERENCE_ASSET_MIME } from "@/components/reference/referenceDrag";
import { getGenerationReferenceMedia, type StorageItem } from "@/lib/db";
import { mediaReferenceLabel } from "@/lib/media-references";
import { formatDisplayedAspectRatio } from "@/lib/media-display";
import { tryParseProviderModel, type AiProvider } from "@/lib/providers/model-catalog";
import { getProviderMeta } from "@/lib/providers/registry";
import { transcriptFromDataUrl } from "@/lib/transcripts";
import { getVideoFrameCaptureLabel, type CapturedVideoFrame, type VideoFrameCaptureMode } from "@/lib/video-frame";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";

interface AssetCardProps {
  canceling: boolean;
  inCompare: boolean;
  item: StorageItem;
  priority?: boolean;
  selected: boolean;
  selectedProvider: AiProvider;
  onApplyVideoReference: (item: StorageItem) => void;
  onCancel: (item: StorageItem) => void;
  onCaptureVideoFrame: (item: StorageItem, frame: CapturedVideoFrame) => void | Promise<unknown>;
  onDelete: (item: StorageItem) => void;
  onDownload: (item: StorageItem) => void;
  onLaunchMaskEditor: (imageUrl: string, id: string) => void;
  onImageQuickEdit: (item: StorageItem, operation: ImageEditFeature) => void;
  onOpenFullscreen: (item: StorageItem) => void;
  onOpenPanorama: (item: StorageItem) => void;
  onOpenReferencePreview: (item: StorageItem, index: number) => void;
  onRetry: (item: StorageItem) => void;
  onReuseTask: (item: StorageItem) => void;
  onSaveVoiceProfile: (item: StorageItem) => void;
  onToggleCompare: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onUseAgentReference: (item: StorageItem) => void;
}

function formatModelName(model: string): string {
  return model.replace("-preview", "").replace("lite-", "").replace("-generate", "").replace("imagen-", "Imagen");
}

function isContentSafetyError(message?: string): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("image_unsafe") ||
    normalized.includes("content blocked") ||
    normalized.includes("generated images appear to be unsafe")
  );
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

const frameCaptureActions: Array<{
  icon: LucideIcon;
  mode: VideoFrameCaptureMode;
}> = [
  { icon: SkipBack, mode: "first" },
  { icon: Clock3, mode: "current" },
  { icon: SkipForward, mode: "last" },
];

type FrameMenuPlacement = "hover" | "meta";

function processingTitle(type: StorageItem["type"]): string {
  if (type === "video") return "视频合成中";
  if (type === "audio") return "音频处理中";
  if (type === "transcript") return "音频转写中";
  return "图像生成中";
}

function AudioProcessingWaveform() {
  return (
    <div className="mt-3 flex h-12 w-full max-w-44 items-center gap-1.5 rounded-lg border border-cyan-400/10 bg-cyan-500/8 px-3">
      {Array.from({ length: 18 }).map((_, index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-cyan-300/45"
          style={{ height: `${18 + ((index * 7) % 28)}px` }}
        />
      ))}
    </div>
  );
}

export default function AssetCard({
  canceling,
  inCompare,
  item,
  priority = false,
  selected,
  selectedProvider,
  onApplyVideoReference,
  onCancel,
  onCaptureVideoFrame,
  onDelete,
  onDownload,
  onLaunchMaskEditor,
  onImageQuickEdit,
  onOpenFullscreen,
  onOpenPanorama,
  onOpenReferencePreview,
  onRetry,
  onReuseTask,
  onSaveVoiceProfile,
  onToggleCompare,
  onToggleSelect,
  onUseAgentReference,
}: AssetCardProps) {
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [frameMenuPlacement, setFrameMenuPlacement] = useState<FrameMenuPlacement | null>(null);
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);
  const provider = tryParseProviderModel(item.model, selectedProvider)?.provider ?? selectedProvider;
  const isDraggableReference = item.status === "complete" && item.type !== "transcript";
  const failedTitle = isContentSafetyError(item.errorMessage) ? "内容安全拦截" : "生成失败 / 链接中断";
  const referenceMedia = getGenerationReferenceMedia(item.generationRequest);
  const transcriptText = item.type === "transcript" ? transcriptFromDataUrl(item.url) : "";

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!isDraggableReference) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(REFERENCE_ASSET_MIME, JSON.stringify({ id: item.id, type: item.type, url: item.url }));
    event.dataTransfer.setData("text/plain", makeReferenceDropToken(item.id));
  };

  const runMobileAction = (action: () => void) => {
    setIsMobileActionsOpen(false);
    action();
  };

  const captureVideoFrame = (mode: VideoFrameCaptureMode) => {
    setFrameMenuPlacement(null);
    void captureVideoFrameRef.current?.(mode);
  };

  return (
    <div
      draggable={isDraggableReference}
      data-asset-id={item.id}
      data-status={item.status}
      data-type={item.type}
      onDragStart={handleDragStart}
      className={`imagine-asset-card relative flex h-full flex-col overflow-hidden rounded-[10px] group border bg-slate-900 shadow-xl transition-all duration-300 ${
        selected ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-850 hover:border-slate-750"
      }`}
    >
      <div className="imagine-asset-media relative aspect-[4/3] w-full bg-slate-950 overflow-hidden flex items-center justify-center border-b border-white/5">
        {item.status === "processing" || item.status === "pending" ? (
          <div className="imagine-generation-stage overflow-hidden">
            <span className="imagine-generation-stage-glow" aria-hidden />
            <div className="imagine-generation-stage-icon">
              <RefreshCw className="h-4 w-4 text-indigo-300 animate-spin" />
            </div>
            <p className="imagine-generation-stage-title">
              {item.status === "pending" ? "任务已排队" : processingTitle(item.type)}
            </p>
            <span className="imagine-generation-stage-meta">模型 {formatModelName(item.model)}</span>
            <div className="imagine-generation-progress" role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="imagine-generation-progress-fill" style={{ width: `${item.progress}%` }} />
            </div>
            <span className="imagine-generation-progress-label">
              {item.progress}% · {item.status === "pending" ? "排队" : "处理中"}
            </span>
            {item.type === "audio" && <AudioProcessingWaveform />}
            <button
              type="button"
              onClick={() => onCancel(item)}
              disabled={canceling}
              className="imagine-danger-action relative z-10 mt-3 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55"
              title={item.operationName?.startsWith("12ai:video:") ? "取消 12AI 视频生成任务" : "从本地取消并停止等待"}
            >
              <X className="h-3 w-3" />
              {canceling ? "取消中" : "取消任务"}
            </button>
          </div>
        ) : item.status === "failed" ? (
          <div className="imagine-asset-failed-stage select-none text-red-300">
            <X className="mb-2 h-6 w-6 shrink-0 text-red-400/70" />
            <p className="text-xs font-semibold leading-5 text-[var(--iw-text)]">{failedTitle}</p>
            <p className="mt-1 line-clamp-2 max-w-full break-words text-[10px] leading-4 text-[var(--iw-muted)]">
              {item.errorMessage ?? "请核查 API Key 或重构参数。"}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onRetry(item)}
                className="imagine-primary-action flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold !min-h-0"
              >
                <RefreshCw className="h-3 w-3" />
                重试
              </button>
              <button
                type="button"
                onClick={() => onReuseTask(item)}
                className="imagine-secondary-action flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold !min-h-0"
              >
                <SlidersHorizontal className="h-3 w-3" />
                复用参数
              </button>
            </div>
          </div>
        ) : (
          <div className="relative flex h-full w-full items-center justify-center bg-slate-950">
            {item.type === "image" ? (
              <PreviewImage
                src={item.url}
                alt={item.prompt}
                className="h-full w-full cursor-pointer object-contain transition duration-500"
                fetchPriority={priority ? "high" : "auto"}
                loading={priority ? "eager" : "lazy"}
                onClick={() => onOpenFullscreen(item)}
              />
            ) : item.type === "video" ? (
              <VideoAssetPlayer
                item={item}
                onCaptureFrame={onCaptureVideoFrame}
                onCaptureFrameRequestReady={request => {
                  captureVideoFrameRef.current = request;
                }}
              />
            ) : item.type === "audio" ? (
              <div className="flex h-full w-full items-center justify-center p-3">
                <AudioWaveformPreview src={item.url} size="compact" tone="media" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenFullscreen(item)}
                className="flex h-full w-full cursor-pointer flex-col items-start justify-start gap-3 p-4 text-left"
              >
                <FileText className="h-5 w-5 shrink-0 text-cyan-200" />
                <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-5 text-slate-200">
                  {transcriptText || "无转写文本"}
                </p>
              </button>
            )}

            <div className="absolute top-3 right-3 z-10 flex gap-1.5">
              {item.type === "image" ? (
                <span className="imagine-asset-type-badge flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-blue-500/80 backdrop-blur-md text-white border border-blue-400/25">
                  <ImageIcon className="h-3 w-3" />
                  IMAGE
                </span>
              ) : item.type === "video" ? (
                <span className="imagine-asset-type-badge flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-purple-500/80 backdrop-blur-md text-white border border-purple-400/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
                  VIDEO
                </span>
              ) : item.type === "audio" ? (
                <span className="imagine-asset-type-badge imagine-audio-type-badge flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded border border-white/12 bg-slate-950/46 text-slate-100 backdrop-blur-md">
                  <Music className="h-3 w-3" />
                  AUDIO
                </span>
              ) : (
                <span className="imagine-asset-type-badge flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded border border-cyan-400/20 bg-cyan-500/18 text-cyan-100 backdrop-blur-md">
                  <FileText className="h-3 w-3" />
                  TEXT
                </span>
              )}
            </div>

            <div className="absolute top-3 left-3 z-10">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(item.id)}
                aria-label={selected ? "取消选择此资产" : "选择此资产"}
                className="h-4.5 w-4.5 bg-slate-950/85 border-white/10 text-blue-500 focus:ring-0 rounded-md cursor-pointer checked:bg-blue-600 flex items-center justify-center transition"
              />
            </div>

            <button
              type="button"
              className="imagine-mobile-action-trigger hidden"
              aria-expanded={isMobileActionsOpen}
              aria-label="打开资产操作"
              onClick={() => setIsMobileActionsOpen(prev => !prev)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {isMobileActionsOpen && (
              <div className="imagine-mobile-action-sheet">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                  <span className="imagine-mobile-action-sheet-title text-[11px] font-semibold">资产操作</span>
                  <button
                    type="button"
                    onClick={() => setIsMobileActionsOpen(false)}
                    className="imagine-mobile-action-sheet-close rounded-md p-1"
                    aria-label="关闭资产操作"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 p-2">
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onApplyVideoReference(item))}>
                      <VideoIcon className="h-3.5 w-3.5 text-purple-300" />
                      生视频
                    </button>
                  )}
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onUseAgentReference(item))}>
                      <Sparkles className="h-3.5 w-3.5 text-blue-300" />
                      Agent
                    </button>
                  )}
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onOpenPanorama(item))}>
                      <Compass className="h-3.5 w-3.5 text-cyan-300" />
                      全景
                    </button>
                  )}
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onLaunchMaskEditor(item.url, item.id))}>
                      <Paintbrush className="h-3.5 w-3.5 text-amber-300" />
                      修改
                    </button>
                  )}
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onImageQuickEdit(item, "redraw"))}>
                      <Paintbrush className="h-3.5 w-3.5 text-sky-300" />
                      重绘
                    </button>
                  )}
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onImageQuickEdit(item, "erase"))}>
                      <X className="h-3.5 w-3.5 text-rose-300" />
                      擦除
                    </button>
                  )}
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onImageQuickEdit(item, "outpaint"))}>
                      <ImageDown className="h-3.5 w-3.5 text-indigo-300" />
                      扩图
                    </button>
                  )}
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onImageQuickEdit(item, "cutout"))}>
                      <Scissors className="h-3.5 w-3.5 text-emerald-300" />
                      抠图
                    </button>
                  )}
                  <button type="button" onClick={() => runMobileAction(() => onDownload(item))}>
                    <Download className="h-3.5 w-3.5 text-emerald-300" />
                    下载
                  </button>
                  <button type="button" onClick={() => runMobileAction(() => onReuseTask(item))}>
                    <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-300" />
                    复用
                  </button>
                  {item.type !== "transcript" && (
                    <button type="button" onClick={() => runMobileAction(() => onToggleCompare(item.id))}>
                      <RefreshCw className="h-3.5 w-3.5 text-blue-300" />
                      {inCompare ? "取消对比" : "对比"}
                    </button>
                  )}
                  <button type="button" onClick={() => runMobileAction(() => onOpenFullscreen(item))}>
                    <Maximize2 className="h-3.5 w-3.5 text-slate-300" />
                    放大
                  </button>
                  <button type="button" onClick={() => runMobileAction(() => onDelete(item))}>
                    <Trash2 className="h-3.5 w-3.5 text-red-300" />
                    删除
                  </button>
                </div>
              </div>
            )}

            <div className="imagine-asset-hover-scrim absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none" />
            <div className={`imagine-card-actions-shell absolute inset-x-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30 pointer-events-none group-hover:pointer-events-auto ${
              item.type === "video" ? "bottom-[2.85rem]" : item.type === "audio" ? "bottom-16" : "bottom-3"
            }`}>
              <div className="imagine-card-actions imagine-floating-card-actions flex flex-wrap items-center justify-center gap-1 rounded-xl border border-transparent bg-transparent p-1 shadow-none">
                {item.type === "video" && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setFrameMenuPlacement(prev => prev === "hover" ? null : "hover")}
                      className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-cyan-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                      title="截取视频帧"
                      aria-label="截取视频帧"
                    >
                      <ImageDown className="h-3 w-3 text-cyan-200 group-hover:text-white" />
                      <span className="text-[9px] font-bold">截帧</span>
                    </button>
                    {frameMenuPlacement === "hover" && (
                      <div className="absolute bottom-full left-0 mb-1 grid min-w-24 gap-1 rounded-lg border border-white/12 bg-slate-950/94 p-1 text-xs text-slate-100 shadow-xl backdrop-blur">
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
                )}

                {item.type === "image" && (
                  <button
                    type="button"
                    onClick={() => onOpenPanorama(item)}
                    className="imagine-card-action imagine-panorama-action min-w-0 px-1.5 py-1 rounded-md border text-xs transition-all duration-[160ms] shadow-lg flex items-center justify-center cursor-pointer"
                    title="360 全景查看"
                    aria-label="360 全景查看"
                  >
                    <Compass className="h-3 w-3" />
                    <span className="text-[9px] font-bold">360</span>
                  </button>
                )}

                {item.type === "image" && (
                  <button
                    onClick={() => onApplyVideoReference(item)}
                    className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-purple-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                    title="以此图首帧生图动态 Veo 航拍影片"
                    aria-label="以此图首帧生成视频"
                  >
                    <VideoIcon className="h-3 w-3 text-purple-450 group-hover:text-white" />
                    <span className="text-[9px] font-bold">生视频</span>
                  </button>
                )}

                {item.type === "image" && (
                  <button
                    onClick={() => onUseAgentReference(item)}
                    className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-blue-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                    title="引用该图片至 Agent 智能代理进行对话与局部修改"
                    aria-label="引用至 Agent"
                  >
                    <Sparkles className="h-3 w-3 text-blue-400 group-hover:text-white animate-pulse" />
                    <span className="text-[9px] font-bold">Agent</span>
                  </button>
                )}

                {item.type === "image" && (
                  <button
                    onClick={() => onLaunchMaskEditor(item.url, item.id)}
                    className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-amber-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                    title="对该图片局部进行笔刷遮罩修改 & 创意局部重绘"
                    aria-label="局部修改"
                  >
                    <Paintbrush className="h-3 w-3 text-amber-500 group-hover:text-white" />
                    <span className="text-[9px] font-bold">修改</span>
                  </button>
                )}

                {item.type === "image" && (
                  <>
                    <button
                      onClick={() => onImageQuickEdit(item, "redraw")}
                      className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-sky-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                      title="绘制蒙版并重绘局部"
                      aria-label="重绘"
                    >
                      <Paintbrush className="h-3 w-3 text-sky-300 group-hover:text-white" />
                      <span className="text-[9px] font-bold">重绘</span>
                    </button>
                    <button
                      onClick={() => onImageQuickEdit(item, "erase")}
                      className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-rose-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                      title="绘制蒙版并擦除区域"
                      aria-label="擦除"
                    >
                      <X className="h-3 w-3 text-rose-300 group-hover:text-white" />
                      <span className="text-[9px] font-bold">擦除</span>
                    </button>
                    <button
                      onClick={() => onImageQuickEdit(item, "outpaint")}
                      className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-indigo-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                      title="扩展画面边界"
                      aria-label="扩图"
                    >
                      <ImageDown className="h-3 w-3 text-indigo-300 group-hover:text-white" />
                      <span className="text-[9px] font-bold">扩图</span>
                    </button>
                    <button
                      onClick={() => onImageQuickEdit(item, "cutout")}
                      className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-emerald-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                      title="移除背景并保留主体"
                      aria-label="抠图"
                    >
                      <Scissors className="h-3 w-3 text-emerald-300 group-hover:text-white" />
                      <span className="text-[9px] font-bold">抠图</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => onReuseTask(item)}
                  className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-cyan-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                  title="将此任务的提示词、模型、尺寸与参考图回填到左侧工作面板"
                  aria-label="复用任务参数"
                >
                  <SlidersHorizontal className="h-3 w-3 text-cyan-300 group-hover:text-white" />
                  <span className="text-[9px] font-bold">复用</span>
                </button>

                {item.type === "audio" && item.status === "complete" && (
                  <button
                    type="button"
                    onClick={() => onSaveVoiceProfile(item)}
                    className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-cyan-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                    title="保存为可复用克隆音色"
                    aria-label="保存为克隆音色"
                  >
                    <Mic2 className="h-3 w-3 text-cyan-300 group-hover:text-white" />
                    <span className="text-[9px] font-bold">音色</span>
                  </button>
                )}

                <button
                  onClick={() => onDownload(item)}
                  className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-emerald-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                  title="下载该文件到本地"
                  aria-label="下载文件"
                >
                  <Download className="h-3 w-3 text-emerald-400 group-hover:text-white" />
                  <span className="text-[9px] font-bold">下载</span>
                </button>

                {item.type !== "transcript" && (
                  <button
                    onClick={() => onToggleCompare(item.id)}
                    className={`imagine-card-action min-w-0 px-1.5 py-1 rounded-md border transition-all duration-[160ms] shadow-lg flex items-center justify-center gap-0.5 cursor-pointer ${
                      inCompare
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-slate-900/90 border-white/5 text-slate-300 hover:text-white hover:bg-slate-800"
                    }`}
                    title="加入左右侧滑块对比面板"
                    aria-label={inCompare ? "从对比面板移除" : "加入对比面板"}
                  >
                    <RefreshCw className="h-3 w-3 text-blue-400" />
                    <span className="text-[9px] font-bold">对比</span>
                  </button>
                )}

                <button
                  onClick={() => onOpenFullscreen(item)}
                  className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-slate-800 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center cursor-pointer"
                  title="全屏大画幅细节放大"
                  aria-label="全屏预览"
                >
                  <Maximize2 className="h-3 w-3 text-slate-300" />
                </button>

                <button
                  onClick={() => onDelete(item)}
                  className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-red-600 border border-white/5 rounded-md text-xs text-white transition-all duration-[160ms] shadow-lg flex items-center justify-center cursor-pointer"
                  title="移除此项"
                  aria-label="删除资产"
                >
                  <Trash2 className="h-3 w-3 text-red-300" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="imagine-asset-meta flex min-h-[88px] flex-col gap-1.5 bg-[#0e0e12] p-2">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-sans text-[11px] font-medium text-slate-300" title={item.prompt}>
            {item.prompt}
          </p>
          {referenceMedia.length > 0 && (
            <div className="flex shrink-0 items-center gap-1">
              <span className="font-mono text-[10px] text-[var(--iw-faint)]">参考</span>
              <div className="no-scrollbar flex max-w-[96px] gap-1 overflow-x-auto">
                {referenceMedia.map((reference, index) => {
                  const mediaType = reference.type;
                  return (
                    <button
                      type="button"
                      key={`${item.id}_reference_${index}`}
                      onClick={() => onOpenReferencePreview(item, index)}
                      className="relative h-7 w-7 overflow-hidden rounded-md border border-white/10 bg-slate-950 transition hover:border-cyan-300/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                      title={`点击放大参考${mediaReferenceLabel(mediaType)} ${index + 1}`}
                    >
                      {mediaType === "image" ? (
                        <PreviewImage src={reference.url} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
                      ) : mediaType === "video" ? (
                        <video src={reference.url} muted preload="metadata" className="h-full w-full object-cover" />
                      ) : (
                        <Music className="m-auto h-full w-3.5 text-slate-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-end border-t border-[var(--iw-border)] pt-1.5">
          <div className="flex max-h-10 flex-wrap items-center gap-1 overflow-hidden font-mono text-[10px] text-[var(--iw-faint)]">
            <span className="imagine-meta-chip rounded bg-white/5 px-1.5 py-0.5">
              {getProviderMeta(provider).label}
            </span>
            <span className="imagine-meta-chip max-w-[150px] truncate rounded bg-white/5 px-1.5 py-0.5" title={item.model}>
              🤖 {formatModelName(item.model)}
            </span>
            <span className="imagine-meta-chip rounded bg-white/5 px-1.5 py-0.5">📐 {formatDisplayedAspectRatio(item)}</span>
            <span className="imagine-meta-chip imagine-status-chip rounded bg-white/5 px-1.5 py-0.5">{item.status}</span>
            {item.errorMessage && (
              <span className="max-w-[160px] truncate rounded bg-red-500/10 px-2 py-0.5 text-[10px] text-red-300" title={item.errorMessage}>
                last error: {item.errorMessage}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-[var(--iw-faint)]">
              {formatCreatedAt(item.createdAt)}
            </span>

            <div className="flex items-center gap-1.5">
              {item.type === "video" && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setFrameMenuPlacement(prev => prev === "meta" ? null : "meta")}
                    className="text-slate-500 hover:text-cyan-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                    title="截取视频帧"
                  >
                    <ImageDown className="h-3.5 w-3.5" />
                  </button>
                  {frameMenuPlacement === "meta" && (
                    <div className="absolute bottom-full right-0 mb-1 grid min-w-24 gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-xl">
                      {frameCaptureActions.map(action => {
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.mode}
                            type="button"
                            onClick={() => captureVideoFrame(action.mode)}
                            className="flex h-8 items-center gap-2 rounded-md px-2 text-left transition hover:bg-slate-100"
                          >
                            <Icon className="h-3.5 w-3.5 text-cyan-500" />
                            <span className="whitespace-nowrap">{getVideoFrameCaptureLabel(action.mode)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => onReuseTask(item)}
                className="text-slate-500 hover:text-cyan-300 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="复用任务参数到左侧面板"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>

              <button
                onClick={() => onDelete(item)}
                className="text-slate-600 hover:text-red-400 p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="单独移除此项"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
