import { ImagePlus, Loader2, Play, Video } from "lucide-react";
import BoardPromptTextarea from "@/components/board/BoardPromptTextarea";
import PreviewImage from "@/components/PreviewImage";
import PromptTemplatePicker from "@/components/prompt-templates/PromptTemplatePicker";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { BoardGenerateNodeUpdate, BoardGenerateVariantCount, BoardImageGenerateNode, BoardVideoGenerateNode } from "@/lib/board";
import { applyPromptTemplateText, type PromptTemplate, type PromptTemplateApplyMode } from "@/lib/prompt-templates";

type GenerateNode = BoardImageGenerateNode | BoardVideoGenerateNode;
const variantCountOptions: BoardGenerateVariantCount[] = [1, 2, 4];

export interface BoardGenerateReferencePreview {
  id: string;
  role?: string;
  url: string;
}

export interface BoardGenerateInputSummary {
  promptPreview: string | null;
  referenceCount: number;
  referencePreviews: BoardGenerateReferencePreview[];
}

interface GenerateBoardNodeProps {
  inputSummary?: BoardGenerateInputSummary;
  node: GenerateNode;
  onExecute: () => void;
  onUpdate: (input: BoardGenerateNodeUpdate) => void;
  references: ReferenceImageRef[];
}

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

export default function GenerateBoardNode({ inputSummary, node, onExecute, onUpdate, references }: GenerateBoardNodeProps) {
  const isProcessing = node.status === "processing";
  const promptPreview = inputSummary?.promptPreview ?? null;
  const referenceCount = inputSummary?.referenceCount ?? 0;
  const referencePreviews = inputSummary?.referencePreviews ?? [];
  const steps = statusSteps(node.status);
  const paramSummary = node.kind === "image-generate"
    ? `${node.model} / ${node.imageResolution === "custom" ? node.customImageResolution : node.imageResolution} / x${node.variantCount}`
    : `${node.model} / ${node.aspectRatio}${node.videoDuration ? ` / ${node.videoDuration}s` : ""} / x${node.variantCount}`;
  const handleApplyPromptTemplate = (template: PromptTemplate, mode: PromptTemplateApplyMode): void => {
    onUpdate({ prompt: applyPromptTemplateText(node.prompt, template.positivePrompt, mode) });
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <div className="relative min-h-0 flex-1 overflow-visible">
        <BoardPromptTextarea
          value={promptPreview ?? node.prompt}
          onChange={(prompt) => onUpdate({ prompt })}
          references={references}
          readOnly={promptPreview !== null}
          headerRight={promptPreview === null ? <PromptTemplatePicker compact onApply={handleApplyPromptTemplate} /> : undefined}
          className={`nodrag nowheel h-full w-full resize-none rounded-md imagine-board-input p-2 pr-20 text-xs leading-5 outline-none placeholder:text-[var(--iw-faint)] focus:border-[var(--iw-border)] ${
            promptPreview !== null ? "cursor-default opacity-85" : ""
          }`}
          placeholder={promptPreview !== null ? "已连接 Prompt 节点，请在提示节点编辑" : "可直接写提示词，输入 @ 引用参考图"}
        />
      </div>
      {(promptPreview !== null || referenceCount > 0) && (
        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {promptPreview !== null && (
              <span className="imagine-meta-chip rounded-md border border-teal-400/20 bg-teal-500/10 px-2 py-1 text-[10px] font-semibold text-[var(--iw-text)]">
                Prompt 输入
              </span>
            )}
            {referenceCount > 0 && (
              <span className="imagine-meta-chip rounded-md border border-blue-400/20 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-[var(--iw-text)]">
                参考 {referenceCount}
              </span>
            )}
          </div>
          {referencePreviews.length > 0 && (
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
          )}
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
        <span className={`imagine-status-chip truncate text-[10px] font-mono ${node.status === "failed" ? "text-red-300" : "text-[var(--iw-muted)]"}`} data-status={node.status}>
          {node.errorMessage ?? `${statusText(node)} / ${paramSummary}`}
        </span>
        <div className="nodrag flex h-8 overflow-hidden rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]" title="变体数量">
          {variantCountOptions.map(count => (
            <button
              key={count}
              type="button"
              onClick={() => onUpdate({ variantCount: count })}
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
        <button
          type="button"
          onClick={onExecute}
          disabled={isProcessing}
          className="nodrag flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
        >
          {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : node.kind === "image-generate" ? <ImagePlus className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
          <Play className="h-3 w-3" />
        </button>
      </div>
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
