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
import { audioOperationFormatOptions, audioOperationRequiresTextInput, getAudioModeLabel } from "@/lib/audio-operation-rules";
import { getAudioModelCapabilities, getVideoModelCapabilities } from "@/lib/providers/model-catalog";
import { buildGenerationModelPriceOptions } from "@/lib/providers/pricing";
import { selectVideoReferenceTypesForMode } from "@/lib/video-reference-selection";
import { gsap, prefersReducedWorkbenchMotion, useGSAP, WORKBENCH_GSAP_EASE } from "@/lib/workbench-gsap";
import { useTranslations } from "@/lib/i18n";

type GenerateNode = BoardImageGenerateNode | BoardVideoGenerateNode | BoardAudioOperationNode;
const variantCountOptions: BoardGenerateVariantCount[] = [1, 2, 4];

function effectiveVariantCount(node: GenerateNode): BoardGenerateVariantCount {
  return node.kind === "audio-operation" ? 1 : node.variantCount;
}

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

type BoardNodeT = ReturnType<typeof useTranslations>["t"];

function statusText(node: GenerateNode, t: BoardNodeT): string {
  if (node.status === "processing") return t("node.statusLabels.processing");
  if (node.status === "complete") return t("node.statusLabels.complete");
  if (node.status === "failed") return t("node.statusLabels.failed");
  if (node.kind === "image-generate") return t("node.types.imageGenerate");
  if (node.kind === "video-generate") return t("node.types.videoGenerate");
  return t("node.types.audioOperation");
}

function contextToneClass(tone: GenerateContextTone): string {
  if (tone !== "neutral") return "imagine-tone-chip";
  return "border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)]";
}

function resultContext(hasResultConnection: boolean, resultCount: number, t: BoardNodeT): { title: string; tone: GenerateContextTone } {
  if (resultCount > 0) {
    return {
      title: hasResultConnection
        ? t("node.generateNode.connectedMediaCount", { count: resultCount })
        : t("node.generateNode.mediaCount", { count: resultCount }),
      tone: hasResultConnection ? "result" : "ok",
    };
  }
  return { title: t("node.generateNode.noResult"), tone: "neutral" };
}

