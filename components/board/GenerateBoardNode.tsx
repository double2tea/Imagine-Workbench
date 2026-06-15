import { memo, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { AudioLines, ImagePlus, Loader2, Play, Video, X } from "lucide-react";
import CinematicProfileControls from "@/components/creation/CinematicProfileControls";
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
import { buildGenerationModelPriceOptions } from "@/lib/providers/pricing";
import { selectVideoReferenceTypesForMode } from "@/lib/video-reference-selection";
import { gsap, prefersReducedWorkbenchMotion, useGSAP, WORKBENCH_GSAP_EASE } from "@/lib/workbench-gsap";

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
  onFocusResultNode?: () => void;
  onSelectReference?: (reference: BoardPromptReference, index: number) => void;
  onUpdate: (input: BoardGenerateNodeUpdate) => void;
  references: BoardPromptReference[];
  resultItems: StorageItem[];
}

type GenerateContextTone = "failed" | "neutral" | "ok" | "processing" | "prompt" | "reference" | "result";
type GenerateContextItem = {
  key: string;
  label: string;
  onClick?: () => void;
  title: string;
  tone: GenerateContextTone;
  tooltip?: string;
};
type GenerateStatusLineTone = "complete" | "failed" | "idle" | "processing";

function statusText(node: GenerateNode): string {
  if (node.status === "processing") return "处理中";
  if (node.status === "complete") return "已完成";
  if (node.status === "failed") return "失败";
  if (node.kind === "image-generate") return "图片";
  if (node.kind === "video-generate") return "视频";
  return "音频";
}

function contextToneClass(tone: GenerateContextTone): string {
  if (tone !== "neutral") return "imagine-tone-chip";
  return "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]";
}

function resultContext(hasResultConnection: boolean, resultCount: number): { title: string; tone: GenerateContextTone } {
  if (resultCount > 0) return { title: hasResultConnection ? `${resultCount} 个已上板` : `${resultCount} 个`, tone: hasResultConnection ? "result" : "ok" };
  return { title: "未生成", tone: "neutral" };
}

