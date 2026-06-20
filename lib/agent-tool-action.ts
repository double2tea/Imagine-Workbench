import { t } from "@/lib/i18n";
import { AGENT_BOARD_PATCH_MAX_OPERATIONS, type AgentGenerationParams, type AgentToolAction } from "./agent-actions";
import { audioOperationMissingReferenceMessage, audioOperationRequiresTextInput } from "./audio-operation-rules";
import { getMediaReferenceType, mediaReferenceLabel, type MediaReference } from "./media-references";
import {
  getAudioModelCapabilities,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getModelCapabilities,
  getVideoModelCapabilities,
  resolveImageModelQuality,
} from "./providers/model-catalog";

export type { AgentGenerationParams };

export function cloneAgentToolAction(action: AgentToolAction): AgentToolAction {
  return {
    type: action.type,
    params: action.params ? { ...action.params } : {},
  };
}

export function patchAgentToolAction(
  action: AgentToolAction,
  patch: Partial<AgentGenerationParams>,
): AgentToolAction {
  return {
    type: action.type,
    params: { ...action.params, ...patch },
  };
}

function firstOptionValue(options: Array<{ value: string }>, fallback: string): string {
  return options[0]?.value ?? fallback;
}

export function resolveImageActionParams(
  model: string,
  current: AgentGenerationParams = {},
): AgentGenerationParams {
  const capabilities = getImageModelCapabilities(model);
  const aspectRatio = current.aspectRatio && capabilities.aspectRatios.some(option => option.value === current.aspectRatio)
    ? current.aspectRatio
    : firstOptionValue(capabilities.aspectRatios, "1:1");
  const resolutionOptions = getImageResolutionOptions(model, aspectRatio);
  const resolutionSource = resolutionOptions.length > 0 ? resolutionOptions : capabilities.resolutions;
  const imageResolution = current.imageResolution && resolutionSource.some(option => option.value === current.imageResolution)
    ? current.imageResolution
    : firstOptionValue(resolutionSource, "1K");
  const imageQuality = resolveImageModelQuality(model, current.imageQuality) ?? capabilities.qualities[0]?.value;
  const thinkingLevel = current.thinkingLevel && capabilities.thinkingLevels.some(option => option.value === current.thinkingLevel)
    ? current.thinkingLevel
    : capabilities.thinkingLevels[0]?.value;

  return { ...current, model, aspectRatio, imageResolution, imageQuality, thinkingLevel };
}

export function resolveVideoActionParams(
  model: string,
  current: AgentGenerationParams = {},
): AgentGenerationParams {
  const capabilities = getVideoModelCapabilities(model);
  const aspectRatio = current.aspectRatio && capabilities.sizes.some(option => option.value === current.aspectRatio)
    ? current.aspectRatio
    : firstOptionValue(capabilities.sizes, "auto");
  const videoResolution = current.videoResolution && capabilities.resolutions.some(option => option.value === current.videoResolution)
    ? current.videoResolution
    : capabilities.resolutions[0]?.value;
  const videoDuration = current.videoDuration && capabilities.durations.some(option => option.value === current.videoDuration)
    ? current.videoDuration
    : capabilities.durations[0]?.value;
  const videoPreset = current.videoPreset && capabilities.presets.some(option => option.value === current.videoPreset)
    ? current.videoPreset
    : capabilities.presets[0]?.value;
  const videoReferenceMode = current.videoReferenceMode && capabilities.referenceModes.includes(current.videoReferenceMode)
    ? current.videoReferenceMode
    : capabilities.referenceMode === "none"
      ? undefined
      : capabilities.referenceMode;

  return { ...current, model, aspectRatio, videoResolution, videoDuration, videoPreset, videoReferenceMode };
}

export function resolveAudioActionParams(
  model: string,
  current: AgentGenerationParams = {},
): AgentGenerationParams {
  const capabilities = getAudioModelCapabilities(model);
  const audioMode = current.audioMode && capabilities.modes.includes(current.audioMode)
    ? current.audioMode
    : capabilities.defaultMode;
  const audioFormat = current.audioFormat && capabilities.formats.some(option => option.value === current.audioFormat)
    ? current.audioFormat
    : firstOptionValue(capabilities.formats, "wav");

  return { ...current, model, audioFormat, audioMode };
}

function isImageActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_image" || type === "create_board_image_flow";
}

function isVideoActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_video" || type === "create_board_video_flow";
}

function isAudioActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_audio" || type === "create_board_audio_flow";
}

function isKnownAudioModel(model: string): boolean {
  return getModelCapabilities("audio").some(capability => capability.value === model);
}

