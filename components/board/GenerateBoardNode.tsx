import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ImagePlus, Loader2, Play, Video, X } from "lucide-react";
import BoardPromptTextarea, { type BoardPromptTextareaHandle } from "@/components/board/BoardPromptTextarea";
import PreviewImage from "@/components/PreviewImage";
import PromptTemplatePicker, { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { BoardGenerateNodeUpdate, BoardGenerateVariantCount, BoardImageGenerateNode, BoardVideoGenerateNode } from "@/lib/board";
import {
  applyPromptTemplateText,
  insertPromptTemplateText,
  type PromptTemplate,
  type PromptTemplateApplyMode,
  type PromptTemplateSlashCommand,
} from "@/lib/prompt-templates";

type GenerateNode = BoardImageGenerateNode | BoardVideoGenerateNode;
const variantCountOptions: BoardGenerateVariantCount[] = [1, 2, 4];

export interface BoardGenerateReferencePreview {
  id: string;
  role?: string;
  url: string;
}

export interface BoardGenerateInputSummary {
  promptPreview: string | null;
  promptSourceTitle?: string;
  referenceCount: number;
  referencePreviews: BoardGenerateReferencePreview[];
}

export interface BoardGenerateTaskSummary {
  id: string;
  progress: number;
  status: "processing" | "pending";
}

interface GenerateBoardNodeProps {
  hasResultConnection?: boolean;
  inputSummary?: BoardGenerateInputSummary;
  node: GenerateNode;
  taskSummary?: BoardGenerateTaskSummary;
  onCancel?: () => void;
  onExecute: () => void;
  onUpdate: (input: BoardGenerateNodeUpdate) => void;
  references: ReferenceImageRef[];
}

type GenerateContextTone = "failed" | "neutral" | "ok" | "processing" | "prompt" | "reference" | "result";

function statusText(node: GenerateNode): string {
  if (node.status === "processing") return "处理中";
  if (node.status === "complete") return "已完成";
  if (node.status === "failed") return "失败";
  return node.kind === "image-generate" ? "图片" : "视频";
}

function statusSteps(status: GenerateNode["status"]): Array<{ key: string; label: string; state: "done" | "active" | "idle" | "failed" }> {
  const activeIndex = status === "idle" ? 0 : status === "processing" ? 1 : 2;
  return ["准备", "生成", "结果"].map((label, index) => {
    if (status === "failed") return { key: label, label, state: index === activeIndex ? "failed" : index < activeIndex ? "done" : "idle" };
    if (status === "complete") return { key: label, label, state: "done" };
    if (index < activeIndex) return { key: label, label, state: "done" };
    if (index === activeIndex) return { key: label, label, state: "active" };
    return { key: label, label, state: "idle" };
  });
}

function contextToneClass(tone: GenerateContextTone): string {
  if (tone === "prompt") return "border-teal-400/20 bg-teal-500/10 text-teal-100";
  if (tone === "reference") return "border-blue-400/20 bg-blue-500/10 text-blue-100";
  if (tone === "result") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  if (tone === "processing") return "border-sky-400/20 bg-sky-500/10 text-sky-100";
  if (tone === "ok") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-100";
  if (tone === "failed") return "border-red-400/25 bg-red-500/10 text-red-200";
  return "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]";
}

function resultContext(node: GenerateNode, hasResultConnection: boolean): { title: string; tone: GenerateContextTone } {
  if (node.resultAssetId && hasResultConnection) return { title: "已连接", tone: "result" };
  if (node.resultAssetId) return { title: "已生成", tone: "ok" };
  if (node.status === "processing") return { title: "等待", tone: "processing" };
  if (node.status === "failed") return { title: "未输出", tone: "failed" };
  return { title: "未生成", tone: "neutral" };
}

function runContext(node: GenerateNode, taskSummary: BoardGenerateTaskSummary | undefined): { title: string; tone: GenerateContextTone } {
  if (taskSummary?.status === "pending") return { title: "排队", tone: "processing" };
  if (taskSummary?.status === "processing") return { title: `${taskSummary.progress}%`, tone: "processing" };
  if (node.status === "complete") return { title: "完成", tone: "ok" };
  if (node.status === "failed") return { title: "失败", tone: "failed" };
  if (node.status === "processing") return { title: "处理中", tone: "processing" };
  return { title: "待运行", tone: "neutral" };
}

export default function GenerateBoardNode({ hasResultConnection = false, inputSummary, node, onCancel, onExecute, onUpdate, references, taskSummary }: GenerateBoardNodeProps) {
  const promptTextareaRef = useRef<BoardPromptTextareaHandle | null>(null);
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const slashCommandRef = useRef<PromptTemplateSlashCommand | null>(null);
  const isProcessing = node.status === "processing" || taskSummary?.status === "processing" || taskSummary?.status === "pending";
  const promptPreview = inputSummary?.promptPreview ?? null;
  const promptSourceTitle = inputSummary?.promptSourceTitle;
  const referenceCount = inputSummary?.referenceCount ?? 0;
  const referencePreviews = inputSummary?.referencePreviews ?? [];
  const steps = statusSteps(node.status);
  const result = resultContext(node, hasResultConnection);
  const run = runContext(node, taskSummary);
  const promptContext = promptPreview !== null
    ? { title: promptSourceTitle ?? "已连接", tone: "prompt" as const }
    : { title: "节点内", tone: "neutral" as const };
  const referenceContext = referenceCount > 0
    ? { title: `${referenceCount} 张`, tone: "reference" as const }
    : { title: "无", tone: "neutral" as const };
  const contextItems: Array<{ key: string; label: string; title: string; tone: GenerateContextTone; tooltip?: string }> = [
    {
      key: "prompt",
      label: "Prompt",
      title: promptContext.title,
      tone: promptContext.tone,
      tooltip: promptPreview !== null ? `来自 ${promptSourceTitle ?? "Prompt 节点"}` : "使用节点内提示词",
    },
    { key: "references", label: "参考", title: referenceContext.title, tone: referenceContext.tone },
    { key: "result", label: "结果", title: result.title, tone: result.tone },
    {
      key: "run",
      label: "运行",
      title: run.title,
      tone: run.tone,
      tooltip: taskSummary ? `任务 ${taskSummary.id}` : undefined,
    },
  ];
  const paramSummary = node.kind === "image-generate"
    ? `${node.model} / ${node.imageResolution === "custom" ? node.customImageResolution : node.imageResolution} / x${node.variantCount}`
    : `${node.model} / ${node.aspectRatio}${node.videoDuration ? ` / ${node.videoDuration}s` : ""} / x${node.variantCount}`;
  const statusLabel = taskSummary
    ? `${taskSummary.status === "pending" ? "排队" : "处理中"} ${taskSummary.progress}% / ${paramSummary}`
    : `${statusText(node)} / ${paramSummary}`;
  const handleApplyPromptTemplate = (template: PromptTemplate, mode: PromptTemplateApplyMode): void => {
    const textarea = promptTextareaRef.current;
    const currentPrompt = textarea?.getValue() ?? node.prompt;
    const slashCommand = slashCommandRef.current;
    if (slashCommand && mode === "insert") {
      const result = insertPromptTemplateText(currentPrompt, template.positivePrompt, slashCommand.start, slashCommand.end);
      textarea?.setValue(result.prompt);
      slashCommandRef.current = null;
      window.requestAnimationFrame(() => promptTextareaRef.current?.focusAt(result.caret));
      return;
    }
    if (mode === "replace") {
      textarea?.setValue(applyPromptTemplateText(currentPrompt, template.positivePrompt, mode));
      slashCommandRef.current = null;
      return;
    }
    const selection = textarea?.getSelectionRange() ?? { start: currentPrompt.length, end: currentPrompt.length };
    const result = insertPromptTemplateText(currentPrompt, template.positivePrompt, selection.start, selection.end);
    textarea?.setValue(result.prompt);
    window.requestAnimationFrame(() => promptTextareaRef.current?.focusAt(result.caret));
  };
  const handleSlashCommand = (command: PromptTemplateSlashCommand | null): void => {
    slashCommandRef.current = command;
    if (command) templatePickerRef.current?.open(command.search);
  };
  const stopBoardControlPointer = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
  };
  const updateVariantCount = (event: ReactMouseEvent<HTMLButtonElement>, count: BoardGenerateVariantCount): void => {
    event.stopPropagation();
    if (node.variantCount === count) return;
    onUpdate({ variantCount: count });
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="relative min-h-0 flex-1 overflow-visible">
        <BoardPromptTextarea
          ref={promptTextareaRef}
          commitId={promptPreview === null ? node.id : undefined}
          value={promptPreview ?? node.prompt}
          onChange={(prompt) => onUpdate({ prompt })}
          onSlashCommand={handleSlashCommand}
          references={references}
          readOnly={promptPreview !== null}
          headerRight={promptPreview === null ? <PromptTemplatePicker ref={templatePickerRef} compact onApply={handleApplyPromptTemplate} /> : undefined}
          className={`nodrag nowheel h-full w-full resize-none rounded-md imagine-board-input p-2 pr-20 text-xs leading-5 outline-none placeholder:text-[var(--iw-faint)] focus:border-[var(--iw-border)] ${
            promptPreview !== null ? "cursor-default opacity-85" : ""
          }`}
          placeholder={promptPreview !== null ? "已连接 Prompt 节点，请在提示节点编辑" : "可直接写提示词，输入 @ 引用参考图"}
        />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {contextItems.map(item => (
          <div
            key={item.key}
            className={`min-w-0 rounded-md border px-1.5 py-1 ${contextToneClass(item.tone)}`}
            title={item.tooltip}
          >
            <span className="block truncate text-[8px] font-semibold uppercase opacity-70">{item.label}</span>
            <span className="block truncate text-[10px] font-semibold">{item.title}</span>
          </div>
        ))}
      </div>
      {referencePreviews.length > 0 && (
        <div className="flex min-h-6 min-w-0 items-center gap-1.5">
          <div className="nodrag flex min-w-0 items-center gap-1">
            {referencePreviews.slice(0, 4).map(reference => (
              <div
                key={`${reference.id}:${reference.url}`}
                className="h-6 w-6 overflow-hidden rounded border border-blue-400/30 bg-[var(--iw-panel-soft)]"
                title={reference.role ? `参考图 · ${reference.role}` : "参考图"}
              >
                <PreviewImage src={reference.url} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
            {referencePreviews.length > 4 && (
              <span className="rounded border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-1.5 py-1 font-mono text-[10px] text-[var(--iw-muted)]">
                +{referencePreviews.length - 4}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
        <span className={`imagine-status-chip truncate text-[10px] font-mono ${node.status === "failed" ? "text-red-300" : "text-[var(--iw-muted)]"}`} data-status={node.status}>
          {node.errorMessage ?? statusLabel}
        </span>
        <div className="nodrag flex h-8 overflow-hidden rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]" title="变体数量">
          {variantCountOptions.map(count => (
            <button
              key={count}
              type="button"
              onClick={(event) => updateVariantCount(event, count)}
              onPointerDown={stopBoardControlPointer}
              disabled={isProcessing}
              className={`w-7 text-[10px] font-semibold transition ${
                node.variantCount === count
                  ? "bg-blue-600 text-white"
                  : "text-[var(--iw-muted)] hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]"
              }`}
            >
              {count}
            </button>
          ))}
        </div>
        {isProcessing && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="nodrag flex h-8 items-center justify-center gap-1.5 rounded-md border border-red-400/25 bg-red-500/10 px-3 text-xs font-semibold text-red-300 transition hover:bg-red-500/15"
            title="取消关联生成任务"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <X className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onExecute}
            disabled={isProcessing}
            className="nodrag flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
          >
            {node.kind === "image-generate" ? <ImagePlus className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
            <Play className="h-3 w-3" />
          </button>
        )}
      </div>
      {taskSummary && (
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--iw-panel-soft)]" title={`任务进度 ${taskSummary.progress}%`}>
          <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${taskSummary.progress}%` }} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5" role="list" aria-label="生成进度">
        {steps.map(step => (
          <span
            key={step.key}
            className="imagine-board-progress-step h-1.5 rounded-full"
            data-state={step.state}
            title={step.label}
            aria-label={step.label}
            role="listitem"
          />
        ))}
      </div>
    </div>
  );
}
