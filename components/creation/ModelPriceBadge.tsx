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
      className="imagine-model-price-badge iw-type-label inline-flex shrink-0 items-center rounded-full border border-[color-mix(in_srgb,#fff_25%,transparent)] bg-[color-mix(in_srgb,#fff_15%,transparent)] px-1.5 py-0.5 font-semibold leading-none text-white"
      title={price.detail ?? formatted}
    >
      {formatted}
    </span>
  );
}