export function prepareAgentActionDraft(action: AgentToolAction): AgentToolAction {
  const draft = cloneAgentToolAction(action);
  const params = draft.params ?? {};
  if (draft.type === "edit_image") {
    return {
      type: draft.type,
      params: {
        prompt: params.prompt,
        referenceImageId: params.referenceImageId,
      },
    };
  }
  if (draft.type === "update_board_node") {
    return {
      type: draft.type,
      params: {
        nodeId: params.nodeId,
        prompt: params.prompt,
        body: params.body,
        instruction: params.instruction,
        model: params.model,
        aspectRatio: params.aspectRatio,
        imageResolution: params.imageResolution,
        imageQuality: params.imageQuality,
        thinkingLevel: params.thinkingLevel,
        videoResolution: params.videoResolution,
        videoDuration: params.videoDuration,
        videoPreset: params.videoPreset,
        videoReferenceMode: params.videoReferenceMode,
        audioFormat: params.audioFormat,
        audioMode: params.audioMode,
        audioStylePrompt: params.audioStylePrompt,
        asrLanguage: params.asrLanguage,
        voiceCloneConsentAccepted: params.voiceCloneConsentAccepted,
        voiceProfileId: params.voiceProfileId,
      },
    };
  }
  if (draft.type === "apply_board_patch") {
    return {
      type: draft.type,
      params: {
        boardPatch: params.boardPatch,
      },
    };
  }
  if (draft.type === "continue_image_to_video") {
    return {
      type: draft.type,
      params: {
        nodeId: params.nodeId,
        prompt: params.prompt,
        model: params.model,
        aspectRatio: params.aspectRatio,
        videoResolution: params.videoResolution,
        videoDuration: params.videoDuration,
        videoPreset: params.videoPreset,
        videoReferenceMode: params.videoReferenceMode,
        run: params.run,
      },
    };
  }
  if (isImageActionType(draft.type) && params.model) {
    return patchAgentToolAction(draft, resolveImageActionParams(params.model, params));
  }
  if (isVideoActionType(draft.type) && params.model) {
    return patchAgentToolAction(draft, resolveVideoActionParams(params.model, params));
  }
  if (isAudioActionType(draft.type) && params.model) {
    return patchAgentToolAction(draft, resolveAudioActionParams(params.model, params));
  }
  return draft;
}

export function isCustomImageResolutionValue(imageResolution: string | undefined): boolean {
  if (!imageResolution) return false;
  if (imageResolution === "custom") return true;
  return /^\d+x\d+$/.test(imageResolution);
}

export interface ValidateAgentToolActionContext {
  hasEditReference?: boolean;
  references?: ReadonlyArray<MediaReference>;
}

export function validateAgentToolAction(
  action: AgentToolAction,
  context: ValidateAgentToolActionContext = {},
): string | null {
  const params = action.params ?? {};

  if (action.type === "optimize_prompt") {
    return params.prompt?.trim() ? null : t("common.notices.promptOptimizationFailed");
  }

  if (action.type === "edit_image") {
    if (!params.prompt?.trim()) return t("common.notices.promptOptimizationFailed");
    if (!context.hasEditReference) {
      return t("common.notices.agentReferenceReadFailed");
    }
    return null;
  }

  if (action.type === "generate_audio" || action.type === "create_board_audio_flow") {
    if (!params.model?.trim()) return t("common.notices.audioGenNeedModel");
    if (!isKnownAudioModel(params.model)) return t("common.notices.audioGenNeedModel");
    const capabilities = getAudioModelCapabilities(params.model);
    const audioMode = params.audioMode && capabilities.modes.includes(params.audioMode)
      ? params.audioMode
      : capabilities.defaultMode;
    if (audioOperationRequiresTextInput(audioMode) && !params.prompt?.trim()) return "请先填写提示词";
    if (audioMode === "voice_clone" && params.voiceCloneConsentAccepted !== true) return t("common.notices.voiceCloneNeedsConsent");
    const references = context.references ?? [];
    const unsupportedReference = references.find(reference => !capabilities.referenceMediaTypes.includes(getMediaReferenceType(reference)));
    if (unsupportedReference) return `当前音频模型不支持${mediaReferenceLabel(getMediaReferenceType(unsupportedReference))}参考`;
    if (references.length < capabilities.minReferenceMedia) return audioOperationMissingReferenceMessage(capabilities);
    if (references.length > capabilities.maxReferenceMedia) return `当前音频模型最多支持 ${capabilities.maxReferenceMedia} 个参考媒体`;
    return null;
  }

  if (
    action.type === "generate_image" ||
    action.type === "generate_video" ||
    action.type === "create_board_image_flow" ||
    action.type === "create_board_video_flow"
  ) {
    if (!params.prompt?.trim()) return "请先填写提示词";
    if (!params.model?.trim()) return "请先选择生成模型";
    return null;
  }

  if (action.type === "create_board_note") {
    return params.body?.trim() || params.prompt?.trim() ? null : "请先填写笔记内容";
  }

  if (action.type === "apply_board_patch") {
    const operationCount = params.boardPatch?.operations.length ?? 0;
    if (operationCount === 0) return "请先提供画板补丁操作";
    if (operationCount > AGENT_BOARD_PATCH_MAX_OPERATIONS) {
      return `画板补丁最多支持 ${AGENT_BOARD_PATCH_MAX_OPERATIONS} 个操作`;
    }
    return null;
  }

  if (action.type === "continue_image_to_video") {
    if (!params.prompt?.trim()) return "请先填写视频提示词";
    if (!params.model?.trim()) return "请先选择视频模型";
    return null;
  }

  if (action.type === "update_board_node") {
    return params.prompt?.trim() ||
      params.body?.trim() ||
      params.instruction?.trim() ||
      params.model?.trim() ||
      params.aspectRatio?.trim() ||
      params.imageResolution?.trim() ||
      params.imageQuality?.trim() ||
      params.thinkingLevel?.trim() ||
      params.videoResolution?.trim() ||
      params.videoDuration?.trim() ||
      params.videoPreset?.trim() ||
      params.videoReferenceMode ||
      params.audioFormat?.trim() ||
      params.audioMode ||
      params.audioStylePrompt?.trim() ||
      params.asrLanguage ||
      typeof params.voiceCloneConsentAccepted === "boolean" ||
      params.voiceProfileId?.trim()
      ? null
      : "请先填写要更新的节点内容";
  }

  return null;
}
