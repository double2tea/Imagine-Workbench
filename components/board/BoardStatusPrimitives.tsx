import { AlertTriangle, CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { GenerationTaskStatus } from "@/lib/generation-tasks";
import { t } from "@/lib/i18n";

type BoardStatusTone = "complete" | "failed" | "canceled" | "pending" | "processing" | "neutral";

const iconClassName = "h-3.5 w-3.5";

export function boardStatusLabel(status: GenerationTaskStatus): string {
  return t(`statusLabels.${status}`);
}

function statusTone(status: GenerationTaskStatus): BoardStatusTone {
  if (status === "processing") return "processing";
  if (status === "pending") return "pending";
  if (status === "failed") return "failed";
  if (status === "canceled") return "canceled";
  return "complete";
}

export function BoardStatusIcon({ status }: { status: GenerationTaskStatus }) {
  if (status === "processing") return <Loader2 className={`imagine-tone-icon ${iconClassName} animate-spin`} data-tone="processing" />;
  if (status === "pending") return <Clock3 className={`imagine-tone-icon ${iconClassName}`} data-tone="pending" />;
  if (status === "failed") return <AlertTriangle className={`imagine-tone-icon ${iconClassName}`} data-tone="failed" />;
  if (status === "canceled") return <XCircle className={`${iconClassName} text-[var(--iw-faint)]`} />;
  return <CheckCircle2 className={`imagine-tone-icon ${iconClassName}`} data-tone="complete" />;
}

export function BoardStatusBadge({
  children,
  className = "",
  status,
}: {
  children?: ReactNode;
  className?: string;
  status: GenerationTaskStatus;
}) {
  return (
    <span
      className={`imagine-board-status-badge shrink-0 ${className}`}
      data-tone={statusTone(status)}
      title={boardStatusLabel(status)}
    >
      {children ?? boardStatusLabel(status)}
    </span>
  );
}

export function BoardTaskProgressBar({
  progress,
  status,
}: {
  progress: number;
  status: GenerationTaskStatus;
}) {
  const statusLabel = boardStatusLabel(status);
  return (
    <div
      aria-label={statusLabel}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={progress}
      aria-valuetext={`${statusLabel} ${progress}%`}
      className="imagine-board-task-progress"
      role="progressbar"
    >
      <div className="imagine-board-task-progress-fill" data-tone={statusTone(status)} style={{ width: `${progress}%` }} />
    </div>
  );
}

export function BoardTaskActionButton({
  children,
  tone = "neutral",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "danger" | "neutral";
}) {
  return (
    <button
      {...props}
      className={`imagine-board-task-action ${props.className ?? ""}`}
      data-tone={tone}
    >
      {children}
    </button>
  );
}
