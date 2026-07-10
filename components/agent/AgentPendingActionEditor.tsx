"use client";

import { useMemo } from "react";
import { useTranslations } from "@/lib/i18n";
import type { AgentBoardPatchOperation, AgentGenerationParams, AgentToolAction } from "@/lib/agent-actions";
import {
  patchAgentToolAction,
  resolveAudioActionParams,
  resolveImageActionParams,
  resolveVideoActionParams,
} from "@/lib/agent-tool-action";
import {
  ASR_LANGUAGE_OPTIONS,
  audioFunctionOptionsForProvider,
  audioFunctionValue,
  audioOperationFormatOptions,
  audioProviderFromModel,
  audioProviderOptions,
  parseAudioFunctionValue,
} from "@/lib/audio-operation-rules";
import {
  getAudioModelCapabilities,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getVideoModelCapabilities,
  type AiProvider,
  type ModelOption,
} from "@/lib/providers/model-catalog";

interface AgentModelGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

interface AgentPendingActionEditorProps {
  action: AgentToolAction;
  audioModelGroups: AgentModelGroup[];
  disabled?: boolean;
  imageModelGroups: AgentModelGroup[];
  videoModelGroups: AgentModelGroup[];
  onChange: (action: AgentToolAction) => void;
}

function isImageActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_image" || type === "edit_image" || type === "create_board_image_flow";
}

function isVideoActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_video" || type === "create_board_video_flow" || type === "continue_image_to_video";
}

function isAudioActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_audio" || type === "create_board_audio_flow";
}

function firstOptionValue(options: Array<{ value: string }>, fallback: string): string {
  return options[0]?.value ?? fallback;
}

function concreteImageResolutionOptions<T extends { value: string }>(options: T[]): T[] {
  return options.filter(option => option.value !== "custom");
}

function describePatchOperation(operation: AgentBoardPatchOperation, t: { (key: string, params?: Record<string, string>): string }): string {
  if (operation.op === "create_node") return t("pendingActionEditor.describePatchCreateNode", { kind: operation.kind, title: operation.title ?? operation.tempId });
  if (operation.op === "update_node") return t("pendingActionEditor.describePatchUpdateNode", { nodeId: operation.nodeId });
  return t("pendingActionEditor.describePatchConnectPorts", {
    from_nodeId: operation.from.nodeId,
    from_portId: operation.from.portId,
    to_nodeId: operation.to.nodeId,
    to_portId: operation.to.portId,
  });
}

function editablePatchField(operation: AgentBoardPatchOperation): { field: "prompt" | "body" | "instruction"; value: string } | null {
  if (operation.op === "connect_ports") return null;
  if ("body" in operation && typeof operation.body === "string") return { field: "body", value: operation.body };
  if ("instruction" in operation && typeof operation.instruction === "string") return { field: "instruction", value: operation.instruction };
  if ("prompt" in operation && typeof operation.prompt === "string") return { field: "prompt", value: operation.prompt };
  if (operation.op === "create_node") {
    if (operation.kind === "note") return { field: "body", value: "" };
    if (operation.kind === "agent") return { field: "instruction", value: "" };
    return { field: "prompt", value: "" };
  }
  return null;
}

