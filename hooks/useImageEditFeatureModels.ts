import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_IMAGE_EDIT_FEATURE_TARGETS,
  IMAGE_EDIT_FEATURES,
  isImageEditFeature,
  normalizeImageQuickEditTargetId,
  type ImageEditFeature,
  type ImageEditFeatureTargets,
} from "@/lib/image-quick-edit-targets";

export { IMAGE_EDIT_FEATURES, type ImageEditFeature };
export type ImageEditFeatureModels = ImageEditFeatureTargets;

const STORAGE_KEY = "imagine_image_edit_feature_models";
export const DEFAULT_IMAGE_EDIT_FEATURE_MODELS: ImageEditFeatureModels = DEFAULT_IMAGE_EDIT_FEATURE_TARGETS;

function readStoredFeatureModels(value: string | null): ImageEditFeatureModels {
  if (!value) return DEFAULT_IMAGE_EDIT_FEATURE_MODELS;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const next = { ...DEFAULT_IMAGE_EDIT_FEATURE_MODELS };
    for (const [key, model] of Object.entries(parsed)) {
      if (isImageEditFeature(key) && typeof model === "string" && model.trim()) {
        next[key] = normalizeImageQuickEditTargetId(key, model);
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
      const next = { ...prev, [feature]: normalizeImageQuickEditTargetId(feature, model) };
      writeFeatureModels(next);
      return next;
    });
  }, []);

  return {
    featureModels,
    selectFeatureModel,
  };
}
