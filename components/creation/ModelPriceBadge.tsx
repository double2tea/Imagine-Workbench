"use client";

import { getModelPrice, getShowPriceSetting } from "@/lib/providers/pricing";

interface ModelPriceBadgeProps {
  provider: string;
  modelId: string;
}

export default function ModelPriceBadge({ provider, modelId }: ModelPriceBadgeProps) {
  if (!getShowPriceSetting()) return null;

  const price = getModelPrice(provider, modelId);
  if (!price) return null;

  const formatted = price.price < 1
    ? `≈¥${price.price.toFixed(2)}/${price.unit}`
    : `≈¥${price.price.toFixed(2).replace(/\.?0+$/, "")}/${price.unit}`;

  return (
    <span className="text-[10px] font-medium text-[var(--iw-muted)]">
      · {formatted}
    </span>
  );
}
