import { Loader2, X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import type { StorageItem } from "@/lib/db";
import { gsap, prefersReducedWorkbenchMotion, useGSAP, WORKBENCH_GSAP_EASE } from "@/lib/workbench-gsap";

interface BoardMediaNodeShellProps {
  actionBar: ReactNode;
  activeStackAssetId: string;
  children: ReactNode;
  isSelected: boolean;
  onCancelProcessing?: () => void;
  processingLabel?: string;
  onSelectStackAsset?: (assetId: string) => void;
  progress?: number;
  stackItems: ReadonlyArray<Pick<StorageItem, "id">>;
  status?: StorageItem["status"];
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export default function BoardMediaNodeShell({
  actionBar,
  activeStackAssetId,
  children,
  isSelected,
  onCancelProcessing,
  processingLabel = "编辑处理中",
  onSelectStackAsset,
  progress = 0,
  stackItems,
  status,
}: BoardMediaNodeShellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousStatusRef = useRef<StorageItem["status"] | undefined>(undefined);
  const hasStackSwitcher = stackItems.length > 1;
  const isProcessing = status === "pending" || status === "processing";
  const isFailed = status === "failed";
  const progressValue = clampProgress(progress);
  const statusTitle = isFailed
    ? "编辑失败"
    : status === "pending"
      ? "任务已排队"
      : `${processingLabel} ${progressValue}%`;

  useGSAP(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;
    if (
      prefersReducedWorkbenchMotion() ||
      status !== "complete" ||
      (previousStatus !== "pending" && previousStatus !== "processing")
    ) {
      return;
    }

    gsap.timeline({ defaults: { ease: WORKBENCH_GSAP_EASE } })
      .fromTo(
        ".board-media-commit-surface",
        { filter: "saturate(0.86) brightness(0.92)", scale: 0.985 },
        { filter: "saturate(1) brightness(1)", scale: 1, duration: 0.36 },
        0,
      )
      .fromTo(
        ".board-media-commit-flash",
        { opacity: 0 },
        { opacity: 0.72, duration: 0.14, repeat: 1, yoyo: true },
        0,
      );
  }, { dependencies: [status], scope: containerRef });

  return (
    <div ref={containerRef} className="board-media-node group/board-video relative h-full min-h-0 overflow-visible">
      {actionBar}
      <div className="board-media-commit-surface imagine-motion-media-reveal relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
        <span className="board-media-commit-flash pointer-events-none absolute inset-0 z-30 opacity-0" />
        {hasStackSwitcher && (
          <div className="board-media-stack-badge pointer-events-none absolute right-2 top-2 z-30 rounded-md bg-slate-950/45 px-2 py-1 text-xs font-semibold text-white/90 opacity-80 shadow-lg backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100">
            {stackItems.length}
          </div>
        )}
        <div className={`h-full w-full transition duration-300 ${isProcessing ? "scale-[1.03] opacity-70 blur-sm saturate-75" : ""}`}>
          {children}
        </div>
        {(isProcessing || isFailed) && (
          <div className="board-media-processing-visual pointer-events-none absolute inset-0 z-40 text-white">
            {isProcessing && <span className="board-media-processing-dots absolute inset-0" />}
            <div className="absolute inset-0 flex items-center justify-center p-3">
              <div className="board-media-processing-pill imagine-motion-panel-reveal flex max-w-[calc(100%-24px)] items-center gap-2 rounded-full border border-white/15 bg-black/32 px-3 py-1.5 text-[11px] font-semibold text-white/90 shadow-lg backdrop-blur-md">
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <X className="h-3.5 w-3.5 shrink-0 text-rose-200" />}
                <span className="truncate">{statusTitle}</span>
              </div>
            </div>
            <div className="absolute inset-x-3 bottom-3 h-1 overflow-hidden rounded-full bg-white/18">
              <div
                className={`h-full rounded-full transition-[width] ${isFailed ? "bg-rose-400" : "bg-sky-300 shadow-[0_0_16px_rgba(125,211,252,0.55)]"}`}
                style={{ width: `${isFailed ? 100 : Math.max(8, progressValue)}%` }}
              />
            </div>
            {isProcessing && onCancelProcessing ? (
              <button
                type="button"
                className="imagine-motion-interactive nodrag pointer-events-auto absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/18 bg-black/28 text-white/80 shadow-lg backdrop-blur transition hover:border-rose-300/50 hover:bg-rose-500/80 hover:text-white"
                title="取消图片编辑任务"
                aria-label="取消图片编辑任务"
                onClick={(event) => {
                  event.stopPropagation();
                  onCancelProcessing();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        )}
      </div>
      {hasStackSwitcher && (
        <div
          data-visible={isSelected ? "true" : "false"}
          className={[
            "board-media-stack-switcher nodrag absolute -bottom-8 left-1/2 z-40 flex gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold shadow-xl backdrop-blur transition-opacity duration-200",
            isSelected
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0 group-hover/board-video:pointer-events-auto group-hover/board-video:opacity-100",
          ].join(" ")}
        >
          {stackItems.map((stackItem, index) => {
            const isActive = stackItem.id === activeStackAssetId;
            return (
              <button
                key={stackItem.id}
                type="button"
                data-active={isActive ? "true" : "false"}
                className="board-media-stack-option imagine-motion-interactive nodrag flex h-5 min-w-5 items-center justify-center rounded-full px-1"
                title={`版本 ${index + 1}`}
                aria-label={`切换到版本 ${index + 1}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!isActive) onSelectStackAsset?.(stackItem.id);
                }}
              >
                {isSelected ? index + 1 : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
