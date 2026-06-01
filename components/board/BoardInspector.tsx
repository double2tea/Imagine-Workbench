"use client";

import type { ReactNode } from "react";
import { Maximize2, Paintbrush, Play, Send, Settings } from "lucide-react";
import type { StorageItem } from "@/lib/db";
import {
  getImageAspectRatioFromResolution,
  getImageModelCapabilities,
  getImageResolutionOptions,
  getModelCapability,
  getVideoModelCapabilities,
  type AiProvider,
  type ModelOption,
} from "@/lib/providers/model-catalog";
import type {
  BoardGenerateNode,
  BoardGenerateNodeUpdate,
  BoardImageGenerateNode,
  BoardNode,
  BoardVideoGenerateNode,
} from "@/lib/board";

interface ProviderModelGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

interface BoardInspectorProps {
  imageModelGroups: ProviderModelGroup[];
  incomingCount: number;
  items: StorageItem[];
  node: BoardNode | undefined;
  outgoingCount: number;
  videoModelGroups: ProviderModelGroup[];
  onExecuteGenerate: (nodeId: string) => void;
  onOpenFullscreen: (item: StorageItem | null) => void;
  onOpenMask: (imageUrl: string, assetId: string) => void;
  onOpenSettings: () => void;
  onSendAssetToAgent: () => void;
  onSyncAssetReference: () => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
}

const DEFAULT_CUSTOM_IMAGE_RESOLUTION = "2560x1440";

