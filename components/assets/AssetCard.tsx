import {
  CheckSquare,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  Music,
  RefreshCw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import AudioWaveformPreview from "@/components/audio/AudioWaveformPreview";
import VideoFrameMenu from "@/components/assets/VideoFrameMenu";
import VideoAssetPlayer, { type VideoFrameCaptureRequest } from "@/components/assets/VideoAssetPlayer";
import PreviewImage from "@/components/PreviewImage";
import { makeReferenceDropToken, REFERENCE_ASSET_MIME } from "@/components/reference/referenceDrag";
import { getGenerationReferenceMedia, type StorageItem } from "@/lib/db";
import { imageQuickEditProcessingTitleFromPrompt } from "@/lib/image-quick-edit-targets";
import { mediaReferenceLabel } from "@/lib/media-references";
import { formatDisplayedAspectRatio } from "@/lib/media-display";
import { tryParseProviderModel, type AiProvider } from "@/lib/providers/model-catalog";
import { getProviderMeta } from "@/lib/providers/registry";
import { transcriptFromDataUrl } from "@/lib/transcripts";
import type { CapturedVideoFrame, VideoFrameCaptureMode } from "@/lib/video-frame";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";
import { useTranslations } from "@/lib/i18n";
import {
  IMAGE_EDIT_OPERATION_ORDER,
  WORKBENCH_OPERATION_META,
  WorkbenchActionButton,
  WorkbenchOperationIcon,
  WorkbenchPopoverMenu,
  WorkbenchPopoverMenuItem,
  type WorkbenchActionDescriptor,
  WorkbenchActionStrip,
  imageEditOperationMeta,
  operationToneClassName,
  workbenchCardActionClassName,
} from "@/components/workbench/OperationControls";

type AssetSelectionEvent = { shiftKey?: boolean };

interface AssetCardProps {
  canceling: boolean;
  inCompare: boolean;
  item: StorageItem;
  priority?: boolean;
  selected: boolean;
  selectedProvider: AiProvider;
  onApplyVideoReference: (item: StorageItem) => void;
  onCancel: (item: StorageItem) => void;
  onCaptureVideoFrame: (item: StorageItem, frame: CapturedVideoFrame) => void | Promise<unknown>;
  onDelete: (item: StorageItem) => void;
  onDownload: (item: StorageItem) => void;
  onImageQuickEdit: (item: StorageItem, operation: ImageEditFeature) => void;
  onAddToLibrary: (item: StorageItem) => void;
  onOpenFullscreen: (item: StorageItem) => void;
  onOpenPanorama: (item: StorageItem) => void;
  onPromoteOriginal: (item: StorageItem) => void;
  onOpenReferencePreview: (item: StorageItem, index: number) => void;
  onRetry: (item: StorageItem) => void;
  onReuseTask: (item: StorageItem) => void;
  onSaveVoiceProfile: (item: StorageItem) => void;
  onToggleCompare: (id: string) => void;
  onToggleSelect: (id: string, event?: AssetSelectionEvent) => void;
  onUseAgentReference: (item: StorageItem) => void;
  providerLabelsByKey?: Partial<Record<AiProvider, string>>;
}

function formatModelName(model: string): string {
  return model.replace("-preview", "").replace("lite-", "").replace("-generate", "").replace("imagen-", "Imagen");
}

function isContentSafetyError(message?: string): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("image_unsafe") ||
    normalized.includes("content blocked") ||
    normalized.includes("generated images appear to be unsafe")
  );
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

type FrameMenuPlacement = "hover";

function processingTitle(
  item: StorageItem,
  t: ReturnType<typeof useTranslations>["t"],
  creationT: ReturnType<typeof useTranslations>["t"],
): string {
  const quickEditTitle = item.type === "image" ? imageQuickEditProcessingTitleFromPrompt(item.prompt, creationT) : null;
  if (quickEditTitle) return quickEditTitle;
  if (item.type === "video") return t("processingTitles.video");
  if (item.type === "audio") return t("processingTitles.audio");
  if (item.type === "transcript") return t("processingTitles.transcript");
  return t("processingTitles.image");
}

function AudioProcessingWaveform() {
  return (
    <div className="mt-3 flex h-12 w-full max-w-44 items-center gap-1.5 rounded-lg border border-[var(--iw-tone-info-border)] bg-[var(--iw-tone-info-bg)] px-3">
      {Array.from({ length: 18 }).map((_, index) => (
        <span
          key={index}
          className="w-1 rounded-full bg-cyan-300/45"
          style={{ height: `${18 + ((index * 7) % 28)}px` }}
        />
      ))}
    </div>
  );
}