function runContext(node: GenerateNode, taskSummary: BoardGenerateTaskSummary | undefined, t: BoardNodeT): { title: string; tone: GenerateContextTone } {
  if (taskSummary?.status === "pending") return { title: t("node.statusLabels.pending"), tone: "processing" };
  if (taskSummary?.status === "processing") return { title: t("node.statusLabels.processing"), tone: "processing" };
  if (node.status === "complete") return { title: t("node.statusLabels.complete"), tone: "ok" };
  if (node.status === "failed") return { title: t("node.statusLabels.failed"), tone: "failed" };
  if (node.status === "processing") return { title: t("node.statusLabels.processing"), tone: "processing" };
  return { title: t("node.statusLabels.idle"), tone: "neutral" };
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
  const { t } = useTranslations("board");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousLineToneRef = useRef<GenerateStatusLineTone | null>(null);
  const promptTextareaRef = useRef<BoardPromptTextareaHandle | null>(null);
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const slashCommandRef = useRef<PromptTemplateSlashCommand | null>(null);
  const isProcessing = node.status === "processing" || taskSummary?.status === "processing" || taskSummary?.status === "pending";
  const isAudioNode = node.kind === "audio-operation";
  const isVideoNode = node.kind === "video-generate";
  const cinematicNode = node.kind === "audio-operation" ? null : node;
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
  const result = resultContext(hasResultConnection, resultItems.length, t);
  const run = runContext(node, taskSummary, t);
  const lineTone = statusLineTone(node, taskSummary);
  const promptContext = usesOptionalTextInput && promptPreview === null && !node.prompt.trim()
    ? { title: t("node.generateNode.optional"), tone: "neutral" as const }
    : promptPreview !== null
    ? { title: promptSourceTitle ?? t("node.generateNode.connected"), tone: "prompt" as const }
    : { title: t("node.generateNode.inline"), tone: "neutral" as const };
  const promptContextLabel = isAudioNode
    ? textInputRequired ? t("node.generateNode.text") : t("node.generateNode.note")
    : t("node.generateNode.prompt");
  const referenceContext = referenceCount > 0
    ? { title: `${referenceCount}`, tone: "reference" as const }
    : { title: t("node.generateNode.none"), tone: "neutral" as const };
  const contextItems: GenerateContextItem[] = [
    {
      key: "prompt",
      label: promptContextLabel,
      title: promptContext.title,
      tone: promptContext.tone,
      tooltip: isAudioNode
        ? promptPreview !== null
          ? t("node.generateNode.promptFrom", { label: promptContextLabel, source: promptSourceTitle ?? t("node.generateNode.promptNode") })
          : textInputRequired ? t("node.generateNode.useInlineAudioText") : t("node.generateNode.optionalTextHint")
        : promptPreview !== null
          ? t("node.generateNode.fromPromptNode", { source: promptSourceTitle ?? t("node.generateNode.promptNode") })
          : t("node.generateNode.useInlinePrompt"),
    },
    { key: "references", label: t("node.generateNode.reference"), title: referenceContext.title, tone: referenceContext.tone },
    {
      key: "result",
      label: t("node.generateNode.result"),
      title: result.title,
      tone: result.tone,
      ...(hasResultConnection && onFocusResultNode ? { onClick: onFocusResultNode, tooltip: t("node.generateNode.locateResultNode") } : {}),
    },
    {
      key: "run",
      label: t("node.generateNode.run"),
      title: run.title,
      tone: run.tone,
      tooltip: taskSummary ? t("node.generateNode.taskLabel", { id: taskSummary.id }) : undefined,
    },
  ];
  const displayedVariantCount = effectiveVariantCount(node);
  const paramSummary = node.kind === "image-generate"
    ? `${node.model} / ${node.imageResolution === "custom" ? node.customImageResolution : node.imageResolution} / x${displayedVariantCount}`
    : node.kind === "video-generate"
      ? `${node.model} / ${node.aspectRatio}${node.videoDuration ? ` / ${node.videoDuration}s` : ""} / x${displayedVariantCount}`
      : [
        node.model,
        getAudioModeLabel(node.audioMode, t),
        audioOperationFormatOptions(getAudioModelCapabilities(node.model)).length > 0 ? node.audioFormat : "",
        `x${displayedVariantCount}`,
      ].filter(value => value.trim().length > 0).join(" / ");
  const taskStatusText = taskSummary?.status === "pending" ? t("node.statusLabels.pending") : t("node.statusLabels.processing");
  const statusLabel = taskSummary ? `${taskStatusText} / ${paramSummary}` : `${statusText(node, t)} / ${paramSummary}`;
  const compactStatusLabel = taskSummary ? `${taskStatusText} · x${displayedVariantCount}` : `${statusText(node, t)} · x${displayedVariantCount}`;

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
            ? isAudioNode ? t("node.generateNode.connectedTextPlaceholder", { label: promptContextLabel }) : t("node.generateNode.connectedPromptPlaceholder")
            : usesOptionalTextInput ? t("node.generateNode.optionalPlaceholder") : isAudioNode ? t("node.generateNode.audioPlaceholder") : t("node.generateNode.imagePromptPlaceholder")}
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
                className="h-6 w-6 overflow-hidden rounded border border-[color-mix(in_srgb,var(--iw-board-edge-reference)_30%,transparent)] bg-[var(--iw-panel-soft)]"
                title={reference.role ? t("node.generateNode.referenceRole", { role: reference.role }) : t("node.generateNode.referenceMedia")}
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
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(110px,0.9fr)_auto_auto] items-center gap-2">
        <span
          className={`imagine-status-chip min-w-0 truncate text-[10px] font-mono ${node.status === "failed" ? "imagine-tone-icon" : "text-[var(--iw-muted)]"}`}
          data-status={node.status}
          data-tone={node.status === "failed" ? "danger" : undefined}
          title={node.status === "failed" && node.errorMessage ? node.errorMessage : statusLabel}
        >
          {compactStatusLabel}
        </span>
        {cinematicNode ? (
          <CinematicProfileControls
            accent={cinematicNode.kind === "video-generate" ? "violet" : "blue"}
            className="nodrag h-8"
            mediaType={cinematicNode.kind === "video-generate" ? "video" : "image"}
            variant="compact"
            value={cinematicNode.cinematicProfile}
            onChange={cinematicProfile => onUpdate({ cinematicProfile })}
          />
        ) : (
          <span />
        )}
        {node.kind === "audio-operation" ? <span /> : (
          <div className="imagine-generate-variant-group nodrag flex h-8 overflow-hidden rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]" title={t("node.generateNode.variantCount")}>
            {variantCountOptions.map(count => (
              <button
                key={count}
                type="button"
                onClick={(event) => updateVariantCount(event, count)}
                onPointerDown={stopBoardControlPointer}
                disabled={isProcessing}
                className={`w-7 text-[10px] font-semibold transition ${
                  node.variantCount === count
                    ? "bg-[var(--iw-accent-strong)] text-white"
                    : "text-[var(--iw-muted)] hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]"
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        )}
        {isProcessing && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="imagine-generate-run-action imagine-tone-chip nodrag flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition"
            data-tone="danger"
            title={t("node.generateNode.cancelTask")}
            aria-label={t("node.generateNode.cancelTask")}
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <X className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onExecute}
            disabled={isProcessing}
            className="imagine-primary-action imagine-generate-run-action nodrag flex h-8 items-center justify-center gap-1.5 px-3 text-xs font-semibold transition disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
            data-size="compact"
            title={t("node.generateNode.run")}
            aria-label={t("node.generateNode.run")}
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
