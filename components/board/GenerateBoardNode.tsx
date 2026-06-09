import { memo, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AudioLines, FileText, ImagePlus, Loader2, Play, Plus, Video, X } from "lucide-react";
import ModelPriceBadge from "@/components/creation/ModelPriceBadge";
import BoardPromptTextarea, { type BoardPromptTextareaHandle } from "@/components/board/BoardPromptTextarea";
import MediaReferenceThumbnail from "@/components/reference/MediaReferenceThumbnail";
import PromptTemplatePicker, { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { StorageItem } from "@/lib/db";
import type { BoardAudioOperationNode, BoardGenerateNodeUpdate, BoardGenerateVariantCount, BoardImageGenerateNode, BoardVideoGenerateNode } from "@/lib/board";
import type { BoardPromptReference } from "@/lib/board/prompt-references";
import {
  applyPromptTemplateText,
  insertPromptTemplateText,
  type PromptTemplate,
  type PromptTemplateApplyMode,
  type PromptTemplateSlashCommand,
} from "@/lib/prompt-templates";
import { AUDIO_MODE_LABELS, audioOperationFormatOptions, audioOperationRequiresTextInput } from "@/lib/audio-operation-rules";
import { getAudioModelCapabilities, getVideoModelCapabilities } from "@/lib/providers/model-catalog";
import { selectVideoReferenceTypesForMode } from "@/lib/video-reference-selection";
import { compactBoardModelLabel } from "@/lib/board/provenance";

type GenerateNode = BoardImageGenerateNode | BoardVideoGenerateNode | BoardAudioOperationNode;
const variantCountOptions: BoardGenerateVariantCount[] = [1, 2, 4];

export interface BoardGenerateReferencePreview {
  id: string;
  role?: string;
  sourceEdgeId?: string;
  sourceNodeId?: string;
  sourceTitle?: string;
  type?: ReferenceImageRef["type"];
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
  showReferencePreviews?: boolean;
  taskSummary?: BoardGenerateTaskSummary;
  onCancel?: () => void;
  onExecute: () => void;
  onMaterializeResult?: (assetId: string) => void;
  onOpenResult?: (item: StorageItem) => void;
  onSelectResult: (assetId: string) => void;
  onSelectReference?: (reference: BoardPromptReference, index: number) => void;
  onUpdate: (input: BoardGenerateNodeUpdate) => void;
  references: BoardPromptReference[];
  resultItems: StorageItem[];
  activeResultAssetId?: string;
}

type GenerateContextTone = "failed" | "neutral" | "ok" | "processing" | "prompt" | "reference" | "result";
type GenerateStatusLineTone = "complete" | "failed" | "idle" | "processing";

interface BoardResultStackProps {
  activeAssetId?: string;
  hasResultConnection?: boolean;
  onMaterializeResult?: (assetId: string) => void;
  onOpenResult?: (item: StorageItem) => void;
  onSelectResult: (assetId: string) => void;
  resultItems: StorageItem[];
}

export function BoardResultStack({
  activeAssetId,
  hasResultConnection = false,
  onMaterializeResult,
  onOpenResult,
  onSelectResult,
  resultItems,
}: BoardResultStackProps) {
  if (resultItems.length === 0) return null;
  const activeIndex = Math.max(0, resultItems.findIndex(item => item.id === activeAssetId));
  const activeItem = resultItems[activeIndex] ?? resultItems[0];
  const activePosition = activeIndex + 1;
  const stopPointer = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
  };
  return (
    <div className="nodrag min-w-0 rounded-md border border-emerald-400/20 bg-emerald-500/5 p-1">
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2 px-1">
        <span className="truncate text-[10px] font-semibold text-emerald-100" title={compactBoardModelLabel(activeItem.model)}>
          {activeItem.type} · {activePosition}/{resultItems.length} · {compactBoardModelLabel(activeItem.model)}
        </span>
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
          hasResultConnection
            ? "border-emerald-300/30 bg-emerald-500/15 text-emerald-100"
            : "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]"
        }`}>
          {hasResultConnection ? "已上板" : "未上板"}
        </span>
      </div>
      <div className="flex min-h-10 min-w-0 items-center gap-1 overflow-x-auto">
        {resultItems.map((item, index) => {
          const isActive = item.id === activeItem.id;
          return (
            <div key={item.id} className="relative h-8 w-8 shrink-0">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectResult(item.id);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onOpenResult?.(item);
                }}
                onPointerDown={stopPointer}
                className={`h-full w-full overflow-hidden rounded border transition ${
                  isActive ? "border-emerald-300 ring-2 ring-emerald-400/25" : "border-[var(--iw-border)] opacity-75 hover:opacity-100"
                }`}
                title={`结果 ${index + 1} · ${compactBoardModelLabel(item.model)}`}
              >
                {item.type === "transcript" ? (
                  <div className="flex h-full w-full items-center justify-center bg-cyan-950/35">
                    <FileText className="h-4 w-4 text-cyan-200" />
                  </div>
                ) : (
                  <MediaReferenceThumbnail reference={{ type: item.type, url: item.url }} alt="" className="h-full w-full" />
                )}
                <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[8px] font-semibold text-white">
                  {index + 1}
                </span>
              </button>
              {onMaterializeResult ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMaterializeResult(item.id);
                  }}
                  onPointerDown={stopPointer}
                  className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl rounded-tr border-b border-l border-emerald-200/60 bg-emerald-500 text-white shadow transition hover:bg-emerald-400"
                  title="放到画板"
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function statusText(node: GenerateNode): string {
  if (node.status === "processing") return "处理中";
  if (node.status === "complete") return "已完成";
  if (node.status === "failed") return "失败";
  if (node.kind === "image-generate") return "图片";
  if (node.kind === "video-generate") return "视频";
  return "音频";
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

function resultContext(hasResultConnection: boolean, resultCount: number): { title: string; tone: GenerateContextTone } {
  if (resultCount > 1) return { title: `${resultCount} 个结果`, tone: hasResultConnection ? "result" : "ok" };
  if (resultCount > 0 && hasResultConnection) return { title: "已连接", tone: "result" };
  if (resultCount > 0) return { title: "已生成", tone: "ok" };
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

function statusLineTone(node: GenerateNode, taskSummary: BoardGenerateTaskSummary | undefined): GenerateStatusLineTone {
  if (taskSummary?.status === "pending" || taskSummary?.status === "processing" || node.status === "processing") return "processing";
  if (node.status === "complete") return "complete";
  if (node.status === "failed") return "failed";
  return "idle";
}

function statusLineWidth(tone: GenerateStatusLineTone, taskSummary: BoardGenerateTaskSummary | undefined): string {
  if (tone === "processing") {
    if (taskSummary?.status === "processing") return `${Math.max(8, Math.min(100, taskSummary.progress))}%`;
    return "28%";
  }
  if (tone === "complete" || tone === "failed") return "100%";
  return "18%";
}

function statusLineClass(tone: GenerateStatusLineTone): string {
  if (tone === "processing") return "bg-blue-500 shadow-[0_0_14px_rgba(59,130,246,0.45)] animate-pulse";
  if (tone === "complete") return "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.35)]";
  if (tone === "failed") return "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.32)]";
  return "bg-slate-500/45";
}

const GenerateBoardNode = memo(function GenerateBoardNode({
  hasResultConnection = false,
  inputSummary,
  node,
  onCancel,
  onExecute,
  onMaterializeResult,
  onOpenResult,
  onSelectReference,
  onSelectResult,
  onUpdate,
  references,
  resultItems,
  activeResultAssetId,
  showReferencePreviews = true,
  taskSummary,
}: GenerateBoardNodeProps) {
  const promptTextareaRef = useRef<BoardPromptTextareaHandle | null>(null);
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const slashCommandRef = useRef<PromptTemplateSlashCommand | null>(null);
  const isProcessing = node.status === "processing" || taskSummary?.status === "processing" || taskSummary?.status === "pending";
  const isAudioNode = node.kind === "audio-operation";
  const textInputRequired = !isAudioNode || audioOperationRequiresTextInput(node.audioMode);
  const usesOptionalTextInput = isAudioNode && !textInputRequired;
  const promptPreview = inputSummary?.promptPreview ?? null;
  const promptSourceTitle = inputSummary?.promptSourceTitle;
  const referenceCount = inputSummary?.referenceCount ?? 0;
  const referencePreviews = inputSummary?.referencePreviews ?? [];
  const videoCapabilities = useMemo(
    () => node.kind === "video-generate" ? getVideoModelCapabilities(node.model) : null,
    [node.kind, node.model],
  );
  const activeVideoReferenceMode = node.kind === "video-generate"
    ? node.videoReferenceMode ?? videoCapabilities?.referenceMode ?? "none"
    : "none";
  const videoPriceReferenceTypes = useMemo(
    () => node.kind === "video-generate" && videoCapabilities
      ? selectVideoReferenceTypesForMode(
        referencePreviews.map(reference => ({
          id: reference.id,
          role: reference.role === "start" || reference.role === "end" || reference.role === "general" ? reference.role : undefined,
          type: reference.type,
          url: reference.url,
        })),
        referencePreviews[0]?.url ?? null,
        activeVideoReferenceMode,
        videoCapabilities.maxReferenceImages,
      )
      : [],
    [activeVideoReferenceMode, node.kind, referencePreviews, videoCapabilities],
  );
  const result = resultContext(hasResultConnection, resultItems.length);
  const run = runContext(node, taskSummary);
  const lineTone = statusLineTone(node, taskSummary);
  const promptContext = usesOptionalTextInput && promptPreview === null && !node.prompt.trim()
    ? { title: "可选", tone: "neutral" as const }
    : promptPreview !== null
    ? { title: promptSourceTitle ?? "已连接", tone: "prompt" as const }
    : { title: "节点内", tone: "neutral" as const };
  const promptContextLabel = isAudioNode ? textInputRequired ? "文本" : "备注" : "Prompt";
  const referenceContext = referenceCount > 0
    ? { title: `${referenceCount} 个`, tone: "reference" as const }
    : { title: "无", tone: "neutral" as const };
  const contextItems: Array<{ key: string; label: string; title: string; tone: GenerateContextTone; tooltip?: string }> = [
    {
      key: "prompt",
      label: promptContextLabel,
      title: promptContext.title,
      tone: promptContext.tone,
      tooltip: isAudioNode
        ? promptPreview !== null ? `${promptContextLabel}来自 ${promptSourceTitle ?? "Prompt 节点"}` : textInputRequired ? "使用节点内音频文本" : "文本可留空；连接所需参考媒体后执行"
        : promptPreview !== null ? `来自 ${promptSourceTitle ?? "Prompt 节点"}` : "使用节点内提示词",
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
    : node.kind === "video-generate"
      ? `${node.model} / ${node.aspectRatio}${node.videoDuration ? ` / ${node.videoDuration}s` : ""} / x${node.variantCount}`
      : [
        node.model,
        AUDIO_MODE_LABELS[node.audioMode],
        audioOperationFormatOptions(getAudioModelCapabilities(node.model)).length > 0 ? node.audioFormat : "",
        `x${node.variantCount}`,
      ].filter(value => value.trim().length > 0).join(" / ");
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
    if (command) {
      templatePickerRef.current?.open(command.search);
    } else {
      templatePickerRef.current?.close();
    }
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
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-3">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md">
        <BoardPromptTextarea
          ref={promptTextareaRef}
          commitId={promptPreview === null ? node.id : undefined}
          value={promptPreview ?? node.prompt}
          onChange={(prompt) => onUpdate({ prompt })}
          onSelectReference={onSelectReference}
          onSlashCommand={handleSlashCommand}
          references={references}
          readOnly={promptPreview !== null}
          headerRight={promptPreview === null && !usesOptionalTextInput ? <PromptTemplatePicker ref={templatePickerRef} compact onApply={handleApplyPromptTemplate} /> : undefined}
          className={`nodrag nowheel h-full w-full resize-none rounded-md imagine-board-input !p-2 !pr-20 text-xs leading-5 outline-none placeholder:text-[var(--iw-faint)] focus:border-[var(--iw-border)] ${
            promptPreview !== null ? "cursor-default opacity-85" : ""
          }`}
          placeholder={promptPreview !== null
            ? isAudioNode ? `已连接${promptContextLabel}节点，请在提示节点编辑` : "已连接 Prompt 节点，请在提示节点编辑"
            : usesOptionalTextInput ? "文本可留空；连接或拖入所需参考媒体后执行" : isAudioNode ? "输入音频操作文本，输入 @ 引用支持的参考媒体" : "可直接写提示词，输入 @ 引用参考图"}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1 overflow-hidden rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-1">
        {contextItems.map(item => (
          <span
            key={item.key}
            data-tone={item.tone}
            className={`imagine-generate-context-chip flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 ${contextToneClass(item.tone)}`}
            title={item.tooltip}
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
            <span className="truncate text-[10px] font-semibold">{item.label} · {item.title}</span>
          </span>
        ))}
      </div>
      {showReferencePreviews && referencePreviews.length > 0 && (
        <div className="flex min-h-6 min-w-0 items-center gap-1.5">
          <div className="nodrag flex min-w-0 items-center gap-1">
            {referencePreviews.slice(0, 4).map(reference => (
              <div
                key={`${reference.id}:${reference.url}`}
                className="h-6 w-6 overflow-hidden rounded border border-blue-400/30 bg-[var(--iw-panel-soft)]"
                title={reference.role ? `参考媒体 · ${reference.role}` : "参考媒体"}
              >
                <MediaReferenceThumbnail reference={reference} alt="" className="h-full w-full" />
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
      <BoardResultStack
        activeAssetId={activeResultAssetId}
        hasResultConnection={hasResultConnection}
        onMaterializeResult={onMaterializeResult}
        onOpenResult={onOpenResult}
        onSelectResult={onSelectResult}
        resultItems={resultItems}
      />
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
            {node.kind === "image-generate" ? (
              <ImagePlus className="h-3.5 w-3.5" />
            ) : node.kind === "video-generate" ? (
              <Video className="h-3.5 w-3.5" />
            ) : (
              <AudioLines className="h-3.5 w-3.5" />
            )}
            <Play className="h-3 w-3" />
            {!isProcessing && (
              <ModelPriceBadge
                provider={node.model.split(":")[0]}
                modelId={node.model}
                duration={node.kind === "video-generate" ? node.videoDuration : undefined}
                resolution={node.kind === "image-generate" ? (node.imageResolution === "custom" ? node.customImageResolution : node.imageResolution) : undefined}
                imageQuality={node.kind === "image-generate" ? node.imageQuality : undefined}
                referenceTypes={node.kind === "video-generate" ? videoPriceReferenceTypes : undefined}
                thinkingLevel={node.kind === "image-generate" ? node.thinkingLevel : undefined}
                videoReferenceMode={node.kind === "video-generate" ? activeVideoReferenceMode : undefined}
                videoResolution={node.kind === "video-generate" ? node.videoResolution : undefined}
              />
            )}
          </button>
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-[var(--iw-panel-soft)]" title={`状态：${run.title}`}>
        <div
          className={`h-full rounded-full transition-[width] ${statusLineClass(lineTone)}`}
          data-state={lineTone}
          style={{ width: statusLineWidth(lineTone, taskSummary) }}
        />
      </div>
    </div>
  );
});

export default GenerateBoardNode;
