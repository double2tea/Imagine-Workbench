import { Check, Clipboard, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getGenerationReferenceMedia, type StorageItem } from "@/lib/db";
import { formatDisplayedAspectRatio } from "@/lib/media-display";
import { useTranslations } from "@/lib/i18n";

interface GenerationDiagnosticsDrawerProps {
  item: StorageItem;
  onClose: () => void;
}

type CopyState = "idle" | "copied" | "failed";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function referenceSummary(item: StorageItem, t: ReturnType<typeof useTranslations>["t"]): string {
  const references = getGenerationReferenceMedia(item.generationRequest);
  if (references.length === 0) return "0";
  return references
    .map((reference, index) => {
      const role = reference.role
        ? t(`diagnostics.role${reference.role.charAt(0).toUpperCase() + reference.role.slice(1)}`)
        : t("diagnostics.roleReference");
      const type = t(`diagnostics.media${reference.type.charAt(0).toUpperCase() + reference.type.slice(1)}`);
      return `${index + 1}. ${type} / ${role}`;
    })
    .join("\n");
}

function diagnosticRows(item: StorageItem, t: ReturnType<typeof useTranslations>["t"]): Array<{ label: string; value: string }> {
  const request = item.generationRequest;
  return [
    { label: t("diagnostics.labelStatus"), value: t(`diagnostics.status${item.status.charAt(0).toUpperCase() + item.status.slice(1)}`) },
    { label: t("diagnostics.labelMedia"), value: t(`diagnostics.media${item.type.charAt(0).toUpperCase() + item.type.slice(1)}`) },
    { label: t("diagnostics.labelOperation"), value: item.operationName ?? t("diagnostics.operationGenerate") },
    { label: t("diagnostics.labelModel"), value: request?.model ?? item.model },
    { label: t("diagnostics.labelRatio"), value: request?.aspectRatio ?? formatDisplayedAspectRatio(item) },
    { label: t("diagnostics.labelResolution"), value: request?.imageResolution ?? request?.videoResolution ?? "" },
    { label: t("diagnostics.labelQuality"), value: request?.imageQuality ?? "" },
    { label: t("diagnostics.labelDuration"), value: request?.videoDurationSeconds ? `${request.videoDurationSeconds}s` : "" },
    { label: t("diagnostics.labelProgress"), value: `${item.progress}%` },
    { label: t("diagnostics.labelCreatedAt"), value: formatDateTime(item.createdAt) },
  ].filter(row => row.value.trim().length > 0);
}

export default function GenerationDiagnosticsDrawer({ item, onClose }: GenerationDiagnosticsDrawerProps) {
  const { t } = useTranslations("common");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const rows = useMemo(() => diagnosticRows(item, t), [item, t]);
  const copyLabels: Record<CopyState, string> = {
    idle: t("diagnostics.copyDiagnostics"),
    copied: t("diagnostics.copiedDiagnostics"),
    failed: t("diagnostics.copyFailed"),
  };
  const prompt = item.generationRequest?.prompt.trim() || item.prompt.trim();
  const references = getGenerationReferenceMedia(item.generationRequest);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const buildSummary = (): string => {
    const request = item.generationRequest;
    const sbRows = rows;
    const sbPrompt = request?.prompt.trim() || item.prompt.trim();
    const lines = [
      t("diagnostics.summaryTitle"),
      ...sbRows.map(row => `${row.label}: ${row.value}`),
      `${t("diagnostics.labelReferences")}: ${getGenerationReferenceMedia(request).length}`,
    ];
    if (item.errorMessage?.trim()) lines.push(`${t("diagnostics.labelError")}: ${item.errorMessage.trim()}`);
    if (sbPrompt) lines.push(`Prompt: ${sbPrompt}`);
    return lines.join("\n");
  };

  const copySummary = (): void => {
    void navigator.clipboard.writeText(buildSummary()).then(
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
    <div className="absolute inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-bg)_96%,transparent)] text-[var(--iw-text)] shadow-2xl backdrop-blur-xl">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generation-diagnostics-title"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--iw-border)] px-4 py-3">
          <div>
            <h2 id="generation-diagnostics-title" className="text-sm font-semibold text-[var(--iw-text)]">
              {t("diagnostics.title")}
            </h2>
            <p className="mt-0.5 break-all text-[11px] text-[var(--iw-faint)]">{item.id}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="imagine-secondary-action imagine-motion-interactive flex h-8 w-8 items-center justify-center rounded-md border border-[var(--iw-border)]"
            aria-label={t("diagnostics.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--iw-faint)]">{t("diagnostics.requestSummary")}</h3>
            <dl className="overflow-hidden rounded-lg border border-[var(--iw-border)]">
              {rows.map(row => (
                <div key={row.label} className="grid grid-cols-[88px_1fr] border-b border-[color-mix(in_srgb,var(--iw-border)_80%,transparent)] last:border-b-0">
                  <dt className="bg-[color-mix(in_srgb,var(--iw-panel)_80%,transparent)] px-3 py-2 text-[11px] text-[var(--iw-faint)]">{row.label}</dt>
                  <dd className="min-w-0 break-words px-3 py-2 text-xs text-[var(--iw-text)]">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-5 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--iw-faint)]">{t("diagnostics.promptLabel")}</h3>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-panel)_52%,transparent)] p-3 text-xs leading-5 text-[var(--iw-text)]">
              {prompt || t("diagnostics.noPrompt")}
            </p>
          </section>

          <section className="mt-5 space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--iw-faint)]">{t("diagnostics.referenceMedia")}</h3>
            <div className="rounded-lg border border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-panel)_52%,transparent)] p-3 text-xs leading-5 text-[var(--iw-text)]">
              {references.length === 0 ? (
                <p className="text-[var(--iw-faint)]">{t("diagnostics.noReference")}</p>
              ) : (
                <pre className="whitespace-pre-wrap font-sans">{referenceSummary(item, t)}</pre>
              )}
            </div>
          </section>

          {item.errorMessage?.trim() ? (
            <section className="mt-5 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--iw-tone-danger-text)]">{t("diagnostics.failedInfo")}</h3>
              <p className="imagine-tone-surface rounded-lg border p-3 text-xs leading-5" data-tone="danger">
                {item.errorMessage.trim()}
              </p>
            </section>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[var(--iw-border)] px-4 py-3">
          <button
            type="button"
            onClick={copySummary}
            className="imagine-secondary-action imagine-motion-interactive inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--iw-border)] px-3 text-xs font-medium"
          >
            {copyState === "copied" ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            {copyLabels[copyState]}
          </button>
        </div>
      </div>
    </div>
  );
}
