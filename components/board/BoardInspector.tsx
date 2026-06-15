"use client";
import VoiceProfilePreviewPlayer from "@/components/audio/VoiceProfilePreviewPlayer";
import CapabilityParameterControls from "@/components/creation/CapabilityParameterControls";
import ModelPriceBadge from "@/components/creation/ModelPriceBadge";
import type { BoardGenerateInputSummary } from "@/components/board/GenerateBoardNode";

import { useEffect, useState, type ReactNode } from "react";
import {
  Crosshair,
  Loader2,
  Play,
  Send,
  Settings,
  Trash2,
} from "lucide-react";
import {
  WORKBENCH_OPERATION_META,
  WorkbenchOperationIcon,
} from "@/components/workbench/OperationControls";
import { getAssetMetasByIds, hydrateAssets, type StorageItem } from "@/lib/db";
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
  getImageAspectRatioFromResolution,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getModelCapability,
  getVideoModelCapabilities,
  imageParameterValuesFromLegacy,
  imageParameterValuesToRunningHubYouchuan,
} from "@/lib/providers/model-catalog";
import { buildGenerationModelPriceOptions } from "@/lib/providers/pricing";
import { includeCurrentModelOption, type BoardModelOptionGroup } from "@/lib/board/model-options";
import type { MediaReferenceType } from "@/lib/media-references";
import { getBoardNodePortDefinition } from "@/lib/board/ports";
import type {
  BoardAudioOperationNode,
  BoardEdge,
  BoardGenerateNode,
  BoardGenerateNodeUpdate,
  BoardGenerateVariantCount,
  BoardImageGenerateNode,
  BoardNode,
  BoardPortRef,
  BoardRunningHubAppNode,
  BoardRunningHubAppNodeUpdate,
  BoardVideoReferenceMode,
  BoardVideoGenerateNode,
} from "@/lib/board";
import { selectVideoReferenceTypesForMode } from "@/lib/video-reference-selection";
import { hasActiveCinematicProfile } from "@/lib/cinematic-controls";
import { VOICE_PROFILES_CHANGED_EVENT, getVisibleVoiceProfilesForAudioModel, isBuiltInVoiceProfileId, listVoiceProfiles, type VoiceProfile } from "@/lib/voice-profiles";

const CINEMATIC_PROFILE_SUMMARY_LABEL = "电影风格";

interface BoardInspectorProps {
  audioModelGroups: BoardModelOptionGroup[];
  edge: BoardEdge | undefined;
  imageModelGroups: BoardModelOptionGroup[];
  incomingCount: number;
  items: StorageItem[];
  generateInputSummary?: BoardGenerateInputSummary;
  node: BoardNode | undefined;
  nodes: BoardNode[];
  outgoingCount: number;
  selectedNodeCount: number;
  videoModelGroups: BoardModelOptionGroup[];
  onCompareAsset?: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onEditAssetImage?: () => void;
  onExecuteGenerate: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onOpenFullscreen: (item: StorageItem | null) => void;
  onOpenSettings: () => void;
  onSendAssetToAgent: () => void;
  onSyncAssetReference: () => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  onUpdateNodeTitle: (nodeId: string, title: string) => void;
  onUpdateRunningHubApp: (nodeId: string, input: BoardRunningHubAppNodeUpdate) => void;
}

const DEFAULT_CUSTOM_IMAGE_RESOLUTION = "2560x1440";
const variantCountOptions: BoardGenerateVariantCount[] = [1, 2, 4];
const inputClass = "imagine-board-input h-9 w-full !rounded-lg px-2 text-xs outline-none focus:border-[var(--iw-board-accent-amber)]";
const monoInputClass = `${inputClass} font-mono`;
const secondaryButtonClass = "imagine-secondary-action flex h-8 items-center justify-center !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]";
const infoChipClass = "imagine-meta-chip rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-[10px] font-mono text-[var(--iw-muted)]";
const inspectorSectionClass = "board-inspector-section rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]/70 p-2";
const inspectorSummaryClass = "board-inspector-summary rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel)]/80 p-2";

const edgeKindLabels: Record<BoardEdge["kind"], string> = {
  "agent-context": "Agent 上下文",
  prompt: "提示",
  reference: "参考",
  result: "结果",
};

const nodeKindLabels: Record<BoardNode["kind"], string> = {
  agent: "Agent",
  asset: "资产",
  group: "组",
  "multi-grid": "多宫格",
  "audio-operation": "音频操作",
  "image-generate": "图片生成",
  note: "备注",
  prompt: "Prompt",
  "reference-group": "参考组",
  result: "生成结果",
  "runninghub-app": "RunningHub 应用",
  "video-generate": "视频生成",
};

const videoReferenceModeLabels: Record<BoardVideoReferenceMode, string> = {
  reference: "全能参考",
  firstLast: "首尾帧 / 关键帧",
};

function isGenerateNode(node: BoardNode | undefined): node is BoardGenerateNode {
  return node?.kind === "image-generate" || node?.kind === "video-generate" || node?.kind === "audio-operation";
}