function runContext(node: GenerateNode, taskSummary: BoardGenerateTaskSummary | undefined): { title: string; tone: GenerateContextTone } {
  if (taskSummary?.status === "pending") return { title: "排队", tone: "processing" };
  if (taskSummary?.status === "processing") return { title: "处理中", tone: "processing" };
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

const GenerateBoardNode = memo(function GenerateBoardNode({
  hasResultConnection = false,
  inputSummary,
  node,
  onCancel,
  onExecute,
  onFocusResultNode,
  onSelectReference,
  onUpdate,
  references,
  resultItems,
  showReferencePreviews = true,
  taskSummary,
}: GenerateBoardNodeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousLineToneRef = useRef<GenerateStatusLineTone | null>(null);
  const promptTextareaRef = useRef<BoardPromptTextareaHandle | null>(null);
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const slashCommandRef = useRef<PromptTemplateSlashCommand | null>(null);
  const isProcessing = node.status === "processing" || taskSummary?.status === "processing" || taskSummary?.status === "pending";
  const isAudioNode = node.kind === "audio-operation";
  const isVideoNode = node.kind === "video-generate";
  const textInputRequired = !isAudioNode || audioOperationRequiresTextInput(node.audioMode);
  const usesOptionalTextInput = isAudioNode && !textInputRequired;
  const promptPreview = inputSummary?.promptPreview ?? null;
  const promptSourceTitle = inputSummary?.promptSourceTitle;
  const referenceCount = inputSummary?.referenceCount ?? 0;
  const referencePreviews = inputSummary?.referencePreviews ?? [];
  const videoCapabilities = useMemo(
    () => isVideoNode ? getVideoModelCapabilities(node.model) : null,
    [isVideoNode, node.model],
  );
  const activeVideoReferenceMode = isVideoNode
    ? node.videoReferenceMode ?? videoCapabilities?.referenceMode ?? "none"
    : "none";
  const videoPriceReferenceTypes = useMemo(
    () => isVideoNode && videoCapabilities
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
    [activeVideoReferenceMode, isVideoNode, referencePreviews, videoCapabilities],
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
  const contextItems: GenerateContextItem[] = [
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
    {
      key: "result",
      label: "结果",
      title: result.title,
      tone: result.tone,
      ...(hasResultConnection && onFocusResultNode ? { onClick: onFocusResultNode, tooltip: "定位结果节点" } : {}),
    },
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
  const taskStatusText = taskSummary?.status === "pending" ? "排队中" : "处理中";
  const statusLabel = taskSummary ? `${taskStatusText} / ${paramSummary}` : `${statusText(node)} / ${paramSummary}`;
  const compactStatusLabel = taskSummary ? `${taskStatusText} · x${node.variantCount}` : `${statusText(node)} · x${node.variantCount}`;

  useGSAP(() => {
    const previousLineTone = previousLineToneRef.current;
    previousLineToneRef.current = lineTone;
    if (prefersReducedWorkbenchMotion() || previousLineTone === null || previousLineTone === lineTone) return;

    if (lineTone === "processing") {
      gsap.timeline({ defaults: { duration: 0.24, ease: WORKBENCH_GSAP_EASE } })
        .fromTo(
          ".imagine-generate-context-chip",
          { opacity: 0.72, y: 4 },
          { opacity: 1, stagger: 0.025, y: 0 },
          0,
        )
        .fromTo(
          ".imagine-generate-run-action",
          { scale: 0.96 },
          { scale: 1 },
          0,
        );
      return;
    }

    if (lineTone === "complete" || lineTone === "failed") {
      gsap.timeline({ defaults: { ease: WORKBENCH_GSAP_EASE } })
        .fromTo(
          ".imagine-status-chip",
          { scale: 0.98 },
          { scale: 1, duration: 0.18 },
          0,
        );
    }
  }, { dependencies: [lineTone], scope: containerRef });

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
    <div ref={containerRef} className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-3">
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
        {contextItems.map(item => {
          const className = `imagine-generate-context-chip flex min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 ${contextToneClass(item.tone)}`;
          const content = <span className="truncate text-[10px] font-semibold">{item.label} · {item.title}</span>;
          return item.onClick ? (
            <button
              key={item.key}
              type="button"
              data-tone={item.tone}
              className={`${className} nodrag cursor-pointer transition hover:border-[var(--iw-tone-success-border)] hover:bg-[var(--iw-tone-success-bg)]`}
              title={item.tooltip}
              onClick={(event) => {
                event.stopPropagation();
                item.onClick?.();
              }}
              onPointerDown={stopBoardControlPointer}
            >
              {content}
            </button>
          ) : (
            <span
              key={item.key}
              data-tone={item.tone}
              className={className}
              title={item.tooltip}
            >
              {content}
            </span>
          );
        })}
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
      <div className="grid grid-cols-[1fr_minmax(110px,0.9fr)_auto_auto] items-center gap-2">
        <span
          className={`imagine-status-chip truncate text-[10px] font-mono ${node.status === "failed" ? "imagine-tone-icon" : "text-[var(--iw-muted)]"}`}
          data-status={node.status}
          data-tone="danger"
          title={node.errorMessage ?? statusLabel}
        >
          {node.errorMessage ?? compactStatusLabel}
        </span>
        {node.kind === "image-generate" || isVideoNode ? (
          <CinematicProfileControls
            accent={isVideoNode ? "violet" : "blue"}
            className="nodrag h-8"
            mediaType={isVideoNode ? "video" : "image"}
            variant="compact"
            value={node.cinematicProfile}
            onChange={cinematicProfile => onUpdate({ cinematicProfile })}
          />
        ) : (
          <span />
        )}
        <div className="imagine-generate-variant-group nodrag flex h-8 overflow-hidden rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]" title="变体数量">
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
            className="imagine-generate-run-action imagine-tone-chip nodrag flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition"
            data-tone="danger"
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
            className="imagine-generate-run-action nodrag flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
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
                options={node.kind === "image-generate"
                  ? buildGenerationModelPriceOptions({
                      kind: "image",
                      imageQuality: node.imageQuality,
                      resolution: node.imageResolution === "custom" ? node.customImageResolution : node.imageResolution,
                      thinkingLevel: node.thinkingLevel,
                    })
                  : node.kind === "video-generate"
                    ? buildGenerationModelPriceOptions({
                        kind: "video",
                        duration: node.videoDuration,
                        referenceTypes: videoPriceReferenceTypes,
                        videoReferenceMode: activeVideoReferenceMode,
                        videoResolution: node.videoResolution,
                      })
                    : buildGenerationModelPriceOptions({ kind: "audio" })}
              />
            )}
          </button>
        )}
      </div>
    </div>
  );
});

export default GenerateBoardNode;
