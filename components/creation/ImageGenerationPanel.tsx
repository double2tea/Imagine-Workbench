import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import CreatorGenerateButton from "@/components/creation/CreatorGenerateButton";
import ModelSelectCombobox, { type ModelOptionGroup } from "@/components/creation/ModelSelectCombobox";
import PromptComposerSurface from "@/components/creation/PromptComposerSurface";
import PromptComposerToolbarActions from "@/components/creation/PromptComposerToolbarActions";
import ReferenceImagePicker, { type ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { type DraggedReferenceAsset } from "@/components/reference/referenceDrag";
import {
  applyPromptTemplateText,
  detectPromptTemplateSlashCommand,
  insertPromptTemplateText,
  type PromptTemplate,
  type PromptTemplateApplyMode,
  type PromptTemplateSlashCommand,
} from "@/lib/prompt-templates";
import type { ImageModelCapabilities } from "@/lib/providers/model-catalog";

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
  promptRequired: boolean;
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
  promptRequired,
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
  const generateDisabled = promptRequired && !prompt.trim();

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
    if (command) {
      templatePickerRef.current?.open(command.search);
    } else {
      templatePickerRef.current?.close();
    }
  };

  return (
    <div className="flex flex-col gap-3.5 animate-fade-in">
      <PromptComposerSurface
        acceptedMediaTypes={capabilities.referenceMediaTypes}
        actions={
          <PromptComposerToolbarActions
            ref={templatePickerRef}
            accent="blue"
            isOptimizing={isOptimizing}
            optimizeDisabled={isOptimizing || !prompt.trim()}
            optimizeLabel="优化"
            onApplyTemplate={handleApplyPromptTemplate}
            onOptimize={onOptimizePrompt}
          />
        }
        atDropdownNode={atDropdownNode}
        desktopHint="拖入资产到此处插入 @媒体N | 拖入下方只作为参考图"
        headerAccent="blue"
        headerVariant="toolbar"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        label="提示词"
        onChange={handlePromptChange}
        onDropAsset={onPromptDropAsset}
        placeholder="写下你想创造的图片奇思妙想... 输入 @ 可引用作品"
        prompt={prompt}
        references={referenceImages}
      />

      <div className="imagine-parameter-grid grid grid-cols-1 gap-3">
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
          <ModelSelectCombobox
            accent="blue"
            ariaLabel="选择图片模型"
            groups={modelGroups}
            value={selectedModel}
            onChange={onSelectModel}
          />
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

      <div className="flex flex-col gap-3 border-t border-[var(--iw-border)] pt-3">
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
        <CreatorGenerateButton
          mode="image"
          disabled={generateDisabled}
          isSubmitting={isSubmitting}
          priceProvider={selectedModel.split(":")[0]}
          priceModelId={selectedModel}
          priceResolution={imageResolution}
          priceImageQuality={imageQuality}
          priceThinkingLevel={imageThinkingLevel}
          submitCount={submitCount}
          onGenerate={onGenerate}
        />
      )}
    </div>
  );
}
