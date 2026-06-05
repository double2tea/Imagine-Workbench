"use client";

import { calculateModelPrice, getShowPriceSetting } from "@/lib/providers/pricing";

interface ModelPriceBadgeProps {
  provider: string;
  modelId: string;
  duration?: string;
  resolution?: string;
}

export default function ModelPriceBadge({ provider, modelId, duration, resolution }: ModelPriceBadgeProps) {
  if (!getShowPriceSetting()) return null;

  const price = calculateModelPrice(provider, modelId, { duration, resolution });
  if (!price) return null;

  const formatted = price.isCalculated
    ? `≈¥${price.totalPrice.toFixed(2).replace(/\.?0+$/, "")}`
    : price.price < 1
      ? `≈¥${price.price.toFixed(2)}/${price.unit}`
      : `≈¥${price.price.toFixed(2).replace(/\.?0+$/, "")}/${price.unit}`;

  return (
    <span className="text-[10px] font-medium text-[var(--iw-muted)]">
      · {formatted}
    </span>
  );
}
