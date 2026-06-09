import { useCallback, useEffect, useState } from "react";
import { DEFAULT_IMAGE_MODEL } from "@/lib/providers/model-catalog";

export type ImageEditFeature = "redraw" | "erase" | "outpaint" | "cutout";

export type ImageEditFeatureModels = Record<ImageEditFeature, string>;

export const IMAGE_EDIT_FEATURES: Array<{
  key: ImageEditFeature;
  label: string;
  description: string;
}> = [
  { key: "redraw", label: "重绘", description: "遮罩区域按提示词重新生成" },
  { key: "erase", label: "擦除", description: "遮罩区域移除并补全背景" },
  { key: "outpaint", label: "扩图", description: "向画面外延展内容" },
  { key: "cutout", label: "抠图", description: "移除背景并保留主体" },
];

const STORAGE_KEY = "imagine_image_edit_feature_models";
const NANO_BANANA_PRO_MODEL = "12ai:gemini-3-pro-image-preview";

export const DEFAULT_IMAGE_EDIT_FEATURE_MODELS: ImageEditFeatureModels = {
  redraw: NANO_BANANA_PRO_MODEL,
  erase: NANO_BANANA_PRO_MODEL,
  outpaint: NANO_BANANA_PRO_MODEL,
  cutout: NANO_BANANA_PRO_MODEL,
};

function isImageEditFeature(value: string): value is ImageEditFeature {
  return IMAGE_EDIT_FEATURES.some(feature => feature.key === value);
}

function readStoredFeatureModels(value: string | null): ImageEditFeatureModels {
  if (!value) return DEFAULT_IMAGE_EDIT_FEATURE_MODELS;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const next = { ...DEFAULT_IMAGE_EDIT_FEATURE_MODELS };
    for (const [key, model] of Object.entries(parsed)) {
      if (isImageEditFeature(key) && typeof model === "string" && model.trim()) {
        next[key] = model;
      }
    }
    return next;
  } catch {
    return DEFAULT_IMAGE_EDIT_FEATURE_MODELS;
  }
}

function writeFeatureModels(value: ImageEditFeatureModels): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable in private or restricted browser contexts.
  }
}

function normalizeUnavailableDefaults(
  value: ImageEditFeatureModels,
  availableImageModels: readonly string[],
): ImageEditFeatureModels {
  if (availableImageModels.length === 0) return value;
  const available = new Set(availableImageModels);
  const fallback = available.has(DEFAULT_IMAGE_EDIT_FEATURE_MODELS.redraw)
    ? DEFAULT_IMAGE_EDIT_FEATURE_MODELS.redraw
    : available.has(DEFAULT_IMAGE_MODEL)
      ? DEFAULT_IMAGE_MODEL
      : availableImageModels[0];

  return {
    redraw: available.has(value.redraw) ? value.redraw : fallback,
    erase: available.has(value.erase) ? value.erase : fallback,
    outpaint: available.has(value.outpaint) ? value.outpaint : fallback,
    cutout: available.has(value.cutout) ? value.cutout : fallback,
  };
}

export function useImageEditFeatureModels(availableImageModels: readonly string[]) {
  const [featureModels, setFeatureModels] = useState<ImageEditFeatureModels>(DEFAULT_IMAGE_EDIT_FEATURE_MODELS);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = readStoredFeatureModels(localStorage.getItem(STORAGE_KEY));
      const normalized = normalizeUnavailableDefaults(restored, availableImageModels);
      setFeatureModels(normalized);
      writeFeatureModels(normalized);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [availableImageModels]);

  const selectFeatureModel = useCallback((feature: ImageEditFeature, model: string) => {
    setFeatureModels(prev => {
      const next = { ...prev, [feature]: model };
      writeFeatureModels(next);
      return next;
    });
  }, []);

  return {
    featureModels,
    selectFeatureModel,
  };
}
