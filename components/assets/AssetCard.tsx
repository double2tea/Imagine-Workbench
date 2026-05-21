import {
  Download,
  Image as ImageIcon,
  Maximize2,
  Paintbrush,
  RefreshCw,
  Sparkles,
  Trash2,
  Video as VideoIcon,
  X,
} from "lucide-react";
import type { DragEvent } from "react";
import PreviewImage from "@/components/PreviewImage";
import { makeReferenceDropToken, REFERENCE_ASSET_MIME } from "@/components/reference/referenceDrag";
import type { StorageItem } from "@/lib/db";
import { parseProviderModel, type AiProvider } from "@/lib/providers/model-catalog";
import { getProviderMeta } from "@/lib/providers/registry";

interface AssetCardProps {
  canceling: boolean;
  inCompare: boolean;
  item: StorageItem;
  selected: boolean;
  selectedProvider: AiProvider;
  onApplyVideoReference: (item: StorageItem) => void;
  onCancel: (item: StorageItem) => void;
  onDelete: (item: StorageItem) => void;
  onDownload: (item: StorageItem) => void;
  onLaunchMaskEditor: (imageUrl: string, id: string) => void;
  onOpenFullscreen: (item: StorageItem) => void;
  onRetry: (item: StorageItem) => void;
  onToggleCompare: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onUseAgentReference: (item: StorageItem) => void;
}

function formatModelName(model: string): string {
  return model.replace("-preview", "").replace("lite-", "").replace("-generate", "").replace("imagen-", "Imagen");
}

