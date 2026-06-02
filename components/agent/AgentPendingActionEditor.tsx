"use client";

import { useMemo } from "react";
import type { AgentToolAction } from "@/components/agent/AgentDock";
import {
  patchAgentToolAction,
  resolveImageActionParams,
  resolveVideoActionParams,
} from "@/lib/agent-tool-action";
import {
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
  disabled?: boolean;
  imageModelGroups: AgentModelGroup[];
  videoModelGroups: AgentModelGroup[];
  onChange: (action: AgentToolAction) => void;
}

function isImageActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_image" || type === "edit_image" || type === "create_board_image_flow";
}

function isVideoActionType(type: AgentToolAction["type"]): boolean {
  return type === "generate_video" || type === "create_board_video_flow";
}

function firstOptionValue(options: Array<{ value: string }>, fallback: string): string {
  return options[0]?.value ?? fallback;
}

export function AgentPendingActionEditor({
  action,
  disabled = false,
  imageModelGroups,
  videoModelGroups,
  onChange,
}: AgentPendingActionEditorProps) {
  const params = action.params ?? {};
  const isEditImage = action.type === "edit_image";
  const isImage = isImageActionType(action.type) && !isEditImage;
  const isVideo = isVideoActionType(action.type);
  const isNote = action.type === "create_board_note";
  const showPrompt = action.type !== "none" && !isNote;
  const showNoteFields = isNote;

  const imageModel = params.model ?? "";
  const videoModel = params.model ?? "";

  const imageCapabilities = useMemo(
    () => (isImage && imageModel ? getImageModelCapabilities(imageModel) : null),
    [imageModel, isImage],
  );
  const imageResolutionOptions = useMemo(() => {
    if (!imageCapabilities || !imageModel) return [];
    const aspectRatio = params.aspectRatio ?? firstOptionValue(imageCapabilities.aspectRatios, "1:1");
    const fromAspect = getImageResolutionOptions(imageModel, aspectRatio);
    return fromAspect.length > 0 ? fromAspect : imageCapabilities.resolutions;
  }, [imageCapabilities, imageModel, params.aspectRatio]);

  const videoCapabilities = useMemo(
    () => (isVideo && videoModel ? getVideoModelCapabilities(videoModel) : null),
    [isVideo, videoModel],
  );

  const modelGroups = useMemo(
    () => (isImage ? imageModelGroups : isVideo ? videoModelGroups : []),
    [imageModelGroups, isImage, isVideo, videoModelGroups],
  );
  const activeModel = isImage ? imageModel : isVideo ? videoModel : "";
  const flatModelOptions = useMemo(
    () => modelGroups.flatMap(group => group.options),
    [modelGroups],
  );
  const modelMissingFromList = Boolean(activeModel) && !flatModelOptions.some(option => option.value === activeModel);

  const updateParams = (patch: NonNullable<AgentToolAction["params"]>) => {
    onChange(patchAgentToolAction(action, patch));
  };

  const handleModelChange = (model: string) => {
    if (isImage) {
      onChange(patchAgentToolAction(action, resolveImageActionParams(model, params)));
      return;
    }
    if (isVideo) {
      onChange(patchAgentToolAction(action, resolveVideoActionParams(model, params)));
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
    const imageResolution = params.imageResolution && resolutionSource.some(option => option.value === params.imageResolution)
      ? params.imageResolution
      : firstOptionValue(resolutionSource, "1K");
    updateParams({ aspectRatio, imageResolution });
  };

  return (
    <div className="imagine-agent-action-form">
      {showPrompt && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">提示词</span>
          <textarea
            value={params.prompt ?? ""}
            disabled={disabled}
            rows={3}
            onChange={event => updateParams({ prompt: event.target.value })}
            className="imagine-agent-action-textarea"
            placeholder="执行前可修改 Agent 规划的提示词"
          />
        </label>
      )}

      {showNoteFields && (
        <>
          <label className="imagine-agent-action-field">
            <span className="imagine-agent-action-field-label">标题</span>
            <input
              type="text"
              value={params.title ?? ""}
              disabled={disabled}
              onChange={event => updateParams({ title: event.target.value })}
              className="imagine-agent-action-input"
            />
          </label>
          <label className="imagine-agent-action-field">
            <span className="imagine-agent-action-field-label">笔记内容</span>
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

      {(isImage || isVideo) && modelGroups.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">生成模型</span>
          <select
            value={activeModel}
            disabled={disabled}
            onChange={event => handleModelChange(event.target.value)}
            className="imagine-agent-model-select w-full"
          >
            {!activeModel ? <option value="">选择模型</option> : null}
            {modelMissingFromList ? (
              <option value={activeModel}>{activeModel}（未在列表）</option>
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

      {isImage && imageCapabilities && imageCapabilities.aspectRatios.length > 0 && (
        <label className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">画面比例</span>
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
          <span className="imagine-agent-action-field-label">分辨率</span>
          <select
            value={params.imageResolution ?? imageResolutionOptions[0]?.value ?? "1K"}
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
          <span className="imagine-agent-action-field-label">质量</span>
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
          <span className="imagine-agent-action-field-label">思考级别</span>
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
          <span className="imagine-agent-action-field-label">画面尺寸</span>
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
          <span className="imagine-agent-action-field-label">分辨率</span>
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
          <span className="imagine-agent-action-field-label">时长</span>
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
          <span className="imagine-agent-action-field-label">预设</span>
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
    </div>
  );
}