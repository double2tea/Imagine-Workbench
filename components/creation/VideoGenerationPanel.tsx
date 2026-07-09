import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Video as VideoIcon } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import CinematicProfileControls from "@/components/creation/CinematicProfileControls";
import CreatorGenerateButton from "@/components/creation/CreatorGenerateButton";
import ModelSelectCombobox, { type ModelOptionGroup } from "@/components/creation/ModelSelectCombobox";
import PromptComposerSurface, { type PromptComposerSelectionRange } from "@/components/creation/PromptComposerSurface";
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
import type { ParameterOption, VideoModelCapabilities, VideoReferenceMode } from "@/lib/providers/model-catalog";
import { buildGenerationModelPriceOptions } from "@/lib/providers/pricing";
import { selectVideoReferenceTypesForMode } from "@/lib/video-reference-selection";
import { hasActiveCinematicProfile, type CinematicProfile } from "@/lib/cinematic-controls";

interface VideoGenerationPanelProps {
  atDropdownNode: ReactNode;
  capabilities: VideoModelCapabilities;
  cinematicProfile: CinematicProfile;
  clearReferenceLabel: string;
  isOptimizing: boolean;
  isSubmitting: boolean;
  modelGroups: ModelOptionGroup[];
  durationOptions: ParameterOption[];
  presetOptions: ParameterOption[];
  prompt: string;
  promptPlaceholder: string;
  promptRequired: boolean;
  referenceHelp: string;
  referenceImages: ReferenceImageRef[];
  referenceLabel: string;
  referenceLimit: number;
  referenceMode: VideoReferenceMode;
  referenceModeOptions: VideoReferenceMode[];
  resolutionOptions: ParameterOption[];
  selectedDuration: string;
  selectedModel: string;
  selectedPreset: string;
  selectedReferenceMode: VideoReferenceMode;
  selectedResolution: string;
  selectedSize: string;
  submitCount: number;
  onClearReferences: () => void;
  onCinematicProfileChange: (value: CinematicProfile) => void;
  onGenerate: () => void;
  onOptimizePrompt: () => void;
  onPromptChange: (value: string) => void;
  onPromptDropAsset: (event: DragEvent<HTMLTextAreaElement>) => void;
  onReferenceDropAsset: (asset: DraggedReferenceAsset) => void;
  onReferenceDropFiles: (files: File[]) => void;
  onReferenceRemove: (id: string) => void;
  onReferenceRoleChange: (id: string, role: ReferenceImageRef["role"]) => void;
  onReferenceUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenAssetLibrary?: () => void;
  onSelectDuration: (value: string) => void;
  onSelectReferenceMode: (value: VideoReferenceMode) => void;
  onSelectResolution: (value: string) => void;
  onSelectModel: (value: string) => void;
  onSelectPreset: (value: string) => void;
  onSelectSize: (value: string) => void;
  showGenerateButton?: boolean;
}

