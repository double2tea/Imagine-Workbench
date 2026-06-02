import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { Paintbrush, RefreshCw, Sparkles } from "lucide-react";
import { VISUAL_PRESETS, type VisualPreset } from "@/components/PresetStyles";
import ReferenceImagePicker, { type ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { type DraggedReferenceAsset, hasDraggedReferenceAsset } from "@/components/reference/referenceDrag";
import type { ImageModelCapabilities, ModelOption } from "@/lib/providers/model-catalog";

interface ModelOptionGroup {
  provider: string;
  label: string;
  options: ModelOption[];
}

interface ImageGenerationPanelProps {
  atDropdownNode: ReactNode;
  capabilities: ImageModelCapabilities;
  customImageSize: string;
  imageQuality: string;
  imageBackgroundGeneration: boolean;
  imageResolution: string;
  imageResolutionOptions: ImageModelCapabilities["resolutions"];
  imageThinkingLevel: string;
  isOptimizing: boolean;
  isSubmitting: boolean;
  supportsBackgroundGeneration: boolean;
  modelGroups: ModelOptionGroup[];
  negativePrompt: string;
  prompt: string;
  referenceImages: ReferenceImageRef[];
  selectedAspectRatio: string;
  selectedModel: string;
  submitCount: number;
  onApplyPreset: (preset: VisualPreset) => void;
  onClearReferences: () => void;
  onCustomImageSizeChange: (value: string) => void;
  onGenerate: () => void;
  onImageBackgroundGenerationChange: (value: boolean) => void;
  onImageQualityChange: (value: string) => void;
  onImageResolutionChange: (value: string) => void;
  onNegativePromptChange: (value: string) => void;
  onOptimizePrompt: () => void;
  onPromptChange: (value: string) => void;
  onPromptDropAsset: (event: DragEvent<HTMLTextAreaElement>) => void;
  onReferenceDropAsset: (asset: DraggedReferenceAsset) => void;
  onReferenceDropFiles: (files: File[]) => void;
  onReferenceRemove: (id: string) => void;
  onReferenceUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectAspectRatio: (value: string) => void;
  onSelectModel: (value: string) => void;
  onThinkingLevelChange: (value: string) => void;
}

export default function ImageGenerationPanel({
  atDropdownNode,
  capabilities,
  customImageSize,
  imageQuality,
  imageBackgroundGeneration,
  imageResolution,
  imageResolutionOptions,
  imageThinkingLevel,
  isOptimizing,
  isSubmitting,
  modelGroups,
  negativePrompt,
  prompt,
  referenceImages,
  selectedAspectRatio,
  selectedModel,
  submitCount,
  supportsBackgroundGeneration,
  onApplyPreset,
  onClearReferences,
  onCustomImageSizeChange,
  onGenerate,
  onImageBackgroundGenerationChange,
  onImageQualityChange,
  onImageResolutionChange,
  onNegativePromptChange,
  onOptimizePrompt,
  onPromptChange,
  onPromptDropAsset,
  onReferenceDropAsset,
  onReferenceDropFiles,
  onReferenceRemove,
  onReferenceUpload,
  onSelectAspectRatio,
  onSelectModel,
  onThinkingLevelChange,
}: ImageGenerationPanelProps) {
  const presetResolutionOptions = imageResolutionOptions.filter(option => option.value !== "custom");
  const supportsCustomImageSize = imageResolutionOptions.some(option => option.value === "custom");
  const isCustomImageResolution = imageResolution === "custom";

  return (
    <div className="flex flex-col gap-3.5 animate-fade-in">
      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--iw-muted)]">
          <Paintbrush className="h-3.5 w-3.5 text-blue-300" />
          艺术预设
        </label>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {VISUAL_PRESETS.map((preset) => {
            const isActive = prompt.includes(preset.promptSuffix);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApplyPreset(preset)}
                className={`imagine-preset-chip flex h-8 items-center gap-1.5 shrink-0 rounded-lg border px-3 text-xs transition duration-200 cursor-pointer ${
                  isActive
                    ? "bg-blue-500/14 border-blue-400/35 text-blue-100"
                    : "bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <span>{preset.emoji}</span>
                <span>{preset.name}</span>
                {isActive && <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-blue-300" />
            提示词 <span className="hidden text-slate-500 sm:inline">(Prompt)</span>
          </label>
          <button
            onClick={onOptimizePrompt}
            disabled={isOptimizing || !prompt.trim()}
            className={`flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition ${
              isOptimizing || !prompt.trim()
                ? "bg-slate-900/70 text-slate-600 border-slate-800 cursor-not-allowed"
                : "bg-blue-500/12 text-blue-200 border-blue-400/25 hover:bg-blue-500/18 cursor-pointer"
            }`}
          >
            {isOptimizing ? (
              <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
            ) : (
              <Sparkles className="h-3 w-3 text-blue-300" />
            )}
            <span className="sm:hidden">优化</span>
            <span className="hidden sm:inline">一键智能优化</span>
          </button>
        </div>

        <div className="imagine-field-shell relative rounded-lg border border-slate-800 bg-slate-950/55 p-3 transition focus-within:border-blue-400/35 focus-within:bg-slate-950/75">
          {atDropdownNode}
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onDragOver={(event) => {
              if (!hasDraggedReferenceAsset(event.dataTransfer)) return;
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={onPromptDropAsset}
            placeholder="写下你想创造的图片奇思妙想... 输入 @ 可引用作品"
            className="w-full h-24 resize-none border-0 bg-transparent text-sm leading-6 text-slate-100 placeholder-slate-500 outline-0 ring-0 focus:ring-0"
          />
          <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2 font-mono text-[10px] text-slate-500">
            <span className="hidden sm:inline">拖入资产到此处插入 @图片N | 拖入下方只作为参考图</span>
            <span className="sm:hidden">@ 可引用作品</span>
            <span>{prompt.length} 字符</span>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
          反向提示词 <span className="hidden text-slate-500 sm:inline">(Negative Prompt)</span>
        </label>
        <input
          type="text"
          value={negativePrompt}
          onChange={(event) => onNegativePromptChange(event.target.value)}
          placeholder="不希望出现在作品里的元素，例如：blurred, ugly, deformed, text"
          className="w-full rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 transition focus:border-blue-400/35 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="text-[11px] font-semibold text-slate-300">图片生成模型</label>
            {supportsBackgroundGeneration && (
              <label className="flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/45 px-2 text-[10px] font-semibold text-slate-400">
                <input
                  type="checkbox"
                  checked={imageBackgroundGeneration}
                  onChange={(event) => onImageBackgroundGenerationChange(event.target.checked)}
                  className="h-3 w-3 cursor-pointer accent-blue-500"
                />
                <span>后台</span>
              </label>
            )}
          </div>
          <select
            value={selectedModel}
            onChange={(event) => onSelectModel(event.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 transition focus:border-blue-400/35 focus:outline-none cursor-pointer"
          >
            {modelGroups.map(group => (
              <optgroup key={group.provider} label={group.label}>
                {group.options.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
            画面宽高比 <span className="text-slate-500">(Aspect Ratio)</span>
          </label>
          <select
            value={isCustomImageResolution ? "custom" : selectedAspectRatio}
            onChange={(event) => onSelectAspectRatio(event.target.value)}
            disabled={isCustomImageResolution}
            className={`w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs transition focus:border-blue-400/35 focus:outline-none ${
              isCustomImageResolution ? "cursor-not-allowed text-slate-500 opacity-70" : "cursor-pointer text-slate-200"
            }`}
          >
            {isCustomImageResolution && <option value="custom">自定义尺寸决定比例</option>}
            {capabilities.aspectRatios.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {imageResolutionOptions.length > 0 && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
              输出分辨率
            </label>
            {presetResolutionOptions.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-slate-800 bg-slate-950/45 p-1.5">
                {presetResolutionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onImageResolutionChange(option.value)}
                    className={`min-h-8 rounded-md px-2 font-mono text-[10px] transition cursor-pointer ${
                      isCustomImageResolution ? false : imageResolution === option.value
                        ? "bg-blue-500/16 text-blue-100"
                        : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            {supportsCustomImageSize && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => onImageResolutionChange("custom")}
                  className={`min-h-8 rounded-md border px-3 font-mono text-[10px] transition cursor-pointer ${
                    isCustomImageResolution
                      ? "bg-blue-500/16 text-blue-100"
                      : "border-slate-800 bg-slate-950/45 text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                  }`}
                >
                  自定义尺寸
                </button>
              </div>
            )}
            {isCustomImageResolution && (
              <div className="mt-2">
                <input
                  type="text"
                  value={customImageSize}
                  onChange={(event) => onCustomImageSizeChange(event.target.value)}
                  placeholder="例如 2560x1440，宽高需为 16 的倍数"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2.5 font-mono text-xs text-slate-200 placeholder-slate-600 transition focus:border-blue-400/35 focus:outline-none"
                />
                <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-slate-500">
                  约束：最大边 ≤ 3840px，宽高为 16 的倍数，比例由尺寸决定且 ≤ 3:1，总像素 655,360-8,294,400。
                </p>
              </div>
            )}
          </div>
        )}

        {capabilities.qualities.length > 0 && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">
              画质档位
            </label>
            <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-slate-800 bg-slate-950/45 p-1.5">
              {capabilities.qualities.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onImageQualityChange(option.value)}
                  className={`min-h-8 rounded-md px-2 font-mono text-[10px] transition cursor-pointer ${
                    imageQuality === option.value
                      ? "bg-blue-500/16 text-blue-100"
                      : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {capabilities.thinkingLevels.length > 0 && (
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-300">图片思考等级</label>
            <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-800 bg-slate-950/45 p-1.5">
              {capabilities.thinkingLevels.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onThinkingLevelChange(option.value)}
                  className={`min-h-8 rounded-md px-2 font-mono text-[10px] transition cursor-pointer ${
                    imageThinkingLevel === option.value
                      ? "bg-amber-500/16 text-amber-100"
                      : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      <ReferenceImagePicker
        addLabel="多图垫"
        browseClassName="font-medium text-blue-300 underline-offset-4 hover:text-blue-200 hover:underline cursor-pointer"
        clearLabel="清空所有垫图"
        emptyHelp="支持 JPG / PNG / WEBP | 可拖入右侧资产或粘贴剪贴板"
        emptyLabel="添加图片"
        label={`创意参考图 / 多图垫图 ${referenceImages.length > 0 ? `(${referenceImages.length})` : ""}`}
        maxCount={4}
        references={referenceImages}
        uploadLabel="浏览上传"
        onClear={onClearReferences}
        onDropAsset={onReferenceDropAsset}
        onDropFiles={onReferenceDropFiles}
        onRemove={onReferenceRemove}
        onUpload={onReferenceUpload}
      />

      <button
        onClick={onGenerate}
        disabled={!prompt.trim()}
        className={`imagine-primary-action mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold transition duration-200 ${
          !prompt.trim()
            ? "bg-slate-900/70 text-slate-600 border border-slate-800 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-500 text-white active:scale-95 shadow-lg shadow-blue-950/30 cursor-pointer"
        }`}
      >
        {isSubmitting ? (
          <RefreshCw className="h-4 w-4 animate-spin text-white" />
        ) : (
          <Sparkles className="h-4 w-4 text-white" />
        )}
        {isSubmitting ? (
          `提交中 (${submitCount})，可继续排队`
        ) : (
          <>
            <span className="sm:hidden">生成图片</span>
            <span className="hidden sm:inline">一键渲染合成全新图片 (Render Image)</span>
          </>
        )}
      </button>
    </div>
  );
}