export default function AssetCard({
  canceling,
  inCompare,
  item,
  selected,
  selectedProvider,
  onApplyVideoReference,
  onCancel,
  onDelete,
  onDownload,
  onLaunchMaskEditor,
  onOpenFullscreen,
  onRetry,
  onToggleCompare,
  onToggleSelect,
  onUseAgentReference,
}: AssetCardProps) {
  const provider = parseProviderModel(item.model, selectedProvider).provider;
  const isDraggableReference = item.type === "image" && item.status === "complete";

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!isDraggableReference) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(REFERENCE_ASSET_MIME, JSON.stringify({ id: item.id, url: item.url }));
    event.dataTransfer.setData("text/plain", makeReferenceDropToken(item.id));
  };

  return (
    <div
      draggable={isDraggableReference}
      data-status={item.status}
      data-type={item.type}
      onDragStart={handleDragStart}
      className={`imagine-asset-card relative overflow-hidden rounded-2xl group border bg-slate-900 shadow-xl transition-all duration-300 flex flex-col justify-between ${
        selected ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-850 hover:border-slate-750"
      }`}
    >
      <div className="imagine-asset-media relative aspect-[4/3] w-full bg-slate-950 overflow-hidden flex items-center justify-center border-b border-white/5">
        {item.status === "processing" || item.status === "pending" ? (
          <div className="absolute inset-0 bg-[#07070a] flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 bg-blue-500/10 rounded-full blur-2xl animate-pulse" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-indigo-500/5 rounded-full blur-xl animate-ping" />

            <div className="relative z-10 flex flex-col items-center">
              <div className="h-9 w-9 rounded-xl bg-blue-600/10 border border-blue-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.2)] mb-3 animate-spin duration-3000">
                <RefreshCw className="h-4.5 w-4.5 text-blue-400 animate-spin" />
              </div>
              <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                {item.status === "pending" ? "任务已排队..." : item.type === "video" ? "智影合成中..." : "极精算色中..."}
              </p>
              <span className="text-[9px] font-mono text-slate-500 mt-1">模型: {formatModelName(item.model)}</span>

              <div className="w-36 bg-white/5 h-1 rounded-full overflow-hidden mt-4 border border-white/5 shadow-inner">
                <div
                  className="bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 h-full transition-all duration-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-blue-400 mt-2 font-mono font-bold tracking-widest">
                {item.progress}% {item.status.toUpperCase()}
              </span>
              <button
                type="button"
                onClick={() => onCancel(item)}
                disabled={canceling}
                className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-400/50 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold text-red-200 transition hover:border-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-55"
                title={item.operationName?.startsWith("12ai:video:") ? "取消 12AI 视频生成任务" : "从本地取消并停止等待"}
              >
                <X className="h-3 w-3" />
                {canceling ? "取消中" : "取消"}
              </button>
            </div>
          </div>
        ) : item.status === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 px-4 py-3 text-center text-red-400 select-none">
            <X className="mb-1.5 h-6 w-6 shrink-0 text-red-500/55" />
            <p className="text-xs font-semibold leading-5">生成失败 / 链接中断</p>
            <p className="mt-0.5 line-clamp-2 max-w-full break-words text-[10px] leading-4 text-slate-550">
              {item.errorMessage ?? "请核查 API Key 或重构参数。"}
            </p>
            <button
              type="button"
              onClick={() => onRetry(item)}
              className="mt-2 flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/60 bg-red-600 px-3 py-1.5 text-[10px] font-bold text-white shadow-sm shadow-red-950/20 transition hover:bg-red-500"
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
          </div>
        ) : (
          <div className="relative flex h-full w-full items-center justify-center bg-slate-950">
            {item.type === "image" ? (
              <PreviewImage
                src={item.url}
                alt={item.prompt}
                className="h-full w-full cursor-pointer object-contain transition duration-500"
                onClick={() => onOpenFullscreen(item)}
              />
            ) : (
              <div className="relative flex h-full w-full items-center justify-center bg-slate-950">
                <video src={item.url} controls loop preload="metadata" className="h-full w-full object-contain" />
              </div>
            )}

            <div className="absolute top-3 right-3 z-10 flex gap-1.5">
              {item.type === "image" ? (
                <span className="imagine-asset-type-badge flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-blue-500/80 backdrop-blur-md text-white border border-blue-400/25">
                  <ImageIcon className="h-3 w-3" />
                  IMAGE
                </span>
              ) : (
                <span className="imagine-asset-type-badge flex items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-purple-500/80 backdrop-blur-md text-white border border-purple-400/25">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
                  VEO VIDEO
                </span>
              )}
            </div>

            <div className="absolute top-3 left-3 z-10">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(item.id)}
                className="h-4.5 w-4.5 bg-slate-950/85 border-white/10 text-blue-500 focus:ring-0 rounded-md cursor-pointer checked:bg-blue-600 flex items-center justify-center transition"
              />
            </div>

            <div className="imagine-asset-hover-scrim absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none" />
            <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 pointer-events-none group-hover:pointer-events-auto">
              <div className="imagine-card-actions flex flex-wrap items-center justify-center gap-1 rounded-xl border border-white/10 bg-slate-950/80 p-1 backdrop-blur-md shadow-xl">
                {item.type === "image" && (
                  <button
                    onClick={() => onApplyVideoReference(item)}
                    className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-purple-600 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                    title="以此图首帧生图动态 Veo 航拍影片"
                  >
                    <VideoIcon className="h-3 w-3 text-purple-450 group-hover:text-white" />
                    <span className="text-[9px] font-bold">生视频</span>
                  </button>
                )}

                {item.type === "image" && (
                  <button
                    onClick={() => onUseAgentReference(item)}
                    className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-blue-600 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                    title="引用该图片至 Agent 智能代理进行对话与局部修改"
                  >
                    <Sparkles className="h-3 w-3 text-blue-455 text-blue-400 group-hover:text-white animate-pulse" />
                    <span className="text-[9px] font-bold">Agent</span>
                  </button>
                )}

                {item.type === "image" && (
                  <button
                    onClick={() => onLaunchMaskEditor(item.url, item.id)}
                    className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-amber-600 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                    title="对该图片局部进行笔刷遮罩修改 & 创意局部重绘"
                  >
                    <Paintbrush className="h-3 w-3 text-amber-500 group-hover:text-white" />
                    <span className="text-[9px] font-bold">修改</span>
                  </button>
                )}

                <button
                  onClick={() => onDownload(item)}
                  className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-emerald-600 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer"
                  title="下载该文件到本地"
                >
                  <Download className="h-3 w-3 text-emerald-400 group-hover:text-white" />
                  <span className="text-[9px] font-bold">下载</span>
                </button>

                <button
                  onClick={() => onToggleCompare(item.id)}
                  className={`imagine-card-action min-w-0 px-1.5 py-1 rounded-md border transition-all duration-200 shadow-lg flex items-center justify-center gap-0.5 cursor-pointer ${
                    inCompare
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-slate-900/90 border-white/5 text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                  title="加入左右侧滑块对比面板"
                >
                  <RefreshCw className="h-3 w-3 text-blue-400" />
                  <span className="text-[9px] font-bold">对比</span>
                </button>

                <button
                  onClick={() => onOpenFullscreen(item)}
                  className="imagine-card-action min-w-0 px-1.5 py-1 bg-slate-900/90 hover:bg-slate-800 border border-white/5 rounded-md text-xs text-white transition-all duration-200 shadow-lg flex items-center justify-center cursor-pointer"
                  title="全屏大画幅细节放大"
                >
                  <Maximize2 className="h-3 w-3 text-slate-300" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="imagine-asset-meta p-3.5 bg-[#0e0e12] flex-1 flex flex-col justify-between">
        <div>
          <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed font-sans" title={item.prompt}>
            {item.prompt}
          </p>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-850 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-mono text-slate-500">
            <span className="imagine-meta-chip bg-white/5 px-2 py-0.5 rounded text-[9px]">
              {getProviderMeta(provider).label}
            </span>
            <span className="imagine-meta-chip bg-white/5 px-2 py-0.5 rounded text-[9px]" title={item.model}>
              🤖 {formatModelName(item.model)}
            </span>
            <span className="imagine-meta-chip bg-white/5 px-2 py-0.5 rounded">📐 {item.aspectRatio}</span>
            <span className="imagine-meta-chip imagine-status-chip bg-white/5 px-2 py-0.5 rounded">{item.status}</span>
            {item.errorMessage && (
              <span className="max-w-[160px] truncate rounded bg-red-500/10 px-2 py-0.5 text-red-300" title={item.errorMessage}>
                last error: {item.errorMessage}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-slate-650">
              {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>

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
  );
}
