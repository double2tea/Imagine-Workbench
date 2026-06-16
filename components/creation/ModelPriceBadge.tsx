"use client";

import { usePriceDisplaySetting } from "@/hooks/usePriceDisplaySetting";
import { calculateModelPrice, formatPriceValue, type ModelPriceOptions } from "@/lib/providers/pricing";

interface ModelPriceBadgeProps {
  provider: string;
  modelId: string;
  options?: ModelPriceOptions;
}

export default function ModelPriceBadge({
  provider,
  modelId,
  options,
}: ModelPriceBadgeProps) {
  const [showPrice] = usePriceDisplaySetting();
  if (!showPrice) return null;

  const price = calculateModelPrice(provider, modelId, options);
  if (!price) return null;

  const formatted = price.isCalculated
    ? `~¥${formatPriceValue(price.totalPrice)}`
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
