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
  onSelectStackAsset?: (assetId: string) => void;
  progress?: number;
  stackItems: ReadonlyArray<Pick<StorageItem, "id">>;
  status?: StorageItem["status"];
}

export default function BoardMediaNodeShell({
  actionBar,
  activeStackAssetId,
  children,
  isSelected,
  onCancelProcessing,
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
        {children}
        {(isProcessing || isFailed) && (
          <div className="board-media-processing-overlay pointer-events-none absolute inset-0 z-40 flex flex-col justify-end p-3 text-white">
            <div className="board-media-processing-card imagine-motion-panel-reveal rounded-md border border-white/15 bg-slate-950/72 px-3 py-2 shadow-lg backdrop-blur">
              <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
                <span className="flex items-center gap-1.5">
                  {!isFailed && <Loader2 className="h-3 w-3 animate-spin" />}
                  {isFailed ? "编辑失败" : status === "pending" ? "任务已排队" : "编辑处理中"}
                </span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className={`board-media-processing-progress-fill h-full rounded-full ${isFailed ? "bg-rose-400" : "bg-sky-400"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              {isProcessing && onCancelProcessing ? (
                <button
                  type="button"
                  className="imagine-motion-interactive nodrag pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/85 hover:border-rose-300/50 hover:bg-rose-500/80 hover:text-white"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelProcessing();
                  }}
                >
                  <X className="h-3 w-3" />
                  取消任务
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
      {hasStackSwitcher && (
        <div
          className={[
            "board-media-stack-switcher nodrag absolute -bottom-8 left-1/2 z-40 flex -translate-x-1/2 gap-1.5 rounded-full border border-white/10 bg-slate-950/72 px-2.5 py-1.5 text-[10px] font-semibold text-white/90 shadow-xl backdrop-blur transition-opacity duration-200",
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
                className={[
                  "imagine-motion-interactive nodrag flex h-5 min-w-5 items-center justify-center rounded-full px-1",
                  isActive ? "bg-white text-slate-950" : "bg-white/20 text-white/80 hover:bg-white/35 hover:text-white",
                ].join(" ")}
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
