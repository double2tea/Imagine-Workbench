import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { AudioLines, Music, RefreshCw, Sparkles, Trash2, Wand2 } from "lucide-react";
import PromptTemplatePicker, { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import ModelSelectCombobox, { type ModelOptionGroup } from "@/components/creation/ModelSelectCombobox";
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
import { getMediaReferenceType } from "@/lib/media-references";
import { parseProviderModel, type AudioModelCapabilities, type AudioOperationMode } from "@/lib/providers/model-catalog";
import { deleteVoiceProfile, getVisibleVoiceProfilesForAudioModel, listVoiceProfiles, saveVoiceProfile, type VoiceProfile, type VoiceProfileSource } from "@/lib/voice-profiles";

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
  selectedVoiceProfileId: string;
  submitCount: number;
  voiceCloneConsentAccepted: boolean;
  audioStylePrompt: string;
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
  onSelectVoiceProfile: (value: string) => void;
  onVoiceCloneConsentChange: (value: boolean) => void;
  onAudioStylePromptChange: (value: string) => void;
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
  selectedVoiceProfileId,
  submitCount,
  voiceCloneConsentAccepted,
  audioStylePrompt,
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
  onSelectVoiceProfile,
  onVoiceCloneConsentChange,
  onAudioStylePromptChange,
  showGenerateButton = true,
}: AudioGenerationPanelProps) {
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const [slashCommand, setSlashCommand] = useState<PromptTemplateSlashCommand | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [voiceProfileName, setVoiceProfileName] = useState("");
  const [voiceProfileMessage, setVoiceProfileMessage] = useState("");
  const supportedModes = capabilities.modes;
  const referenceLimit = capabilities.maxReferenceMedia;
  const acceptedMediaTypes = capabilities.referenceMediaTypes;
  const promptReferenceThumbnails = resolvePromptReferenceThumbnails(prompt, referenceImages, acceptedMediaTypes);
  const visibleVoiceProfiles = useMemo(
    () => getVisibleVoiceProfilesForAudioModel(selectedModel, mode, voiceProfiles),
    [mode, selectedModel, voiceProfiles],
  );
  const selectedVoiceProfile = visibleVoiceProfiles.find(profile => profile.id === selectedVoiceProfileId);
  const referenceAudioAssetIds = useMemo(
    () => referenceImages.filter(reference => getMediaReferenceType(reference) === "audio").map(reference => reference.id),
    [referenceImages],
  );
  const canSaveVoiceProfile = mode === "voice_design" || mode === "voice_clone";
  const canUseVoiceProfile = mode === "tts" || canSaveVoiceProfile;
  const showVoiceProfileLibrary = canUseVoiceProfile && (canSaveVoiceProfile || visibleVoiceProfiles.length > 0 || selectedVoiceProfile !== undefined);
  const needsCloneConsent = mode === "voice_clone";
  const stylePromptLabel = mode === "voice_design" ? "音色描述" : mode === "voice_clone" ? "演绎风格" : "风格提示";

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

  const refreshVoiceProfiles = async (): Promise<void> => {
    const profiles = await listVoiceProfiles();
    setVoiceProfiles(profiles);
  };

  const handleSaveVoiceProfile = async (): Promise<void> => {
    const name = voiceProfileName.trim();
    if (!name) {
      setVoiceProfileMessage("先输入音色名称");
      return;
    }
    if (mode === "voice_clone" && referenceAudioAssetIds.length === 0) {
      setVoiceProfileMessage("克隆音色需要至少一个音频参考");
      return;
    }
    if (mode === "voice_clone" && !voiceCloneConsentAccepted) {
      setVoiceProfileMessage("保存克隆音色前请确认参考音频授权");
      return;
    }
    const designPrompt = audioStylePrompt.trim();
    if (mode === "voice_design" && !designPrompt) {
      setVoiceProfileMessage("设计音色需要填写音色描述");
      return;
    }

    const source: VoiceProfileSource = mode === "voice_clone" ? "cloned" : "designed";
    const selectedProvider = parseProviderModel(selectedModel, "12ai").provider;
    const profile = await saveVoiceProfile({
      id: `voice_${Date.now()}`,
      name,
      provider: selectedProvider,
      source,
      designPrompt: designPrompt || undefined,
      referenceAudioAssetIds: mode === "voice_clone" ? referenceAudioAssetIds : [],
    });
    await refreshVoiceProfiles();
    onSelectVoiceProfile(profile.id);
    setVoiceProfileName("");
    setVoiceProfileMessage("已保存音色");
  };

  const handleDeleteVoiceProfile = async (): Promise<void> => {
    if (!selectedVoiceProfileId) return;
    await deleteVoiceProfile(selectedVoiceProfileId);
    await refreshVoiceProfiles();
    onSelectVoiceProfile("");
    setVoiceProfileMessage("已删除音色");
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
              placeholder="写下要朗读、生成音乐或音效的内容... 输入 @ 可引用作品"
              className={`imagine-field-textarea relative z-10 h-24 text-sm leading-6 caret-[var(--iw-text)] transition-all duration-200 ${
                isDragOver ? "scale-[1.01]" : ""
              } ${
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

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="imagine-section-label mb-1.5 block">音频模型</label>
          <ModelSelectCombobox
            accent="cyan"
            ariaLabel="选择音频模型"
            groups={modelGroups}
            value={selectedModel}
            onChange={onSelectModel}
          />
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
              className={`imagine-audio-mode-button flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition ${
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

      {(mode === "voice_design" || mode === "voice_clone") && (
        <div>
          <label className="imagine-section-label mb-1.5 block">{stylePromptLabel}</label>
          <input
            value={audioStylePrompt}
            onChange={event => onAudioStylePromptChange(event.target.value)}
            placeholder={mode === "voice_design" ? "例如：温暖、年轻、自然叙事感" : "例如：平静讲述、广告旁白、轻松口播"}
            className="imagine-input h-9 w-full rounded-md px-3 text-xs"
          />
        </div>
      )}

      {showVoiceProfileLibrary && (
        <div className="rounded-md border border-cyan-400/15 bg-cyan-500/8 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="imagine-section-label">音色库</label>
            {selectedVoiceProfile && selectedVoiceProfile.source !== "builtin" && (
              <button
                type="button"
                onClick={() => void handleDeleteVoiceProfile()}
                className="flex h-7 items-center gap-1 rounded-md border border-red-400/20 px-2 text-[10px] font-semibold text-red-200 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
                删除
              </button>
            )}
          </div>
          <div className={`grid grid-cols-1 gap-2 ${canSaveVoiceProfile ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" : ""}`}>
            <select
              value={selectedVoiceProfileId}
              onChange={event => onSelectVoiceProfile(event.target.value)}
              className="imagine-select h-9 py-0 text-xs"
            >
              <option value="">不使用保存音色</option>
              {selectedVoiceProfileId && !selectedVoiceProfile && (
                <option value={selectedVoiceProfileId}>当前音色不可用于此模式</option>
              )}
              {visibleVoiceProfiles.map(profile => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
            {canSaveVoiceProfile && (
              <>
                <input
                  value={voiceProfileName}
                  onChange={event => setVoiceProfileName(event.target.value)}
                  placeholder="新音色名称"
                  className="imagine-input h-9 rounded-md px-3 text-xs"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveVoiceProfile()}
                  className="imagine-secondary-action h-9 rounded-md border px-3 text-xs font-semibold"
                >
                  保存
                </button>
              </>
            )}
          </div>
          {needsCloneConsent && (
            <label className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-cyan-100">
              <input
                type="checkbox"
                checked={voiceCloneConsentAccepted}
                onChange={event => onVoiceCloneConsentChange(event.target.checked)}
                className="mt-1 h-3.5 w-3.5 rounded border-cyan-400/30 bg-slate-950 text-cyan-500 focus:ring-cyan-400/30"
              />
              我确认拥有参考音频的使用权，并允许用于本次音色克隆。
            </label>
          )}
          {voiceProfileMessage && <p className="mt-2 text-[11px] text-cyan-100">{voiceProfileMessage}</p>}
        </div>
      )}

      {showGenerateButton && (
        <button
          type="button"
          onClick={onGenerate}
          disabled={isSubmitting || !prompt.trim() || (needsCloneConsent && !voiceCloneConsentAccepted)}
          className="imagine-primary-action flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 py-3 text-xs font-bold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin text-white" /> : <AudioLines className="h-4 w-4 text-white" />}
          {isSubmitting ? `提交中 (${submitCount})，可继续排队` : "生成音频"}
        </button>
      )}
    </div>
  );
}
