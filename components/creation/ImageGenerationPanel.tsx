import { useId, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import CapabilityParameterControls from "@/components/creation/CapabilityParameterControls";
import CinematicProfileControls from "@/components/creation/CinematicProfileControls";
import { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import CreatorGenerateButton from "@/components/creation/CreatorGenerateButton";
import ModelSelectCombobox, { type ModelOptionGroup } from "@/components/creation/ModelSelectCombobox";
import PromptComposerSurface, { type PromptComposerSelectionRange } from "@/components/creation/PromptComposerSurface";
import PromptComposerToolbarActions from "@/components/creation/PromptComposerToolbarActions";
import ReferenceImagePicker, { type ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { type DraggedReferenceAsset } from "@/components/reference/referenceDrag";
import { useTranslations } from "@/lib/i18n";
import {
  applyPromptTemplateText,
  detectPromptTemplateSlashCommand,
  insertPromptTemplateText,
  type PromptTemplate,
  type PromptTemplateApplyMode,
  type PromptTemplateSlashCommand,
} from "@/lib/prompt-templates";
import type { ImageModelCapabilities } from "@/lib/providers/model-catalog";
import type { ModelParameterValues } from "@/lib/providers/model-capabilities";
import { buildGenerationModelPriceOptions } from "@/lib/providers/pricing";
import type { CinematicProfile } from "@/lib/cinematic-controls";

type ImageSizeMode = "preset" | "custom";

interface ImageGenerationPanelProps {
  atDropdownNode: ReactNode;
  capabilities: ImageModelCapabilities;
  customImageSize: string;
  cinematicProfile: CinematicProfile;
  imageQuality: string;
  imageBackgroundGeneration: boolean;
  imageResolution: string;
  imageResolutionOptions: ImageModelCapabilities["resolutions"];
  imageSizeMode: ImageSizeMode;
  imageThinkingLevel: string;
  isOptimizing: boolean;
  isSubmitting: boolean;
  supportsBackgroundGeneration: boolean;
  modelGroups: ModelOptionGroup[];
  negativePrompt: string;
  parameterValues: ModelParameterValues;
  prompt: string;
  promptRequired: boolean;
  referenceImages: ReferenceImageRef[];
  selectedAspectRatio: string;
  selectedModel: string;
  submitCount: number;
  onClearReferences: () => void;
  onCinematicProfileChange: (value: CinematicProfile) => void;
  onCustomImageSizeChange: (value: string) => void;
  onGenerate: () => void;
  onImageBackgroundGenerationChange: (value: boolean) => void;
  onImageQualityChange: (value: string) => void;
  onImageResolutionChange: (value: string) => void;
  onImageSizeModeChange: (value: ImageSizeMode) => void;
  onNegativePromptChange: (value: string) => void;
  onOptimizePrompt: () => void;
  onParameterValuesChange: (value: ModelParameterValues) => void;
  onPromptChange: (value: string) => void;
  onPromptDropAsset: (event: DragEvent<HTMLTextAreaElement>) => void;
  onReferenceDropAsset: (asset: DraggedReferenceAsset) => void;
  onReferenceDropFiles: (files: File[]) => void;
  onReferenceEdit?: (reference: ReferenceImageRef) => void;
  onReferenceRemove: (id: string) => void;
  onReferenceUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenAssetLibrary?: () => void;
  onSelectAspectRatio: (value: string) => void;
  onSelectModel: (value: string) => void;
  onThinkingLevelChange: (value: string) => void;
  showGenerateButton?: boolean;
}

export default function ImageGenerationPanel({
  atDropdownNode,
  capabilities,
  cinematicProfile,
  customImageSize,
  imageQuality,
  imageBackgroundGeneration,
  imageResolution,
  imageResolutionOptions,
  imageSizeMode,
  imageThinkingLevel,
  isOptimizing,
  isSubmitting,
  modelGroups,
  negativePrompt,
  prompt,
  promptRequired,
  parameterValues,
  referenceImages,
  selectedAspectRatio,
  selectedModel,
  submitCount,
  supportsBackgroundGeneration,
  onClearReferences,
  onCinematicProfileChange,
  onCustomImageSizeChange,
  onGenerate,
  onImageBackgroundGenerationChange,
  onImageQualityChange,
  onImageResolutionChange,
  onImageSizeModeChange,
  onNegativePromptChange,
  onOptimizePrompt,
  onParameterValuesChange,
  onPromptChange,
  onPromptDropAsset,
  onReferenceDropAsset,
  onReferenceDropFiles,
  onReferenceEdit,
  onReferenceRemove,
  onReferenceUpload,
  onOpenAssetLibrary,
  onSelectAspectRatio,
  onSelectModel,
  onThinkingLevelChange,
  showGenerateButton = true,
}: ImageGenerationPanelProps) {
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const promptSelectionRef = useRef<PromptComposerSelectionRange | null>(null);
  const [slashCommand, setSlashCommand] = useState<PromptTemplateSlashCommand | null>(null);
  const { t } = useTranslations("creation");
  const aspectRatioId = useId();
  const negativePromptId = useId();
  const customImageSizeId = useId();
  const presetResolutionOptions = imageResolutionOptions.filter(option => option.value !== "custom");
  const supportsCustomImageSize = imageResolutionOptions.some(option => option.value === "custom");
  const isCustomImageSize = imageSizeMode === "custom";
  const priceImageResolution = isCustomImageSize ? customImageSize.trim() : imageResolution;
  const imageReferenceLimit = capabilities.maxReferenceImages;
  const imageReferenceHelp = imageReferenceLimit > 0
    ? t("imageGeneration.referenceHelpSupported", { limit: imageReferenceLimit })
    : t("imageGeneration.referenceHelpUnsupported");
  const imageReferenceCountLabel = imageReferenceLimit > 0
    ? `${Math.min(referenceImages.length, imageReferenceLimit)}/${imageReferenceLimit}`
    : String(referenceImages.length);
  const generateDisabled = promptRequired && !prompt.trim();

  const handleApplyPromptTemplate = (template: PromptTemplate, mode: PromptTemplateApplyMode): void => {
    if (slashCommand && mode === "insert") {
      const result = insertPromptTemplateText(prompt, template.positivePrompt, slashCommand.start, slashCommand.end);
      onPromptChange(result.prompt);
      promptSelectionRef.current = { end: result.caret, start: result.caret };
      setSlashCommand(null);
      if (template.negativePrompt) onNegativePromptChange(template.negativePrompt);
      return;
    }
    if (mode === "insert") {
      const selection = promptSelectionRef.current ?? { end: prompt.length, start: prompt.length };
      const result = insertPromptTemplateText(prompt, template.positivePrompt, selection.start, selection.end);
      onPromptChange(result.prompt);
      promptSelectionRef.current = { end: result.caret, start: result.caret };
      setSlashCommand(null);
      if (template.negativePrompt) onNegativePromptChange(template.negativePrompt);
      return;
    }
    onPromptChange(applyPromptTemplateText(prompt, template.positivePrompt, mode));
    promptSelectionRef.current = { end: template.positivePrompt.trim().length, start: template.positivePrompt.trim().length };
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
    <div className="flex flex-col gap-3 animate-fade-in">
      <PromptComposerSurface
        acceptedMediaTypes={capabilities.referenceMediaTypes}
        actions={
          <PromptComposerToolbarActions
            ref={templatePickerRef}
            accent="blue"
            isOptimizing={isOptimizing}
            optimizeDisabled={isOptimizing || !prompt.trim()}
            optimizeLabel={t("imageGeneration.optimizeLabel")}
            onApplyTemplate={handleApplyPromptTemplate}
            onOptimize={onOptimizePrompt}
          />
        }
        atDropdownNode={atDropdownNode}
        desktopHint={t("imageGeneration.desktopHint")}
        headerAccent="blue"
        headerVariant="toolbar"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        label={t("imageGeneration.promptLabel")}
        name="image-prompt"
        onChange={handlePromptChange}
        onDropAsset={onPromptDropAsset}
        onSelectionChange={(selection) => {
          promptSelectionRef.current = selection;
        }}
        placeholder={t("imageGeneration.promptPlaceholder")}
        prompt={prompt}
        references={referenceImages}
      />

      <div className="imagine-parameter-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="imagine-parameter-field">
          <div className="imagine-parameter-label-row">
            <label className="imagine-section-label">{t("imageGeneration.modelLabel")}</label>
            {supportsBackgroundGeneration && (
              <label className="imagine-inline-chip-toggle shrink-0">
                <input
                  name="image-background-generation"
                  type="checkbox"
                  checked={imageBackgroundGeneration}
                  onChange={(event) => onImageBackgroundGenerationChange(event.target.checked)}
                  className="h-3 w-3 cursor-pointer accent-[var(--iw-accent)]"
                />
                <span>{t("imageGeneration.backgroundLabel")}</span>
              </label>
            )}
          </div>
          <ModelSelectCombobox
            accent="blue"
            ariaLabel={t("imageGeneration.modelLabel")}
            groups={modelGroups}
            value={selectedModel}
            onChange={onSelectModel}
          />
        </div>

        <div className="imagine-parameter-field">
          <label htmlFor={aspectRatioId} className="imagine-parameter-label-row imagine-section-label">
            {t("imageGeneration.aspectRatioLabel")}
          </label>
          <select
            id={aspectRatioId}
            name="image-aspect-ratio"
            value={isCustomImageSize ? "custom" : selectedAspectRatio}
            onChange={(event) => onSelectAspectRatio(event.target.value)}
            disabled={isCustomImageSize}
            className="imagine-select py-2.5"
            aria-disabled={isCustomImageSize}
          >
            {isCustomImageSize && <option value="custom">{t("imageGeneration.customSizeOption")}</option>}
            {capabilities.aspectRatios.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <CinematicProfileControls
          accent="blue"
          mediaType="image"
          variant="compact"
          value={cinematicProfile}
          onChange={onCinematicProfileChange}
        />

        <div>
          <label htmlFor={negativePromptId} className="mb-1.5 block imagine-section-label">{t("imageGeneration.negativePromptLabel")}</label>
          <input
            id={negativePromptId}
            name="image-negative-prompt"
            type="text"
            value={negativePrompt}
            onChange={(event) => onNegativePromptChange(event.target.value)}
            placeholder={t("imageGeneration.negativePromptPlaceholder")}
            className="imagine-input py-2.5"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {presetResolutionOptions.length > 0 && (
            <div>
              <label className="mb-1.5 block imagine-section-label">
                {t("imageGeneration.outputResolutionLabel")}
              </label>
              <div className="imagine-option-group grid-cols-4">
                {presetResolutionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    data-active={!isCustomImageSize && imageResolution === option.value}
                    onClick={() => onImageResolutionChange(option.value)}
                    className="imagine-segment-btn"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {supportsCustomImageSize && (
            <div>
              <label htmlFor={customImageSizeId} className="mb-1.5 block imagine-section-label">
                {t("imageGeneration.outputSizeLabel")}
              </label>
              <button
                type="button"
                onClick={() => onImageSizeModeChange("custom")}
                data-active={isCustomImageSize}
                className="imagine-segment-btn border border-[var(--iw-border)]"
              >
                {t("imageGeneration.customSizeButton")}
              </button>
              {isCustomImageSize && (
                <div className="mt-2">
                  <input
                    id={customImageSizeId}
                    name="image-custom-size"
                    type="text"
                    value={customImageSize}
                    onChange={(event) => onCustomImageSizeChange(event.target.value)}
                    placeholder={t("imageGeneration.customSizePlaceholder")}
                    className="imagine-input py-2.5 font-mono"
                  />
                  <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-[var(--iw-faint)]">
                    {t("imageGeneration.customSizeHint")}
                  </p>
                </div>
              )}
            </div>
          )}

          {capabilities.qualities.length > 0 && (
            <div>
              <label className="mb-1.5 block imagine-section-label">
                {t("imageGeneration.qualityLabel")}
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
              <label className="mb-1.5 block imagine-section-label">{t("imageGeneration.thinkingLevelLabel")}</label>
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

      <CapabilityParameterControls
        descriptors={capabilities.parameterDescriptors}
        value={parameterValues}
        onChange={onParameterValuesChange}
      />

      <ReferenceImagePicker
        addLabel={t("imageGeneration.referenceAddLabel")}
        browseClassName="cursor-pointer font-medium text-[var(--iw-tone-accent-text)] underline-offset-4 hover:text-[var(--iw-tone-accent-text)] hover:underline"
        clearLabel={t("imageGeneration.referenceClearLabel")}
        emptyHelp={imageReferenceHelp}
        emptyLabel={imageReferenceLimit > 0 ? t("imageGeneration.referenceEmptySupported") : t("imageGeneration.referenceEmptyUnsupported")}
        label={`${t("imageGeneration.referenceTitle")}${referenceImages.length > 0 ? ` (${imageReferenceCountLabel})` : ""}`}
        libraryBrowseLabel={t("imageGeneration.referenceLibraryLabel")}
        libraryTileLabel={t("imageGeneration.referenceLibraryTile")}
        maxCount={imageReferenceLimit}
        references={referenceImages}
        uploadLabel={imageReferenceLimit > 0 ? t("imageGeneration.referenceUploadSupported") : t("imageGeneration.referenceUploadUnsupported")}
        acceptedMediaTypes={capabilities.referenceMediaTypes}
        onClear={onClearReferences}
        onDropAsset={onReferenceDropAsset}
        onDropFiles={onReferenceDropFiles}
        onReferenceEdit={onReferenceEdit}
        onRemove={onReferenceRemove}
        onOpenLibrary={onOpenAssetLibrary}
        onUpload={onReferenceUpload}
      />

      {showGenerateButton && (
        <CreatorGenerateButton
          mode="image"
          disabled={generateDisabled}
          isSubmitting={isSubmitting}
          priceProvider={selectedModel.split(":")[0]}
          priceModelId={selectedModel}
          priceOptions={buildGenerationModelPriceOptions({
            kind: "image",
            imageQuality,
            resolution: priceImageResolution,
            thinkingLevel: imageThinkingLevel,
          })}
          submitCount={submitCount}
          onGenerate={onGenerate}
        />
      )}
    </div>
  );
}
