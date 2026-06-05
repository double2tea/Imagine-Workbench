"use client";
import ModelPriceBadge from "@/components/creation/ModelPriceBadge";

import type { ReactNode } from "react";
import {
  Crosshair,
  Loader2,
  Maximize2,
  Paintbrush,
  Play,
  Send,
  Settings,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { StorageItem } from "@/lib/db";
import {
  getImageAspectRatioFromResolution,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getModelCapability,
  getVideoModelCapabilities,
} from "@/lib/providers/model-catalog";
import { includeCurrentModelOption, type BoardModelOptionGroup } from "@/lib/board/model-options";
import { getBoardNodePortDefinition } from "@/lib/board/ports";
import type {
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

interface BoardInspectorProps {
  edge: BoardEdge | undefined;
  imageModelGroups: BoardModelOptionGroup[];
  incomingCount: number;
  items: StorageItem[];
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
  onUpdateRunningHubApp: (nodeId: string, input: BoardRunningHubAppNodeUpdate) => void;
}

const DEFAULT_CUSTOM_IMAGE_RESOLUTION = "2560x1440";
const variantCountOptions: BoardGenerateVariantCount[] = [1, 2, 4];
const inputClass = "imagine-board-input h-9 w-full !rounded-lg px-2 text-xs outline-none focus:border-[var(--iw-board-accent-amber)]";
const monoInputClass = `${inputClass} font-mono`;
const secondaryButtonClass = "imagine-secondary-action flex h-8 items-center justify-center !rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]";
const infoChipClass = "imagine-meta-chip rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-[10px] font-mono text-[var(--iw-muted)]";

const edgeKindLabels: Record<BoardEdge["kind"], string> = {
  "agent-context": "Agent 上下文",
  prompt: "提示",
  reference: "参考",
  result: "结果",
};

const nodeKindLabels: Record<BoardNode["kind"], string> = {
  agent: "Agent",
  asset: "资产",
  "image-generate": "图片生成",
  note: "备注",
  prompt: "Prompt",
  "reference-group": "参考组",
  "runninghub-app": "RunningHub 应用",
  "video-generate": "视频生成",
};

const videoReferenceModeLabels: Record<BoardVideoReferenceMode, string> = {
  reference: "全能参考",
  firstLast: "首尾帧 / 关键帧",
};

function isGenerateNode(node: BoardNode | undefined): node is BoardGenerateNode {
  return node?.kind === "image-generate" || node?.kind === "video-generate";
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
    return `${node.model} / ${resolution} / x${node.variantCount}`;
  }
  return `${node.model} / ${node.aspectRatio}${node.videoDuration ? ` / ${node.videoDuration}s` : ""} / x${node.variantCount}`;
}

function modelSupportsReferences(node: BoardGenerateNode): boolean {
  try {
    return getModelCapability(node.model, node.kind === "image-generate" ? "image" : "video").supportsReferences;
  } catch {
    return false;
  }
}

function firstOption(options: Array<{ value: string }>, fallback: string): string {
  return options[0]?.value ?? fallback;
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

function ModelSelect({
  groups,
  value,
  onChange,
}: {
  groups: BoardModelOptionGroup[];
  value: string;
  onChange: (value: string) => void;
}) {
  const modelGroups = includeCurrentModelOption(groups, value);
  return (
    <select value={value} onChange={event => onChange(event.target.value)} className={inputClass}>
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
      <p className={infoChipClass}>类型 · {edgeKindLabels[edge.kind]}</p>
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
      <button
        type="button"
        onClick={() => onDeleteEdge(edge.id)}
        className="imagine-danger-action flex h-9 w-full items-center justify-center gap-2 !rounded-lg border border-red-400/30 bg-red-500/10 text-xs font-semibold text-red-200 transition hover:bg-red-500/15"
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
  node,
  onExecuteGenerate,
  onFocusNode,
  onUpdateGenerate,
}: {
  imageModelGroups: BoardModelOptionGroup[];
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
  const isProcessing = node.status === "processing";

  const advancedFields = (
    <div className="imagine-panel-disclosure-body">
      <InspectorField title="模型">
        <ModelSelect groups={imageModelGroups} value={node.model} onChange={model => onUpdateGenerate(node.id, imageModelPatch(model, node))} />
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
          className={`imagine-secondary-action h-8 !rounded-lg border px-3 text-xs ${node.imageResolution === "custom" ? "border-blue-400/30 bg-blue-500/15 text-blue-100" : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"}`}
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
      <InspectorField title="变体">
        <VariantCountSelect value={node.variantCount} onChange={variantCount => onUpdateGenerate(node.id, { variantCount })} />
      </InspectorField>
      <p className={infoChipClass}>参考图：{supportsReferences ? "支持" : "不支持"}</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className={infoChipClass}>{generateParamSummary(node)}</p>
      <p className="text-[10px] leading-5 text-[var(--iw-faint)]">主执行在画布节点；此处可细调模型参数。</p>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
      <details className="imagine-panel-disclosure" open>
        <summary className="imagine-panel-disclosure-summary">高级参数</summary>
        {advancedFields}
      </details>
      <button type="button" onClick={() => onExecuteGenerate(node.id)} disabled={isProcessing} className={`imagine-primary-action flex !h-9 min-h-0 w-full items-center justify-center gap-2 !rounded-lg text-xs font-semibold transition ${isProcessing ? "bg-[var(--iw-panel-soft)] text-[var(--iw-faint)]" : "bg-blue-600 text-white hover:bg-blue-500"}`}>
        {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        执行图片节点
          {!isProcessing && <ModelPriceBadge provider={node.model.split(":")[0]} modelId={node.model} resolution={node.imageResolution === "custom" ? node.customImageResolution : node.imageResolution} />}
      </button>
    </div>
  );
}

function VideoGenerateInspector({
  node,
  onExecuteGenerate,
  onFocusNode,
  onUpdateGenerate,
  videoModelGroups,
}: {
  node: BoardVideoGenerateNode;
  onExecuteGenerate: (nodeId: string) => void;
  onFocusNode: (nodeId: string) => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  videoModelGroups: BoardModelOptionGroup[];
}) {
  const capabilities = getVideoModelCapabilities(node.model);
  const supportsReferences = modelSupportsReferences(node);
  const isProcessing = node.status === "processing";
  const defaultReferenceMode: BoardVideoReferenceMode | undefined =
    capabilities.referenceMode === "reference" || capabilities.referenceMode === "firstLast"
      ? capabilities.referenceMode
      : undefined;
  const activeReferenceMode = node.videoReferenceMode ?? defaultReferenceMode;
  const referenceModeOptions = capabilities.referenceModes.filter(isBoardVideoReferenceMode);

  const advancedFields = (
    <div className="imagine-panel-disclosure-body">
      <InspectorField title="模型">
        <ModelSelect groups={videoModelGroups} value={node.model} onChange={model => onUpdateGenerate(node.id, videoModelPatch(model, node))} />
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
      <p className={infoChipClass}>{generateParamSummary(node)}</p>
      <p className="text-[10px] leading-5 text-[var(--iw-faint)]">主执行在画布节点；此处可细调模型参数。</p>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
      <details className="imagine-panel-disclosure" open>
        <summary className="imagine-panel-disclosure-summary">高级参数</summary>
        {advancedFields}
      </details>
      <button type="button" onClick={() => onExecuteGenerate(node.id)} disabled={isProcessing} className={`imagine-primary-action flex !h-9 min-h-0 w-full items-center justify-center gap-2 !rounded-lg text-xs font-semibold transition ${isProcessing ? "bg-[var(--iw-panel-soft)] text-[var(--iw-faint)]" : "bg-blue-600 text-white hover:bg-blue-500"}`}>
        {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        执行视频节点
          {!isProcessing && <ModelPriceBadge provider={node.model.split(":")[0]} modelId={node.model} duration={node.videoDuration} />}
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
  return (
    <div className="space-y-3">
      <p className={infoChipClass}>
        {node.targetType === "workflow" ? "Workflow" : "AI App"} / {node.outputType === "video" ? "视频" : "图片"} / {node.bindings.length} 参数
      </p>
      <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
      <details className="imagine-panel-disclosure" open>
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
              <select value={node.outputType} onChange={event => onUpdateRunningHubApp(node.id, { outputType: event.target.value === "video" ? "video" : "image" })} className={inputClass}>
                <option value="image">图片</option>
                <option value="video">视频</option>
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
      <button type="button" onClick={() => onExecuteGenerate(node.id)} disabled={isProcessing} className={`imagine-primary-action flex !h-9 min-h-0 w-full items-center justify-center gap-2 !rounded-lg text-xs font-semibold transition ${isProcessing ? "bg-[var(--iw-panel-soft)] text-[var(--iw-faint)]" : "bg-emerald-600 text-white hover:bg-emerald-500"}`}>
        {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        执行 RunningHub 应用
      </button>
    </div>
  );
}

export default function BoardInspector({
  edge,
  imageModelGroups,
  incomingCount,
  items,
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
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[var(--iw-muted)]">
            <div className="imagine-meta-chip rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5">输入 {incomingCount}</div>
            <div className="imagine-meta-chip rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5">输出 {outgoingCount}</div>
          </div>
          {node.kind === "asset" && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => onOpenFullscreen(items.find(item => item.id === node.asset.assetId) ?? null)} className={secondaryButtonClass} title="全屏">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                {node.asset.type === "image" && onEditAssetImage ? (
                  <button type="button" onClick={onEditAssetImage} className={secondaryButtonClass} title="编辑图片">
                    <Paintbrush className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className={`${secondaryButtonClass} cursor-not-allowed opacity-40`} title="仅图片可编辑">
                    <Paintbrush className="h-3.5 w-3.5" />
                  </span>
                )}
                <button type="button" onClick={onSendAssetToAgent} className={secondaryButtonClass} title="发送到 Agent">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              {node.asset.type === "image" && onCompareAsset ? (
                <button type="button" onClick={onCompareAsset} className={`${secondaryButtonClass} w-full gap-2 text-xs font-semibold`}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  对比参考
                </button>
              ) : null}
              <button type="button" onClick={onSyncAssetReference} className={`${secondaryButtonClass} w-full text-xs font-semibold`}>
                同步到传统参考槽
              </button>
              <InspectorFocusButton nodeId={node.id} onFocusNode={onFocusNode} />
            </div>
          )}
          {node.kind === "prompt" && <PromptNodeSummary node={node} onFocusNode={onFocusNode} />}
          {node.kind === "agent" && <AgentNodeSummary node={node} onFocusNode={onFocusNode} />}
          {node.kind === "note" && <NoteNodeSummary node={node} onFocusNode={onFocusNode} />}
          {node.kind === "reference-group" && <ReferenceGroupSummary node={node} onFocusNode={onFocusNode} />}
          {node.kind === "image-generate" && (
            <ImageGenerateInspector imageModelGroups={imageModelGroups} node={node} onExecuteGenerate={onExecuteGenerate} onFocusNode={onFocusNode} onUpdateGenerate={onUpdateGenerate} />
          )}
          {node.kind === "video-generate" && (
            <VideoGenerateInspector node={node} onExecuteGenerate={onExecuteGenerate} onFocusNode={onFocusNode} onUpdateGenerate={onUpdateGenerate} videoModelGroups={videoModelGroups} />
          )}
          {node.kind === "runninghub-app" && (
            <RunningHubAppInspector node={node} onExecuteGenerate={onExecuteGenerate} onFocusNode={onFocusNode} onUpdateRunningHubApp={onUpdateRunningHubApp} />
          )}
          {isExecutableNode(node) && node.status === "failed" && node.errorMessage && (
            <p className="rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-200">{node.errorMessage}</p>
          )}
        </div>
      ) : (
        <p className="text-xs leading-5 text-[var(--iw-faint)]">点击画布节点或连线；双击空白处可快速插入。切换到「本地资产」可拖入画布。</p>
      )}
    </div>
  );
}
