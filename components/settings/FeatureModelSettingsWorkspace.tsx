"use client";

import { Sparkles } from "lucide-react";
import { IMAGE_EDIT_FEATURES, type ImageEditFeature, type ImageEditFeatureModels } from "@/hooks/useImageEditFeatureModels";
import {
  getImageQuickEditTargetOptions,
  resolveImageQuickEditTarget,
} from "@/lib/image-quick-edit-targets";
import type { AiProvider, ModelOption } from "@/lib/providers/model-catalog";

interface ModelGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

interface FeatureModelSettingsWorkspaceProps {
  featureModels: ImageEditFeatureModels;
  imageModelGroups: ModelGroup[];
  onSelectFeatureModel: (feature: ImageEditFeature, model: string) => void;
}

function flattenImageModelOptions(groups: ModelGroup[]): ModelOption[] {
  const seen = new Set<string>();
  const options: ModelOption[] = [];
  for (const group of groups) {
    for (const option of group.options) {
      if (seen.has(option.value)) continue;
      seen.add(option.value);
      options.push(option);
    }
  }
  return options;
}

export function FeatureModelSettingsWorkspace({
  featureModels,
  imageModelGroups,
  onSelectFeatureModel,
}: FeatureModelSettingsWorkspaceProps) {
  const imageModelOptions = flattenImageModelOptions(imageModelGroups);

  return (
    <div className="flex flex-col gap-3">
      <section className="imagine-settings-section">
        <div className="flex items-center gap-2">
          <Sparkles className="imagine-tone-icon h-4 w-4" data-tone="warning" />
          <div className="imagine-settings-section-title">图片快捷编辑默认模型</div>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--iw-faint)]">
          主界面和画板的图片快捷操作会优先使用这里选择的模型。
        </p>
      </section>

      <section className="imagine-settings-section">
        <div className="grid grid-cols-1 gap-3">
          {IMAGE_EDIT_FEATURES.map(feature => {
            const value = featureModels[feature.key];
            const targetOptions = getImageQuickEditTargetOptions(feature.key, imageModelOptions);
            const hasCurrentOption = targetOptions.some(option => option.id === value);
            const currentTarget = resolveImageQuickEditTarget(feature.key, value);
            return (
              <div key={feature.key} className="grid gap-2 md:grid-cols-[minmax(0,180px)_1fr] md:items-center">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--iw-text)]">{feature.label}</div>
                  <div className="text-[10px] leading-relaxed text-[var(--iw-faint)]">{feature.description}</div>
                </div>
                <select
                  value={value}
                  onChange={event => onSelectFeatureModel(feature.key, event.target.value)}
                  className="imagine-input h-9 min-w-0 text-xs"
                  aria-label={`${feature.label}默认模型`}
                >
                  {!hasCurrentOption ? <option value={value}>{currentTarget.label}</option> : null}
                  {targetOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
