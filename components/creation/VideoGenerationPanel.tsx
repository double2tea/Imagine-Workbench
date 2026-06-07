import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { RefreshCw, Sparkles, Video as VideoIcon } from "lucide-react";
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
import type { ModelOption, ParameterOption, VideoModelCapabilities, VideoReferenceMode } from "@/lib/providers/model-catalog";
import { selectVideoReferenceTypesForMode } from "@/lib/video-reference-selection";

interface ModelOptionGroup {
  provider: string;
  label: string;
  options: ModelOption[];
}

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
  onSelectDuration,
  onSelectReferenceMode,
  onSelectResolution,
  onSelectModel,
  onSelectPreset,
  onSelectSize,
  showGenerateButton = true,
}: VideoGenerationPanelProps) {
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const [slashCommand, setSlashCommand] = useState<PromptTemplateSlashCommand | null>(null);
  const [modelFilter, setModelFilter] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
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
  const promptReferenceThumbnails = resolvePromptReferenceThumbnails(prompt, referenceImages, capabilities.referenceMediaTypes);
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
      setSlashCommand(null);
      return;
    }
    onPromptChange(applyPromptTemplateText(prompt, template.positivePrompt, mode));
    setSlashCommand(null);
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
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--iw-muted)]">
            <VideoIcon className="h-3.5 w-3.5 text-violet-300" />
            视频场景运动描述
          </label>
          <div className="flex items-center gap-2">
            <PromptTemplatePicker ref={templatePickerRef} accent="violet" compact onApply={handleApplyPromptTemplate} />
            <button
              onClick={onOptimizePrompt}
              disabled={isOptimizing || !prompt.trim()}
              className={`imagine-secondary-action flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                isOptimizing || !prompt.trim()
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer border-violet-400/25 bg-violet-500/12 text-violet-200 hover:bg-violet-500/18"
              }`}
            >
              {isOptimizing ? (
                <RefreshCw className="h-3 w-3 animate-spin text-purple-400" />
              ) : (
                <Sparkles className="h-3 w-3 text-violet-300" />
              )}
              <span className="sm:hidden">润色</span>
              <span className="hidden sm:inline">提示词动态润色</span>
            </button>
          </div>
        </div>

        <div className={`imagine-field-shell relative p-3 transition-all duration-200 ${
          isDragOver ? "border-blue-400/40 ring-2 ring-blue-400/40" : ""
        }`}>
          {atDropdownNode}
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(event) => handlePromptChange(event.target.value, event.target.selectionStart)}
              onDragEnter={(event) => {
                if (!hasDraggedReferenceAsset(event.dataTransfer)) return;
                event.preventDefault();
                setIsDragOver(true);
              }}
              onDragOver={(event) => {
                if (!hasDraggedReferenceAsset(event.dataTransfer)) return;
                event.dataTransfer.dropEffect = "copy";
                event.preventDefault();
              }}
              onDragLeave={(event) => {
                const relatedTarget = event.relatedTarget;
                if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
                  setIsDragOver(false);
                }
              }}
              onDrop={(event) => {
                setIsDragOver(false);
                onPromptDropAsset(event);
              }}
              placeholder={promptPlaceholder}
              className={`imagine-field-textarea relative z-10 h-24 text-sm leading-6 caret-[var(--iw-text)] transition-all duration-200 ${
                isDragOver ? "scale-[1.01]" : ""
              } ${
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
            <span className="hidden sm:inline">拖入资产到此处插入 @媒体N | 拖入下方只作为参考图</span>
            <span className="sm:hidden">@ 可引用作品</span>
            <span>{prompt.length} 字符</span>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${controlGridClass}`}>
        <div>
          <label className="imagine-section-label mb-1.5 block">视频生成模型</label>
          <div className="overflow-hidden rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)] transition-colors duration-150 focus-within:border-violet-400/45">
            <input
              type="search"
              placeholder="搜索模型"
              value={modelFilter}
              onChange={(event) => setModelFilter(event.target.value)}
              className="h-8 w-full border-0 border-b border-[var(--iw-border)] bg-transparent px-3 text-[11px] text-[var(--iw-text)] outline-none placeholder:text-[var(--iw-faint)]"
              aria-label="搜索视频模型"
            />
            <select
              value={selectedModel}
              onChange={(event) => onSelectModel(event.target.value)}
              className="h-10 w-full border-0 bg-transparent px-3 font-mono text-[11px] text-[var(--iw-text)] outline-none"
            >
              {modelGroups.map(group => {
                const filteredOptions = modelFilter
                  ? group.options.filter(option =>
                      option.label.toLowerCase().includes(modelFilter.toLowerCase()) ||
                      option.value.toLowerCase().includes(modelFilter.toLowerCase()) ||
                      selectedModel === option.value
                    )
                  : group.options;
                if (filteredOptions.length === 0) return null;
                return (
                  <optgroup key={group.provider} label={group.label}>
                    {filteredOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
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
        <details className="imagine-inline-disclosure">
          <summary className="imagine-inline-disclosure-summary">
            <span>输出参数</span>
            <span className="font-mono text-[10px] text-[var(--iw-faint)]">分辨率 · 时长 · 预设</span>
          </summary>
          <div className={`imagine-inline-disclosure-panel grid grid-cols-1 gap-3 ${controlGridClass}`}>
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
        </details>
      )}

      <ReferenceImagePicker
        acceptedMediaTypes={capabilities.referenceMediaTypes}
        addLabel="添加参考"
        browseClassName="font-medium text-violet-300 underline-offset-4 hover:text-violet-200 hover:underline cursor-pointer"
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
        onRoleChange={onReferenceRoleChange}
        onUpload={onReferenceUpload}
      />

      {showGenerateButton && (
        <button
          type="button"
          onClick={onGenerate}
          disabled={!prompt.trim()}
          className={`imagine-primary-action mt-1 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold transition duration-[160ms] ${
            !prompt.trim()
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer bg-violet-600 text-white shadow-lg shadow-violet-950/30 hover:bg-violet-500 active:scale-[0.98]"
          }`}
        >
          {isSubmitting ? (
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-white" />
          ) : (
            <VideoIcon className="h-4 w-4 shrink-0 text-white" />
          )}
          <span className="truncate">{isSubmitting ? `提交中 (${submitCount})，可继续排队` : "生成视频"}</span>
          {!isSubmitting && (
            <ModelPriceBadge
              provider={selectedModel.split(":")[0]}
              modelId={selectedModel}
              duration={selectedDuration}
              referenceTypes={priceReferenceTypes}
              videoReferenceMode={selectedReferenceMode}
              videoResolution={selectedResolution}
            />
          )}
        </button>
      )}
    </div>
  );
}