export default function VideoGenerationPanel({
  atDropdownNode,
  capabilities,
  cinematicProfile,
  clearReferenceLabel,
  isOptimizing,
  isSubmitting,
  modelGroups,
  durationOptions,
  presetOptions,
  prompt,
  promptPlaceholder,
  promptRequired,
  referenceHelp,
  referenceImages,
  referenceLabel,
  referenceLimit,
  referenceMode,
  referenceModeOptions,
  resolutionOptions,
  selectedDuration,
  selectedModel,
  selectedPreset,
  selectedReferenceMode,
  selectedResolution,
  selectedSize,
  submitCount,
  onClearReferences,
  onCinematicProfileChange,
  onGenerate,
  onOptimizePrompt,
  onPromptChange,
  onPromptDropAsset,
  onReferenceDropAsset,
  onReferenceDropFiles,
  onReferenceRemove,
  onReferenceRoleChange,
  onReferenceUpload,
  onOpenAssetLibrary,
  onSelectDuration,
  onSelectReferenceMode,
  onSelectResolution,
  onSelectModel,
  onSelectPreset,
  onSelectSize,
  showGenerateButton = true,
}: VideoGenerationPanelProps) {
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const promptSelectionRef = useRef<PromptComposerSelectionRange | null>(null);
  const [slashCommand, setSlashCommand] = useState<PromptTemplateSlashCommand | null>(null);
  const { t } = useTranslations("creation");
  const acceptedReferenceText = capabilities.referenceMediaTypes.includes("audio")
    ? t("videoGeneration.referenceTypeImageVideoAudio")
    : capabilities.referenceMediaTypes.includes("video")
      ? t("videoGeneration.referenceTypeImageVideo")
      : t("videoGeneration.referenceTypeImage");
  const extraControlCount =
    Number(resolutionOptions.length > 0) + Number(durationOptions.length > 0) + Number(presetOptions.length > 0);
  const controlGridClass =
    extraControlCount >= 3
      ? "sm:grid-cols-2 xl:grid-cols-3"
      : extraControlCount === 2
        ? "sm:grid-cols-2"
        : extraControlCount === 1
          ? "sm:grid-cols-3"
          : "sm:grid-cols-2";
  const referenceModeLabels: Record<VideoReferenceMode, string> = {
    none: t("videoGeneration.referenceModeNone"),
    reference: t("videoGeneration.referenceModeReference"),
    firstLast: t("videoGeneration.referenceModeFirstLast"),
  };
  const generateDisabled = promptRequired && !prompt.trim();
  const priceReferenceTypes = selectVideoReferenceTypesForMode(
    referenceImages,
    null,
    selectedReferenceMode,
    capabilities.maxReferenceImages,
  );

  const handleApplyPromptTemplate = (template: PromptTemplate, mode: PromptTemplateApplyMode): void => {
    if (slashCommand && mode === "insert") {
      const result = insertPromptTemplateText(prompt, template.positivePrompt, slashCommand.start, slashCommand.end);
      onPromptChange(result.prompt);
      promptSelectionRef.current = { end: result.caret, start: result.caret };
      setSlashCommand(null);
      return;
    }
    if (mode === "insert") {
      const selection = promptSelectionRef.current ?? { end: prompt.length, start: prompt.length };
      const result = insertPromptTemplateText(prompt, template.positivePrompt, selection.start, selection.end);
      onPromptChange(result.prompt);
      promptSelectionRef.current = { end: result.caret, start: result.caret };
      setSlashCommand(null);
      return;
    }
    onPromptChange(applyPromptTemplateText(prompt, template.positivePrompt, mode));
    promptSelectionRef.current = { end: template.positivePrompt.trim().length, start: template.positivePrompt.trim().length };
    setSlashCommand(null);
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
            accent="violet"
            isOptimizing={isOptimizing}
            optimizeDisabled={isOptimizing || !prompt.trim()}
            optimizeLabel={t("videoGeneration.optimizeLabel")}
            onApplyTemplate={handleApplyPromptTemplate}
            onOptimize={onOptimizePrompt}
          />
        }
        atDropdownNode={atDropdownNode}
        desktopHint={t("videoGeneration.desktopHint")}
        headerAccent="neutral"
        headerVariant="toolbar"
        icon={<VideoIcon className="h-3.5 w-3.5" />}
        label={t("videoGeneration.promptLabel")}
        onChange={handlePromptChange}
        onDropAsset={onPromptDropAsset}
        onSelectionChange={(selection) => {
          promptSelectionRef.current = selection;
        }}
        placeholder={promptPlaceholder}
        prompt={prompt}
        references={referenceImages}
      />

      <div className="imagine-parameter-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="imagine-parameter-field">
          <label className="imagine-parameter-label-row imagine-section-label">{t("videoGeneration.modelLabel")}</label>
          <ModelSelectCombobox
            accent="neutral"
            ariaLabel={t("videoGeneration.modelLabel")}
            groups={modelGroups}
            value={selectedModel}
            onChange={onSelectModel}
          />
        </div>

        <div className="imagine-parameter-field">
          <label className="imagine-parameter-label-row imagine-section-label">{t("videoGeneration.aspectRatioLabel")}</label>
          <select
            value={selectedSize}
            onChange={(event) => onSelectSize(event.target.value)}
            className="imagine-select py-2.5"
          >
            {capabilities.sizes.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

      </div>

      {referenceModeOptions.length > 1 && (
        <div className="imagine-parameter-field">
          <label className="imagine-parameter-label-row imagine-section-label">{t("videoGeneration.referenceModeLabel")}</label>
          <select
            value={selectedReferenceMode}
            onChange={(event) => onSelectReferenceMode(event.target.value as VideoReferenceMode)}
            className="imagine-select py-2.5"
          >
            {referenceModeOptions.map(option => (
              <option key={option} value={option}>{referenceModeLabels[option]}</option>
            ))}
          </select>
        </div>
      )}

      {(resolutionOptions.length > 0 || durationOptions.length > 0 || presetOptions.length > 0) && (
        <div className={`grid grid-cols-1 gap-3 ${controlGridClass}`}>
          {resolutionOptions.length > 0 && (
            <div>
              <label className="mb-1.5 block imagine-section-label">{t("videoGeneration.resolutionLabel")}</label>
              <select
                value={selectedResolution}
                onChange={(event) => onSelectResolution(event.target.value)}
                className="imagine-select py-2.5"
              >
                {resolutionOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}

          {durationOptions.length > 0 && (
            <div>
              <label className="mb-1.5 block imagine-section-label">{t("videoGeneration.durationLabel")}</label>
              <select
                value={selectedDuration}
                onChange={(event) => onSelectDuration(event.target.value)}
                className="imagine-select py-2.5"
              >
                {durationOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}

          {presetOptions.length > 0 && (
            <div>
              <label className="mb-1.5 block imagine-section-label">{t("videoGeneration.presetLabel")}</label>
              <select
                value={selectedPreset}
                onChange={(event) => onSelectPreset(event.target.value)}
                className="imagine-select py-2.5"
              >
                {presetOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <details className="imagine-panel-disclosure">
        <summary className="imagine-panel-disclosure-summary">
          <span>{t("advanced.summary")}</span>
          {hasActiveCinematicProfile(cinematicProfile, "video") ? (
            <span className="imagine-meta-chip ml-2 font-mono text-[10px]">
              {t("advanced.activeCount", { count: 1 })}
            </span>
          ) : null}
        </summary>
        <div className="imagine-panel-disclosure-body">
          <CinematicProfileControls
            accent="neutral"
            mediaType="video"
            variant="compact"
            value={cinematicProfile}
            onChange={onCinematicProfileChange}
          />
        </div>
      </details>

      <ReferenceImagePicker
        acceptedMediaTypes={capabilities.referenceMediaTypes}
        addLabel={t("videoGeneration.addReferenceLabel")}
        browseClassName="cursor-pointer font-semibold text-[var(--iw-muted)] underline-offset-2 hover:text-[var(--iw-text)] hover:underline"
        clearLabel={clearReferenceLabel}
        emptyHelp={t("videoGeneration.emptyHelp", { referenceTypes: acceptedReferenceText, limit: referenceLimit, referenceHelp })}
        emptyLabel={t("videoGeneration.emptyLabel", { label: referenceLabel })}
        label={`${referenceLabel} ${referenceImages.length > 0 ? `(${Math.min(referenceImages.length, referenceLimit)}/${referenceLimit})` : ""}`}
        libraryBrowseLabel={t("videoGeneration.libraryBrowseLabel")}
        libraryTileLabel={t("videoGeneration.libraryTileLabel")}
        maxCount={referenceLimit}
        references={referenceImages}
        roleMode={referenceMode === "firstLast"}
        uploadLabel={t("videoGeneration.uploadLabel")}
        onClear={onClearReferences}
        onDropAsset={onReferenceDropAsset}
        onDropFiles={onReferenceDropFiles}
        onRemove={onReferenceRemove}
        onOpenLibrary={onOpenAssetLibrary}
        onRoleChange={onReferenceRoleChange}
        onUpload={onReferenceUpload}
      />

      {showGenerateButton && (
        <CreatorGenerateButton
          mode="video"
          disabled={generateDisabled}
          isSubmitting={isSubmitting}
          priceProvider={selectedModel.split(":")[0]}
          priceModelId={selectedModel}
          priceOptions={buildGenerationModelPriceOptions({
            kind: "video",
            duration: selectedDuration,
            referenceTypes: priceReferenceTypes,
            videoReferenceMode: selectedReferenceMode,
            videoResolution: selectedResolution,
          })}
          submitCount={submitCount}
          onGenerate={onGenerate}
        />
      )}
    </div>
  );
}
