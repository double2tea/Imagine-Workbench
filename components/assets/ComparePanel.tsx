import { Sliders } from "lucide-react";
import PreviewImage from "@/components/PreviewImage";
import type { StorageItem } from "@/lib/db";

export type CompareViewType = "side-by-side" | "wipe-slider";

interface ComparePanelProps {
  compareItemIds: string[];
  first?: StorageItem;
  second?: StorageItem;
  sliderPos: number;
  viewType: CompareViewType;
  onReset: () => void;
  onSliderPosChange: (value: number) => void;
  onViewTypeChange: (value: CompareViewType) => void;
}

function formatModelName(model: string): string {
  return model.replace("-preview", "").replace("lite-", "").replace("imagen-", "Imagen");
}

function CompareFrame({ item, tone }: { item: StorageItem; tone: "blue" | "amber" }) {
  const isBlue = tone === "blue";

  return (
    <div className="border border-white/5 rounded-2xl overflow-hidden bg-slate-950 p-3 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${
              isBlue
                ? "text-blue-400 bg-blue-500/10 border-blue-500/20"
                : "text-amber-500 bg-amber-500/10 border-amber-500/25"
            }`}
          >
            FRAME {isBlue ? "A" : "B"}: {item.id.substring(0, 8)}
          </span>
          <span className="text-[9px] font-mono text-slate-500">🤖 {formatModelName(item.model)}</span>
        </div>

        <div className="aspect-[4/3] relative w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center">
          {item.type === "image" ? (
            <PreviewImage src={item.url} alt={isBlue ? "A" : "B"} className="w-full h-full object-cover" />
          ) : (
            <video src={item.url} controls loop preload="metadata" className="w-full h-full object-cover" />
          )}
        </div>
      </div>

      <p className="text-[10px] text-slate-300 mt-2.5 line-clamp-2 leading-relaxed italic" title={item.prompt}>
        &ldquo;{item.prompt}&rdquo;
      </p>
    </div>
  );
}

export default function ComparePanel({
  compareItemIds,
  first,
  second,
  sliderPos,
  viewType,
  onReset,
  onSliderPosChange,
  onViewTypeChange,
}: ComparePanelProps) {
  const isBothImages = first?.type === "image" && second?.type === "image";

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-[#0e0e12]/90 backdrop-blur-md p-5 flex flex-col gap-4 animate-fade-in shadow-[0_0_25px_rgba(37,99,235,0.07)]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-ping" />
            🔄 极智画论对比器 (Visual Layout Contrast)
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            选中两张创意项，即可进行高精度像素级滑动擦拭或双面分屏对判。
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isBothImages && (
            <div className="flex bg-white/5 border border-white/5 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => onViewTypeChange("wipe-slider")}
                className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all duration-200 cursor-pointer ${
                  viewType === "wipe-slider" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🖱️ 滑过擦拭
              </button>
              <button
                type="button"
                onClick={() => onViewTypeChange("side-by-side")}
                className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all duration-200 cursor-pointer ${
                  viewType === "side-by-side" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🔲 双幅分屏
              </button>
            </div>
          )}

          <button
            onClick={onReset}
            className="text-xs text-slate-400 hover:text-red-400 font-medium px-2 py-1 bg-white/5 border border-white/5 rounded-lg hover:border-red-500/20 transition cursor-pointer"
          >
            重置
          </button>
        </div>
      </div>

      {compareItemIds.length !== 2 ? (
        <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-1.5">
          <span>ℹ️ 请先到下方画廊中勾选 2 个项目的「对比」按钮来开启对比！</span>
          <span>（当前已选中: {compareItemIds.length}/2 个）</span>
        </div>
      ) : !first || !second ? (
        <div className="p-4 border border-dashed border-slate-800 rounded-xl text-center text-xs text-slate-500">
          匹配素材载入失败。请重新勾选有效果的原片。
        </div>
      ) : viewType === "wipe-slider" && isBothImages ? (
        <div className="flex flex-col gap-3">
          <div className="relative w-full aspect-[4/3] rounded-2xl border border-white/5 overflow-hidden bg-slate-950 select-none shadow-2xl">
            <PreviewImage
              src={first.url}
              alt="Compare item A"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
            <div className="absolute bottom-3 left-3 z-20 bg-black/70 backdrop-blur-md border border-white/5 px-2.5 py-1 rounded-xl text-[10px] text-slate-300 pointer-events-none flex flex-col gap-0.5">
              <span className="font-bold text-blue-400 text-[11px]">A: 原始起稿</span>
              <span className="font-mono text-[9px] text-slate-400 truncate max-w-[120px]" title={first.prompt}>
                {first.id.substring(0, 8)}
              </span>
            </div>

            <PreviewImage
              src={second.url}
              alt="Compare item B"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
            />
            <div className="absolute bottom-3 right-3 z-20 bg-black/70 backdrop-blur-md border border-white/5 px-2.5 py-1 rounded-xl text-[10px] text-slate-300 pointer-events-none text-right flex flex-col gap-0.5">
              <span className="font-bold text-amber-500 text-[11px]">B: 演进渲染</span>
              <span className="font-mono text-[9px] text-slate-400 truncate max-w-[120px]" title={second.prompt}>
                {second.id.substring(0, 8)}
              </span>
            </div>

            <div
              className="absolute top-0 bottom-0 w-0.5 bg-blue-500/80 z-20 pointer-events-none"
              style={{ left: `${sliderPos}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-600 border border-blue-400 shadow-md flex items-center justify-center pointer-events-none animate-pulse">
                <Sliders className="h-4 w-4 text-white rotate-90" />
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={sliderPos}
              onChange={(e) => onSliderPosChange(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 z-30 cursor-ew-resize"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] px-1 font-mono text-slate-400">
            <span className="truncate max-w-[45%] italic" title={first.prompt}>👈 A: {first.prompt}</span>
            <span className="text-blue-400 font-bold">拉拽滑锁进行滑动对比 (Drag Slider)</span>
            <span className="truncate max-w-[45%] text-right italic" title={second.prompt}>👉 B: {second.prompt}</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CompareFrame item={first} tone="blue" />
          <CompareFrame item={second} tone="amber" />
        </div>
      )}
    </div>
  );
}
