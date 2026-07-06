import { Image as ImageIcon, Layers, Loader2, Music, Video, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import PreviewImage from "@/components/PreviewImage";
import type { StorageItem } from "@/lib/db";
import { gsap, prefersReducedWorkbenchMotion, useGSAP, WORKBENCH_GSAP_EASE } from "@/lib/workbench-gsap";
import { useTranslations } from "@/lib/i18n";

type BoardMediaStackItem = Pick<StorageItem, "id" | "type" | "url">;

interface BoardMediaNodeShellProps {
  actionBar: ReactNode;
  activeStackAssetId: string;
  children: ReactNode;
  isBatchSelectionActive?: boolean;
  isSelected: boolean;
  isUnviewed?: boolean;
  onDoubleClick?: () => void;
  onCancelProcessing?: () => void;
  processingLabel?: string;
  onSelectStackAsset?: (assetId: string) => void;
  stackItems: ReadonlyArray<BoardMediaStackItem>;
  status?: StorageItem["status"];
  statusLabel?: string;
}

function stackItemPreviewImageUrl(item: BoardMediaStackItem): string {
  if (item.type === "image") return item.url;
  if (item.type === "video" && item.url.startsWith("data:image/")) return item.url;
  return "";
}

function stackItemFallbackIcon(item: BoardMediaStackItem) {
  if (item.type === "image") return ImageIcon;
  if (item.type === "video") return Video;
  return Music;
}

export default function BoardMediaNodeShell({
  actionBar,
  activeStackAssetId,
  children,
  isBatchSelectionActive = false,
  isSelected,
  isUnviewed = false,
  onDoubleClick,
  onCancelProcessing,
  processingLabel,
  onSelectStackAsset,
  stackItems,
  status,
  statusLabel,
}: BoardMediaNodeShellProps) {
  const { t } = useTranslations("board");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousStatusRef = useRef<StorageItem["status"] | undefined>(undefined);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [isStackExpanded, setIsStackExpanded] = useState(false);
  const hasStackSwitcher = stackItems.length > 1;
  const shouldShowNodeControls = !isBatchSelectionActive;
  const shouldMountActionBar = shouldShowNodeControls && (isSelected || isHovered || hasFocusWithin);
  const shouldShowStackControls = shouldShowNodeControls && hasStackSwitcher;
  const isProcessing = status === "pending" || status === "processing";
  const isFailed = status === "failed";
  const visualStatus = isFailed ? "failed" : isProcessing ? "processing" : status === "complete" ? "complete" : "idle";
  const statusTitle = isFailed
    ? statusLabel ?? t('mediaNode.taskFailed')
    : status === "pending"
      ? t('mediaNode.taskQueued')
      : processingLabel ?? t('mediaNode.processing');

  useEffect(() => {
    if (!shouldShowStackControls || (!isSelected && !isHovered && !hasFocusWithin)) setIsStackExpanded(false);
  }, [hasFocusWithin, isHovered, isSelected, shouldShowStackControls]);

  const handleSelectStackAsset = (assetId: string) => {
    onSelectStackAsset?.(assetId);
    setIsStackExpanded(false);
  };

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
    <div
      onDoubleClick={onDoubleClick}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        setHasFocusWithin(false);
      }}
      onFocus={() => setHasFocusWithin(true)}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      ref={containerRef}
      className="board-media-node group/board-video relative h-full min-h-0 overflow-visible"
      data-has-stack={hasStackSwitcher ? "true" : "false"}
      data-selected={isSelected ? "true" : "false"}
      data-status={visualStatus}
      data-unviewed={isUnviewed && visualStatus === "complete" ? "true" : "false"}
    >
      {shouldMountActionBar ? (
        <>
          <div
            aria-hidden="true"
            className="nodrag nopan pointer-events-auto absolute bottom-full left-0 right-0 z-20 h-12"
            onDoubleClick={event => event.stopPropagation()}
            onPointerDown={event => event.stopPropagation()}
          />
          {actionBar}
        </>
      ) : null}
      <div className="board-media-commit-surface imagine-motion-media-reveal relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--iw-panel-soft)]">
        <span className="board-media-commit-flash pointer-events-none absolute inset-0 z-30 opacity-0" />
        {shouldShowStackControls && (
          <button
            type="button"
            aria-expanded={isStackExpanded}
            aria-label={isStackExpanded ? t('mediaNode.collapseVersions') : t('mediaNode.expandVersions')}
            className="board-media-stack-badge imagine-motion-interactive nodrag pointer-events-auto absolute right-2 top-2 z-30 flex items-center gap-1 rounded-md border border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-surface-raised)_45%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--iw-text)] opacity-80 backdrop-blur transition-opacity duration-200 group-hover/board-video:opacity-100"
            data-expanded={isStackExpanded ? "true" : "false"}
            title={isStackExpanded ? t('mediaNode.collapseVersions') : t('mediaNode.expandVersions')}
            onClick={(event) => {
              event.stopPropagation();
              setIsStackExpanded(current => !current);
            }}
            onDoubleClick={event => event.stopPropagation()}
            onPointerDown={event => event.stopPropagation()}
          >
            <Layers className="h-3 w-3" />
            {stackItems.length}
          </button>
        )}
        <div className={`h-full w-full transition duration-300 ${isProcessing ? "scale-[1.03] opacity-70 blur-sm saturate-75" : ""}`}>
          {children}
        </div>
        {(isProcessing || isFailed) && (
          <div className="board-media-processing-visual pointer-events-none absolute inset-0 z-40">
            {isProcessing && (
              <>
                <span className="board-media-processing-wash absolute inset-0" />
                <span className="board-media-processing-sheen absolute inset-y-0 w-1/3" />
              </>
            )}
            <div className="absolute inset-0 flex items-center justify-center p-3">
              <div className="board-media-processing-pill imagine-motion-panel-reveal flex max-w-[calc(100%-24px)] items-center gap-2 rounded-full border border-white/15 bg-black/32 px-3 py-1.5 text-[11px] font-semibold text-white/90 shadow-lg backdrop-blur-md">
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <X className="h-3.5 w-3.5 shrink-0 text-[var(--iw-tone-danger-text)]" />}
                <span className="truncate">{statusTitle}</span>
              </div>
            </div>
            {isProcessing && onCancelProcessing && shouldShowNodeControls ? (
              <button
                type="button"
                className="imagine-motion-interactive nodrag pointer-events-auto absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/18 bg-black/28 text-white/80 shadow-lg backdrop-blur transition hover:border-rose-300/50 hover:bg-rose-500/80 hover:text-white"
                title={t('mediaNode.cancelEditTask')}
                aria-label={t('mediaNode.cancelEditTask')}
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
      {shouldShowStackControls && isStackExpanded && (
        <div
          aria-label={t('mediaNode.versions')}
          className="board-media-stack-panel nodrag nopan absolute bottom-full right-0 z-50 mb-2 rounded-xl p-1.5 shadow-xl backdrop-blur"
          onDoubleClick={event => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setIsStackExpanded(false);
            }
          }}
          onPointerDown={event => event.stopPropagation()}
          role="group"
        >
          <div className="board-media-stack-panel-header flex items-center justify-between gap-3 px-1 pb-1">
            <span className="truncate text-[10px] font-semibold">{t('mediaNode.versions')}</span>
            <span className="board-media-stack-panel-count flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
              {stackItems.length}
            </span>
          </div>
          <div className="board-media-stack-panel-grid grid gap-1.5" role="listbox">
            {stackItems.map((stackItem, index) => {
              const isActive = stackItem.id === activeStackAssetId;
              const previewUrl = stackItemPreviewImageUrl(stackItem);
              const FallbackIcon = stackItemFallbackIcon(stackItem);
              return (
                <button
                  key={stackItem.id}
                  type="button"
                  aria-label={t('mediaNode.switchVersion', { index: index + 1 })}
                  aria-selected={isActive}
                  className="board-media-stack-card imagine-motion-interactive relative flex aspect-[4/3] min-h-11 items-center justify-center overflow-hidden rounded-lg"
                  data-active={isActive ? "true" : "false"}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSelectStackAsset(stackItem.id);
                  }}
                  role="option"
                  title={t('mediaNode.version', { index: index + 1 })}
                >
                  {previewUrl ? (
                    <PreviewImage
                      src={previewUrl}
                      alt={t('mediaNode.version', { index: index + 1 })}
                      draggable={false}
                      loading="eager"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <FallbackIcon className="h-5 w-5 opacity-70" />
                  )}
                  <span className="board-media-stack-card-index absolute bottom-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                    {index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {shouldShowStackControls && (
        <div
          data-visible={isSelected ? "true" : "false"}
          className={[
            "board-media-stack-switcher nodrag absolute -bottom-7 left-1/2 z-40 flex gap-1 rounded-full px-1.5 py-1 text-[10px] font-semibold shadow-md backdrop-blur transition-opacity duration-200",
            isSelected
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0 group-hover/board-video:pointer-events-auto group-hover/board-video:opacity-100",
          ].join(" ")}
          onDoubleClick={event => event.stopPropagation()}
        >
          {stackItems.map((stackItem, index) => {
            const isActive = stackItem.id === activeStackAssetId;
            return (
              <button
                key={stackItem.id}
                type="button"
                data-active={isActive ? "true" : "false"}
                className="board-media-stack-option imagine-motion-interactive nodrag flex h-5 min-w-5 items-center justify-center rounded-full px-1"
                title={t('mediaNode.version', { index: index + 1 })}
                aria-label={t('mediaNode.switchVersion', { index: index + 1 })}
                onClick={(event) => {
                  event.stopPropagation();
                  handleSelectStackAsset(stackItem.id);
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
