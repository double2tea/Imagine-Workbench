import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { AudioLines, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import VoiceProfilePreviewPlayer from "@/components/audio/VoiceProfilePreviewPlayer";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import CapabilityParameterControls from "@/components/creation/CapabilityParameterControls";
import CreatorGenerateButton from "@/components/creation/CreatorGenerateButton";
import PromptComposerSurface, { type PromptComposerSelectionRange } from "@/components/creation/PromptComposerSurface";
import PromptComposerToolbarActions from "@/components/creation/PromptComposerToolbarActions";
import { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import type { ModelOptionGroup } from "@/components/creation/ModelSelectCombobox";
import ReferenceImagePicker, { type ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { type DraggedReferenceAsset } from "@/components/reference/referenceDrag";
import {
  ASR_LANGUAGE_OPTIONS,
  audioReferenceConstraintSummary,
  audioOperationRequiresTextInput,
  audioOperationRequiresStylePrompt,
  audioFunctionOptionsForProvider,
  audioFunctionValue,
  audioProviderFromModel,
  audioProviderOptions,
  parseAudioFunctionValue,
} from "@/lib/audio-operation-rules";
import {
  applyPromptTemplateText,
  detectPromptTemplateSlashCommand,
  insertPromptTemplateText,
  type PromptTemplate,
  type PromptTemplateApplyMode,
  type PromptTemplateSlashCommand,
} from "@/lib/prompt-templates";
import { getMediaReferenceType, type MediaReferenceType } from "@/lib/media-references";
import { getAssetMetasByIds, hydrateAssets } from "@/lib/db";
import { getAudioModelCapabilities, parseProviderModel, type AudioModelCapabilities, type AudioOperationMode } from "@/lib/providers/model-catalog";
import type { ModelParameterDescriptor, ModelParameterValues } from "@/lib/providers/model-capabilities";
import {
  VOICE_PROFILES_CHANGED_EVENT,
  VOICE_PROFILE_TAG_GROUPS,
  deleteVoiceProfile,
  getVisibleVoiceProfilesForAudioModel,
  isBuiltInVoiceProfileId,
  listVoiceProfiles,
  saveVoiceProfile,
  voiceProfileTagGroupLabel,
  voiceProfileTagLabel,
  type VoiceProfile,
  type VoiceProfileSource,
} from "@/lib/voice-profiles";

interface AudioGenerationPanelProps {
  atDropdownNode: ReactNode;
  capabilities: AudioModelCapabilities;
  formatOptions: AudioModelCapabilities["formats"];
  isOptimizing: boolean;
  isSubmitting: boolean;
  mode: AudioOperationMode;
  modelGroups: ModelOptionGroup[];
  parameterValues: ModelParameterValues;
  prompt: string;
  referenceImages: ReferenceImageRef[];
  selectedFormat: string;
  selectedModel: string;
  selectedVoiceProfileId: string;
  submitCount: number;
  voiceCloneConsentAccepted: boolean;
  audioStylePrompt: string;
  asrLanguage: "auto" | "zh" | "en";
  onClearReferences: () => void;
  onGenerate: () => void;
  onOptimizePrompt: () => void;
  onParameterValuesChange: (value: ModelParameterValues) => void;
  onPromptChange: (value: string) => void;
  onPromptDropAsset: (event: DragEvent<HTMLTextAreaElement>) => void;
  onReferenceDropAsset: (asset: DraggedReferenceAsset) => void;
  onReferenceDropFiles: (files: File[]) => void;
  onReferenceRemove: (id: string) => void;
  onReferenceUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenAssetLibrary?: () => void;
  onSelectFormat: (value: string) => void;
  onSelectMode: (value: AudioOperationMode) => void;
  onSelectModel: (value: string) => void;
  onSelectVoiceProfile: (value: string) => void;
  onVoiceCloneConsentChange: (value: boolean) => void;
  onAudioStylePromptChange: (value: string) => void;
  onAsrLanguageChange: (value: "auto" | "zh" | "en") => void;
  showGenerateButton?: boolean;
}

interface AudioReferencePickerInput {
  acceptedMediaTypes: MediaReferenceType[];
  maxCount: number;
}

function audioReferencePickerInput(
  capabilities: AudioModelCapabilities,
  references: ReferenceImageRef[],
): AudioReferencePickerInput {
  const defaultInput = {
    acceptedMediaTypes: capabilities.referenceMediaTypes,
    maxCount: capabilities.maxReferenceMedia,
  };
  const allowed = capabilities.inputModalities.mixed?.allowedCombinations;
  if (!allowed) return defaultInput;

  const activeTypes = capabilities.referenceMediaTypes.filter(type =>
    references.some(reference => getMediaReferenceType(reference) === type),
  );
  if (activeTypes.length !== 1 || !allowed.includes(activeTypes[0])) return defaultInput;

  const activeType = activeTypes[0];
  const profile =
    activeType === "image"
      ? capabilities.inputModalities.images
      : activeType === "video"
        ? capabilities.inputModalities.videos
        : capabilities.inputModalities.audio;
  return profile
    ? { acceptedMediaTypes: [activeType], maxCount: profile.maxCount }
    : defaultInput;
}

function visibleProviderParameterDescriptors(
  descriptors: readonly ModelParameterDescriptor[],
  values: ModelParameterValues,
): ModelParameterDescriptor[] {
  const metadataToggle = descriptors.find(
    descriptor => descriptor.kind === "boolean" && descriptor.providerField === "watermark.aigc_metadata.enable",
  );
  if (!metadataToggle || values[metadataToggle.key] === true) return [...descriptors];
  return descriptors.filter(
    descriptor => descriptor === metadataToggle || !descriptor.providerField?.startsWith("watermark.aigc_metadata."),
  );
}

export default function AudioGenerationPanel({
  atDropdownNode,
  capabilities,
  formatOptions,
  isOptimizing,
  isSubmitting,
  mode,
  modelGroups,
  parameterValues,
  prompt,
  referenceImages,
  selectedFormat,
  selectedModel,
  selectedVoiceProfileId,
  submitCount,
  voiceCloneConsentAccepted,
  audioStylePrompt,
  asrLanguage,
  onClearReferences,
  onGenerate,
  onOptimizePrompt,
  onParameterValuesChange,
  onPromptChange,
  onPromptDropAsset,
  onReferenceDropAsset,
  onReferenceDropFiles,
  onReferenceRemove,
  onReferenceUpload,
  onOpenAssetLibrary,
  onSelectFormat,
  onSelectMode,
  onSelectModel,
  onSelectVoiceProfile,
  onVoiceCloneConsentChange,
  onAudioStylePromptChange,
  onAsrLanguageChange,
  showGenerateButton = true,
}: AudioGenerationPanelProps) {
  const { t } = useTranslations("creation");
  const { t: commonT } = useTranslations("common");
  const { t: mediaT } = useTranslations("media");
  const confirmAction = useConfirm();
  const fieldId = useId();
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const promptSelectionRef = useRef<PromptComposerSelectionRange | null>(null);
  const [slashCommand, setSlashCommand] = useState<PromptTemplateSlashCommand | null>(null);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [voiceProfileName, setVoiceProfileName] = useState("");
  const [voiceProfileDescription, setVoiceProfileDescription] = useState("");
  const [voiceProfileTags, setVoiceProfileTags] = useState<string[]>([]);
  const [voiceProfileSearch, setVoiceProfileSearch] = useState("");
  const [voiceProfileMessage, setVoiceProfileMessage] = useState("");
  const [isVoiceProfileEditorOpen, setIsVoiceProfileEditorOpen] = useState(false);
  const [editingVoiceProfileId, setEditingVoiceProfileId] = useState<string | null>(null);
  const [voiceProfilePreviewUrl, setVoiceProfilePreviewUrl] = useState("");
  const selectedProvider = audioProviderFromModel(selectedModel);
  const providerOptions = audioProviderOptions(modelGroups);
  const functionOptions = audioFunctionOptionsForProvider(modelGroups, selectedProvider, getAudioModelCapabilities);
  const selectedFunctionValue = audioFunctionValue(selectedModel, mode);
  const selectedModelLabel = modelGroups
    .flatMap(group => group.options)
    .find(option => option.value === selectedModel)?.label ?? parseProviderModel(selectedModel, selectedProvider).model;
  const audioParameterDescriptors = capabilities.parameterDescriptors.filter(descriptor => descriptor.group !== "provider");
  const providerParameterDescriptors = visibleProviderParameterDescriptors(
    capabilities.parameterDescriptors.filter(descriptor => descriptor.group === "provider"),
    parameterValues,
  );
  const referenceConstraint = useMemo(
    () => audioReferenceConstraintSummary(capabilities, mediaT),
    [capabilities, mediaT],
  );
  const referenceInput = useMemo(
    () => audioReferencePickerInput(capabilities, referenceImages),
    [capabilities, referenceImages],
  );
  const referenceLimit = referenceInput.maxCount;
  const acceptedMediaTypes = referenceInput.acceptedMediaTypes;
  const visibleVoiceProfiles = useMemo(
    () => getVisibleVoiceProfilesForAudioModel(selectedModel, mode, voiceProfiles),
    [mode, selectedModel, voiceProfiles],
  );
  const filteredVoiceProfiles = useMemo(() => {
    const search = voiceProfileSearch.trim().toLowerCase();
    if (!search) return visibleVoiceProfiles;
    return visibleVoiceProfiles.filter(profile => {
      const haystack = [
        profile.name,
        profile.description ?? "",
        ...profile.tags,
        ...profile.tags.map(tag => voiceProfileTagLabel(tag, commonT)),
      ].join(" ").toLowerCase();
      return haystack.includes(search);
    });
  }, [commonT, visibleVoiceProfiles, voiceProfileSearch]);
  const selectedVoiceProfile = visibleVoiceProfiles.find(profile => profile.id === selectedVoiceProfileId);
  const defaultBuiltInVoiceProfile = visibleVoiceProfiles.find(
    profile => profile.source === "builtin" && profile.providerVoiceId === "mimo_default",
  ) ?? visibleVoiceProfiles.find(profile => profile.source === "builtin");
  const referenceAudioAssetIds = useMemo(
    () => referenceImages.filter(reference => getMediaReferenceType(reference) === "audio").map(reference => reference.id),
    [referenceImages],
  );
  const canSaveVoiceProfile = mode === "voice_design" || mode === "voice_clone";
  const canUseVoiceProfile = mode === "generate" || mode === "tts" || canSaveVoiceProfile;
  const showVoiceProfileLibrary = canUseVoiceProfile && (canSaveVoiceProfile || visibleVoiceProfiles.length > 0 || selectedVoiceProfile !== undefined);
  const stylePromptLabel = mode === "voice_design" ? t("audio.stylePromptLabelVoiceDesign") : mode === "voice_clone" ? t("audio.stylePromptLabelVoiceClone") : t("audio.stylePromptLabelDefault");
  const textInputRequired = audioOperationRequiresTextInput(mode);
  const stylePromptRequired = audioOperationRequiresStylePrompt(mode);
  const referenceCount = referenceImages.filter(reference => acceptedMediaTypes.includes(getMediaReferenceType(reference))).length;
  const selectedCloneVoiceProfile = selectedVoiceProfile?.source === "cloned" ? selectedVoiceProfile : undefined;
  const selectedVoiceProfileProvidesCloneReference = mode === "voice_clone" && selectedCloneVoiceProfile !== undefined;
  const hasRequiredReferences = referenceCount >= capabilities.minReferenceMedia || selectedVoiceProfileProvidesCloneReference;
  const hasRequiredInput = (!textInputRequired || prompt.trim().length > 0) && (!stylePromptRequired || audioStylePrompt.trim().length > 0) && hasRequiredReferences;
  const needsCloneConsent = mode === "voice_clone" && !selectedVoiceProfileProvidesCloneReference;
  const promptPlaceholder = textInputRequired
    ? t("audio.promptPlaceholderWithText")
    : t("audio.promptPlaceholderWithoutText");

  const handleProviderChange = (value: string): void => {
    const provider = providerOptions.find(option => option.value === value)?.value;
    if (!provider) return;
    const firstFunction = audioFunctionOptionsForProvider(modelGroups, provider, getAudioModelCapabilities)[0];
    if (!firstFunction) return;
    onSelectModel(firstFunction.model);
    onSelectMode(firstFunction.mode);
  };

  const handleFunctionChange = (value: string): void => {
    const parsed = parseAudioFunctionValue(value);
    if (!parsed) return;
    onSelectModel(parsed.model);
    onSelectMode(parsed.mode);
  };

  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      void listVoiceProfiles().then(
      profiles => {
        if (active) setVoiceProfiles(profiles);
      },
      () => {
        if (active) setVoiceProfiles([]);
      },
      );
    };
    refresh();
    window.addEventListener(VOICE_PROFILES_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(VOICE_PROFILES_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (!canUseVoiceProfile) {
      if (selectedVoiceProfileId && isBuiltInVoiceProfileId(selectedVoiceProfileId)) {
        onSelectVoiceProfile("");
      }
      return;
    }
    if (selectedVoiceProfileId) {
      if (isBuiltInVoiceProfileId(selectedVoiceProfileId) && !selectedVoiceProfile) {
        onSelectVoiceProfile("");
      }
      return;
    }
    if (mode === "tts" && defaultBuiltInVoiceProfile) {
      onSelectVoiceProfile(defaultBuiltInVoiceProfile.id);
    }
  }, [canUseVoiceProfile, defaultBuiltInVoiceProfile, mode, onSelectVoiceProfile, selectedVoiceProfile, selectedVoiceProfileId]);

  const handleApplyPromptTemplate = (template: PromptTemplate, applyMode: PromptTemplateApplyMode): void => {
    if (slashCommand && applyMode === "insert") {
      const result = insertPromptTemplateText(prompt, template.positivePrompt, slashCommand.start, slashCommand.end);
      onPromptChange(result.prompt);
      promptSelectionRef.current = { end: result.caret, start: result.caret };
      setSlashCommand(null);
      return;
    }
    if (applyMode === "insert") {
      const selection = promptSelectionRef.current ?? { end: prompt.length, start: prompt.length };
      const result = insertPromptTemplateText(prompt, template.positivePrompt, selection.start, selection.end);
      onPromptChange(result.prompt);
      promptSelectionRef.current = { end: result.caret, start: result.caret };
      setSlashCommand(null);
      return;
    }
    onPromptChange(applyPromptTemplateText(prompt, template.positivePrompt, applyMode));
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

  const refreshVoiceProfiles = async (): Promise<void> => {
    const profiles = await listVoiceProfiles();
    setVoiceProfiles(profiles);
  };

  useEffect(() => {
    let active = true;
    const previewAssetId = selectedCloneVoiceProfile?.referenceAudioAssetIds[0];
    if (!previewAssetId) {
      setVoiceProfilePreviewUrl("");
      return;
    }
    void getAssetMetasByIds([previewAssetId]).then(
      async metas => {
        const [item] = await hydrateAssets(metas);
        if (active) setVoiceProfilePreviewUrl(item?.type === "audio" ? item.url : "");
      },
      () => {
        if (active) setVoiceProfilePreviewUrl("");
      },
    );
    return () => {
      active = false;
    };
  }, [selectedCloneVoiceProfile]);

  const openNewVoiceProfileEditor = (): void => {
    setEditingVoiceProfileId(null);
    setVoiceProfileName("");
    setVoiceProfileDescription("");
    setVoiceProfileTags([]);
    setVoiceProfileMessage("");
    setIsVoiceProfileEditorOpen(true);
  };

  const openEditVoiceProfileEditor = (profile: VoiceProfile): void => {
    setEditingVoiceProfileId(profile.id);
    setVoiceProfileName(profile.name);
    setVoiceProfileDescription(profile.description ?? "");
    setVoiceProfileTags(profile.tags);
    setVoiceProfileMessage("");
    setIsVoiceProfileEditorOpen(true);
  };

  const closeVoiceProfileEditor = (): void => {
    setIsVoiceProfileEditorOpen(false);
    setEditingVoiceProfileId(null);
    setVoiceProfileName("");
    setVoiceProfileDescription("");
    setVoiceProfileTags([]);
  };

  const handleSaveVoiceProfile = async (): Promise<void> => {
    const name = voiceProfileName.trim();
    if (!name) {
      setVoiceProfileMessage(t("audio.validationEmptyName"));
      return;
    }
    const editingProfile = editingVoiceProfileId ? voiceProfiles.find(profile => profile.id === editingVoiceProfileId) : undefined;
    if (!editingProfile && mode === "voice_clone" && referenceAudioAssetIds.length === 0) {
      setVoiceProfileMessage(t("audio.validationCloneNeedsAudio"));
      return;
    }
    if (!editingProfile && mode === "voice_clone" && !voiceCloneConsentAccepted) {
      setVoiceProfileMessage(t("audio.validationCloneNeedsConsent"));
      return;
    }
    const designPrompt = audioStylePrompt.trim();
    if (!editingProfile && mode === "voice_design" && !designPrompt) {
      setVoiceProfileMessage(t("audio.validationDesignNeedsPrompt"));
      return;
    }
    const source: VoiceProfileSource = editingProfile?.source ?? (mode === "voice_clone" ? "cloned" : "designed");
    const selectedProvider = parseProviderModel(selectedModel, "12ai").provider;
    const profile = await saveVoiceProfile({
      id: editingProfile?.id ?? `voice_${Date.now()}`,
      name,
      provider: editingProfile?.provider ?? selectedProvider,
      source,
      description: voiceProfileDescription.trim() || undefined,
      tags: voiceProfileTags,
      providerVoiceId: editingProfile?.providerVoiceId,
      designPrompt: editingProfile ? editingProfile.designPrompt : designPrompt || undefined,
      referenceAudioAssetIds: editingProfile?.referenceAudioAssetIds ?? (mode === "voice_clone" ? referenceAudioAssetIds : []),
      sourceAssetIds: editingProfile?.sourceAssetIds ?? (mode === "voice_clone" ? referenceAudioAssetIds : []),
      consentAcceptedAt: editingProfile?.consentAcceptedAt ?? (mode === "voice_clone" ? new Date().toISOString() : undefined),
      previewAudioAssetId: editingProfile?.previewAudioAssetId,
      createdAt: editingProfile?.createdAt,
    });
    await refreshVoiceProfiles();
    onSelectVoiceProfile(profile.id);
    closeVoiceProfileEditor();
    setVoiceProfileMessage(editingProfile ? t("audio.profileUpdatedMessage") : t("audio.profileSavedMessage"));
  };

  const handleDeleteVoiceProfile = async (): Promise<void> => {
    if (!selectedVoiceProfileId) return;
    if (!(await confirmAction({ message: t("audio.deleteConfirmMessage"), tone: "danger", confirmLabel: t("audio.deleteConfirmLabel") }))) return;
    await deleteVoiceProfile(selectedVoiceProfileId);
    await refreshVoiceProfiles();
    onSelectVoiceProfile("");
    closeVoiceProfileEditor();
    setVoiceProfileMessage(t("audio.profileDeletedMessage"));
  };

  const toggleVoiceProfileTag = (tag: string): void => {
    setVoiceProfileTags(current => current.includes(tag) ? current.filter(value => value !== tag) : [...current, tag]);
  };

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      <PromptComposerSurface
        acceptedMediaTypes={acceptedMediaTypes}
        actions={
          <PromptComposerToolbarActions
            ref={templatePickerRef}
            accent="blue"
            isOptimizing={isOptimizing}
            optimizeDisabled={isOptimizing || !prompt.trim()}
            optimizeLabel={t("audio.optimizeLabel")}
            onApplyTemplate={handleApplyPromptTemplate}
            onOptimize={onOptimizePrompt}
          />
        }
        atDropdownNode={atDropdownNode}
        desktopHint={t("audio.desktopHint")}
        headerAccent="neutral"
        headerVariant="toolbar"
        icon={<AudioLines className="h-3.5 w-3.5" />}
        label={t("audio.panelLabel")}
        onChange={handlePromptChange}
        onDropAsset={onPromptDropAsset}
        onSelectionChange={(selection) => {
          promptSelectionRef.current = selection;
        }}
        placeholder={promptPlaceholder}
        prompt={prompt}
        references={referenceImages}
      />

      <div className="imagine-parameter-grid grid grid-cols-1 gap-3">
        <div className="imagine-parameter-field">
          <label htmlFor={`${fieldId}-provider`} className="imagine-parameter-label-row imagine-section-label">{t("audio.providerLabel")}</label>
          <select
            id={`${fieldId}-provider`}
            name="audio-provider"
            value={selectedProvider}
            onChange={(event) => handleProviderChange(event.target.value)}
            className="imagine-select py-2.5"
          >
            {providerOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {functionOptions.length === 1 && (
          <div
            aria-label={t("audio.modelSummaryAriaLabel", { model: selectedModelLabel, function: functionOptions[0].label })}
            aria-live="polite"
            className="imagine-surface-panel imagine-surface-panel--soft flex items-center justify-between gap-3 px-3 py-2.5"
          >
            <span className="imagine-section-label">{t("audio.currentModelLabel")}</span>
            <span className="min-w-0 text-right text-xs font-semibold text-[var(--iw-text)]">
              <span>{selectedModelLabel}</span>
              <span aria-hidden="true" className="mx-1 text-[var(--iw-faint)]">·</span>
              <span className="text-[var(--iw-muted)]">{functionOptions[0].label}</span>
            </span>
          </div>
        )}
        {functionOptions.length > 1 && (
          <div className="imagine-parameter-field">
            <label htmlFor={`${fieldId}-function`} className="imagine-parameter-label-row imagine-section-label">{t("audio.functionLabel")}</label>
            <select
              id={`${fieldId}-function`}
              name="audio-function"
              value={functionOptions.some(option => option.value === selectedFunctionValue) ? selectedFunctionValue : ""}
              onChange={(event) => handleFunctionChange(event.target.value)}
              className="imagine-select py-2.5"
            >
              {!functionOptions.some(option => option.value === selectedFunctionValue) && <option value="" disabled>{t("audio.functionUnavailable")}</option>}
              {functionOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        )}
        {formatOptions.length > 0 && (
          <div className="imagine-parameter-field">
            <label htmlFor={`${fieldId}-format`} className="imagine-parameter-label-row imagine-section-label">{t("audio.formatLabel")}</label>
            <select
              id={`${fieldId}-format`}
              name="audio-format"
              value={selectedFormat}
              onChange={(event) => onSelectFormat(event.target.value)}
              className="imagine-select py-2.5"
            >
              {formatOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {capabilities.referenceMediaTypes.length > 0 && (
        <ReferenceImagePicker
          acceptedMediaTypes={acceptedMediaTypes}
          addLabel={t("audio.addReferenceLabel")}
          browseClassName="cursor-pointer font-semibold text-[var(--iw-muted)] underline-offset-2 hover:text-[var(--iw-text)] hover:underline"
          clearLabel={t("audio.clearReferenceLabel")}
          constraintText={referenceConstraint}
          emptyHelp={t("audio.referenceDropHelp")}
          emptyLabel={t("audio.referenceDropLabel")}
          label={`${t("audio.referenceMediaLabel")} ${Math.min(referenceCount, referenceLimit)}/${referenceLimit}`}
          libraryBrowseLabel={t("audio.libraryBrowseLabel")}
          libraryTileLabel={t("audio.libraryTileLabel")}
          maxCount={referenceLimit}
          references={referenceImages}
          uploadLabel={t("audio.referenceUploadLabel")}
          onClear={onClearReferences}
          onDropAsset={onReferenceDropAsset}
          onDropFiles={onReferenceDropFiles}
          onRemove={onReferenceRemove}
          onOpenLibrary={onOpenAssetLibrary}
          onUpload={onReferenceUpload}
        />
      )}

      {capabilities.parameterDescriptors.length > 0 && (
        <details className="imagine-panel-disclosure">
          <summary
            aria-controls={`${fieldId}-advanced-parameters`}
            className="imagine-panel-disclosure-summary"
          >
            {t("advanced.summary")}
          </summary>
          <div id={`${fieldId}-advanced-parameters`} className="imagine-panel-disclosure-body">
            {providerParameterDescriptors.length > 0 ? (
              <div className="grid gap-4">
                {audioParameterDescriptors.length > 0 && (
                  <section aria-labelledby={`${fieldId}-audio-controls-title`} className="grid gap-2">
                    <h3 id={`${fieldId}-audio-controls-title`} className="imagine-section-label">
                      {t("parameters.audioControlsTitle")}
                    </h3>
                    <CapabilityParameterControls
                      hideTitle
                      descriptors={audioParameterDescriptors}
                      value={parameterValues}
                      onChange={onParameterValuesChange}
                    />
                  </section>
                )}
                <section aria-labelledby={`${fieldId}-provenance-title`} className="grid gap-2 border-t border-[var(--iw-border)] pt-3">
                  <h3 id={`${fieldId}-provenance-title`} className="imagine-section-label">
                    {t("parameters.provenanceTitle")}
                  </h3>
                  <CapabilityParameterControls
                    hideTitle
                    descriptors={providerParameterDescriptors}
                    value={parameterValues}
                    onChange={onParameterValuesChange}
                  />
                </section>
              </div>
            ) : (
              <CapabilityParameterControls
                hideTitle
                descriptors={audioParameterDescriptors}
                value={parameterValues}
                onChange={onParameterValuesChange}
              />
            )}
          </div>
        </details>
      )}

      {(mode === "voice_design" || mode === "voice_clone") && (
        <div className="imagine-parameter-field">
          <label className="imagine-parameter-label-row imagine-section-label">{stylePromptLabel}</label>
          <input
            value={audioStylePrompt}
            onChange={event => onAudioStylePromptChange(event.target.value)}
            placeholder={mode === "voice_design" ? t("audio.stylePromptPlaceholderVoiceDesign") : t("audio.stylePromptPlaceholderVoiceClone")}
            className="imagine-input h-9 w-full rounded-md px-3 text-xs"
          />
        </div>
      )}

      {mode === "asr" && (
        <div className="imagine-parameter-field">
          <label className="imagine-parameter-label-row imagine-section-label">{t("audio.transcribeLanguageLabel")}</label>
          <select value={asrLanguage} onChange={event => onAsrLanguageChange(event.target.value as "auto" | "zh" | "en")} className="imagine-select py-2.5">
            {ASR_LANGUAGE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      )}

      {showVoiceProfileLibrary && (
        <div className="rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3 text-[var(--iw-text)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="imagine-section-label">{t("audio.voiceLibraryLabel")}</label>
            <div className="flex items-center gap-1.5">
              {canSaveVoiceProfile && !isVoiceProfileEditorOpen && (
                <button
                  type="button"
                  onClick={openNewVoiceProfileEditor}
                  className="imagine-secondary-action flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold"
                >
                  {t("audio.saveButton")}
                </button>
              )}
              {selectedVoiceProfile && selectedVoiceProfile.source !== "builtin" && (
                <>
                  <button
                    type="button"
                    onClick={() => openEditVoiceProfileEditor(selectedVoiceProfile)}
                    className="imagine-secondary-action flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold"
                  >
                    <Pencil className="h-3 w-3" />
                    {t("audio.editButton")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteVoiceProfile()}
                    className="imagine-tone-chip flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition"
                    data-tone="danger"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("audio.deleteButton")}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <input
              value={voiceProfileSearch}
              onChange={event => setVoiceProfileSearch(event.target.value)}
              placeholder={t("audio.voiceProfileSearchPlaceholder")}
              className="imagine-input h-9 rounded-md px-3 text-xs"
            />
            <select
              value={selectedVoiceProfileId}
              onChange={event => onSelectVoiceProfile(event.target.value)}
              className="imagine-select h-9 py-0 text-xs"
            >
              <option value="">{t("audio.useDefaultVoice")}</option>
              {selectedVoiceProfileId && !selectedVoiceProfile && (
                <option value={selectedVoiceProfileId}>{t("audio.voiceUnavailableForMode")}</option>
              )}
              {selectedVoiceProfile && !filteredVoiceProfiles.some(profile => profile.id === selectedVoiceProfile.id) && (
                <option value={selectedVoiceProfile.id}>{selectedVoiceProfile.name}</option>
              )}
              {filteredVoiceProfiles.map(profile => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}{profile.tags.length > 0 ? ` · ${profile.tags.slice(0, 2).map(tag => voiceProfileTagLabel(tag, commonT)).join("/")}` : ""}
                </option>
              ))}
            </select>
            {selectedCloneVoiceProfile && (
              <div className="rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] p-2 text-[11px] text-[var(--iw-muted)]">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span>{t("audio.cloneReferenceProvided")}</span>
                  <span>{selectedCloneVoiceProfile.referenceAudioAssetIds.length} {t("audio.cloneSourceCount", { count: selectedCloneVoiceProfile.referenceAudioAssetIds.length })}</span>
                </div>
                {voiceProfilePreviewUrl ? (
                  <VoiceProfilePreviewPlayer src={voiceProfilePreviewUrl} />
                ) : (
                  <p className="text-[var(--iw-muted)]">{t("audio.sourceAudioUnavailable")}</p>
                )}
              </div>
            )}
            {isVoiceProfileEditorOpen && canSaveVoiceProfile && (
              <>
                <input
                  value={voiceProfileName}
                  onChange={event => setVoiceProfileName(event.target.value)}
                  placeholder={editingVoiceProfileId ? t("audio.voiceProfileNamePlaceholderEdit") : t("audio.voiceProfileNamePlaceholderNew")}
                  className="imagine-input h-9 rounded-md px-3 text-xs"
                />
                <textarea
                  value={voiceProfileDescription}
                  onChange={event => setVoiceProfileDescription(event.target.value)}
                  placeholder={t("audio.voiceProfileDescriptionPlaceholder")}
                  className="imagine-input min-h-16 resize-y rounded-md px-3 py-2 text-xs"
                  maxLength={180}
                />
                <div className="grid gap-2">
                  {VOICE_PROFILE_TAG_GROUPS.map(group => (
                    <div key={group.label} className="grid gap-1.5">
                      <span className="text-[10px] font-semibold text-[var(--iw-muted)]">{voiceProfileTagGroupLabel(group, commonT)}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {group.tags.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleVoiceProfileTag(tag)}
                            className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition ${
                              voiceProfileTags.includes(tag)
                                ? "border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-text)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--iw-text)_8%,transparent)]"
                                : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]"
                            }`}
                          >
                            {voiceProfileTagLabel(tag, commonT)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveVoiceProfile()}
                    className="imagine-secondary-action h-9 rounded-md border px-3 text-xs font-semibold"
                  >
                    {editingVoiceProfileId ? t("audio.saveVoiceProfileButtonUpdate") : t("audio.saveVoiceProfileButtonNew")}
                  </button>
                  <button
                    type="button"
                    onClick={closeVoiceProfileEditor}
                    className="imagine-secondary-action h-9 rounded-md border px-3 text-xs font-semibold"
                  >
                    {t("audio.cancelButton")}
                  </button>
                </div>
              </>
            )}
          </div>
          {selectedVoiceProfile && (selectedVoiceProfile.description || selectedVoiceProfile.tags.length > 0) && (
            <div className="mt-2 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] p-2 text-[11px] text-[var(--iw-muted)]">
              {selectedVoiceProfile.description && <p className="line-clamp-2">{selectedVoiceProfile.description}</p>}
              {selectedVoiceProfile.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedVoiceProfile.tags.map(tag => (
                    <span key={tag} className="rounded border border-[var(--iw-border)] px-1.5 py-0.5 text-[10px] text-[var(--iw-muted)]">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {needsCloneConsent && (
            <label className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-[var(--iw-text)]">
              <input
                type="checkbox"
                checked={voiceCloneConsentAccepted}
                onChange={event => onVoiceCloneConsentChange(event.target.checked)}
                className="imagine-capability-checkbox mt-1"
              />
              {t("audio.cloneConsentText")}
            </label>
          )}
          {voiceProfileMessage && <p className="mt-2 text-[11px] text-[var(--iw-text)]">{voiceProfileMessage}</p>}
        </div>
      )}

      {showGenerateButton && (
        <CreatorGenerateButton
          mode="audio"
          disabled={!hasRequiredInput || (needsCloneConsent && !voiceCloneConsentAccepted)}
          isSubmitting={isSubmitting}
          label={mode === "asr" ? t("audio.generateLabelASR") : t("audio.generateLabelDefault")}
          submitCount={submitCount}
          onGenerate={onGenerate}
        />
      )}
    </div>
  );
}