export function AgentPendingActionEditor({
  action,
  audioModelGroups,
  disabled = false,
  imageModelGroups,
  videoModelGroups,
  onChange,
}: AgentPendingActionEditorProps) {
  const { t } = useTranslations("agent");
  const params = action.params ?? {};
  const isEditImage = action.type === "edit_image";
  const isImage = isImageActionType(action.type) && !isEditImage;
  const isVideo = isVideoActionType(action.type);
  const isAudio = isAudioActionType(action.type);
  const isNote = action.type === "create_board_note";
  const isBoardNodeUpdate = action.type === "update_board_node";
  const isBoardPatch = action.type === "apply_board_patch";
  const showPrompt = action.type !== "none" && !isNote && !isBoardNodeUpdate && !isBoardPatch;
  const showNoteFields = isNote;

  const imageModel = params.model ?? "";
  const videoModel = params.model ?? "";
  const audioModel = params.model ?? "";

  const imageCapabilities = useMemo(
    () => (isImage && imageModel ? getImageModelCapabilities(imageModel) : null),
    [imageModel, isImage],
  );
  const imageResolutionOptions = useMemo(() => {
    if (!imageCapabilities || !imageModel) return [];
    const aspectRatio = params.aspectRatio ?? firstOptionValue(imageCapabilities.aspectRatios, "1:1");
    const fromAspect = getImageResolutionOptions(imageModel, aspectRatio);
    return concreteImageResolutionOptions(fromAspect.length > 0 ? fromAspect : imageCapabilities.resolutions);
  }, [imageCapabilities, imageModel, params.aspectRatio]);
  const selectedImageResolution = params.imageResolution && imageResolutionOptions.some(option => option.value === params.imageResolution)
    ? params.imageResolution
    : imageResolutionOptions[0]?.value ?? "1K";

  const videoCapabilities = useMemo(
    () => (isVideo && videoModel ? getVideoModelCapabilities(videoModel) : null),
    [isVideo, videoModel],
  );
  const audioCapabilities = useMemo(
    () => (isAudio && audioModel ? getAudioModelCapabilities(audioModel) : null),
    [audioModel, isAudio],
  );
  const activeAudioMode = audioCapabilities && params.audioMode && audioCapabilities.modes.includes(params.audioMode)
    ? params.audioMode
    : audioCapabilities?.defaultMode;
  const audioFormatOptions = audioCapabilities ? audioOperationFormatOptions(audioCapabilities) : [];
  const selectedAudioProvider = isAudio && audioModel ? audioProviderFromModel(audioModel) : audioModelGroups[0]?.provider;
  const audioProviderChoices = useMemo(
    () => audioProviderOptions(audioModelGroups),
    [audioModelGroups],
  );
  const audioFunctionOptions = useMemo(
    () => selectedAudioProvider ? audioFunctionOptionsForProvider(audioModelGroups, selectedAudioProvider, getAudioModelCapabilities) : [],
    [audioModelGroups, selectedAudioProvider],
  );
  const selectedAudioFunctionValue = isAudio && audioModel && activeAudioMode ? audioFunctionValue(audioModel, activeAudioMode) : "";

  const modelGroups = useMemo(
    () => (isImage ? imageModelGroups : isVideo ? videoModelGroups : isAudio ? audioModelGroups : []),
    [audioModelGroups, imageModelGroups, isAudio, isImage, isVideo, videoModelGroups],
  );
  const activeModel = isImage ? imageModel : isVideo ? videoModel : isAudio ? audioModel : "";
  const flatModelOptions = useMemo(
    () => modelGroups.flatMap(group => group.options),
    [modelGroups],
  );
  const modelMissingFromList = Boolean(activeModel) && !flatModelOptions.some(option => option.value === activeModel);

  const updateParams = (patch: NonNullable<AgentToolAction["params"]>) => {
    onChange(patchAgentToolAction(action, patch));
  };

  const updateBoardPatchParams = (patch: Partial<NonNullable<AgentGenerationParams["boardPatch"]>>) => {
    if (!params.boardPatch) return;
    updateParams({ boardPatch: { ...params.boardPatch, ...patch } });
  };

  const updatePatchOperation = (index: number, patch: Partial<AgentBoardPatchOperation>) => {
    if (!params.boardPatch) return;
    const operations = params.boardPatch.operations.map((operation, operationIndex) => (
      operationIndex === index ? { ...operation, ...patch } as AgentBoardPatchOperation : operation
    ));
    updateBoardPatchParams({ operations });
  };

  const handleModelChange = (model: string) => {
    if (isImage) {
      onChange(patchAgentToolAction(action, resolveImageActionParams(model, params)));
      return;
    }
    if (isVideo) {
      onChange(patchAgentToolAction(action, resolveVideoActionParams(model, params)));
      return;
    }
    if (isAudio) {
      onChange(patchAgentToolAction(action, resolveAudioActionParams(model, params)));
    }
  };

  const handleImageAspectRatioChange = (aspectRatio: string) => {
    if (!imageModel) {
      updateParams({ aspectRatio });
      return;
    }
    const resolutionOptions = getImageResolutionOptions(imageModel, aspectRatio);
    const resolutionSource = resolutionOptions.length > 0
      ? resolutionOptions
      : getImageModelCapabilities(imageModel).resolutions;
    const concreteResolutionSource = concreteImageResolutionOptions(resolutionSource);
    const imageResolution = params.imageResolution && params.imageResolution !== "custom" && resolutionSource.some(option => option.value === params.imageResolution)
      ? params.imageResolution
      : firstOptionValue(concreteResolutionSource, firstOptionValue(resolutionSource, "1K"));
    updateParams({ aspectRatio, imageResolution });
  };

  const resolveAudioParamsForMode = (model: string, audioMode: NonNullable<typeof activeAudioMode>): AgentGenerationParams => {
    return resolveAudioActionParams(model, {
      ...params,
      audioMode,
      voiceCloneConsentAccepted: audioMode === "voice_clone" ? params.voiceCloneConsentAccepted : undefined,
    });
  };

  const handleAudioProviderChange = (value: string) => {
    const provider = audioProviderChoices.find(option => option.value === value)?.value;
    if (!provider) return;
    const firstFunction = audioFunctionOptionsForProvider(audioModelGroups, provider, getAudioModelCapabilities)[0];
    if (!firstFunction) return;
    onChange(patchAgentToolAction(action, resolveAudioParamsForMode(firstFunction.model, firstFunction.mode)));
  };

  const handleAudioFunctionChange = (value: string) => {
    const parsed = parseAudioFunctionValue(value);
    if (!parsed) return;
    onChange(patchAgentToolAction(action, resolveAudioParamsForMode(parsed.model, parsed.mode)));
  };

  return (
    <div className="imagine-agent-action-form">
      {showPrompt && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.promptLabel")}</span>
          <textarea
            value={params.prompt ?? ""}
            disabled={disabled}
            rows={3}
            onChange={event => updateParams({ prompt: event.target.value })}
            className="imagine-agent-action-textarea"
            placeholder={t("pendingActionEditor.promptPlaceholder")}
          />
        </label>
      )}

      {showNoteFields && (
        <>
          <label className="imagine-agent-action-field">
            <span className="imagine-agent-action-field-label">{t("pendingActionEditor.titleLabel")}</span>
            <input
              type="text"
              value={params.title ?? ""}
              disabled={disabled}
              onChange={event => updateParams({ title: event.target.value })}
              className="imagine-agent-action-input"
            />
          </label>
          <label className="imagine-agent-action-field">
            <span className="imagine-agent-action-field-label">{t("pendingActionEditor.noteContentLabel")}</span>
            <textarea
              value={params.body ?? params.prompt ?? ""}
              disabled={disabled}
              rows={3}
              onChange={event => updateParams({ body: event.target.value })}
              className="imagine-agent-action-textarea"
            />
          </label>
        </>
      )}

      {isBoardNodeUpdate && (
        <>
          <label className="imagine-agent-action-field">
            <span className="imagine-agent-action-field-label">{t("pendingActionEditor.targetNodeIdLabel")}</span>
            <input
              type="text"
              value={params.nodeId ?? ""}
              disabled={disabled}
              onChange={event => updateParams({ nodeId: event.target.value })}
              className="imagine-agent-action-input"
              placeholder={t("pendingActionEditor.targetNodePlaceholder")}
            />
          </label>
          <label className="imagine-agent-action-field">
            <span className="imagine-agent-action-field-label">{t("pendingActionEditor.nodeContentLabel")}</span>
            <textarea
              value={params.prompt ?? params.instruction ?? params.body ?? ""}
              disabled={disabled}
              rows={3}
              onChange={event => updateParams({ prompt: event.target.value, instruction: event.target.value, body: event.target.value })}
              className="imagine-agent-action-textarea"
              placeholder={t("pendingActionEditor.nodeContentPlaceholder")}
            />
          </label>
        </>
      )}

      {isBoardPatch && params.boardPatch && (
        <div className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.boardPatchLabel")}</span>
          <input
            type="text"
            value={params.boardPatch.title ?? ""}
            disabled={disabled}
            onChange={event => updateBoardPatchParams({ title: event.target.value })}
            className="imagine-agent-action-input"
            placeholder={t("pendingActionEditor.patchTitlePlaceholder")}
          />
          <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--iw-muted)]">
            <input
              type="checkbox"
              checked={params.boardPatch.run === true}
              disabled={disabled}
              onChange={event => updateBoardPatchParams({ run: event.target.checked })}
            />
            {t("pendingActionEditor.autoRunAfterExecution")}
          </label>
          {params.boardPatch.shots?.length ? (
            <div className="mt-2 space-y-1 text-[11px] text-[var(--iw-muted)]">
              {params.boardPatch.shots.slice(0, 6).map((shot, index) => (
                <p key={`${shot.id ?? "shot"}-${index}`}>
                  {shot.scene ?? "Scene"} / {shot.shot ?? `Shot ${index + 1}`}: {shot.beat ?? shot.imagePrompt ?? t("pendingActionEditor.beatFallback")}
                </p>
              ))}
            </div>
          ) : null}
          <div className="mt-2 space-y-2">
            {params.boardPatch.operations.map((operation, index) => {
              const editable = editablePatchField(operation);
              return (
                <div key={`${operation.op}-${index}`} className="rounded-md border border-white/10 p-2">
                  <p className="text-[11px] font-medium text-[var(--iw-text)]">{index + 1}. {describePatchOperation(operation, t)}</p>
                  {editable ? (
                    <textarea
                      value={editable.value}
                      disabled={disabled}
                      rows={2}
                      onChange={event => updatePatchOperation(index, { [editable.field]: event.target.value } as Partial<AgentBoardPatchOperation>)}
                      className="imagine-agent-action-textarea mt-2"
                      placeholder={t("pendingActionEditor.patchContentPlaceholder")}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(isImage || isVideo) && modelGroups.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.modelLabel")}</span>
          <select
            value={activeModel}
            disabled={disabled}
            onChange={event => handleModelChange(event.target.value)}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            className="imagine-agent-model-select pointer-events-auto w-full"
          >
            {!activeModel ? <option value="">{t("pendingActionEditor.selectModelPlaceholder")}</option> : null}
            {modelMissingFromList ? (
              <option value={activeModel}>{activeModel}{t("pendingActionEditor.modelNotInList")}</option>
            ) : null}
            {modelGroups.map(group => (
              <optgroup key={group.provider} label={group.label}>
                {group.options.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      {isAudio && audioProviderChoices.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.providerLabel")}</span>
          <select
            value={selectedAudioProvider ?? ""}
            disabled={disabled}
            onChange={event => handleAudioProviderChange(event.target.value)}
            className="imagine-agent-model-select w-full"
          >
            {audioProviderChoices.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}

      {isAudio && audioFunctionOptions.length > 1 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.functionLabel")}</span>
          <select
            value={audioFunctionOptions.some(option => option.value === selectedAudioFunctionValue) ? selectedAudioFunctionValue : ""}
            disabled={disabled}
            onChange={event => handleAudioFunctionChange(event.target.value)}
            className="imagine-agent-model-select w-full"
          >
            {!audioFunctionOptions.some(option => option.value === selectedAudioFunctionValue) && <option value="" disabled>{t("pendingActionEditor.functionUnavailable")}</option>}
            {audioFunctionOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}

      {isImage && imageCapabilities && imageCapabilities.aspectRatios.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.aspectRatioLabel")}</span>
          <select
            value={params.aspectRatio ?? imageCapabilities.aspectRatios[0]?.value ?? "1:1"}
            disabled={disabled}
            onChange={event => handleImageAspectRatioChange(event.target.value)}
            className="imagine-agent-model-select w-full"
          >
            {imageCapabilities.aspectRatios.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isImage && imageResolutionOptions.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.resolutionLabel")}</span>
          <select
            value={selectedImageResolution}
            disabled={disabled}
            onChange={event => updateParams({ imageResolution: event.target.value })}
            className="imagine-agent-model-select w-full"
          >
            {imageResolutionOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isImage && imageCapabilities && imageCapabilities.qualities.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.qualityLabel")}</span>
          <select
            value={params.imageQuality ?? imageCapabilities.qualities[0]?.value ?? ""}
            disabled={disabled}
            onChange={event => updateParams({ imageQuality: event.target.value })}
            className="imagine-agent-model-select w-full"
          >
            {imageCapabilities.qualities.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isImage && imageCapabilities && imageCapabilities.thinkingLevels.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.thinkingLevelLabel")}</span>
          <select
            value={params.thinkingLevel ?? imageCapabilities.thinkingLevels[0]?.value ?? ""}
            disabled={disabled}
            onChange={event => updateParams({ thinkingLevel: event.target.value })}
            className="imagine-agent-model-select w-full"
          >
            {imageCapabilities.thinkingLevels.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isVideo && videoCapabilities && videoCapabilities.sizes.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.videoSizeLabel")}</span>
          <select
            value={params.aspectRatio ?? videoCapabilities.sizes[0]?.value ?? "auto"}
            disabled={disabled}
            onChange={event => updateParams({ aspectRatio: event.target.value })}
            className="imagine-agent-model-select w-full"
          >
            {videoCapabilities.sizes.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isVideo && videoCapabilities && videoCapabilities.resolutions.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.resolutionLabel")}</span>
          <select
            value={params.videoResolution ?? videoCapabilities.resolutions[0]?.value ?? ""}
            disabled={disabled}
            onChange={event => updateParams({ videoResolution: event.target.value })}
            className="imagine-agent-model-select w-full"
          >
            {videoCapabilities.resolutions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isVideo && videoCapabilities && videoCapabilities.durations.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.durationLabel")}</span>
          <select
            value={params.videoDuration ?? videoCapabilities.durations[0]?.value ?? ""}
            disabled={disabled}
            onChange={event => updateParams({ videoDuration: event.target.value })}
            className="imagine-agent-model-select w-full"
          >
            {videoCapabilities.durations.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isVideo && videoCapabilities && videoCapabilities.presets.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.presetLabel")}</span>
          <select
            value={params.videoPreset ?? videoCapabilities.presets[0]?.value ?? ""}
            disabled={disabled}
            onChange={event => updateParams({ videoPreset: event.target.value })}
            className="imagine-agent-model-select w-full"
          >
            {videoCapabilities.presets.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isVideo && videoCapabilities && videoCapabilities.referenceModes.length > 1 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.referenceModeLabel")}</span>
          <select
            value={params.videoReferenceMode ?? videoCapabilities.referenceMode}
            disabled={disabled}
            onChange={event => updateParams({ videoReferenceMode: event.target.value as AgentGenerationParams["videoReferenceMode"] })}
            className="imagine-agent-model-select w-full"
          >
            {videoCapabilities.referenceModes.map(option => (
              <option key={option} value={option}>
                {option === "firstLast" ? t("pendingActionEditor.referenceModeFirstLast") : t("pendingActionEditor.referenceModeAll")}
              </option>
            ))}
          </select>
        </label>
      )}

      {isAudio && audioCapabilities && audioFormatOptions.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.audioFormatLabel")}</span>
          <select
            value={params.audioFormat ?? audioFormatOptions[0]?.value ?? ""}
            disabled={disabled}
            onChange={event => updateParams({ audioFormat: event.target.value })}
            className="imagine-agent-model-select w-full"
          >
            {audioFormatOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {isAudio && (activeAudioMode === "voice_design" || activeAudioMode === "voice_clone") && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{activeAudioMode === "voice_design" ? t("pendingActionEditor.voiceDescriptionLabel") : t("pendingActionEditor.voiceCloneStyleLabel")}</span>
          <input
            value={params.audioStylePrompt ?? ""}
            disabled={disabled}
            onChange={event => updateParams({ audioStylePrompt: event.target.value })}
            className="imagine-agent-action-input"
            placeholder={activeAudioMode === "voice_design" ? t("pendingActionEditor.voiceDescriptionPlaceholder") : t("pendingActionEditor.voiceCloneStylePlaceholder")}
          />
        </label>
      )}

      {isAudio && activeAudioMode === "asr" && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">{t("pendingActionEditor.asrLanguageLabel")}</span>
          <select
            value={params.asrLanguage ?? "auto"}
            disabled={disabled}
            onChange={event => updateParams({ asrLanguage: event.target.value as "auto" | "zh" | "en" })}
            className="imagine-agent-model-select w-full"
          >
            {ASR_LANGUAGE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}

      {isAudio && activeAudioMode === "voice_clone" && (
        <label className="imagine-agent-action-field flex-row items-start gap-2 text-[11px] leading-5 text-[var(--iw-muted)]">
          <input
            type="checkbox"
            checked={params.voiceCloneConsentAccepted === true}
            disabled={disabled}
            onChange={event => updateParams({ voiceCloneConsentAccepted: event.target.checked })}
            className="mt-1 h-3.5 w-3.5 rounded border-[var(--iw-border)] bg-transparent"
          />
          <span>{t("pendingActionEditor.voiceCloneConsentLabel")}</span>
        </label>
      )}

    </div>
  );
}
