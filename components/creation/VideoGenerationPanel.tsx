import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { Video as VideoIcon } from "lucide-react";
import { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
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

interface VideoGenerationPanelProps {
  atDropdownNode: ReactNode;
  capabilities: VideoModelCapabilities;
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
  const acceptedReferenceText = capabilities.referenceMediaTypes.includes("audio")
    ? "图片 / 视频 / 音频"
    : capabilities.referenceMediaTypes.includes("video")
      ? "图片 / 视频"
      : "JPG / PNG / WEBP";
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
    none: "不使用参考",
    reference: "全能参考",
    firstLast: "首尾帧 / 关键帧",
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
    <div className="flex flex-col gap-3.5 animate-fade-in">
      <PromptComposerSurface
        acceptedMediaTypes={capabilities.referenceMediaTypes}
        actions={
          <PromptComposerToolbarActions
            ref={templatePickerRef}
            accent="violet"
            isOptimizing={isOptimizing}
            optimizeDisabled={isOptimizing || !prompt.trim()}
            optimizeLabel="润色"
            onApplyTemplate={handleApplyPromptTemplate}
            onOptimize={onOptimizePrompt}
          />
        }
        atDropdownNode={atDropdownNode}
        desktopHint="拖入资产到此处插入 @媒体N | 拖入下方只作为参考图"
        headerAccent="violet"
        headerVariant="toolbar"
        icon={<VideoIcon className="h-3.5 w-3.5" />}
        label="视频场景运动描述"
        onChange={handlePromptChange}
        onDropAsset={onPromptDropAsset}
        onSelectionChange={(selection) => {
          promptSelectionRef.current = selection;
        }}
        placeholder={promptPlaceholder}
        prompt={prompt}
        references={referenceImages}
      />

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="imagine-section-label mb-1.5 block">视频生成模型</label>
          <ModelSelectCombobox
            accent="violet"
            ariaLabel="选择视频模型"
            groups={modelGroups}
            value={selectedModel}
            onChange={onSelectModel}
          />
        </div>

        <div>
          <label className="imagine-section-label mb-1.5 block">画面比例</label>
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
        <div>
          <label className="imagine-section-label mb-1.5 block">参考模式</label>
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
        <div className={`grid grid-cols-1 gap-3 border-t border-[var(--iw-border)] pt-3 ${controlGridClass}`}>
          {resolutionOptions.length > 0 && (
            <div>
              <label className="mb-1.5 block imagine-section-label">分辨率</label>
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
              <label className="mb-1.5 block imagine-section-label">秒数</label>
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
              <label className="mb-1.5 block imagine-section-label">预设</label>
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

      <ReferenceImagePicker
        acceptedMediaTypes={capabilities.referenceMediaTypes}
        addLabel="添加参考"
        browseClassName="cursor-pointer font-medium text-[var(--iw-tone-violet-text)] underline-offset-4 hover:text-[var(--iw-tone-violet-text)] hover:underline"
        clearLabel={clearReferenceLabel}
        emptyHelp={`支持 ${acceptedReferenceText} | 最多 ${referenceLimit} 个 | ${referenceHelp}`}
        emptyLabel={`添加${referenceLabel}`}
        label={`${referenceLabel} ${referenceImages.length > 0 ? `(${Math.min(referenceImages.length, referenceLimit)}/${referenceLimit})` : ""}`}
        maxCount={referenceLimit}
        references={referenceImages}
        roleMode={referenceMode === "firstLast"}
        uploadLabel="浏览上传"
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
