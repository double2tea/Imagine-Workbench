"use client";

import { useState } from "react";
import { Sliders, X } from "lucide-react";
import PreviewImage from "@/components/PreviewImage";
import { useTranslations } from "@/lib/i18n";

interface BoardAssetCompareOverlayProps {
  originalUrl: string;
  resultUrl: string;
  onClose: () => void;
}

export default function BoardAssetCompareOverlay({ originalUrl, resultUrl, onClose }: BoardAssetCompareOverlayProps) {
  const { t } = useTranslations("board");
  const [sliderPos, setSliderPos] = useState(50);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--iw-bg)]/90 p-4 backdrop-blur-md">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-muted)] transition hover:text-[var(--iw-text)]"
        aria-label={t('compare.close')}
      >
        <X className="h-5 w-5" />
      </button>
      <div className="flex w-full max-w-4xl flex-col gap-3">
        <div className="text-center">
          <h2 className="text-sm font-semibold text-[var(--iw-text)]">{t('compare.title')}</h2>
          <p className="mt-1 text-[11px] text-[var(--iw-muted)]">{t('compare.hint')}</p>
        </div>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]">
          <PreviewImage src={originalUrl} alt={t('compare.referenceAlt')} className="absolute inset-0 h-full w-full object-contain" />
          <PreviewImage
            src={resultUrl}
            alt={t('compare.resultAlt')}
            className="absolute inset-0 h-full w-full object-contain"
            style={{ clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}
          />
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-blue-500/80"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-blue-400 bg-blue-600 shadow-md">
              <Sliders className="h-4 w-4 rotate-90 text-white" />
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={sliderPos}
            onChange={(event) => setSliderPos(Number(event.target.value))}
            className="absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0"
            aria-label={t('compare.sliderAriaLabel')}
          />
          <span className="imagine-tone-chip pointer-events-none absolute bottom-2 left-2 rounded-md border px-2 py-1 text-[10px] font-semibold" data-tone="accent">
            {t('compare.referenceLabel')}
          </span>
          <span className="imagine-tone-chip pointer-events-none absolute bottom-2 right-2 rounded-md border px-2 py-1 text-[10px] font-semibold" data-tone="warning">
            {t('compare.resultLabel')}
          </span>
        </div>
      </div>
    </div>
  );
}
