"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileJson,
  Link as LinkIcon,
  Loader2,
  Play,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { memo, useEffect, useState } from "react";
import BoardPromptTextarea from "@/components/board/BoardPromptTextarea";
import { BoardResultStack, type BoardGenerateInputSummary } from "@/components/board/GenerateBoardNode";
import type { StorageItem } from "@/lib/db";
import type {
  BoardAssetType,
  BoardRunningHubAppNode,
  BoardRunningHubAppSchemaResult,
  BoardRunningHubAppNodeUpdate,
  BoardRunningHubBindingOption,
  BoardRunningHubBindingDelivery,
  BoardRunningHubBindingSource,
  BoardRunningHubBindingValueType,
  BoardRunningHubNodeInfoBinding,
  BoardRunningHubOutputType,
  BoardRunningHubTargetType,
} from "@/lib/board";
import {
  analyzeRunningHubBindings,
  createDefaultRunningHubBinding,
  parseRunningHubBindingsFromJsonText,
  readRunningHubTargetIdFromText,
} from "@/lib/board/runninghub-bindings";
import type { BoardPromptReference } from "@/lib/board/prompt-references";

interface RunningHubAppBoardNodeProps {
  hasResultConnection?: boolean;
  inputSummary?: BoardGenerateInputSummary;
  node: BoardRunningHubAppNode;
  onExecute: () => void;
  onFetchAppSchema: (webappId: string) => Promise<BoardRunningHubAppSchemaResult>;
  onMaterializeResult?: (assetId: string) => void;
  onOpenResult?: (item: StorageItem) => void;
  onSaveVoiceProfile?: (item: StorageItem) => void;
  onSelectResult: (assetId: string) => void;
  onSelectReference?: (reference: BoardPromptReference, index: number) => void;
  onUpdate: (input: BoardRunningHubAppNodeUpdate) => void;
  references: BoardPromptReference[];
  resultItems: StorageItem[];
  activeResultAssetId?: string;
}

interface RunningHubSavedTarget {
  accessPassword?: string;
  bindings: BoardRunningHubNodeInfoBinding[];
  id: string;
  label: string;
  outputType: BoardRunningHubOutputType;
  targetId: string;
  targetType: BoardRunningHubTargetType;
  updatedAt: string;
}

const SAVED_TARGETS_STORAGE_KEY = "imagine_runninghub_saved_targets";

const inputClass = "nodrag nowheel h-8 min-w-0 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2 text-[10px] text-[var(--iw-text)] outline-none focus:border-emerald-400/60";
const labelClass = "text-[10px] font-medium text-[var(--iw-faint)]";
const softPanelClass = "min-h-0 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]";
const chipClass = "inline-flex h-6 min-w-0 items-center gap-1 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2 text-[10px] text-[var(--iw-muted)]";
const iconButtonClass = "nodrag flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-muted)] transition hover:border-emerald-400/50 hover:text-emerald-100";

const sourceOptions: Array<{ value: BoardRunningHubBindingSource; label: string }> = [
  { value: "prompt", label: "Prompt" },
  { value: "reference", label: "参考媒体" },
  { value: "literal", label: "固定值" },
  { value: "randomSeed", label: "随机 seed" },
];

const valueTypeOptions: Array<{ value: BoardRunningHubBindingValueType; label: string }> = [
  { value: "text", label: "文本" },
  { value: "number", label: "数字" },
  { value: "boolean", label: "开关" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "raw", label: "Raw" },
];

function readTargetType(value: string): BoardRunningHubTargetType {
  return value === "workflow" ? "workflow" : "ai-app";
}

function readOutputType(value: string): BoardRunningHubOutputType {
  if (value === "audio") return "audio";
  return value === "video" ? "video" : "image";
}

function readSource(value: string): BoardRunningHubBindingSource {
  if (value === "prompt" || value === "reference" || value === "randomSeed") return value;
  return "literal";
}

function readValueType(value: string): BoardRunningHubBindingValueType {
  if (value === "number" || value === "boolean" || value === "image" || value === "video" || value === "audio" || value === "raw") return value;
  return "text";
}

