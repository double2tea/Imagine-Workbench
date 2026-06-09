import { useCallback, useEffect, useState } from "react";
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

function imageEditFeatureModelsEqual(left: ImageEditFeatureModels, right: ImageEditFeatureModels): boolean {
  return IMAGE_EDIT_FEATURES.every(feature => left[feature.key] === right[feature.key]);
}

export function useImageEditFeatureModels() {
  const [featureModels, setFeatureModels] = useState<ImageEditFeatureModels>(DEFAULT_IMAGE_EDIT_FEATURE_MODELS);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = readStoredFeatureModels(localStorage.getItem(STORAGE_KEY));
      setFeatureModels(prev => imageEditFeatureModelsEqual(prev, restored) ? prev : restored);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