function isGenerateNode(node: BoardNode | undefined): node is BoardGenerateNode {
  return node?.kind === "image-generate" || node?.kind === "video-generate";
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
  groups: ProviderModelGroup[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={event => onChange(event.target.value)} className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-slate-600">
      {groups.map(group => (
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
      <span className="mb-1 block text-[11px] font-semibold text-slate-500">{title}</span>
      {children}
    </label>
  );
}

function ImageGenerateInspector({
  imageModelGroups,
  node,
  onExecuteGenerate,
  onUpdateGenerate,
}: {
  imageModelGroups: ProviderModelGroup[];
  node: BoardImageGenerateNode;
  onExecuteGenerate: (nodeId: string) => void;
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

  return (
    <div className="space-y-3">
      <InspectorField title="模型">
        <ModelSelect groups={imageModelGroups} value={node.model} onChange={model => onUpdateGenerate(node.id, imageModelPatch(model, node))} />
      </InspectorField>
      {node.model.startsWith("runninghub:") && (
        <InspectorField title="RunningHub 模型 ID">
          <input
            value={node.model}
            onChange={event => onUpdateGenerate(node.id, imageModelPatch(event.target.value, node))}
            className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 font-mono text-xs text-slate-100 outline-none focus:border-slate-600"
          />
        </InspectorField>
      )}
      <div className="grid grid-cols-2 gap-2">
        <InspectorField title="比例">
          <select
            value={node.imageResolution === "custom" ? "custom" : node.aspectRatio}
            onChange={event => onUpdateGenerate(node.id, imageAspectPatch(node.model, event.target.value, node))}
            disabled={node.imageResolution === "custom"}
            className={`h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 text-xs outline-none focus:border-slate-600 ${
              node.imageResolution === "custom" ? "cursor-not-allowed text-slate-500 opacity-70" : "text-slate-100"
            }`}
          >
            {node.imageResolution === "custom" && <option value="custom">自定义尺寸决定比例</option>}
            {capabilities.aspectRatios.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </InspectorField>
        <InspectorField title="分辨率">
          <select value={presetResolutionOptions.some(option => option.value === node.imageResolution) ? node.imageResolution : ""} onChange={event => onUpdateGenerate(node.id, { imageResolution: event.target.value })} className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-slate-600">
            {!presetResolutionOptions.some(option => option.value === node.imageResolution) && <option value="">自定义尺寸</option>}
            {presetResolutionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </InspectorField>
      </div>
      {supportsCustomImageSize && (
        <button
          type="button"
          onClick={() => onUpdateGenerate(node.id, { imageResolution: "custom" })}
          className={`h-8 rounded-md border px-3 text-xs ${node.imageResolution === "custom" ? "border-blue-400/30 bg-blue-500/15 text-blue-100" : "border-slate-800 bg-slate-900 text-slate-400"}`}
        >
          自定义尺寸
        </button>
      )}
      {node.imageResolution === "custom" && (
        <InspectorField title="自定义尺寸">
          <input
            value={node.customImageResolution}
            onChange={event => onUpdateGenerate(node.id, { customImageResolution: event.target.value })}
            className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 font-mono text-xs text-slate-100 outline-none focus:border-slate-600"
          />
        </InspectorField>
      )}
      {(capabilities.qualities.length > 0 || capabilities.thinkingLevels.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {capabilities.qualities.length > 0 && (
            <InspectorField title="质量">
              <select value={node.imageQuality ?? ""} onChange={event => onUpdateGenerate(node.id, { imageQuality: event.target.value })} className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-slate-600">
                {capabilities.qualities.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
          {capabilities.thinkingLevels.length > 0 && (
            <InspectorField title="Thinking">
              <select value={node.thinkingLevel ?? ""} onChange={event => onUpdateGenerate(node.id, { thinkingLevel: event.target.value })} className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-slate-600">
                {capabilities.thinkingLevels.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
        </div>
      )}
      <p className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-500">
        参考图：{supportsReferences ? "支持" : "不支持"}
      </p>
      <button type="button" onClick={() => onExecuteGenerate(node.id)} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-xs font-semibold text-white transition hover:bg-blue-500">
        <Play className="h-3.5 w-3.5" />
        执行图片节点
      </button>
    </div>
  );
}

function VideoGenerateInspector({
  node,
  onExecuteGenerate,
  onUpdateGenerate,
  videoModelGroups,
}: {
  node: BoardVideoGenerateNode;
  onExecuteGenerate: (nodeId: string) => void;
  onUpdateGenerate: (nodeId: string, input: BoardGenerateNodeUpdate) => void;
  videoModelGroups: ProviderModelGroup[];
}) {
  const capabilities = getVideoModelCapabilities(node.model);
  const supportsReferences = modelSupportsReferences(node);

  return (
    <div className="space-y-3">
      <InspectorField title="模型">
        <ModelSelect groups={videoModelGroups} value={node.model} onChange={model => onUpdateGenerate(node.id, videoModelPatch(model, node))} />
      </InspectorField>
      {node.model.startsWith("runninghub:") && (
        <InspectorField title="RunningHub 模型 ID">
          <input
            value={node.model}
            onChange={event => onUpdateGenerate(node.id, videoModelPatch(event.target.value, node))}
            className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 font-mono text-xs text-slate-100 outline-none focus:border-slate-600"
          />
        </InspectorField>
      )}
      <InspectorField title="画幅 / 尺寸">
        <select value={node.aspectRatio} onChange={event => onUpdateGenerate(node.id, { aspectRatio: event.target.value })} className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-slate-600">
          {capabilities.sizes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </InspectorField>
      {(capabilities.durations.length > 0 || capabilities.resolutions.length > 0 || capabilities.presets.length > 0) && (
        <div className="grid grid-cols-3 gap-2">
          {capabilities.durations.length > 0 && (
            <InspectorField title="时长">
              <select value={node.videoDuration ?? ""} onChange={event => onUpdateGenerate(node.id, { videoDuration: event.target.value })} className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-slate-600">
                {capabilities.durations.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
          {capabilities.resolutions.length > 0 && (
            <InspectorField title="清晰度">
              <select value={node.videoResolution ?? ""} onChange={event => onUpdateGenerate(node.id, { videoResolution: event.target.value })} className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-slate-600">
                {capabilities.resolutions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
          {capabilities.presets.length > 0 && (
            <InspectorField title="预设">
              <select value={node.videoPreset ?? ""} onChange={event => onUpdateGenerate(node.id, { videoPreset: event.target.value })} className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-2 text-xs text-slate-100 outline-none focus:border-slate-600">
                {capabilities.presets.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </InspectorField>
          )}
        </div>
      )}
      <p className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-500">
        参考图：{supportsReferences ? `${capabilities.referenceMode} / ${capabilities.maxReferenceImages}` : "不支持"}
      </p>
      <button type="button" onClick={() => onExecuteGenerate(node.id)} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-xs font-semibold text-white transition hover:bg-blue-500">
        <Play className="h-3.5 w-3.5" />
        执行视频节点
      </button>
    </div>
  );
}

export default function BoardInspector({
  imageModelGroups,
  incomingCount,
  items,
  node,
  outgoingCount,
  videoModelGroups,
  onExecuteGenerate,
  onOpenFullscreen,
  onOpenMask,
  onOpenSettings,
  onSendAssetToAgent,
  onSyncAssetReference,
  onUpdateGenerate,
}: BoardInspectorProps) {
  return (
    <div className="imagine-control-surface border-b border-slate-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-200">检查器</h2>
        <button type="button" onClick={onOpenSettings} className="text-slate-500 hover:text-slate-200" title="设置">
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
      {node ? (
        <div className="space-y-3">
          <div>
            <p className="truncate text-sm font-semibold text-slate-100">{node.title}</p>
            <p className="font-mono text-[10px] text-slate-500">{node.kind}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
            <div className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5">输入 {incomingCount}</div>
            <div className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5">输出 {outgoingCount}</div>
          </div>
          {node.kind === "asset" && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => onOpenFullscreen(items.find(item => item.id === node.asset.assetId) ?? null)} className="flex h-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onOpenMask(node.asset.url, node.asset.assetId)} className="flex h-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300">
                  <Paintbrush className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={onSendAssetToAgent} className="flex h-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300">
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              <button type="button" onClick={onSyncAssetReference} className="h-8 w-full rounded-lg border border-slate-800 bg-slate-900 text-[11px] font-semibold text-slate-300">
                同步到传统参考槽
              </button>
            </div>
          )}
          {node.kind === "image-generate" && (
            <ImageGenerateInspector imageModelGroups={imageModelGroups} node={node} onExecuteGenerate={onExecuteGenerate} onUpdateGenerate={onUpdateGenerate} />
          )}
          {node.kind === "video-generate" && (
            <VideoGenerateInspector node={node} onExecuteGenerate={onExecuteGenerate} onUpdateGenerate={onUpdateGenerate} videoModelGroups={videoModelGroups} />
          )}
          {isGenerateNode(node) && node.status === "failed" && node.errorMessage && (
            <p className="rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200">{node.errorMessage}</p>
          )}
        </div>
      ) : (
        <p className="text-[11px] leading-5 text-slate-500">选择节点或连线后查看连接状态；生成与 Agent 动作优先在节点内执行。</p>
      )}
    </div>
  );
}
