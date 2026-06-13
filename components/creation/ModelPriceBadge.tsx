"use client";

import { usePriceDisplaySetting } from "@/hooks/usePriceDisplaySetting";
import { calculateModelPrice, formatPriceValue } from "@/lib/providers/pricing";

interface ModelPriceBadgeProps {
  provider: string;
  modelId: string;
  duration?: string;
  resolution?: string;
  imageQuality?: string;
  referenceTypes?: Array<"image" | "video" | "audio">;
  thinkingLevel?: string;
  videoReferenceMode?: "reference" | "firstLast" | "none";
  videoResolution?: string;
}

export default function ModelPriceBadge({
  provider,
  modelId,
  duration,
  resolution,
  imageQuality,
  referenceTypes,
  thinkingLevel,
  videoReferenceMode,
  videoResolution,
}: ModelPriceBadgeProps) {
  const [showPrice] = usePriceDisplaySetting();
  if (!showPrice) return null;

  const price = calculateModelPrice(provider, modelId, {
    duration,
    imageQuality,
    referenceTypes,
    resolution,
    thinkingLevel,
    videoReferenceMode,
    videoResolution,
  });
  if (!price) return null;

  const formatted = price.isCalculated
    ? `约 ¥${formatPriceValue(price.totalPrice)}`
    : `¥${formatPriceValue(price.price)} / ${price.unit}`;

  return (
    <span
      className="imagine-model-price-badge inline-flex shrink-0 items-center rounded-full border border-white/25 bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white shadow-sm shadow-black/10"
      title={price.detail ?? formatted}
    >
      {formatted}
    </span>
  );
}