function readDelivery(value: string): BoardRunningHubBindingDelivery {
  if (value === "url" || value === "fileName") return value;
  return "raw";
}

function readReferenceType(value: string): BoardAssetType {
  if (value === "video" || value === "audio") return value;
  return "image";
}

function readReferenceIndexInput(value: string): number | undefined {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readSavedBinding(value: unknown): BoardRunningHubNodeInfoBinding | null {
  if (!isRecord(value)) return null;
  const id = readOptionalString(value.id);
  const nodeId = readOptionalString(value.nodeId);
  const fieldName = readOptionalString(value.fieldName);
  if (!id || !nodeId || !fieldName) return null;
  const rawOptions = Array.isArray(value.options) ? value.options : [];
  const options = rawOptions
    .map((option): BoardRunningHubBindingOption | null => {
      if (!isRecord(option)) return null;
      const optionLabel = readOptionalString(option.label);
      const optionValue = readOptionalString(option.value);
      if (!optionLabel || optionValue === undefined) return null;
      const description = readOptionalString(option.description);
      return description ? { label: optionLabel, value: optionValue, description } : { label: optionLabel, value: optionValue };
    })
    .filter((option): option is BoardRunningHubBindingOption => option !== null);
  return {
    id,
    nodeId,
    fieldName,
    fieldData: readOptionalString(value.fieldData),
    description: readOptionalString(value.description),
    descriptionEn: readOptionalString(value.descriptionEn),
    label: readOptionalString(value.label),
    source: readSource(readOptionalString(value.source) ?? "literal"),
    value: readOptionalString(value.value) ?? "",
    valueType: readOptionalString(value.valueType) ? readValueType(readOptionalString(value.valueType) ?? "text") : undefined,
    options,
    enabled: readOptionalBoolean(value.enabled),
    required: readOptionalBoolean(value.required),
    referenceIndex: readOptionalNumber(value.referenceIndex),
    referenceType: readOptionalString(value.referenceType) ? readReferenceType(readOptionalString(value.referenceType) ?? "image") : undefined,
    deliveryMode: readDelivery(readOptionalString(value.deliveryMode) ?? "raw"),
  };
}

function readSavedTarget(value: unknown): RunningHubSavedTarget | null {
  if (!isRecord(value)) return null;
  const id = readOptionalString(value.id);
  const label = readOptionalString(value.label);
  const targetId = readOptionalString(value.targetId);
  if (!id || !label || !targetId || !Array.isArray(value.bindings)) return null;
  return {
    accessPassword: readOptionalString(value.accessPassword),
    bindings: value.bindings.map(readSavedBinding).filter((binding): binding is BoardRunningHubNodeInfoBinding => binding !== null),
    id,
    label,
    outputType: readOutputType(readOptionalString(value.outputType) ?? "image"),
    targetId,
    targetType: readTargetType(readOptionalString(value.targetType) ?? "ai-app"),
    updatedAt: readOptionalString(value.updatedAt) ?? new Date(0).toISOString(),
  };
}

function readSavedTargets(): RunningHubSavedTarget[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(SAVED_TARGETS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(readSavedTarget).filter((target): target is RunningHubSavedTarget => target !== null);
  } catch {
    return [];
  }
}

function writeSavedTargets(targets: RunningHubSavedTarget[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SAVED_TARGETS_STORAGE_KEY, JSON.stringify(targets));
}

function savedTargetId(targetType: BoardRunningHubTargetType, targetId: string): string {
  return `${targetType}:${targetId.trim()}`;
}

function bindingTitle(binding: BoardRunningHubNodeInfoBinding): string {
  return binding.label?.trim() || binding.description || binding.fieldName || "未命名参数";
}

function targetIdLabel(targetType: BoardRunningHubTargetType): string {
  return targetType === "workflow" ? "workflowId / API JSON" : "应用 URL / webappId";
}

function statusLabel(status: BoardRunningHubAppNode["status"]): string {
  if (status === "processing") return "运行中";
  if (status === "complete") return "已完成";
  if (status === "failed") return "失败";
  return "待运行";
}

function resultStatusLabel(hasResultConnection: boolean, resultCount: number): string {
  if (resultCount > 1) return `${resultCount} 个结果`;
  if (resultCount > 0 && hasResultConnection) return "结果已连接";
  if (resultCount > 0) return "已生成";
  return "未生成";
}

const RunningHubAppBoardNode = memo(function RunningHubAppBoardNode({
  hasResultConnection = false,
  inputSummary,
  node,
  onExecute,
  onFetchAppSchema,
  onMaterializeResult,
  onOpenResult,
  onSaveVoiceProfile,
  onSelectResult,
  onSelectReference,
  onUpdate,
  references,
  resultItems,
  activeResultAssetId,
}: RunningHubAppBoardNodeProps) {
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFetchingSchema, setIsFetchingSchema] = useState(false);
  const [savedTargets, setSavedTargets] = useState<RunningHubSavedTarget[]>([]);
  const promptPreview = inputSummary?.promptPreview ?? null;
  const referenceCount = inputSummary?.referenceCount ?? 0;
  const readiness = analyzeRunningHubBindings(node.bindings, promptPreview ?? node.prompt, referenceCount);
  const hasTarget = node.targetId.trim() !== "";
  const isReady = hasTarget && readiness.missingCount === 0;
  const bindingSummary = node.bindings.length > 0
    ? `${readiness.enabledCount}/${node.bindings.length} 字段`
    : "未读取字段";
  const currentSavedTarget = savedTargets.find(target => target.id === savedTargetId(node.targetType, node.targetId));

  useEffect(() => {
    setSavedTargets(readSavedTargets());
  }, []);

  const updateBinding = (bindingId: string, patch: Partial<BoardRunningHubNodeInfoBinding>): void => {
    onUpdate({
      bindings: node.bindings.map(binding => binding.id === bindingId ? { ...binding, ...patch } : binding),
    });
  };

  const removeBinding = (bindingId: string): void => {
    onUpdate({ bindings: node.bindings.filter(binding => binding.id !== bindingId) });
  };

  const addBinding = (): void => {
    onUpdate({ bindings: [...node.bindings, createDefaultRunningHubBinding()] });
  };

  const persistSavedTargets = (targets: RunningHubSavedTarget[]): void => {
    const next = targets.slice(0, 50);
    setSavedTargets(next);
    writeSavedTargets(next);
  };

  const saveTargetSnapshot = (bindings: BoardRunningHubNodeInfoBinding[], name?: string, targetIdOverride?: string): void => {
    const targetId = (targetIdOverride ?? node.targetId).trim();
    if (!targetId) {
      setImportError("请先填写 RunningHub 应用或 Workflow ID");
      return;
    }
    const id = savedTargetId(node.targetType, targetId);
    const label = name?.trim() || currentSavedTarget?.label || `${node.targetType === "workflow" ? "Workflow" : "AI App"} ${targetId}`;
    const target: RunningHubSavedTarget = {
      accessPassword: node.accessPassword?.trim() || undefined,
      bindings,
      id,
      label,
      outputType: node.outputType,
      targetId,
      targetType: node.targetType,
      updatedAt: new Date().toISOString(),
    };
    persistSavedTargets([target, ...savedTargets.filter(item => item.id !== id)]);
    setImportError(null);
  };

  const saveCurrentTarget = (): void => {
    saveTargetSnapshot(node.bindings);
  };

  const applySavedTarget = (targetId: string): void => {
    const target = savedTargets.find(item => item.id === targetId);
    if (!target) return;
    onUpdate({
      accessPassword: target.accessPassword ?? "",
      bindings: target.bindings,
      outputType: target.outputType,
      targetId: target.targetId,
      targetType: target.targetType,
    });
    setImportError(null);
  };

  const deleteCurrentSavedTarget = (): void => {
    if (!currentSavedTarget) return;
    persistSavedTargets(savedTargets.filter(target => target.id !== currentSavedTarget.id));
  };

  const updateTargetText = (value: string): void => {
    const targetId = readRunningHubTargetIdFromText(value) ?? value;
    onUpdate({ targetId });
  };

  const applyImportedText = (): void => {
    const targetId = readRunningHubTargetIdFromText(importText);
    try {
      const bindings = parseRunningHubBindingsFromJsonText(importText);
      onUpdate({
        ...(targetId ? { targetId, targetType: "ai-app" } : {}),
        bindings,
      });
      setImportText("");
      setImportError(null);
      setIsImportOpen(false);
    } catch (error) {
      if (targetId) {
        onUpdate({ targetId, targetType: "ai-app" });
        setImportText("");
        setImportError(null);
        setIsImportOpen(false);
        return;
      }
      setImportError(error instanceof Error ? error.message : "导入失败");
    }
  };

  const fetchAppSchema = async (): Promise<void> => {
    const webappId = readRunningHubTargetIdFromText(node.targetId);
    if (node.targetType !== "ai-app") {
      setImportError("Workflow 请导入 RunningHub 导出的 API JSON");
      return;
    }
    if (!webappId) {
      setImportError("请先粘贴应用 URL 或 webappId");
      return;
    }
    setIsFetchingSchema(true);
    setImportError(null);
    try {
      const schema = await onFetchAppSchema(webappId);
      onUpdate({ targetId: schema.webappId, bindings: schema.bindings });
      saveTargetSnapshot(schema.bindings, schema.name, schema.webappId);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "字段读取失败");
    } finally {
      setIsFetchingSchema(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_34%)] p-3">
      <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
        <div className="grid grid-cols-[110px_1fr_auto_auto] gap-1.5">
          <select
            value={node.targetType}
            onChange={event => onUpdate({ targetType: readTargetType(event.target.value) })}
            className={inputClass}
          >
            <option value="ai-app">AI App</option>
            <option value="workflow">Workflow</option>
          </select>
          <div className="relative min-w-0">
            <LinkIcon className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-[var(--iw-faint)]" />
            <input
              value={node.targetId}
              onChange={event => updateTargetText(event.target.value)}
              className={`${inputClass} w-full pl-7 font-mono`}
              placeholder={targetIdLabel(node.targetType)}
            />
          </div>
          <button
            type="button"
            onClick={() => setIsImportOpen(value => !value)}
            className={iconButtonClass}
            title="粘贴导入"
          >
            <FileJson className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void fetchAppSchema()}
            disabled={isFetchingSchema || node.targetType !== "ai-app"}
            className="nodrag flex h-8 items-center gap-1.5 rounded-md border border-emerald-400/45 bg-emerald-500/10 px-3 text-[10px] font-semibold text-[var(--iw-text)] transition hover:bg-emerald-500/20 disabled:border-[var(--iw-border)] disabled:text-[var(--iw-faint)]"
            title="从 RunningHub 官方调用示例读取 nodeInfoList"
          >
            {isFetchingSchema ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
            读取字段
          </button>
        </div>
        <button
          type="button"
          onClick={onExecute}
          disabled={node.status === "processing" || !isReady}
          className="nodrag flex h-8 items-center justify-center gap-1 rounded-md bg-emerald-600 px-4 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
        >
          <Play className="h-3.5 w-3.5" />
          运行
        </button>
      </div>

      {(savedTargets.length > 0 || hasTarget) && (
        <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
          <select
            value={currentSavedTarget?.id ?? ""}
            onChange={event => applySavedTarget(event.target.value)}
            disabled={savedTargets.length === 0}
            className={`${inputClass} w-full`}
          >
            <option value="">选择已保存应用</option>
            {savedTargets.map(target => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={saveCurrentTarget}
            disabled={!hasTarget}
            className="nodrag flex h-8 items-center gap-1.5 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] px-2 text-[10px] font-semibold text-[var(--iw-text)] transition hover:border-emerald-400/50 disabled:text-[var(--iw-faint)]"
            title="保存当前 RunningHub 目标"
          >
            <Save className="h-3.5 w-3.5" />
            保存
          </button>
          <button
            type="button"
            onClick={deleteCurrentSavedTarget}
            disabled={!currentSavedTarget}
            className={iconButtonClass}
            title="删除当前保存目标"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[0.92fr_1.08fr] gap-2">
        <section className={`${softPanelClass} flex flex-col gap-2 p-2`}>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={node.outputType}
              onChange={event => onUpdate({ outputType: readOutputType(event.target.value) })}
              className={inputClass}
            >
              <option value="image">图片输出</option>
              <option value="video">视频输出</option>
              <option value="audio">音频输出</option>
            </select>
            <input
              value={node.accessPassword ?? ""}
              onChange={event => onUpdate({ accessPassword: event.target.value })}
              className={`${inputClass} font-mono`}
              placeholder="访问密码（可选）"
            />
          </div>

          <BoardPromptTextarea
            commitId={promptPreview === null ? node.id : undefined}
            value={promptPreview ?? node.prompt}
            onChange={prompt => onUpdate({ prompt })}
            onSelectReference={onSelectReference}
            references={references}
            readOnly={promptPreview !== null}
            className={`nodrag nowheel min-h-[146px] flex-1 resize-none rounded-md imagine-board-input !p-2 text-xs leading-5 outline-none ${
              promptPreview !== null ? "cursor-default opacity-85" : ""
            }`}
            placeholder={promptPreview !== null ? "已连接 Prompt 节点" : "输入 Prompt，字段可绑定到这里"}
          />

          <div className="grid grid-cols-3 gap-1.5">
            <span className={chipClass}>{statusLabel(node.status)}</span>
            <span className={`${chipClass} ${isReady ? "text-emerald-200" : "text-amber-200"}`}>
              {isReady ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {!hasTarget ? "缺少目标" : isReady ? "可运行" : `${readiness.missingCount} 缺少`}
            </span>
            <span className={`${chipClass} ${resultItems.length > 0 ? "text-emerald-200" : ""}`}>
              {resultStatusLabel(hasResultConnection, resultItems.length)}
            </span>
          </div>

          <BoardResultStack
            activeAssetId={activeResultAssetId}
            onMaterializeResult={onMaterializeResult}
            onOpenResult={onOpenResult}
            onSaveVoiceProfile={onSaveVoiceProfile}
            onSelectResult={onSelectResult}
            resultItems={resultItems}
          />

          {isImportOpen && (
            <div className={`${softPanelClass} nodrag w-full min-w-0 p-2`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className={labelClass}>粘贴导入</span>
                <button type="button" onClick={() => setIsImportOpen(false)} className="text-[10px] text-[var(--iw-faint)] hover:text-[var(--iw-text)]">
                  关闭
                </button>
              </div>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_48px] gap-1.5">
                <textarea
                  value={importText}
                  onChange={event => setImportText(event.target.value)}
                  className="nodrag nowheel h-16 min-w-0 resize-none rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] p-2 font-mono text-[10px] leading-4 text-[var(--iw-text)] outline-none focus:border-emerald-400/60"
                  placeholder="应用 URL、webappId、官方 curl 或 API JSON"
                />
                <button type="button" onClick={applyImportedText} className="nodrag h-16 rounded-md bg-emerald-600 px-2 text-[10px] font-semibold text-white transition hover:bg-emerald-500">
                  应用
                </button>
              </div>
            </div>
          )}

          {(importError || node.errorMessage) && (
            <p className="line-clamp-3 rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] leading-4 text-red-200">
              {importError ?? node.errorMessage}
            </p>
          )}
        </section>

        <section className={`${softPanelClass} flex min-h-0 flex-col`}>
          <div className="flex items-center justify-between gap-2 border-b border-[var(--iw-border)] px-2 py-1.5">
            <div className="min-w-0">
              <p className={labelClass}>应用参数</p>
              <p className="truncate text-[10px] text-[var(--iw-faint)]">{bindingSummary}</p>
            </div>
            <button type="button" onClick={addBinding} className={iconButtonClass} title="添加参数">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {node.bindings.length === 0 ? (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-[var(--iw-border)] text-center">
                <ClipboardList className="h-5 w-5 text-[var(--iw-faint)]" />
                <p className="text-[10px] text-[var(--iw-muted)]">未读取字段</p>
              </div>
            ) : (
              <div className="space-y-2">
                {node.bindings.map((binding, index) => (
                  <div key={binding.id} className="rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] p-2">
                    <div className="grid grid-cols-[1fr_112px_auto] items-start gap-1.5">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <input
                            value={binding.label ?? ""}
                            onChange={event => updateBinding(binding.id, { label: event.target.value })}
                            className="nodrag nowheel h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-[11px] font-semibold text-[var(--iw-text)] outline-none focus:border-emerald-400/40"
                            placeholder={bindingTitle(binding)}
                          />
                          {binding.required && <span className="shrink-0 rounded border border-amber-400/25 px-1 text-[9px] text-amber-200">必填</span>}
                        </div>
                      </div>
                      <select
                        value={binding.source}
                        onChange={event => updateBinding(binding.id, { source: readSource(event.target.value) })}
                        className={inputClass}
                      >
                        {sourceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <button type="button" onClick={() => removeBinding(binding.id)} className={iconButtonClass} title="删除参数">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-1.5">
                      {binding.source === "literal" && binding.options && binding.options.length > 0 && (
                        <select value={binding.value} onChange={event => updateBinding(binding.id, { value: event.target.value })} className={`${inputClass} w-full`}>
                          {binding.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      )}
                      {binding.source === "literal" && (!binding.options || binding.options.length === 0) && (
                        <input
                          value={binding.value}
                          onChange={event => updateBinding(binding.id, { value: event.target.value })}
                          className={`${inputClass} w-full`}
                          placeholder="固定 fieldValue"
                        />
                      )}
                      {binding.source === "reference" && (
                        <div className="grid grid-cols-[1fr_1fr_1fr] gap-1.5">
                          <input
                            value={String(binding.referenceIndex ?? index)}
                            onChange={event => updateBinding(binding.id, { referenceIndex: readReferenceIndexInput(event.target.value) })}
                            className={`${inputClass} font-mono`}
                            placeholder="参考序号"
                          />
                          <select value={binding.referenceType ?? "image"} onChange={event => updateBinding(binding.id, { referenceType: readReferenceType(event.target.value) })} className={inputClass}>
                            <option value="image">图片</option>
                            <option value="video">视频</option>
                            <option value="audio">音频</option>
                          </select>
                          <select value={binding.deliveryMode} onChange={event => updateBinding(binding.id, { deliveryMode: readDelivery(event.target.value) })} className={inputClass}>
                            <option value="fileName">文件名</option>
                            <option value="url">URL</option>
                            <option value="raw">原值</option>
                          </select>
                        </div>
                      )}
                      {binding.source === "prompt" && (
                        <p className="rounded-md border border-[var(--iw-border)] px-2 py-1 text-[10px] text-[var(--iw-faint)]">
                          使用当前 Prompt{promptPreview !== null ? " 节点" : ""}
                        </p>
                      )}
                      {binding.source === "randomSeed" && (
                        <p className="rounded-md border border-[var(--iw-border)] px-2 py-1 text-[10px] text-[var(--iw-faint)]">每次运行生成随机 seed</p>
                      )}
                    </div>

                    <details className="nodrag mt-1.5">
                      <summary className="flex cursor-pointer items-center gap-1 text-[10px] text-[var(--iw-faint)]">
                        <Settings2 className="h-3 w-3" />
                        映射身份
                      </summary>
                      <div className="mt-1.5 grid grid-cols-[1fr_1fr_88px_72px] gap-1.5">
                        <input value={binding.nodeId} onChange={event => updateBinding(binding.id, { nodeId: event.target.value })} className={`${inputClass} font-mono`} placeholder="nodeId" />
                        <input value={binding.fieldName} onChange={event => updateBinding(binding.id, { fieldName: event.target.value })} className={`${inputClass} font-mono`} placeholder="fieldName" />
                        <select value={binding.valueType ?? "text"} onChange={event => updateBinding(binding.id, { valueType: readValueType(event.target.value) })} className={inputClass}>
                          {valueTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <label className="flex h-8 items-center gap-1 rounded-md border border-[var(--iw-border)] px-2 text-[10px] text-[var(--iw-muted)]">
                          <input
                            type="checkbox"
                            checked={binding.required === true}
                            onChange={event => updateBinding(binding.id, { required: event.target.checked })}
                            className="nodrag h-3 w-3"
                          />
                          必填
                        </label>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

    </div>
  );
});

export default RunningHubAppBoardNode;
