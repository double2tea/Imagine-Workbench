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
    <div className="imagine-compare-frame flex flex-col justify-between overflow-hidden rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold ${
              isBlue
                ? "border-blue-500/25 bg-blue-500/10 text-blue-300"
                : "border-amber-500/25 bg-amber-500/10 text-amber-400"
            }`}
          >
            {isBlue ? "A" : "B"} · {item.id.substring(0, 8)}
          </span>
          <span className="font-mono text-[9px] text-[var(--iw-faint)]">{formatModelName(item.model)}</span>
        </div>

        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)]">
          {item.type === "image" ? (
            <PreviewImage src={item.url} alt={isBlue ? "对比 A" : "对比 B"} className="h-full w-full object-cover" />
          ) : (
            <video src={item.url} controls loop preload="metadata" className="h-full w-full object-cover" />
          )}
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 text-[10px] leading-relaxed text-[var(--iw-muted)]" title={item.prompt}>
        {item.prompt}
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
    <div className="imagine-compare-panel imagine-control-surface flex animate-fade-in flex-col gap-4 rounded-xl border border-[var(--iw-border)] p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--iw-text)]">
            <Sliders className="h-4 w-4 text-[var(--iw-accent)]" aria-hidden />
            作品对比
          </h3>
          <p className="mt-0.5 text-[10px] text-[var(--iw-muted)]">在画廊勾选 2 项后，可分屏或滑块对比。</p>
        </div>

        <div className="flex items-center gap-3">
          {isBothImages && (
            <div className="flex rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => onViewTypeChange("wipe-slider")}
                className={`cursor-pointer rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                  viewType === "wipe-slider"
                    ? "bg-[var(--iw-accent)] text-white"
                    : "text-[var(--iw-muted)] hover:text-[var(--iw-text)]"
                }`}
              >
                滑块
              </button>
              <button
                type="button"
                onClick={() => onViewTypeChange("side-by-side")}
                className={`cursor-pointer rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                  viewType === "side-by-side"
                    ? "bg-[var(--iw-accent)] text-white"
                    : "text-[var(--iw-muted)] hover:text-[var(--iw-text)]"
                }`}
              >
                分屏
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onReset}
            className="imagine-secondary-action cursor-pointer rounded-lg border border-[var(--iw-border)] px-2 py-1 text-xs font-medium text-[var(--iw-muted)] transition hover:text-[var(--iw-text)]"
          >
            重置
          </button>
        </div>
      </div>

      {compareItemIds.length !== 2 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--iw-border)] p-8 text-center text-xs text-[var(--iw-muted)]">
          <span>请在画廊中为 2 个作品开启「对比」。</span>
          <span className="font-mono text-[10px]">已选 {compareItemIds.length}/2</span>
        </div>
      ) : !first || !second ? (
        <div className="rounded-xl border border-dashed border-[var(--iw-border)] p-4 text-center text-xs text-[var(--iw-muted)]">
          对比素材加载失败，请重新勾选。
        </div>
      ) : viewType === "wipe-slider" && isBothImages ? (
        <div className="flex flex-col gap-3">
          <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel)] shadow-lg">
            <PreviewImage
              src={first.url}
              alt="对比 A"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)]/90 px-2.5 py-1 text-[10px] text-[var(--iw-muted)] backdrop-blur-md">
              <span className="font-semibold text-blue-400">A</span>
              <span className="ml-1 font-mono text-[9px]">{first.id.substring(0, 8)}</span>
            </div>

            <PreviewImage
              src={second.url}
              alt="对比 B"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
            />
            <div className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)]/90 px-2.5 py-1 text-right text-[10px] text-[var(--iw-muted)] backdrop-blur-md">
              <span className="font-semibold text-amber-500">B</span>
              <span className="ml-1 font-mono text-[9px]">{second.id.substring(0, 8)}</span>
            </div>

            <div
              className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-[var(--iw-accent)]"
              style={{ left: `${sliderPos}%` }}
            >
              <div className="absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--iw-accent)] bg-[var(--iw-accent-strong)] shadow-md">
                <Sliders className="h-4 w-4 rotate-90 text-white" aria-hidden />
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={sliderPos}
              aria-label="对比滑块位置"
              onChange={event => onSliderPosChange(Number(event.target.value))}
              className="absolute inset-0 z-30 h-full w-full cursor-ew-resize opacity-0"
            />
          </div>

          <div className="flex items-center justify-between px-1 font-mono text-[11px] text-[var(--iw-faint)]">
            <span className="max-w-[45%] truncate" title={first.prompt}>
              A: {first.prompt}
            </span>
            <span className="text-[var(--iw-accent)]">拖动滑块</span>
            <span className="max-w-[45%] truncate text-right" title={second.prompt}>
              B: {second.prompt}
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CompareFrame item={first} tone="blue" />
          <CompareFrame item={second} tone="amber" />
        </div>
      )}
    </div>
  );
}