export default function AssetCard({
  canceling,
  inCompare,
  item,
  priority = false,
  selected,
  selectedProvider,
  onApplyVideoReference,
  onCancel,
  onCaptureVideoFrame,
  onDelete,
  onDownload,
  onImageQuickEdit,
  onAddToLibrary,
  onOpenFullscreen,
  onOpenPanorama,
  onPromoteOriginal,
  onOpenReferencePreview,
  onRetry,
  onReuseTask,
  onSaveVoiceProfile,
  onToggleCompare,
  onToggleSelect,
  onUseAgentReference,
  providerLabelsByKey,
}: AssetCardProps) {
  const { t } = useTranslations("common");
  const { t: creationT } = useTranslations("creation");
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);
  const [isQuickEditMenuOpen, setIsQuickEditMenuOpen] = useState(false);
  const [frameMenuPlacement, setFrameMenuPlacement] = useState<FrameMenuPlacement | null>(null);
  const captureVideoFrameRef = useRef<VideoFrameCaptureRequest | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const provider = tryParseProviderModel(item.model, selectedProvider)?.provider ?? selectedProvider;
  const providerLabel = providerLabelsByKey?.[provider] ?? getProviderMeta(provider).label;
  const isDraggableReference = item.status === "complete" && item.type !== "transcript";
  const failedTitle = isContentSafetyError(item.errorMessage) ? t("failedTitles.contentSafety") : t("failedTitles.default");
  const referenceMedia = getGenerationReferenceMedia(item.generationRequest);
  const transcriptText = item.type === "transcript" ? transcriptFromDataUrl(item.url) : "";
  const canAddToLibrary = item.status === "complete" && (item.type === "image" || item.type === "video" || item.type === "audio");

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (!isDraggableReference) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(REFERENCE_ASSET_MIME, JSON.stringify({ id: item.id, type: item.type, url: item.url }));
    event.dataTransfer.setData("text/plain", makeReferenceDropToken(item.id));
  };

  const runMobileAction = (action: () => void) => {
    setIsMobileActionsOpen(false);
    setIsQuickEditMenuOpen(false);
    action();
  };

  const captureVideoFrame = (mode: VideoFrameCaptureMode) => {
    setFrameMenuPlacement(null);
    void captureVideoFrameRef.current?.(mode);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };

  useEffect(() => {
    if (selected && item.status === "complete") onPromoteOriginal(item);
  }, [item, onPromoteOriginal, selected]);

  useEffect(() => clearLongPressTimer, []);

  const imageHoverActions: WorkbenchActionDescriptor[] = item.type === "image"
    ? [
        {
          icon: <WorkbenchOperationIcon operation="panorama" className="h-3 w-3" />,
          id: "panorama",
          label: "360",
          onClick: () => onOpenPanorama(item),
          title: WORKBENCH_OPERATION_META.panorama.title,
          tone: WORKBENCH_OPERATION_META.panorama.tone,
        },
        {
          ariaLabel: t("assetCard.toVideo"),
          icon: <WorkbenchOperationIcon operation="imageToVideo" className="h-3 w-3" />,
          id: "image-to-video",
          label: WORKBENCH_OPERATION_META.imageToVideo.label,
          onClick: () => onApplyVideoReference(item),
          title: t("assetCard.toVideo"),
          tone: WORKBENCH_OPERATION_META.imageToVideo.tone,
        },
        {
          ariaLabel: t("assetCard.referenceLabel"),
          icon: <AgentIdentityMark variant="inline" />,
          id: "agent-reference",
          label: "Agent",
          onClick: () => onUseAgentReference(item),
          title: t("assetCard.referenceLabel"),
          tone: WORKBENCH_OPERATION_META.analyze.tone,
        },
      ]
    : [];

  const sharedHoverActions: WorkbenchActionDescriptor[] = [
    {
      ariaLabel: t("buttons.reuseParams"),
      icon: <WorkbenchOperationIcon operation="reuse" className="h-3 w-3" />,
      id: "reuse",
      label: WORKBENCH_OPERATION_META.reuse.label,
      onClick: () => onReuseTask(item),
      title: t("buttons.reuseParams"),
      tone: WORKBENCH_OPERATION_META.reuse.tone,
    },
    ...(item.type === "audio" && item.status === "complete"
      ? [
          {
            ariaLabel: t("assetCard.voiceProfile"),
            icon: <WorkbenchOperationIcon operation="voice" className="h-3 w-3" />,
            id: "voice-profile",
            label: WORKBENCH_OPERATION_META.voice.label,
            onClick: () => onSaveVoiceProfile(item),
            title: WORKBENCH_OPERATION_META.voice.title,
            tone: WORKBENCH_OPERATION_META.voice.tone,
          },
        ]
      : []),
    {
      ariaLabel: t("buttons.download"),
      icon: <WorkbenchOperationIcon operation="download" className="h-3 w-3" />,
      id: "download",
      label: WORKBENCH_OPERATION_META.download.label,
      onClick: () => onDownload(item),
      title: t("buttons.download"),
      tone: WORKBENCH_OPERATION_META.download.tone,
    },
    ...(canAddToLibrary
      ? [
          {
            ariaLabel: t("library.useThisAsset"),
            icon: <WorkbenchOperationIcon operation="library" className="h-3 w-3" />,
            id: "library",
            label: WORKBENCH_OPERATION_META.library.label,
            onClick: () => onAddToLibrary(item),
            title: WORKBENCH_OPERATION_META.library.title,
            tone: WORKBENCH_OPERATION_META.library.tone,
          },
        ]
      : []),
    {
      ariaLabel: t("assetCard.fullscreen"),
      icon: <WorkbenchOperationIcon operation="fullscreen" className="h-3 w-3" />,
      id: "fullscreen",
      onClick: () => onOpenFullscreen(item),
      title: t("assetCard.fullscreen"),
      tone: WORKBENCH_OPERATION_META.fullscreen.tone,
    },
    ...(item.type !== "transcript"
      ? [
          {
            active: inCompare,
            ariaLabel: inCompare ? t("assetCard.cancelCompare") : t("assetCard.compare"),
            icon: <WorkbenchOperationIcon operation="compare" className="h-3 w-3" />,
            id: "compare",
            label: WORKBENCH_OPERATION_META.compare.label,
            onClick: () => onToggleCompare(item.id),
            title: t("assetCard.compare"),
            tone: WORKBENCH_OPERATION_META.compare.tone,
          },
        ]
      : []),
    {
      ariaLabel: t("assetCard.delete"),
      icon: <WorkbenchOperationIcon operation="delete" className="h-3 w-3" />,
      id: "delete",
      onClick: () => onDelete(item),
      title: t("assetCard.delete"),
      tone: WORKBENCH_OPERATION_META.delete.tone,
    },
  ];
  const assetTypeBadge = item.type === "image" ? (
    <span className="imagine-asset-type-badge flex shrink-0 items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-blue-500/80 backdrop-blur-md text-white border border-blue-400/25">
      <ImageIcon className="h-3 w-3" />
      IMAGE
    </span>
  ) : item.type === "video" ? (
    <span className="imagine-asset-type-badge flex shrink-0 items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded bg-purple-500/80 backdrop-blur-md text-white border border-purple-400/25">
      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
      VIDEO
    </span>
  ) : item.type === "audio" ? (
    <span className="imagine-asset-type-badge imagine-audio-type-badge flex shrink-0 items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded border border-white/12 bg-slate-950/46 text-slate-100 backdrop-blur-md">
      <Music className="h-3 w-3" />
      AUDIO
    </span>
  ) : (
    <span className="imagine-asset-type-badge flex shrink-0 items-center gap-1.5 px-2 py-1 text-[9px] font-bold tracking-wider uppercase rounded border border-cyan-400/20 bg-cyan-500/18 text-cyan-100 backdrop-blur-md">
      <FileText className="h-3 w-3" />
      TEXT
    </span>
  );
  const handleCardClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button,a,input,select,textarea,[role='button']")) return;
    event.preventDefault();
    event.stopPropagation();
    onToggleSelect(item.id, event);
  };
  const handleCardPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button,a,input,select,textarea,[role='button']")) return;
    clearLongPressTimer();
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      suppressNextClickRef.current = true;
      longPressTimerRef.current = null;
      longPressStartRef.current = null;
      onToggleSelect(item.id);
    }, 460);
  };
  const handleCardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = longPressStartRef.current;
    if (!start) return;
    if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) clearLongPressTimer();
  };

  return (
    <div
      draggable={isDraggableReference}
      data-asset-id={item.id}
      data-selected={selected ? "true" : "false"}
      data-status={item.status}
      data-type={item.type}
      onDragStart={handleDragStart}
      onClickCapture={handleCardClickCapture}
      onPointerCancel={clearLongPressTimer}
      onPointerDown={handleCardPointerDown}
      onPointerLeave={clearLongPressTimer}
      onPointerMove={handleCardPointerMove}
      onPointerUp={clearLongPressTimer}
      className={`imagine-asset-card relative flex h-full flex-col overflow-hidden rounded-xl group border bg-slate-900 shadow-xl transition-all duration-300 ${
        selected ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-850 hover:border-slate-750"
      }`}
    >
      {item.status === "complete" && (
        <div className="imagine-asset-controlbar flex items-start gap-2">
          <div
            className="imagine-card-actions-shell min-w-0 flex-1"
            data-popover-open={frameMenuPlacement === "hover" ? "true" : "false"}
          >
            <WorkbenchActionStrip className="justify-start">
              {item.type === "video" && (
                <VideoFrameMenu
                  buttonClassName={workbenchCardActionClassName(WORKBENCH_OPERATION_META.frame.tone)}
                  isOpen={frameMenuPlacement === "hover"}
                  onSelect={captureVideoFrame}
                  onToggle={() => setFrameMenuPlacement(prev => prev === "hover" ? null : "hover")}
                  placement="below"
                />
              )}

              {sharedHoverActions.map(action => <WorkbenchActionButton key={action.id} action={action} />)}

              {imageHoverActions.map(action => <WorkbenchActionButton key={action.id} action={action} />)}

            </WorkbenchActionStrip>
          </div>

          {item.type === "image" && (
            <div className="imagine-asset-quick-edit-anchor relative shrink-0">
              <button
                type="button"
                onClick={() => setIsQuickEditMenuOpen(prev => !prev)}
                className={workbenchCardActionClassName(WORKBENCH_OPERATION_META.brush.tone)}
                title={t("assetCard.quickEditButton")}
                aria-label={t("assetCard.quickEditAriaLabel")}
                aria-expanded={isQuickEditMenuOpen}
              >
                <Sparkles className="h-3 w-3" />
                <span className="text-[9px] font-bold">AI</span>
                <ChevronDown className={`h-3 w-3 transition ${isQuickEditMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {isQuickEditMenuOpen && (
                <WorkbenchPopoverMenu align="right" placement="below">
                  {IMAGE_EDIT_OPERATION_ORDER.map(operation => {
                    const action = imageEditOperationMeta(operation, creationT);
                    const Icon = action.Icon;
                    return (
                      <WorkbenchPopoverMenuItem
                        key={operation}
                        onClick={() => {
                          setIsQuickEditMenuOpen(false);
                          onImageQuickEdit(item, operation);
                        }}
                        icon={<Icon className="h-3.5 w-3.5" />}
                        iconClassName={operationToneClassName(action.tone)}
                        title={action.title}
                      >
                        {action.label}
                      </WorkbenchPopoverMenuItem>
                    );
                  })}
                </WorkbenchPopoverMenu>
              )}
            </div>
          )}

          {assetTypeBadge}
        </div>
      )}

      <div className="imagine-asset-media relative aspect-[4/3] w-full bg-slate-950 overflow-hidden flex items-center justify-center border-b border-white/5">
        {item.status === "processing" || item.status === "pending" ? (
          <div className="imagine-generation-stage overflow-hidden">
            <span className="imagine-generation-stage-glow" aria-hidden />
            <div className="imagine-generation-stage-icon">
              <RefreshCw className="h-4 w-4 animate-spin text-[var(--iw-tone-violet-text)]" />
            </div>
            <p className="imagine-generation-stage-title">
              {item.status === "pending" ? t("processingTitles.pending") : processingTitle(item, t, creationT)}
            </p>
            <span className="imagine-generation-stage-meta">{t("assetCard.modelLabel")} {formatModelName(item.model)}</span>
            <span className="imagine-generation-stage-state">
              {item.status === "pending" ? t("assetCard.waitingExecution") : t("assetCard.generating")}
            </span>
            {item.type === "audio" && <AudioProcessingWaveform />}
            <button
              type="button"
              onClick={() => onCancel(item)}
              disabled={canceling}
              className="imagine-danger-action relative z-10 mt-3 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55"
              title={item.operationName?.startsWith("12ai:video:") ? t("assetCard.cancelProcessing12ai") : t("assetCard.cancelLocalWait")}
            >
              <X className="h-3 w-3" />
              {canceling ? t("assetCard.canceling") : t("buttons.cancelTask")}
            </button>
          </div>
        ) : item.status === "failed" ? (
          <div className="imagine-asset-failed-stage select-none text-[var(--iw-tone-danger-text)]">
            <X className="mb-2 h-6 w-6 shrink-0 text-[var(--iw-tone-danger-text)]" />
            <p className="text-xs font-semibold leading-5 text-[var(--iw-text)]">{failedTitle}</p>
            <p className="mt-1 line-clamp-2 max-w-full break-words text-[10px] leading-4 text-[var(--iw-muted)]">
              {item.errorMessage ?? t("failedTitles.checkApiKey")}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onRetry(item)}
                data-size="compact"
                className="imagine-primary-action flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold"
              >
                <RefreshCw className="h-3 w-3" />
                {t("assetCard.retry")}
              </button>
              <button
                type="button"
                onClick={() => onReuseTask(item)}
                data-size="compact"
                className="imagine-secondary-action flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold"
              >
                <WorkbenchOperationIcon operation="reuse" className="h-3 w-3" />
                {t("assetCard.reuseParams")}
              </button>
            </div>
          </div>
        ) : (
          <div className="relative flex h-full w-full items-center justify-center bg-slate-950">
            {item.type === "image" ? (
              <PreviewImage
                src={item.url}
                alt={item.prompt}
                className="h-full w-full cursor-pointer object-contain transition duration-500"
                fetchPriority={priority ? "high" : "auto"}
                loading={priority ? "eager" : "lazy"}
                onClick={() => onOpenFullscreen(item)}
              />
            ) : item.type === "video" ? (
              <VideoAssetPlayer
                item={item}
                onCaptureFrame={onCaptureVideoFrame}
                onCaptureFrameRequestReady={request => {
                  captureVideoFrameRef.current = request;
                }}
              />
            ) : item.type === "audio" ? (
              <div className="flex h-full w-full items-center justify-center p-3">
                <AudioWaveformPreview src={item.url} size="compact" tone="media" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenFullscreen(item)}
                className="flex h-full w-full cursor-pointer flex-col items-start justify-start gap-3 p-4 text-left"
              >
                <FileText className="h-5 w-5 shrink-0 text-[var(--iw-tone-info-text)]" />
                <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-5 text-slate-200">
                  {transcriptText || t("assetCard.noTranscriptText")}
                </p>
              </button>
            )}

            <button
              type="button"
              className="imagine-mobile-action-trigger hidden"
              aria-expanded={isMobileActionsOpen}
              aria-label={t("assetCard.openMobileActions")}
              onClick={() => setIsMobileActionsOpen(prev => !prev)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {isMobileActionsOpen && (
              <div className="imagine-mobile-action-sheet">
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                  <span className="imagine-mobile-action-sheet-title text-[11px] font-semibold">{t("assetCard.mobileActionsTitle")}</span>
                  <button
                    type="button"
                    onClick={() => setIsMobileActionsOpen(false)}
                    className="imagine-mobile-action-sheet-close rounded-md p-1"
                    aria-label={t("assetCard.mobileCloseActions")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 p-2">
                  <button type="button" onClick={() => runMobileAction(() => onToggleSelect(item.id))}>
                    {selected ? <CheckSquare className="imagine-tone-icon h-3.5 w-3.5" data-tone="accent" /> : <Square className="h-3.5 w-3.5 text-slate-300" />}
                    {selected ? t("assetCard.cancelSelect") : t("assetCard.select")}
                  </button>
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onApplyVideoReference(item))}>
                      <WorkbenchOperationIcon operation="imageToVideo" className="imagine-tone-icon h-3.5 w-3.5" />
                      {t("assetCard.toVideo")}
                    </button>
                  )}
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onUseAgentReference(item))}>
                      <AgentIdentityMark variant="inline" />
                      Agent
                    </button>
                  )}
                  {item.type === "image" && (
                    <button type="button" onClick={() => runMobileAction(() => onOpenPanorama(item))}>
                      <WorkbenchOperationIcon operation="panorama" className="imagine-tone-icon h-3.5 w-3.5" />
                      {t("assetCard.panorama")}
                    </button>
                  )}
                  {item.type === "image" && IMAGE_EDIT_OPERATION_ORDER.map(operation => {
                    const meta = imageEditOperationMeta(operation, creationT);
                    const Icon = meta.Icon;
                    return (
                      <button key={operation} type="button" onClick={() => runMobileAction(() => onImageQuickEdit(item, operation))}>
                        <Icon className={`h-3.5 w-3.5 ${operationToneClassName(meta.tone)}`} />
                        {meta.label}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => runMobileAction(() => onDownload(item))}>
                    <WorkbenchOperationIcon operation="download" className="imagine-tone-icon h-3.5 w-3.5" />
                    {t("assetCard.download")}
                  </button>
                  <button type="button" onClick={() => runMobileAction(() => onReuseTask(item))}>
                    <WorkbenchOperationIcon operation="reuse" className="imagine-tone-icon h-3.5 w-3.5" />
                    {t("buttons.reuse")}
                  </button>
                  {canAddToLibrary && (
                    <button type="button" onClick={() => runMobileAction(() => onAddToLibrary(item))}>
                      <WorkbenchOperationIcon operation="library" className="imagine-tone-icon h-3.5 w-3.5" />
                      {WORKBENCH_OPERATION_META.library.label}
                    </button>
                  )}
                  {item.type !== "transcript" && (
                    <button type="button" onClick={() => runMobileAction(() => onToggleCompare(item.id))}>
                      <WorkbenchOperationIcon operation="compare" className="imagine-tone-icon h-3.5 w-3.5" />
                      {inCompare ? t("assetCard.cancelCompare") : t("assetCard.compare")}
                    </button>
                  )}
                  <button type="button" onClick={() => runMobileAction(() => onOpenFullscreen(item))}>
                    <WorkbenchOperationIcon operation="fullscreen" className="h-3.5 w-3.5 text-slate-300" />
                    {t("assetCard.fullscreen")}
                  </button>
                  <button type="button" onClick={() => runMobileAction(() => onDelete(item))}>
                    <WorkbenchOperationIcon operation="delete" className="imagine-tone-icon h-3.5 w-3.5" />
                    {t("assetCard.delete")}
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      <div className="imagine-asset-meta flex min-h-[88px] flex-col gap-1 bg-[var(--iw-panel-solid)] p-2">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-sans text-[11px] font-medium text-[var(--iw-text)] opacity-90" title={item.prompt}>
            {item.prompt}
          </p>
          {referenceMedia.length > 0 && (
            <div className="flex shrink-0 items-center gap-1">
              <span className="font-mono text-[10px] text-[var(--iw-faint)]">{t("assetCard.referenceLabel")}</span>
              <div className="no-scrollbar flex max-w-[96px] gap-1 overflow-x-auto">
                {referenceMedia.map((reference, index) => {
                  const mediaType = reference.type;
                  return (
                    <button
                      type="button"
                      key={`${item.id}_reference_${index}`}
                      onClick={() => onOpenReferencePreview(item, index)}
                      className="relative h-7 w-7 overflow-hidden rounded-md border border-white/10 bg-slate-950 transition hover:border-cyan-300/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                      title={t("assetCard.referencePreviewTooltip", { type: mediaReferenceLabel(mediaType), index: index + 1 })}
                    >
                      {mediaType === "image" ? (
                        <PreviewImage src={reference.url} alt={t("assetCard.referenceImageAlt", { index: index + 1 })} className="h-full w-full object-cover" />
                      ) : mediaType === "video" ? (
                        <video src={reference.url} muted preload="metadata" className="h-full w-full object-cover" />
                      ) : (
                        <Music className="m-auto h-full w-3.5 text-slate-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-end border-t border-[var(--iw-border)] pt-1.5">
          <div className="flex max-h-10 flex-wrap items-center gap-1 overflow-hidden font-mono text-[10px] text-[var(--iw-faint)]">
            <span className="imagine-meta-chip rounded bg-white/5 px-1.5 py-0.5">
              {providerLabel}
            </span>
            <span className="imagine-meta-chip max-w-[150px] truncate rounded bg-white/5 px-1.5 py-0.5" title={item.model}>
              🤖 {formatModelName(item.model)}
            </span>
            <span className="imagine-meta-chip rounded bg-white/5 px-1.5 py-0.5">📐 {formatDisplayedAspectRatio(item)}</span>
            <span className="imagine-meta-chip imagine-status-chip rounded bg-white/5 px-1.5 py-0.5">{item.status}</span>
            {item.errorMessage && (
              <span className="imagine-tone-chip max-w-[160px] truncate rounded px-2 py-0.5 text-[10px]" data-tone="danger" title={item.errorMessage}>
                last error: {item.errorMessage}
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] text-[var(--iw-faint)]">
              {formatCreatedAt(item.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
