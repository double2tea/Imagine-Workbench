import { Check, Clipboard, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getGenerationReferenceMedia, type StorageItem } from "@/lib/db";
import { formatDisplayedAspectRatio } from "@/lib/media-display";

interface GenerationDiagnosticsDrawerProps {
  item: StorageItem;
  onClose: () => void;
}

type CopyState = "idle" | "copied" | "failed";

const statusLabels: Record<StorageItem["status"], string> = {
  complete: "完成",
  failed: "失败",
  pending: "排队中",
  processing: "生成中",
};

const mediaTypeLabels: Record<StorageItem["type"], string> = {
  audio: "音频",
  image: "图片",
  transcript: "转写文本",
  video: "视频",
};

const referenceRoleLabels: Record<string, string> = {
  end: "尾帧",
  reference: "参考",
  start: "首帧",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function referenceSummary(item: StorageItem): string {
  const references = getGenerationReferenceMedia(item.generationRequest);
  if (references.length === 0) return "0";
  return references
    .map((reference, index) => {
      const role = reference.role ? referenceRoleLabels[reference.role] ?? reference.role : "参考";
      return `${index + 1}. ${reference.type} / ${role}`;
    })
    .join("\n");
}

function diagnosticRows(item: StorageItem): Array<{ label: string; value: string }> {
  const request = item.generationRequest;
  return [
    { label: "状态", value: statusLabels[item.status] },
    { label: "媒体", value: mediaTypeLabels[item.type] },
    { label: "操作", value: item.operationName ?? "生成" },
    { label: "模型", value: request?.model ?? item.model },
    { label: "比例", value: request?.aspectRatio ?? formatDisplayedAspectRatio(item) },
    { label: "分辨率", value: request?.imageResolution ?? request?.videoResolution ?? "" },
    { label: "质量", value: request?.imageQuality ?? "" },
    { label: "时长", value: request?.videoDurationSeconds ? `${request.videoDurationSeconds}s` : "" },
    { label: "进度", value: `${item.progress}%` },
    { label: "创建时间", value: formatDateTime(item.createdAt) },
  ].filter(row => row.value.trim().length > 0);
}

function buildDiagnosticSummary(item: StorageItem): string {
  const request = item.generationRequest;
  const rows = diagnosticRows(item);
  const prompt = request?.prompt.trim() || item.prompt.trim();
  const lines = [
    "Imagine Workbench 生成诊断",
    ...rows.map(row => `${row.label}: ${row.value}`),
    `参考媒体: ${getGenerationReferenceMedia(request).length}`,
  ];
  if (item.errorMessage?.trim()) lines.push(`错误: ${item.errorMessage.trim()}`);
  if (prompt) lines.push(`Prompt: ${prompt}`);
  return lines.join("\n");
}

export default function GenerationDiagnosticsDrawer({ item, onClose }: GenerationDiagnosticsDrawerProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const rows = useMemo(() => diagnosticRows(item), [item]);
  const prompt = item.generationRequest?.prompt.trim() || item.prompt.trim();
  const references = getGenerationReferenceMedia(item.generationRequest);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const copySummary = (): void => {
    void navigator.clipboard.writeText(buildDiagnosticSummary(item)).then(
      () => {
        setCopyState("copied");
        window.setTimeout(() => setCopyState("idle"), 1600);
      },
      () => {
        setCopyState("failed");
        window.setTimeout(() => setCopyState("idle"), 1600);
      },
    );
  };

  return (
    <div className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-slate-800 bg-slate-950/96 text-slate-100 shadow-2xl backdrop-blur-xl">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generation-diagnostics-title"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 id="generation-diagnostics-title" className="text-sm font-semibold text-slate-50">
              生成诊断
            </h2>
            <p className="mt-0.5 break-all text-[11px] text-slate-500">{item.id}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="imagine-motion-interactive flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-white"
            aria-label="关闭生成诊断"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">请求摘要</h3>
            <dl className="overflow-hidden rounded-lg border border-slate-800">
              {rows.map(row => (
                <div key={row.label} className="grid grid-cols-[88px_1fr] border-b border-slate-800/80 last:border-b-0">
                  <dt className="bg-slate-900/80 px-3 py-2 text-[11px] text-slate-500">{row.label}</dt>
                  <dd className="min-w-0 break-words px-3 py-2 text-xs text-slate-200">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-5 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Prompt</h3>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-900/52 p-3 text-xs leading-5 text-slate-200">
              {prompt || "无 prompt 记录"}
            </p>
          </section>

          <section className="mt-5 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">参考媒体</h3>
            <div className="rounded-lg border border-slate-800 bg-slate-900/52 p-3 text-xs leading-5 text-slate-200">
              {references.length === 0 ? (
                <p className="text-slate-500">无参考媒体记录</p>
              ) : (
                <pre className="whitespace-pre-wrap font-sans">{referenceSummary(item)}</pre>
              )}
            </div>
          </section>

          {item.errorMessage?.trim() ? (
            <section className="mt-5 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-300">失败信息</h3>
              <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-3 text-xs leading-5 text-rose-100">
                {item.errorMessage.trim()}
              </p>
            </section>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={copySummary}
            className="imagine-motion-interactive inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-medium text-slate-100 hover:border-slate-500 hover:text-white"
          >
            {copyState === "copied" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            {copyState === "copied" ? "已复制诊断摘要" : copyState === "failed" ? "复制失败" : "复制诊断摘要"}
          </button>
        </div>
      </div>
    </div>
  );
}
