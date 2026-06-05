import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import PromptTemplatePicker, { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import ModelPriceBadge from "@/components/creation/ModelPriceBadge";
import ReferenceImagePicker, { type ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import PromptReferenceInlineOverlay, { resolvePromptReferenceThumbnails } from "@/components/reference/PromptReferenceThumbnailStrip";
import { type DraggedReferenceAsset, hasDraggedReferenceAsset } from "@/components/reference/referenceDrag";
import {
  applyPromptTemplateText,
  detectPromptTemplateSlashCommand,
  insertPromptTemplateText,
  type PromptTemplate,
  type PromptTemplateApplyMode,
  type PromptTemplateSlashCommand,
} from "@/lib/prompt-templates";
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
  showGenerateButton?: boolean;
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
  showGenerateButton = true,
}: ImageGenerationPanelProps) {
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const [slashCommand, setSlashCommand] = useState<PromptTemplateSlashCommand | null>(null);
  const presetResolutionOptions = imageResolutionOptions.filter(option => option.value !== "custom");
  const supportsCustomImageSize = imageResolutionOptions.some(option => option.value === "custom");
  const isCustomImageResolution = imageResolution === "custom";
  const imageReferenceLimit = capabilities.maxReferenceImages;
  const imageReferenceHelp = imageReferenceLimit > 0
    ? `支持 JPG / PNG / WEBP | 最多 ${imageReferenceLimit} 张 | 可拖入右侧资产或粘贴剪贴板`
    : "当前模型不支持参考图";
  const imageReferenceCountLabel = imageReferenceLimit > 0
    ? `${Math.min(referenceImages.length, imageReferenceLimit)}/${imageReferenceLimit}`
    : String(referenceImages.length);
  const promptReferenceThumbnails = resolvePromptReferenceThumbnails(prompt, referenceImages, capabilities.referenceMediaTypes);

  const handleApplyPromptTemplate = (template: PromptTemplate, mode: PromptTemplateApplyMode): void => {
    if (slashCommand && mode === "insert") {
      const result = insertPromptTemplateText(prompt, template.positivePrompt, slashCommand.start, slashCommand.end);
      onPromptChange(result.prompt);
      setSlashCommand(null);
      if (template.negativePrompt) onNegativePromptChange(template.negativePrompt);
      return;
    }
    onPromptChange(applyPromptTemplateText(prompt, template.positivePrompt, mode));
    setSlashCommand(null);
    if (template.negativePrompt) onNegativePromptChange(template.negativePrompt);
  };

  const handlePromptChange = (value: string, caret: number): void => {
    onPromptChange(value);
    const command = detectPromptTemplateSlashCommand(value, caret);
    setSlashCommand(command);
    if (command) templatePickerRef.current?.open(command.search);
  };

  return (
    <div className="flex flex-col gap-3.5 animate-fade-in">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center gap-1.5 imagine-section-label">
            <Sparkles className="h-3.5 w-3.5 text-blue-300" />
            提示词
          </label>
          <div className="flex items-center gap-2">
            <PromptTemplatePicker ref={templatePickerRef} compact onApply={handleApplyPromptTemplate} />
            <button
              onClick={onOptimizePrompt}
              disabled={isOptimizing || !prompt.trim()}
              className={`imagine-secondary-action flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                isOptimizing || !prompt.trim()
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer border-blue-400/25 bg-blue-500/12 text-blue-200 hover:bg-blue-500/18"
              }`}
            >
              {isOptimizing ? (
                <RefreshCw className="h-3 w-3 animate-spin text-blue-400" />
              ) : (
                <Sparkles className="h-3 w-3 text-blue-300" />
              )}
              <span className="sm:hidden">优化</span>
              <span className="hidden sm:inline">优化提示词</span>
            </button>
          </div>
        </div>

        <div className="imagine-field-shell relative p-3">
          {atDropdownNode}
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(event) => handlePromptChange(event.target.value, event.target.selectionStart)}
              onDragOver={(event) => {
                if (!hasDraggedReferenceAsset(event.dataTransfer)) return;
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={onPromptDropAsset}
              placeholder="写下你想创造的图片奇思妙想... 输入 @ 可引用作品"
              className={`imagine-field-textarea relative z-10 h-24 text-sm leading-6 caret-[var(--iw-text)] ${
                promptReferenceThumbnails.length > 0 ? "!text-transparent" : ""
              }`}
            />
            <PromptReferenceInlineOverlay
              acceptedMediaTypes={capabilities.referenceMediaTypes}
              prompt={prompt}
              references={referenceImages}
              className="text-sm leading-6"
            />
          </div>
          <div className="imagine-field-shell-footer mt-2 flex items-center justify-between pt-2">
            <span className="hidden sm:inline">拖入资产到此处插入 @图片N | 拖入下方只作为参考图</span>
            <span className="sm:hidden">@ 可引用作品</span>
            <span>{prompt.length} 字符</span>
          </div>
        </div>
      </div>

      <div className="imagine-parameter-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="imagine-parameter-field">
          <div className="imagine-parameter-label-row">
            <label className="imagine-section-label">图片生成模型</label>
            {supportsBackgroundGeneration && (
              <label className="imagine-inline-chip-toggle shrink-0">
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
            className="imagine-select py-2.5"
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

        <div className="imagine-parameter-field">
          <label className="imagine-parameter-label-row imagine-section-label">
            画面宽高比
          </label>
          <select
            value={isCustomImageResolution ? "custom" : selectedAspectRatio}
            onChange={(event) => onSelectAspectRatio(event.target.value)}
            disabled={isCustomImageResolution}
            className="imagine-select py-2.5"
            aria-disabled={isCustomImageResolution}
          >
            {isCustomImageResolution && <option value="custom">自定义尺寸决定比例</option>}
            {capabilities.aspectRatios.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <details className="imagine-inline-disclosure">
        <summary className="imagine-inline-disclosure-summary">
          <span>高级参数</span>
          <span className="font-mono text-[10px] text-[var(--iw-faint)]">反向词 · 分辨率 · 画质</span>
        </summary>
        <div className="imagine-inline-disclosure-panel">
          <div>
            <label className="mb-1.5 block imagine-section-label">反向提示词</label>
            <input
              type="text"
              value={negativePrompt}
              onChange={(event) => onNegativePromptChange(event.target.value)}
              placeholder="不希望出现的元素，例如 blurred, text"
              className="imagine-input py-2.5"
            />
          </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {imageResolutionOptions.length > 0 && (
          <div>
            <label className="mb-1.5 block imagine-section-label">
              输出分辨率
            </label>
            {presetResolutionOptions.length > 0 && (
              <div className="imagine-option-group grid-cols-4">
                {presetResolutionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    data-active={!isCustomImageResolution && imageResolution === option.value}
                    onClick={() => onImageResolutionChange(option.value)}
                    className="imagine-segment-btn"
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
                  data-active={isCustomImageResolution}
                  className="imagine-segment-btn border border-[var(--iw-border)]"
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
                  className="imagine-input py-2.5 font-mono"
                />
                <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-[var(--iw-faint)]">
                  约束：最大边 ≤ 3840px，宽高为 16 的倍数，比例由尺寸决定且 ≤ 3:1，总像素 655,360-8,294,400。
                </p>
              </div>
            )}
          </div>
        )}

        {capabilities.qualities.length > 0 && (
          <div>
            <label className="mb-1.5 block imagine-section-label">
              画质档位
            </label>
            <div className="imagine-option-group grid-cols-4">
              {capabilities.qualities.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-active={imageQuality === option.value}
                  onClick={() => onImageQualityChange(option.value)}
                  className="imagine-segment-btn"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {capabilities.thinkingLevels.length > 0 && (
          <div>
            <label className="mb-1.5 block imagine-section-label">图片思考等级</label>
            <div className="imagine-option-group grid-cols-2">
              {capabilities.thinkingLevels.map(option => (
                <button
                  key={option.value}
                  type="button"
                  data-active={imageThinkingLevel === option.value}
                  data-tone="amber"
                  onClick={() => onThinkingLevelChange(option.value)}
                  className="imagine-segment-btn"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
        </div>
      </details>

      <ReferenceImagePicker
        addLabel="多图垫"
        browseClassName="font-medium text-blue-300 underline-offset-4 hover:text-blue-200 hover:underline cursor-pointer"
        clearLabel="清空所有垫图"
        emptyHelp={imageReferenceHelp}
        emptyLabel={imageReferenceLimit > 0 ? "添加图片" : "当前模型不支持参考图"}
        label={`创意参考图 / 多图垫图 ${referenceImages.length > 0 ? `(${imageReferenceCountLabel})` : ""}`}
        maxCount={imageReferenceLimit}
        references={referenceImages}
        uploadLabel={imageReferenceLimit > 0 ? "浏览上传" : "不可上传"}
        acceptedMediaTypes={capabilities.referenceMediaTypes}
        onClear={onClearReferences}
        onDropAsset={onReferenceDropAsset}
        onDropFiles={onReferenceDropFiles}
        onRemove={onReferenceRemove}
        onUpload={onReferenceUpload}
      />

      {showGenerateButton && (
        <button
          type="button"
          onClick={onGenerate}
          disabled={!prompt.trim()}
          className={`imagine-primary-action mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold transition duration-200 ${
            !prompt.trim()
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer bg-blue-600 text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500 active:scale-[0.98]"
          }`}
        >
          {isSubmitting ? (
            <RefreshCw className="h-4 w-4 animate-spin text-white" />
          ) : (
            <Sparkles className="h-4 w-4 shrink-0 text-white" />
          )}
          <span className="truncate">{isSubmitting ? `提交中 (${submitCount})，可继续排队` : "生成图片"}</span>
          {!isSubmitting && <ModelPriceBadge provider={selectedModel.split(":")[0]} modelId={selectedModel} resolution={imageResolution} />}
        </button>
      )}
    </div>
  );
}
