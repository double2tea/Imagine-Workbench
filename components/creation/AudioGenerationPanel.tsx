import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { AudioLines, Music, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import PromptTemplatePicker, { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
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
import type { AudioModelCapabilities, AudioOperationMode, ModelOption } from "@/lib/providers/model-catalog";
import { listVoiceProfiles, type VoiceProfile } from "@/lib/voice-profiles";

interface ModelOptionGroup {
  provider: string;
  label: string;
  options: ModelOption[];
}

interface AudioGenerationPanelProps {
  atDropdownNode: ReactNode;
  capabilities: AudioModelCapabilities;
  formatOptions: AudioModelCapabilities["formats"];
  isOptimizing: boolean;
  isSubmitting: boolean;
  mode: AudioOperationMode;
  modelGroups: ModelOptionGroup[];
  prompt: string;
  referenceImages: ReferenceImageRef[];
  selectedFormat: string;
  selectedModel: string;
  submitCount: number;
  onClearReferences: () => void;
  onGenerate: () => void;
  onOptimizePrompt: () => void;
  onPromptChange: (value: string) => void;
  onPromptDropAsset: (event: DragEvent<HTMLTextAreaElement>) => void;
  onReferenceDropAsset: (asset: DraggedReferenceAsset) => void;
  onReferenceDropFiles: (files: File[]) => void;
  onReferenceRemove: (id: string) => void;
  onReferenceUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onSelectFormat: (value: string) => void;
  onSelectMode: (value: AudioOperationMode) => void;
  onSelectModel: (value: string) => void;
  showGenerateButton?: boolean;
}

const AUDIO_MODE_LABELS: Record<AudioOperationMode, string> = {
  asr: "转写",
  music: "音乐",
  sfx: "音效",
  tts: "朗读",
  voice_clone: "克隆",
  voice_design: "设计音色",
};

function audioModeIcon(mode: AudioOperationMode) {
  if (mode === "music") return <Music className="h-3.5 w-3.5" />;
  if (mode === "sfx") return <Wand2 className="h-3.5 w-3.5" />;
  return <AudioLines className="h-3.5 w-3.5" />;
}

export default function AudioGenerationPanel({
  atDropdownNode,
  capabilities,
  formatOptions,
  isOptimizing,
  isSubmitting,
  mode,
  modelGroups,
  prompt,
  referenceImages,
  selectedFormat,
  selectedModel,
  submitCount,
  onClearReferences,
  onGenerate,
  onOptimizePrompt,
  onPromptChange,
  onPromptDropAsset,
  onReferenceDropAsset,
  onReferenceDropFiles,
  onReferenceRemove,
  onReferenceUpload,
  onSelectFormat,
  onSelectMode,
  onSelectModel,
  showGenerateButton = true,
}: AudioGenerationPanelProps) {
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const [slashCommand, setSlashCommand] = useState<PromptTemplateSlashCommand | null>(null);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const supportedModes = capabilities.modes;
  const referenceLimit = capabilities.maxReferenceMedia;
  const acceptedMediaTypes = capabilities.referenceMediaTypes;
  const promptReferenceThumbnails = resolvePromptReferenceThumbnails(prompt, referenceImages, acceptedMediaTypes);
  const visibleVoiceProfileCount = useMemo(
    () => voiceProfiles.filter(profile => profile.source !== "builtin").length,
    [voiceProfiles],
  );

  useEffect(() => {
    let active = true;
    void listVoiceProfiles().then(
      profiles => {
        if (active) setVoiceProfiles(profiles);
      },
      () => {
        if (active) setVoiceProfiles([]);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const handleApplyPromptTemplate = (template: PromptTemplate, applyMode: PromptTemplateApplyMode): void => {
    if (slashCommand && applyMode === "insert") {
      const result = insertPromptTemplateText(prompt, template.positivePrompt, slashCommand.start, slashCommand.end);
      onPromptChange(result.prompt);
      setSlashCommand(null);
      return;
    }
    onPromptChange(applyPromptTemplateText(prompt, template.positivePrompt, applyMode));
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
        <div className="mb-2 flex items-center justify-between">
          <label className="flex items-center gap-1.5 imagine-section-label">
            <AudioLines className="h-3.5 w-3.5 text-cyan-300" />
            音频创作
          </label>
          <div className="flex items-center gap-2">
            <PromptTemplatePicker ref={templatePickerRef} accent="teal" compact onApply={handleApplyPromptTemplate} />
            <button
              onClick={onOptimizePrompt}
              disabled={isOptimizing || !prompt.trim()}
              className={`imagine-secondary-action flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition ${
                isOptimizing || !prompt.trim()
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer border-cyan-400/25 bg-cyan-500/12 text-cyan-200 hover:bg-cyan-500/18"
              }`}
            >
              {isOptimizing ? <RefreshCw className="h-3 w-3 animate-spin text-cyan-300" /> : <Sparkles className="h-3 w-3 text-cyan-300" />}
              <span className="sm:hidden">润色</span>
              <span className="hidden sm:inline">优化音频提示</span>
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
              placeholder="写下要朗读、生成音乐或音效的内容... 输入 @ 可引用作品"
              className={`imagine-field-textarea relative z-10 h-24 text-sm leading-6 caret-[var(--iw-text)] ${
                promptReferenceThumbnails.length > 0 ? "!text-transparent" : ""
              }`}
            />
            <PromptReferenceInlineOverlay
              acceptedMediaTypes={acceptedMediaTypes}
              prompt={prompt}
              references={referenceImages}
              className="text-sm leading-6"
            />
          </div>
          <div className="imagine-field-shell-footer mt-2 flex items-center justify-between pt-2">
            <span className="hidden sm:inline">拖入资产到此处插入 @媒体N | 参考媒体按模型能力启用</span>
            <span className="sm:hidden">@ 可引用作品</span>
            <span>{prompt.length} 字符</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="imagine-section-label mb-1.5 block">音频模型</label>
          <select value={selectedModel} onChange={(event) => onSelectModel(event.target.value)} className="imagine-select py-2.5">
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
          <label className="imagine-section-label mb-1.5 block">输出格式</label>
          <select value={selectedFormat} onChange={(event) => onSelectFormat(event.target.value)} className="imagine-select py-2.5">
            {(formatOptions.length > 0 ? formatOptions : [{ value: "wav", label: "WAV" }]).map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="imagine-section-label mb-1.5 block">任务模式</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {supportedModes.map(item => (
            <button
              key={item}
              type="button"
              onClick={() => onSelectMode(item)}
              data-active={mode === item}
              className={`flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition ${
                mode === item
                  ? "border-cyan-300/50 bg-cyan-500/16 text-cyan-100"
                  : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] hover:text-[var(--iw-text)]"
              }`}
            >
              {audioModeIcon(item)}
              {AUDIO_MODE_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <ReferenceImagePicker
        acceptedMediaTypes={acceptedMediaTypes}
        addLabel="加参考"
        browseClassName={referenceLimit > 0 ? "cursor-pointer font-semibold text-cyan-200 hover:text-cyan-100" : "text-[var(--iw-faint)]"}
        clearLabel="清空参考"
        emptyHelp={referenceLimit > 0 ? "可拖入右侧资产或上传音频/视频/图片参考" : "当前模型不支持参考媒体"}
        emptyLabel={referenceLimit > 0 ? "拖入参考媒体" : "无需参考媒体"}
        label={`参考媒体 ${referenceLimit > 0 ? `${Math.min(referenceImages.length, referenceLimit)}/${referenceLimit}` : "0/0"}`}
        maxCount={referenceLimit}
        references={referenceImages}
        uploadLabel={referenceLimit > 0 ? "上传参考" : "不可上传"}
        onClear={onClearReferences}
        onDropAsset={onReferenceDropAsset}
        onDropFiles={onReferenceDropFiles}
        onRemove={onReferenceRemove}
        onUpload={onReferenceUpload}
      />

      {visibleVoiceProfileCount > 0 && (
        <div className="rounded-md border border-cyan-400/15 bg-cyan-500/8 px-3 py-2 text-[11px] text-cyan-100">
          已有 {visibleVoiceProfileCount} 个可复用音色档案
        </div>
      )}

      {showGenerateButton && (
        <button
          type="button"
          onClick={onGenerate}
          disabled={isSubmitting || !prompt.trim()}
          className="imagine-primary-action flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 py-3 text-xs font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin text-white" /> : <AudioLines className="h-4 w-4 text-white" />}
          {isSubmitting ? `提交中 (${submitCount})，可继续排队` : "生成音频"}
        </button>
      )}
    </div>
  );
}
