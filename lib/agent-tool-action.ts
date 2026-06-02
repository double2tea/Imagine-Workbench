import type { AgentToolAction } from "@/components/agent/AgentDock";
import {
  getImageModelCapabilities,
  getImageResolutionOptions,
  getVideoModelCapabilities,
} from "@/lib/providers/model-catalog";

export interface AgentGenerationParams {
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  referenceImageId?: string;
  imageResolution?: string;
  imageQuality?: string;
  thinkingLevel?: string;
  videoResolution?: string;
  videoDuration?: string;
  videoPreset?: string;
  title?: string;
  body?: string;
  run?: boolean;
}

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
  const imageQuality = current.imageQuality && capabilities.qualities.some(option => option.value === current.imageQuality)
    ? current.imageQuality
    : capabilities.qualities[0]?.value;
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

  return { ...current, model, aspectRatio, videoResolution, videoDuration, videoPreset };
}

function isImageActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_image" || type === "create_board_image_flow";
}

function isVideoActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_video" || type === "create_board_video_flow";
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
  if (isImageActionType(draft.type) && params.model) {
    return patchAgentToolAction(draft, resolveImageActionParams(params.model, params));
  }
  if (isVideoActionType(draft.type) && params.model) {
    return patchAgentToolAction(draft, resolveVideoActionParams(params.model, params));
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
}

export function validateAgentToolAction(
  action: AgentToolAction,
  context: ValidateAgentToolActionContext = {},
): string | null {
  const params = action.params ?? {};

  if (action.type === "optimize_prompt") {
    return params.prompt?.trim() ? null : "请先填写提示词";
  }

  if (action.type === "edit_image") {
    if (!params.prompt?.trim()) return "请先填写编辑提示词";
    if (!context.hasEditReference) {
      return "请先提供编辑参考图（@ 引用画廊资产或上传到 Agent）";
    }
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

  return null;
}
