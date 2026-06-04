"use client";

import { useMemo } from "react";
import type { AgentBoardPatchOperation, AgentGenerationParams, AgentToolAction } from "@/lib/agent-actions";
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
  return type === "generate_video" || type === "create_board_video_flow" || type === "continue_image_to_video";
}

function firstOptionValue(options: Array<{ value: string }>, fallback: string): string {
  return options[0]?.value ?? fallback;
}

function describePatchOperation(operation: AgentBoardPatchOperation): string {
  if (operation.op === "create_node") return `创建 ${operation.kind}: ${operation.title ?? operation.tempId}`;
  if (operation.op === "update_node") return `更新节点: ${operation.nodeId}`;
  return `连接: ${operation.from.nodeId}.${operation.from.portId} -> ${operation.to.nodeId}.${operation.to.portId}`;
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
  const isBoardNodeUpdate = action.type === "update_board_node";
  const isBoardPatch = action.type === "apply_board_patch";
  const showPrompt = action.type !== "none" && !isNote && !isBoardNodeUpdate && !isBoardPatch;
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

      {isBoardNodeUpdate && (
        <>
          <label className="imagine-agent-action-field">
            <span className="imagine-agent-action-field-label">目标节点 ID</span>
            <input
              type="text"
              value={params.nodeId ?? ""}
              disabled={disabled}
              onChange={event => updateParams({ nodeId: event.target.value })}
              className="imagine-agent-action-input"
              placeholder="留空则使用当前选中节点"
            />
          </label>
          <label className="imagine-agent-action-field">
            <span className="imagine-agent-action-field-label">提示词 / Agent 指令 / 笔记内容</span>
            <textarea
              value={params.prompt ?? params.instruction ?? params.body ?? ""}
              disabled={disabled}
              rows={3}
              onChange={event => updateParams({ prompt: event.target.value, instruction: event.target.value, body: event.target.value })}
              className="imagine-agent-action-textarea"
              placeholder="执行前可修改要写入节点的内容"
            />
          </label>
        </>
      )}

      {isBoardPatch && params.boardPatch && (
        <div className="imagine-agent-action-field">
          <span className="imagine-agent-action-field-label">画板补丁</span>
          <input
            type="text"
            value={params.boardPatch.title ?? ""}
            disabled={disabled}
            onChange={event => updateBoardPatchParams({ title: event.target.value })}
            className="imagine-agent-action-input"
            placeholder="补丁标题"
          />
          <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--iw-muted)]">
            <input
              type="checkbox"
              checked={params.boardPatch.run === true}
              disabled={disabled}
              onChange={event => updateBoardPatchParams({ run: event.target.checked })}
            />
            执行后立即运行生成节点
          </label>
          {params.boardPatch.shots?.length ? (
            <div className="mt-2 space-y-1 text-[11px] text-[var(--iw-muted)]">
              {params.boardPatch.shots.slice(0, 6).map((shot, index) => (
                <p key={`${shot.id ?? "shot"}-${index}`}>
                  {shot.scene ?? "Scene"} / {shot.shot ?? `Shot ${index + 1}`}: {shot.beat ?? shot.imagePrompt ?? "未填写 beat"}
                </p>
              ))}
            </div>
          ) : null}
          <div className="mt-2 space-y-2">
            {params.boardPatch.operations.map((operation, index) => {
              const editable = editablePatchField(operation);
              return (
                <div key={`${operation.op}-${index}`} className="rounded-md border border-white/10 p-2">
                  <p className="text-[11px] font-medium text-[var(--iw-text)]">{index + 1}. {describePatchOperation(operation)}</p>
                  {editable ? (
                    <textarea
                      value={editable.value}
                      disabled={disabled}
                      rows={2}
                      onChange={event => updatePatchOperation(index, { [editable.field]: event.target.value } as Partial<AgentBoardPatchOperation>)}
                      className="imagine-agent-action-textarea mt-2"
                      placeholder="执行前可修改文本内容"
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
          <span className="imagine-agent-action-field-label">生成模型</span>
          <select
            value={activeModel}
            disabled={disabled}
            onChange={event => handleModelChange(event.target.value)}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            className="imagine-agent-model-select pointer-events-auto w-full"
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