function isExecutableNode(node: BoardNode | undefined): node is BoardGenerateNode | BoardRunningHubAppNode {
  return isGenerateNode(node) || node?.kind === "runninghub-app";
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

function describePortEndpoint(nodes: BoardNode[], ref: BoardPortRef): string {
  const boardNode = nodes.find(entry => entry.id === ref.nodeId);
  const port = boardNode ? getBoardNodePortDefinition(boardNode, ref.portId) : undefined;
  const nodeLabel = boardNode?.title ?? ref.nodeId.slice(0, 8);
  const portLabel = port?.label ?? ref.portId;
  return `${nodeLabel} · ${portLabel}`;
}

function generateParamSummary(node: BoardGenerateNode): string {
  if (node.kind === "image-generate") {
    const resolution = node.imageResolution === "custom" ? node.customImageResolution : node.imageResolution;
    return `${node.model} / ${resolution}${hasActiveCinematicProfile(node.cinematicProfile, "image") ? ` / ${CINEMATIC_PROFILE_SUMMARY_LABEL}` : ""} / x${node.variantCount}`;
  }
  if (node.kind === "video-generate") {
    return `${node.model} / ${node.aspectRatio}${node.videoDuration ? ` / ${node.videoDuration}s` : ""}${hasActiveCinematicProfile(node.cinematicProfile, "video") ? ` / ${CINEMATIC_PROFILE_SUMMARY_LABEL}` : ""} / x${node.variantCount}`;
  }
  return [
    node.model,
    node.audioMode,
    audioOperationFormatOptions(getAudioModelCapabilities(node.model)).length > 0 ? node.audioFormat : "",
    `x${node.variantCount}`,
  ].filter(value => value.trim().length > 0).join(" / ");
}

function modelSupportsReferences(node: BoardGenerateNode): boolean {
  try {
    const kind = node.kind === "image-generate" ? "image" : node.kind === "video-generate" ? "video" : "audio";
    return getModelCapability(node.model, kind).supportsReferences;
  } catch {
    return false;
  }
}

function firstOption(options: Array<{ value: string }>, fallback: string): string {
  return options[0]?.value ?? fallback;
}

function getInputReferenceTypes(inputSummary?: BoardGenerateInputSummary): MediaReferenceType[] {
  const types: MediaReferenceType[] = [];
  inputSummary?.referencePreviews.forEach(reference => {
    if (reference.type && !types.includes(reference.type)) types.push(reference.type);
  });
  return types;
}

function getModelReferenceTypes(kind: "image" | "video" | "audio", model: string): MediaReferenceType[] {
  try {
    if (kind === "image") return getImageModelCapabilities(model).referenceMediaTypes;
    if (kind === "video") return getVideoModelCapabilities(model).referenceMediaTypes;
    return getAudioModelCapabilities(model).referenceMediaTypes;
  } catch {
    return [];
  }
}

function filterModelGroupsForReferenceTypes(
  groups: BoardModelOptionGroup[],
  kind: "image" | "video" | "audio",
  referenceTypes: MediaReferenceType[],
): BoardModelOptionGroup[] {
  if (referenceTypes.length === 0) return groups;
  return groups
    .map(group => ({
      ...group,
      options: group.options.filter(option => {
        const acceptedTypes = getModelReferenceTypes(kind, option.value);
        return referenceTypes.every(type => acceptedTypes.includes(type));
      }),
    }))
    .filter(group => group.options.length > 0);
}

function hasModelOptionValue(groups: BoardModelOptionGroup[], value: string): boolean {
  return groups.some(group => group.options.some(option => option.value === value));
}

function imageModelPatch(model: string, current: BoardImageGenerateNode): BoardGenerateNodeUpdate {
  const capabilities = getImageModelCapabilities(model);
  const aspectRatio = capabilities.aspectRatios.some(option => option.value === current.aspectRatio)
    ? current.aspectRatio
    : firstOption(capabilities.aspectRatios, "1:1");
  const resolutionOptions = getImageResolutionOptions(model, aspectRatio);
  const resolutionSource = resolutionOptions.length > 0 ? resolutionOptions : capabilities.resolutions;
  return {
    aspectRatio,
    customImageResolution: current.customImageResolution || DEFAULT_CUSTOM_IMAGE_RESOLUTION,
    imageQuality: capabilities.qualities.some(option => option.value === current.imageQuality)
      ? current.imageQuality
      : capabilities.qualities[0]?.value,
    imageResolution: resolutionSource.some(option => option.value === current.imageResolution)
      ? current.imageResolution
      : firstOption(resolutionSource, "1K"),
    model,
    runningHubYouchuan: imageParameterValuesToRunningHubYouchuan(
      model,
      imageParameterValuesFromLegacy(model, { runningHubYouchuan: current.runningHubYouchuan }),
    ),
    thinkingLevel: capabilities.thinkingLevels.some(option => option.value === current.thinkingLevel)
      ? current.thinkingLevel
      : capabilities.thinkingLevels[0]?.value,
  };
}

function imageAspectPatch(model: string, aspectRatio: string, current: BoardImageGenerateNode): BoardGenerateNodeUpdate {
  const resolutionOptions = getImageResolutionOptions(model, aspectRatio);
  return {
    aspectRatio,
    imageResolution: resolutionOptions.some(option => option.value === current.imageResolution)
      ? current.imageResolution
      : firstOption(resolutionOptions, current.imageResolution),
  };
}

function videoModelPatch(model: string, current: BoardVideoGenerateNode): BoardGenerateNodeUpdate {
  const capabilities = getVideoModelCapabilities(model);
  const currentReferenceMode = current.videoReferenceMode;
  return {
    aspectRatio: capabilities.sizes.some(option => option.value === current.aspectRatio)
      ? current.aspectRatio
      : firstOption(capabilities.sizes, "auto"),
    model,
    videoDuration: capabilities.durations.some(option => option.value === current.videoDuration)
      ? current.videoDuration
      : capabilities.durations[0]?.value,
    videoPreset: capabilities.presets.some(option => option.value === current.videoPreset)
      ? current.videoPreset
      : capabilities.presets[0]?.value,
    videoReferenceMode: currentReferenceMode && capabilities.referenceModes.includes(currentReferenceMode)
      ? currentReferenceMode
      : capabilities.referenceMode === "none"
        ? undefined
        : capabilities.referenceMode,
    videoResolution: capabilities.resolutions.some(option => option.value === current.videoResolution)
      ? current.videoResolution
      : capabilities.resolutions[0]?.value,
  };
}

function audioModelPatch(model: string, current: BoardAudioOperationNode): BoardGenerateNodeUpdate {
  const capabilities = getAudioModelCapabilities(model);
  const formatOptions = audioOperationFormatOptions(capabilities);
  return {
    audioFormat: formatOptions.some(option => option.value === current.audioFormat)
      ? current.audioFormat
      : formatOptions.length > 0
        ? firstOption(formatOptions, "wav")
        : "",
    audioMode: capabilities.modes.includes(current.audioMode)
      ? current.audioMode
      : capabilities.defaultMode,
    model,
  };
}

function audioFunctionPatch(model: string, audioMode: BoardAudioOperationNode["audioMode"], current: BoardAudioOperationNode): BoardGenerateNodeUpdate {
  const basePatch = audioModelPatch(model, current);
  return {
    ...basePatch,
    audioMode,
    ...(audioMode !== "voice_clone" ? { voiceCloneConsentAccepted: false } : {}),
    ...(audioMode !== "tts" && audioMode !== "voice_design" && audioMode !== "voice_clone" ? { voiceProfileId: undefined } : {}),
  };
}

function ModelSelect({
  allowUnknownCurrent = true,
  groups,
  placeholder = "选择可用模型",
  value,
  onChange,
}: {
  allowUnknownCurrent?: boolean;
  groups: BoardModelOptionGroup[];
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const modelGroups = allowUnknownCurrent ? includeCurrentModelOption(groups, value) : groups;
  const hasSelectedValue = hasModelOptionValue(modelGroups, value);
  const isEmpty = modelGroups.length === 0;
  return (
    <select
      value={hasSelectedValue ? value : ""}
      onChange={event => onChange(event.target.value)}
      disabled={isEmpty}
      className={`${inputClass} ${isEmpty ? "cursor-not-allowed opacity-70" : ""}`}
    >
      {!hasSelectedValue && <option value="" disabled>{placeholder}</option>}
      {modelGroups.map(group => (
        <optgroup key={group.provider} label={group.label}>
          {group.options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function InspectorField({ children, title }: { children: ReactNode; title: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-[var(--iw-faint)]">{title}</span>
      {children}
    </label>
  );
}

function parseVariantCount(value: string): BoardGenerateVariantCount {
  if (value === "1") return 1;
  if (value === "2") return 2;
  if (value === "4") return 4;
  throw new Error(`Unsupported variant count: ${value}`);
}

function isBoardVideoReferenceMode(value: string): value is BoardVideoReferenceMode {
  return value === "reference" || value === "firstLast";
}

function VariantCountSelect({
  value,
  onChange,
}: {
  value: BoardGenerateVariantCount;
  onChange: (value: BoardGenerateVariantCount) => void;
}) {
  return (
    <select value={value} onChange={event => onChange(parseVariantCount(event.target.value))} className={inputClass}>
      {variantCountOptions.map(option => <option key={option} value={option}>{option} 个变体</option>)}
    </select>
  );
}

function InspectorFocusButton({ nodeId, onFocusNode }: { nodeId: string; onFocusNode: (nodeId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onFocusNode(nodeId)}
      className={`${secondaryButtonClass} w-full gap-2 text-xs font-semibold`}
    >
      <Crosshair className="h-3.5 w-3.5" />
      定位到画布
    </button>
  );
}

function InspectorSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className={inspectorSectionClass}>
      <h3 className="mb-2 text-[10px] font-semibold uppercase text-[var(--iw-faint)]">{title}</h3>
      {children}
    </section>
  );
}

function EdgeInspector({
  edge,
  nodes,
  onDeleteEdge,
}: {
  edge: BoardEdge;
  nodes: BoardNode[];
  onDeleteEdge: (edgeId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className={inspectorSummaryClass}>
        <p className={infoChipClass}>类型 · {edgeKindLabels[edge.kind]}</p>
      </div>
      <InspectorSection title="端点">
        <div className="space-y-2 text-[11px] leading-5 text-[var(--iw-muted)]">
        <p>
          <span className="font-semibold text-[var(--iw-faint)]">从 </span>
          {describePortEndpoint(nodes, edge.from)}
        </p>
        <p>
          <span className="font-semibold text-[var(--iw-faint)]">到 </span>
          {describePortEndpoint(nodes, edge.to)}
        </p>
      </div>
      </InspectorSection>
      <button
        type="button"
        onClick={() => onDeleteEdge(edge.id)}
        className="imagine-danger-action flex h-9 w-full items-center justify-center gap-2 !rounded-lg text-xs font-semibold transition"
      >
        <Trash2 className="h-3.5 w-3.5" />
        删除连线
      </button>
    </div>
  );
}

function PromptNodeSummary({ node, onFocusNode }: { node: BoardNode & { kind: "prompt" }; onFocusNode: (nodeId: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 py-2 text-[11px] leading-5 text-[var(--iw-muted)]">
        {truncateText(node.prompt, 240) || "（空提示词）"}
      </p>
      <p className="text-[10px] leading-5 text-[var(--iw-faint)]">在画布节点内编辑；支持 @ 引用与 / 模板。</p>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
    </div>
  );
}

function AgentNodeSummary({ node, onFocusNode }: { node: BoardNode & { kind: "agent" }; onFocusNode: (nodeId: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 py-2 text-[11px] leading-5 text-[var(--iw-muted)]">
        {truncateText(node.instruction, 240) || "（空任务）"}
      </p>
      <p className="text-[10px] leading-5 text-[var(--iw-faint)]">在画布节点内编辑并发送；可连接图片作为上下文。</p>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
    </div>
  );
}

function NoteNodeSummary({ node, onFocusNode }: { node: BoardNode & { kind: "note" }; onFocusNode: (nodeId: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 py-2 text-[11px] leading-5 text-[var(--iw-muted)]">
        {truncateText(node.body, 320) || "（空备注）"}
      </p>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
    </div>
  );
}

function ReferenceGroupSummary({ node, onFocusNode }: { node: BoardNode & { kind: "reference-group" }; onFocusNode: (nodeId: string) => void }) {
  return (
    <div className="space-y-2">
      <p className={infoChipClass}>{node.references.length} 个参考媒体 · 在画布内调整顺序与角色</p>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
    </div>
  );
}

function ImageGenerateInspector({
  imageModelGroups,
  inputSummary,
  node,
  onExecuteGenerate,
  onFocusNode,
  onUpdateGenerate,
}: {
  imageModelGroups: BoardModelOptionGroup[];
  inputSummary?: BoardGenerateInputSummary;
  node: BoardImageGenerateNode;
  onExecuteGenerate: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
}) {
  const capabilities = getImageModelCapabilities(node.model);
  const customAspectRatio = node.imageResolution === "custom"
    ? getImageAspectRatioFromResolution(node.customImageResolution.trim())
    : null;
  const resolutionOptions = getImageResolutionOptions(node.model, customAspectRatio ?? node.aspectRatio);
  const activeResolutionOptions = resolutionOptions.length > 0 ? resolutionOptions : capabilities.resolutions;
  const presetResolutionOptions = activeResolutionOptions.filter(option => option.value !== "custom");
  const supportsCustomImageSize = activeResolutionOptions.some(option => option.value === "custom");
  const supportsReferences = modelSupportsReferences(node);
  const requiredReferenceTypes = getInputReferenceTypes(inputSummary);
  const selectableImageModelGroups = filterModelGroupsForReferenceTypes(imageModelGroups, "image", requiredReferenceTypes);
  const isProcessing = node.status === "processing";
  const parameterValues = imageParameterValuesFromLegacy(node.model, { runningHubYouchuan: node.runningHubYouchuan });

  const advancedFields = (
    <div className="imagine-panel-disclosure-body">
      <InspectorField title="模型">
        <ModelSelect
          allowUnknownCurrent={requiredReferenceTypes.length === 0}
          groups={selectableImageModelGroups}
          value={node.model}
          onChange={model => onUpdateGenerate(node.id, imageModelPatch(model, node))}
        />
      </InspectorField>
      {node.model.startsWith("runninghub:") && (
        <InspectorField title="RunningHub 模型 ID">
          <input
            value={node.model}
            onChange={event => onUpdateGenerate(node.id, imageModelPatch(event.target.value, node))}
            className={monoInputClass}
          />
        </InspectorField>
      )}
      <div className="grid grid-cols-2 gap-2">
        <InspectorField title="比例">
          <select
            value={node.imageResolution === "custom" ? "custom" : node.aspectRatio}
            onChange={event => onUpdateGenerate(node.id, imageAspectPatch(node.model, event.target.value, node))}
            disabled={node.imageResolution === "custom"}
            className={`${inputClass} ${node.imageResolution === "custom" ? "cursor-not-allowed opacity-70" : ""}`}
          >
            {node.imageResolution === "custom" && <option value="custom">自定义尺寸决定比例</option>}
            {capabilities.aspectRatios.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </InspectorField>
        <InspectorField title="分辨率">
          <select value={presetResolutionOptions.some(option => option.value === node.imageResolution) ? node.imageResolution : ""} onChange={event => onUpdateGenerate(node.id, { imageResolution: event.target.value })} className={inputClass}>
            {!presetResolutionOptions.some(option => option.value === node.imageResolution) && <option value="">自定义尺寸</option>}
            {presetResolutionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </InspectorField>
      </div>
      {supportsCustomImageSize && (
        <button
          type="button"
          onClick={() => onUpdateGenerate(node.id, { imageResolution: "custom" })}
          className={`h-8 !rounded-lg border px-3 text-xs ${
            node.imageResolution === "custom"
              ? "imagine-tone-chip"
              : "imagine-secondary-action border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"
          }`}
          data-tone="accent"
        >
          自定义尺寸
        </button>
      )}
      {node.imageResolution === "custom" && (
        <InspectorField title="自定义尺寸">
          <input
            value={node.customImageResolution}
            onChange={event => onUpdateGenerate(node.id, { customImageResolution: event.target.value })}
            className={monoInputClass}
          />
        </InspectorField>
      )}
      {(capabilities.qualities.length > 0 || capabilities.thinkingLevels.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {capabilities.qualities.length > 0 && (
            <InspectorField title="质量">
              <select value={node.imageQuality ?? ""} onChange={event => onUpdateGenerate(node.id, { imageQuality: event.target.value })} className={inputClass}>
                {capabilities.qualities.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
          {capabilities.thinkingLevels.length > 0 && (
            <InspectorField title="Thinking">
              <select value={node.thinkingLevel ?? ""} onChange={event => onUpdateGenerate(node.id, { thinkingLevel: event.target.value })} className={inputClass}>
                {capabilities.thinkingLevels.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
        </div>
      )}
      <CapabilityParameterControls
        compact
        descriptors={capabilities.parameterDescriptors}
        value={parameterValues}
        onChange={nextValues => {
          const nextYouchuan = imageParameterValuesToRunningHubYouchuan(node.model, nextValues);
          if (nextYouchuan) onUpdateGenerate(node.id, { runningHubYouchuan: nextYouchuan });
        }}
      />
      <InspectorField title="变体">
        <VariantCountSelect value={node.variantCount} onChange={variantCount => onUpdateGenerate(node.id, { variantCount })} />
      </InspectorField>
      <p className={infoChipClass}>参考图：{supportsReferences ? "支持" : "不支持"}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className={inspectorSummaryClass}>
        <p className={infoChipClass}>{generateParamSummary(node)}</p>
        <p className="mt-1 text-[10px] leading-5 text-[var(--iw-faint)]">执行入口在画布节点；参数收纳在下方。</p>
      </div>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
      <details className="imagine-panel-disclosure">
        <summary className="imagine-panel-disclosure-summary">高级参数</summary>
        {advancedFields}
      </details>
      <button type="button" onClick={() => onExecuteGenerate(node.id)} disabled={isProcessing} data-tone="accent" className="imagine-primary-action flex !h-9 min-h-0 w-full items-center justify-center gap-2 !rounded-lg text-xs font-semibold text-white transition">
        {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        执行图片节点
        {!isProcessing && (
          <ModelPriceBadge
            provider={node.model.split(":")[0]}
            modelId={node.model}
            options={buildGenerationModelPriceOptions({
              kind: "image",
              imageQuality: node.imageQuality,
              resolution: node.imageResolution === "custom" ? node.customImageResolution : node.imageResolution,
              thinkingLevel: node.thinkingLevel,
            })}
          />
        )}
      </button>
    </div>
  );
}

function VideoGenerateInspector({
  inputSummary,
  node,
  onExecuteGenerate,
  onFocusNode,
  onUpdateGenerate,
  videoModelGroups,
}: {
  node: BoardVideoGenerateNode;
  inputSummary?: BoardGenerateInputSummary;
  onExecuteGenerate: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  videoModelGroups: BoardModelOptionGroup[];
}) {
  const capabilities = getVideoModelCapabilities(node.model);
  const supportsReferences = modelSupportsReferences(node);
  const requiredReferenceTypes = getInputReferenceTypes(inputSummary);
  const selectableVideoModelGroups = filterModelGroupsForReferenceTypes(videoModelGroups, "video", requiredReferenceTypes);
  const isProcessing = node.status === "processing";
  const defaultReferenceMode: BoardVideoReferenceMode | undefined =
    capabilities.referenceMode === "reference" || capabilities.referenceMode === "firstLast"
      ? capabilities.referenceMode
      : undefined;
  const activeReferenceMode = node.videoReferenceMode ?? defaultReferenceMode;
  const referenceModeOptions = capabilities.referenceModes.filter(isBoardVideoReferenceMode);
  const priceReferenceTypes = selectVideoReferenceTypesForMode(
    inputSummary?.referencePreviews.map(reference => ({
      id: reference.id,
      role: reference.role === "start" || reference.role === "end" || reference.role === "general" ? reference.role : undefined,
      type: reference.type,
      url: reference.url,
    })) ?? [],
    inputSummary?.referencePreviews[0]?.url ?? null,
    activeReferenceMode ?? "none",
    capabilities.maxReferenceImages,
  );

  const advancedFields = (
    <div className="imagine-panel-disclosure-body">
      <InspectorField title="模型">
        <ModelSelect
          allowUnknownCurrent={requiredReferenceTypes.length === 0}
          groups={selectableVideoModelGroups}
          value={node.model}
          onChange={model => onUpdateGenerate(node.id, videoModelPatch(model, node))}
        />
      </InspectorField>
      {node.model.startsWith("runninghub:") && (
        <InspectorField title="RunningHub 模型 ID">
          <input
            value={node.model}
            onChange={event => onUpdateGenerate(node.id, videoModelPatch(event.target.value, node))}
            className={monoInputClass}
          />
        </InspectorField>
      )}
      <InspectorField title="画幅 / 尺寸">
        <select value={node.aspectRatio} onChange={event => onUpdateGenerate(node.id, { aspectRatio: event.target.value })} className={inputClass}>
          {capabilities.sizes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </InspectorField>
      {(capabilities.durations.length > 0 || capabilities.resolutions.length > 0 || capabilities.presets.length > 0 || referenceModeOptions.length > 1) && (
        <div className="grid grid-cols-2 gap-2">
          {capabilities.durations.length > 0 && (
            <InspectorField title="时长">
              <select value={node.videoDuration ?? ""} onChange={event => onUpdateGenerate(node.id, { videoDuration: event.target.value })} className={inputClass}>
                {capabilities.durations.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
          {capabilities.resolutions.length > 0 && (
            <InspectorField title="清晰度">
              <select value={node.videoResolution ?? ""} onChange={event => onUpdateGenerate(node.id, { videoResolution: event.target.value })} className={inputClass}>
                {capabilities.resolutions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
          {capabilities.presets.length > 0 && (
            <InspectorField title="预设">
              <select value={node.videoPreset ?? ""} onChange={event => onUpdateGenerate(node.id, { videoPreset: event.target.value })} className={inputClass}>
                {capabilities.presets.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
          {referenceModeOptions.length > 1 && activeReferenceMode && (
            <InspectorField title="参考模式">
              <select
                value={activeReferenceMode}
                onChange={event => onUpdateGenerate(node.id, { videoReferenceMode: event.target.value as BoardVideoReferenceMode })}
                className={inputClass}
              >
                {referenceModeOptions.map(option => (
                  <option key={option} value={option}>{videoReferenceModeLabels[option]}</option>
                ))}
              </select>
            </InspectorField>
          )}
        </div>
      )}
      <InspectorField title="变体">
        <VariantCountSelect value={node.variantCount} onChange={variantCount => onUpdateGenerate(node.id, { variantCount })} />
      </InspectorField>
      <p className={infoChipClass}>
        参考图：{supportsReferences && activeReferenceMode ? `${videoReferenceModeLabels[activeReferenceMode]} / ${capabilities.maxReferenceImages}` : "不支持"}
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className={inspectorSummaryClass}>
        <p className={infoChipClass}>{generateParamSummary(node)}</p>
        <p className="mt-1 text-[10px] leading-5 text-[var(--iw-faint)]">执行入口在画布节点；参数收纳在下方。</p>
      </div>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
      <details className="imagine-panel-disclosure">
        <summary className="imagine-panel-disclosure-summary">高级参数</summary>
        {advancedFields}
      </details>
      <button type="button" onClick={() => onExecuteGenerate(node.id)} disabled={isProcessing} data-tone="accent" className="imagine-primary-action flex !h-9 min-h-0 w-full items-center justify-center gap-2 !rounded-lg text-xs font-semibold text-white transition">
        {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        执行视频节点
        {!isProcessing && (
          <ModelPriceBadge
            provider={node.model.split(":")[0]}
            modelId={node.model}
            options={buildGenerationModelPriceOptions({
              kind: "video",
              duration: node.videoDuration,
              referenceTypes: priceReferenceTypes,
              videoReferenceMode: activeReferenceMode,
              videoResolution: node.videoResolution,
            })}
          />
        )}
      </button>
    </div>
  );
}

function AudioOperationInspector({
  audioModelGroups,
  inputSummary,
  node,
  onExecuteGenerate,
  onFocusNode,
  onUpdateGenerate,
}: {
  audioModelGroups: BoardModelOptionGroup[];
  inputSummary?: BoardGenerateInputSummary;
  node: BoardAudioOperationNode;
  onExecuteGenerate: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
}) {
  const capabilities = getAudioModelCapabilities(node.model);
  const formatOptions = audioOperationFormatOptions(capabilities);
  const supportsReferences = modelSupportsReferences(node);
  const requiredReferenceTypes = getInputReferenceTypes(inputSummary);
  const selectableAudioModelGroups = filterModelGroupsForReferenceTypes(audioModelGroups, "audio", requiredReferenceTypes);
  const selectedProvider = audioProviderFromModel(node.model);
  const providerOptions = audioProviderOptions(selectableAudioModelGroups);
  const functionOptions = audioFunctionOptionsForProvider(selectableAudioModelGroups, selectedProvider, getAudioModelCapabilities);
  const selectedFunctionValue = audioFunctionValue(node.model, node.audioMode);
  const isProcessing = node.status === "processing";
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const visibleVoiceProfiles = getVisibleVoiceProfilesForAudioModel(node.model, node.audioMode, voiceProfiles);
  const selectedVoiceProfile = visibleVoiceProfiles.find(profile => profile.id === node.voiceProfileId);
  const selectedCloneVoiceProfile = selectedVoiceProfile?.source === "cloned" ? selectedVoiceProfile : undefined;
  const defaultBuiltInVoiceProfile = visibleVoiceProfiles.find(
    profile => profile.source === "builtin" && profile.providerVoiceId === "mimo_default",
  ) ?? visibleVoiceProfiles.find(profile => profile.source === "builtin");
  const showAudioFormat = formatOptions.length > 0;
  const showVoiceProfile = node.audioMode === "tts" || node.audioMode === "voice_design" || node.audioMode === "voice_clone";
  const stylePromptLabel = node.audioMode === "voice_design" ? "音色描述" : "演绎风格";
  const [voiceProfilePreviewUrl, setVoiceProfilePreviewUrl] = useState("");

  const handleProviderChange = (value: string): void => {
    const provider = providerOptions.find(option => option.value === value)?.value;
    if (!provider) return;
    const firstFunction = audioFunctionOptionsForProvider(selectableAudioModelGroups, provider, getAudioModelCapabilities)[0];
    if (!firstFunction) return;
    onUpdateGenerate(node.id, audioFunctionPatch(firstFunction.model, firstFunction.mode, node));
  };

  const handleFunctionChange = (value: string): void => {
    const parsed = parseAudioFunctionValue(value);
    if (!parsed) return;
    onUpdateGenerate(node.id, audioFunctionPatch(parsed.model, parsed.mode, node));
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

  useEffect(() => {
    if (!showVoiceProfile) {
      if (node.voiceProfileId && isBuiltInVoiceProfileId(node.voiceProfileId)) {
        onUpdateGenerate(node.id, { voiceProfileId: undefined });
      }
      return;
    }
    if (node.voiceProfileId) {
      if (isBuiltInVoiceProfileId(node.voiceProfileId) && !selectedVoiceProfile) {
        onUpdateGenerate(node.id, { voiceProfileId: undefined });
      }
      return;
    }
    if (node.audioMode === "tts" && defaultBuiltInVoiceProfile) {
      onUpdateGenerate(node.id, { voiceProfileId: defaultBuiltInVoiceProfile.id });
    }
  }, [defaultBuiltInVoiceProfile, node.audioMode, node.id, node.voiceProfileId, onUpdateGenerate, selectedVoiceProfile, showVoiceProfile]);

  const advancedFields = (
    <div className="imagine-panel-disclosure-body">
      <InspectorField title="服务商">
        <select value={selectedProvider} onChange={event => handleProviderChange(event.target.value)} className={inputClass}>
          {providerOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </InspectorField>
      <InspectorField title="功能">
        <select
          value={functionOptions.some(option => option.value === selectedFunctionValue) ? selectedFunctionValue : ""}
          onChange={event => handleFunctionChange(event.target.value)}
          className={inputClass}
        >
          {!functionOptions.some(option => option.value === selectedFunctionValue) && <option value="" disabled>当前功能不可用</option>}
          {functionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </InspectorField>
      <div className={`grid gap-2 ${showAudioFormat ? "grid-cols-2" : "grid-cols-1"}`}>
        {showAudioFormat && (
          <InspectorField title="格式">
            <select value={node.audioFormat} onChange={event => onUpdateGenerate(node.id, { audioFormat: event.target.value })} className={inputClass}>
              {formatOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </InspectorField>
        )}
      </div>
      <InspectorField title="变体">
        <VariantCountSelect value={node.variantCount} onChange={variantCount => onUpdateGenerate(node.id, { variantCount })} />
      </InspectorField>
      {(node.audioMode === "voice_design" || node.audioMode === "voice_clone") && (
        <InspectorField title={stylePromptLabel}>
          <input
            value={node.audioStylePrompt ?? ""}
            onChange={event => onUpdateGenerate(node.id, { audioStylePrompt: event.target.value })}
            placeholder={node.audioMode === "voice_design" ? "例如：温暖、年轻、自然叙事感" : "例如：平静讲述、广告旁白、轻松口播"}
            className={inputClass}
          />
        </InspectorField>
      )}
      {node.audioMode === "asr" && (
        <InspectorField title="转写语言">
          <select value={node.asrLanguage ?? "auto"} onChange={event => onUpdateGenerate(node.id, { asrLanguage: event.target.value as "auto" | "zh" | "en" })} className={inputClass}>
            {ASR_LANGUAGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </InspectorField>
      )}
      {showVoiceProfile && (
        <InspectorField title="音色">
          <select
            value={node.voiceProfileId ?? ""}
            onChange={event => onUpdateGenerate(node.id, { voiceProfileId: event.target.value || undefined })}
            className={inputClass}
          >
            <option value="">使用模型默认音色</option>
            {node.voiceProfileId && !visibleVoiceProfiles.some(profile => profile.id === node.voiceProfileId) && (
              <option value={node.voiceProfileId}>当前音色不可用于此模式</option>
            )}
            {visibleVoiceProfiles.map(profile => (
              <option key={profile.id} value={profile.id}>{profile.name}{profile.tags.length > 0 ? ` · ${profile.tags.slice(0, 2).join("/")}` : ""}</option>
            ))}
          </select>
          {selectedCloneVoiceProfile && (
            <div className="mt-2 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2 text-[11px] leading-5 text-[var(--iw-muted)]">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span>参考音频由音色库提供</span>
                <span>{selectedCloneVoiceProfile.referenceAudioAssetIds.length} 个源</span>
              </div>
              {voiceProfilePreviewUrl ? (
                <VoiceProfilePreviewPlayer src={voiceProfilePreviewUrl} />
              ) : (
                <p>源音频不可预览或已缺失</p>
              )}
            </div>
          )}
          {selectedVoiceProfile && (selectedVoiceProfile.description || selectedVoiceProfile.tags.length > 0) && (
            <div className="mt-2 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2 text-[11px] leading-5 text-[var(--iw-muted)]">
              {selectedVoiceProfile.description && <p className="line-clamp-2">{selectedVoiceProfile.description}</p>}
              {selectedVoiceProfile.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedVoiceProfile.tags.map(tag => (
                    <span key={tag} className="rounded border border-[var(--iw-border)] px-1.5 py-0.5 text-[10px]">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </InspectorField>
      )}
      {node.audioMode === "voice_clone" && !selectedCloneVoiceProfile && (
        <label className="flex items-start gap-2 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 py-2 text-[11px] leading-5 text-[var(--iw-muted)]">
          <input
            type="checkbox"
            checked={node.voiceCloneConsentAccepted === true}
            onChange={event => onUpdateGenerate(node.id, { voiceCloneConsentAccepted: event.target.checked })}
            className="mt-1 h-3.5 w-3.5 rounded border-[var(--iw-border)] bg-transparent"
          />
          我确认拥有参考音频的使用权，并允许用于本次音色克隆。
        </label>
      )}
      <p className={infoChipClass}>
        参考媒体：{supportsReferences ? `${capabilities.referenceMediaTypes.join(" / ")} · ${capabilities.maxReferenceMedia}` : "不支持"}
      </p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className={inspectorSummaryClass}>
        <p className={infoChipClass}>{generateParamSummary(node)}</p>
        <p className="mt-1 text-[10px] leading-5 text-[var(--iw-faint)]">执行入口在画布节点；参数收纳在下方。</p>
      </div>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
      <details className="imagine-panel-disclosure">
        <summary className="imagine-panel-disclosure-summary">高级参数</summary>
        {advancedFields}
      </details>
      <button type="button" onClick={() => onExecuteGenerate(node.id)} disabled={isProcessing} data-tone="accent" className="imagine-primary-action flex !h-9 min-h-0 w-full items-center justify-center gap-2 !rounded-lg text-xs font-semibold text-white transition">
        {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        执行音频节点
        {!isProcessing && (
          <ModelPriceBadge
            provider={node.model.split(":")[0]}
            modelId={node.model}
            options={buildGenerationModelPriceOptions({ kind: "audio" })}
          />
        )}
      </button>
    </div>
  );
}

function RunningHubAppInspector({
  node,
  onExecuteGenerate,
  onFocusNode,
  onUpdateRunningHubApp,
}: {
  node: BoardRunningHubAppNode;
  onExecuteGenerate: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onUpdateRunningHubApp: (nodeId: string, input: BoardRunningHubAppNodeUpdate) => void;
}) {
  const isProcessing = node.status === "processing";
  const outputLabel = node.outputType === "audio" ? "音频" : node.outputType === "video" ? "视频" : "图片";
  return (
    <div className="space-y-3">
      <div className={inspectorSummaryClass}>
        <p className={infoChipClass}>
          {node.targetType === "workflow" ? "Workflow" : "AI App"} / {outputLabel} / {node.bindings.length} 参数
        </p>
      </div>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
      <details className="imagine-panel-disclosure">
        <summary className="imagine-panel-disclosure-summary">RunningHub 目标</summary>
        <div className="imagine-panel-disclosure-body">
          <div className="grid grid-cols-2 gap-2">
            <InspectorField title="类型">
              <select value={node.targetType} onChange={event => onUpdateRunningHubApp(node.id, { targetType: event.target.value === "workflow" ? "workflow" : "ai-app" })} className={inputClass}>
                <option value="ai-app">AI App</option>
                <option value="workflow">Workflow</option>
              </select>
            </InspectorField>
            <InspectorField title="输出">
              <select value={node.outputType} onChange={event => onUpdateRunningHubApp(node.id, { outputType: event.target.value === "audio" ? "audio" : event.target.value === "video" ? "video" : "image" })} className={inputClass}>
                <option value="image">图片</option>
                <option value="video">视频</option>
                <option value="audio">音频</option>
              </select>
            </InspectorField>
          </div>
          <InspectorField title={node.targetType === "workflow" ? "workflowId" : "webappId"}>
            <input value={node.targetId} onChange={event => onUpdateRunningHubApp(node.id, { targetId: event.target.value })} className={monoInputClass} />
          </InspectorField>
          <InspectorField title="访问密码">
            <input value={node.accessPassword ?? ""} onChange={event => onUpdateRunningHubApp(node.id, { accessPassword: event.target.value })} className={monoInputClass} />
          </InspectorField>
        </div>
      </details>
      <button type="button" onClick={() => onExecuteGenerate(node.id)} disabled={isProcessing} data-tone="success" className="imagine-primary-action flex !h-9 min-h-0 w-full items-center justify-center gap-2 !rounded-lg text-xs font-semibold text-white transition">
        {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        执行 RunningHub 应用
      </button>
    </div>
  );
}

export default function BoardInspector({
  audioModelGroups,
  edge,
  imageModelGroups,
  incomingCount,
  items,
  generateInputSummary,
  node,
  nodes,
  outgoingCount,
  selectedNodeCount,
  videoModelGroups,
  onCompareAsset,
  onDeleteEdge,
  onEditAssetImage,
  onExecuteGenerate,
  onFocusNode,
  onOpenFullscreen,
  onOpenSettings,
  onSendAssetToAgent,
  onSyncAssetReference,
  onUpdateGenerate,
  onUpdateNodeTitle,
  onUpdateRunningHubApp,
}: BoardInspectorProps) {
  const headerTitle = edge ? "连线" : node?.title ?? "检查器";

  return (
    <div className="imagine-inspector-shell imagine-control-surface !p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--iw-text)]">{headerTitle}</p>
          {edge ? (
            <p className="imagine-status-chip mt-1 inline-block font-mono text-[10px]" data-status="complete">
              {edgeKindLabels[edge.kind]}
            </p>
          ) : node ? (
            <p className="imagine-status-chip mt-1 inline-block font-mono text-[10px]" data-status={isExecutableNode(node) ? node.status : "complete"}>
              {nodeKindLabels[node.kind]}
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-5 text-[var(--iw-muted)]">
              选中节点或连线查看详情；Prompt 与 Agent 在画布节点内编辑。
            </p>
          )}
        </div>
        <button type="button" onClick={onOpenSettings} className="imagine-icon-button flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--iw-border)] text-[var(--iw-faint)] transition" title="设置">
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      {selectedNodeCount > 1 && !edge ? (
        <p className="mb-3 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-[10px] font-mono text-[var(--iw-muted)]">
          已选 {selectedNodeCount} 个节点 · 检查器显示主选中项
        </p>
      ) : null}

      {edge ? (
        <EdgeInspector edge={edge} nodes={nodes} onDeleteEdge={onDeleteEdge} />
      ) : node ? (
        <div className="space-y-3">
          <InspectorSection title="基础">
            <InspectorField title="节点名称">
              <input
                value={node.title}
                onChange={event => onUpdateNodeTitle(node.id, event.target.value)}
                className={inputClass}
              />
            </InspectorField>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono text-[var(--iw-muted)]">
              <div className="imagine-meta-chip rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5">输入 {incomingCount}</div>
              <div className="imagine-meta-chip rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5">输出 {outgoingCount}</div>
            </div>
          </InspectorSection>
          {node.kind === "asset" && (
            <InspectorSection title="媒体动作">
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => onOpenFullscreen(items.find(item => item.id === node.asset.assetId) ?? null)} className={secondaryButtonClass} title={WORKBENCH_OPERATION_META.fullscreen.title}>
                  <WorkbenchOperationIcon operation="fullscreen" />
                </button>
                {node.asset.type === "image" && onEditAssetImage ? (
                  <button type="button" onClick={onEditAssetImage} className={secondaryButtonClass} title={WORKBENCH_OPERATION_META.localEdit.title}>
                    <WorkbenchOperationIcon operation="localEdit" />
                  </button>
                ) : (
                  <span className={`${secondaryButtonClass} cursor-not-allowed opacity-40`} title="仅图片可编辑">
                    <WorkbenchOperationIcon operation="localEdit" />
                  </span>
                )}
                <button type="button" onClick={onSendAssetToAgent} className={secondaryButtonClass} title="发送到 Agent">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              {node.asset.type === "image" && onCompareAsset ? (
                <button type="button" onClick={onCompareAsset} className={`${secondaryButtonClass} w-full gap-2 text-xs font-semibold`}>
                  <WorkbenchOperationIcon operation="compare" />
                  对比参考
                </button>
              ) : null}
              <button type="button" onClick={onSyncAssetReference} className={`${secondaryButtonClass} w-full text-xs font-semibold`}>
                同步到传统参考槽
              </button>
              <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
            </InspectorSection>
          )}
          {node.kind === "prompt" && <PromptNodeSummary node={node} onFocusNode={onFocusNode} />}
          {node.kind === "agent" && <AgentNodeSummary node={node} onFocusNode={onFocusNode} />}
          {node.kind === "note" && <NoteNodeSummary node={node} onFocusNode={onFocusNode} />}
          {node.kind === "reference-group" && <ReferenceGroupSummary node={node} onFocusNode={onFocusNode} />}
          {node.kind === "image-generate" && (
            <ImageGenerateInspector imageModelGroups={imageModelGroups} inputSummary={generateInputSummary} node={node} onExecuteGenerate={onExecuteGenerate} onFocusNode={onFocusNode} onUpdateGenerate={onUpdateGenerate} />
          )}
          {node.kind === "video-generate" && (
            <VideoGenerateInspector inputSummary={generateInputSummary} node={node} onExecuteGenerate={onExecuteGenerate} onFocusNode={onFocusNode} onUpdateGenerate={onUpdateGenerate} videoModelGroups={videoModelGroups} />
          )}
          {node.kind === "audio-operation" && (
            <AudioOperationInspector audioModelGroups={audioModelGroups} inputSummary={generateInputSummary} node={node} onExecuteGenerate={onExecuteGenerate} onFocusNode={onFocusNode} onUpdateGenerate={onUpdateGenerate} />
          )}
          {node.kind === "runninghub-app" && (
            <RunningHubAppInspector node={node} onExecuteGenerate={onExecuteGenerate} onFocusNode={onFocusNode} onUpdateRunningHubApp={onUpdateRunningHubApp} />
          )}
          {isExecutableNode(node) && node.status === "failed" && node.errorMessage && (
            <p className="imagine-tone-surface rounded-md border px-2 py-1.5 text-[10px]" data-tone="danger">{node.errorMessage}</p>
          )}
        </div>
      ) : (
        <p className="text-xs leading-5 text-[var(--iw-faint)]">点击画布节点或连线；双击空白处可快速插入。切换到「本地资产」可拖入画布。</p>
      )}
    </div>
  );
}
