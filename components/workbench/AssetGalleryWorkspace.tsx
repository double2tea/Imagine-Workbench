import { ChevronLeft, ChevronRight, Image as ImageIcon, Music, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import AssetCard from "@/components/assets/AssetCard";
import AssetSelectionBar from "@/components/assets/AssetSelectionBar";
import AssetToolbar, { type AssetDatePreset, type AssetStatusFilter, type AssetTypeFilter } from "@/components/assets/AssetToolbar";
import ComparePanel, { type CompareViewType } from "@/components/assets/ComparePanel";
import PreviewImage from "@/components/PreviewImage";
import { getGenerationReferenceMedia, type StorageItem } from "@/lib/db";
import type { AiProvider } from "@/lib/providers/model-catalog";
import type { CapturedVideoFrame } from "@/lib/video-frame";
import type { ImageEditFeature } from "@/hooks/useImageEditFeatureModels";

interface AssetGalleryWorkspaceProps {
  assetDateEnd: string;
  assetDatePreset: AssetDatePreset;
  assetDateStart: string;
  assetModelFilter: string;
  assetStatusFilter: AssetStatusFilter;
  cancelingItemIdSet: ReadonlySet<string>;
  compareItemIdSet: ReadonlySet<string>;
  compareItemIds: string[];
  compareItems: { first?: StorageItem; second?: StorageItem };
  compareSliderPos: number;
  compareViewType: CompareViewType;
  filterType: AssetTypeFilter;
  filteredItems: StorageItem[];
  inFlightCount: number;
  itemsCount: number;
  dateOptions: Array<{ value: string; label: string; count: number }>;
  modelOptions: string[];
  retryableFailedCount: number;
  searchQuery: string;
  selectedCount: number;
  selectedItemIdSet: ReadonlySet<string>;
  selectedProvider: AiProvider;
  statusCounts: Record<StorageItem["status"], number>;
  statusUniverseCount: number;
  typeCounts: Record<StorageItem["type"], number>;
  typeUniverseCount: number;
  isCompareMode: boolean;
  initialVisibleItems?: number;
  onApplyVideoReference: (item: StorageItem) => void;
  onBatchDelete: () => void;
  onBatchDownloadZip: () => void;
  onCancelItem: (item: StorageItem) => void;
  onCaptureVideoFrame: (item: StorageItem, frame: CapturedVideoFrame) => void | Promise<unknown>;
  onClearSelection: () => void;
  onDeleteItem: (item: StorageItem) => void;
  onDeleteItemsByStatus: (statuses: StorageItem["status"][]) => void;
  onDownloadItem: (item: StorageItem) => void;
  onExportMetadata: () => void;
  onImageQuickEdit: (item: StorageItem, operation: ImageEditFeature) => void;
  onAddToLibrary: (item: StorageItem) => void;
  onOpenFullscreen: (item: StorageItem) => void;
  onOpenPanorama: (item: StorageItem) => void;
  onOpenSettings?: () => void;
  onPromoteOriginal: (item: StorageItem) => void;
  onResetCompare: () => void;
  onRetryFailed: () => void;
  onRetryItem: (item: StorageItem) => void;
  onReuseTask: (item: StorageItem) => void;
  onSaveVoiceProfile: (item: StorageItem) => void;
  onSetAssetDateEnd: (value: string) => void;
  onSetAssetDatePreset: (value: AssetDatePreset) => void;
  onSetAssetDateStart: (value: string) => void;
  onSetAssetModelFilter: (value: string) => void;
  onSetAssetStatusFilter: (value: AssetStatusFilter) => void;
  onSetCompareSliderPos: (value: number) => void;
  onSetCompareViewType: (value: CompareViewType) => void;
  onSetFilterType: (value: AssetTypeFilter) => void;
  onSetSearchQuery: (value: string) => void;
  onToggleCompare: (id: string) => void;
  onToggleSelect: (id: string, event?: { shiftKey?: boolean }) => void;
  onUseAgentReference: (item: StorageItem) => void;
  visibleItemsStep?: number;
  formatModelLabel: (value: string, fallbackProvider: AiProvider) => string;
  providerLabelsByKey?: Partial<Record<AiProvider, string>>;
}

const DEFAULT_VISIBLE_ITEMS = 48;

export default function AssetGalleryWorkspace({
  assetDateEnd,
  assetDatePreset,
  assetDateStart,
  assetModelFilter,
  assetStatusFilter,
  cancelingItemIdSet,
  compareItemIdSet,
  compareItemIds,
  compareItems,
  compareSliderPos,
  compareViewType,
  filterType,
  filteredItems,
  inFlightCount,
  itemsCount,
  dateOptions,
  modelOptions,
  retryableFailedCount,
  searchQuery,
  selectedCount,
  selectedItemIdSet,
  selectedProvider,
  statusCounts,
  statusUniverseCount,
  typeCounts,
  typeUniverseCount,
  isCompareMode,
  initialVisibleItems = DEFAULT_VISIBLE_ITEMS,
  onApplyVideoReference,
  onBatchDelete,
  onBatchDownloadZip,
  onCancelItem,
  onCaptureVideoFrame,
  onClearSelection,
  onDeleteItem,
  onDeleteItemsByStatus,
  onDownloadItem,
  onExportMetadata,
  onImageQuickEdit,
  onAddToLibrary,
  onOpenFullscreen,
  onOpenPanorama,
  onOpenSettings,
  onPromoteOriginal,
  onResetCompare,
  onRetryFailed,
  onRetryItem,
  onReuseTask,
  onSaveVoiceProfile,
  onSetAssetDateEnd,
  onSetAssetDatePreset,
  onSetAssetDateStart,
  onSetAssetModelFilter,
  onSetAssetStatusFilter,
  onSetCompareSliderPos,
  onSetCompareViewType,
  onSetFilterType,
  onSetSearchQuery,
  onToggleCompare,
  onToggleSelect,
  onUseAgentReference,
  visibleItemsStep = initialVisibleItems,
  formatModelLabel,
  providerLabelsByKey,
}: AssetGalleryWorkspaceProps) {
  const { t } = useTranslations("common");
  const [referencePreview, setReferencePreview] = useState<{ itemId: string; index: number } | null>(null);
  const [visibleItemState, setVisibleItemState] = useState<{ filterKey: string; limit: number }>({
    filterKey: "",
    limit: initialVisibleItems,
  });
  const filterKey = `${filterType}|${assetStatusFilter}|${assetModelFilter}|${assetDatePreset}|${assetDateStart}|${assetDateEnd}|${searchQuery}`;
  const visibleItemLimit = visibleItemState.filterKey === filterKey ? visibleItemState.limit : initialVisibleItems;
  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleItemLimit),
    [filteredItems, visibleItemLimit],
  );
  const priorityItemIdSet = useMemo(
    () => new Set(visibleItems.slice(0, 6).map(item => item.id)),
    [visibleItems],
  );
  const hasMoreItems = visibleItemLimit < filteredItems.length;
  const referencePreviewItem = useMemo(
    () => filteredItems.find(item => item.id === referencePreview?.itemId),
    [filteredItems, referencePreview?.itemId],
  );
  const referencePreviewMedia = getGenerationReferenceMedia(referencePreviewItem?.generationRequest);
  const referencePreviewIndex =
    referencePreview && referencePreviewMedia.length > 0
      ? Math.min(referencePreview.index, referencePreviewMedia.length - 1)
      : 0;
  const selectedReferencePreview = referencePreviewMedia[referencePreviewIndex];
  const hasMultipleReferencePreviews = referencePreviewMedia.length > 1;
  const showPreviousReference = () => {
    setReferencePreview(current => {
      if (!current || referencePreviewMedia.length === 0) return current;
      return { ...current, index: (referencePreviewIndex - 1 + referencePreviewMedia.length) % referencePreviewMedia.length };
    });
  };
  const showNextReference = () => {
    setReferencePreview(current => {
      if (!current || referencePreviewMedia.length === 0) return current;
      return { ...current, index: (referencePreviewIndex + 1) % referencePreviewMedia.length };
    });
  };

  const groupedItems = useMemo(() => {
    const groups = new Map<string, StorageItem[]>();
    for (const item of visibleItems) {
      const date = new Date(item.createdAt);
      const dateKey = Number.isFinite(date.getTime())
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
        : "unknown";
      const current = groups.get(dateKey) ?? [];
      current.push(item);
      groups.set(dateKey, current);
    }
    return Array.from(groups)
      .map(([dateKey, groupItems]) => ({
        dateKey,
        label: dateKey === "unknown" ? t("gallery.unknownDate") : dateKey,
        items: groupItems,
      }))
      .sort((a, b) => {
        if (a.dateKey === "unknown") return 1;
        if (b.dateKey === "unknown") return -1;
        return b.dateKey.localeCompare(a.dateKey);
      });
  }, [visibleItems]);
  useEffect(() => {
    if (assetStatusFilter !== "processing" && assetStatusFilter !== "pending") {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `.imagine-gallery-scroll [data-asset-id][data-status="${assetStatusFilter}"]`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [assetStatusFilter, filteredItems.length]);

  return (
    <section className="imagine-gallery-panel flex min-w-0 flex-col gap-3">
      <div className="imagine-gallery-toolbar-sticky">
      <AssetToolbar
        showGalleryHeader
        inFlightCount={inFlightCount}
        assetDateEnd={assetDateEnd}
        assetDatePreset={assetDatePreset}
        assetDateStart={assetDateStart}
        assetModelFilter={assetModelFilter}
        assetStatusFilter={assetStatusFilter}
        dateOptions={dateOptions}
        filterType={filterType}
        itemsCount={itemsCount}
        modelOptions={modelOptions}
        retryableFailedCount={retryableFailedCount}
        searchQuery={searchQuery}
        selectedProvider={selectedProvider}
        statusCounts={statusCounts}
        statusUniverseCount={statusUniverseCount}
        typeCounts={typeCounts}
        typeUniverseCount={typeUniverseCount}
        deleteItemsByStatus={onDeleteItemsByStatus}
        exportMetadataJson={onExportMetadata}
        formatModelLabel={formatModelLabel}
        onRetryFailed={onRetryFailed}
        setAssetDateEnd={onSetAssetDateEnd}
        setAssetDatePreset={onSetAssetDatePreset}
        setAssetDateStart={onSetAssetDateStart}
        setAssetModelFilter={onSetAssetModelFilter}
        setAssetStatusFilter={onSetAssetStatusFilter}
        setFilterType={onSetFilterType}
        setSearchQuery={onSetSearchQuery}
      />
      </div>

      <AssetSelectionBar
        selectedCount={selectedCount}
        onClear={onClearSelection}
        onDelete={onBatchDelete}
        onDownloadZip={onBatchDownloadZip}
      />

      {isCompareMode && (
        <ComparePanel
          compareItemIds={compareItemIds}
          first={compareItems.first}
          second={compareItems.second}
          sliderPos={compareSliderPos}
          viewType={compareViewType}
          onReset={onResetCompare}
          onSliderPosChange={onSetCompareSliderPos}
          onViewTypeChange={onSetCompareViewType}
        />
      )}

      <div className="imagine-gallery-scroll min-h-[calc(100vh-360px)]">
        {filteredItems.length === 0 ? (
          <div className="imagine-gallery-empty flex min-h-[calc(100vh-390px)] flex-col items-center justify-center rounded-xl p-8 text-center">
            <div className="imagine-gallery-empty-icon">
              <ImageIcon className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-semibold text-[var(--iw-text)]">{t("gallery.emptyTitle")}</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--iw-muted)]">
              {t("gallery.emptyDescription")}
            </p>
            <div className="imagine-gallery-empty-steps">
              <div className="imagine-gallery-empty-step">
                <span className="imagine-gallery-empty-step-index">1</span>
                <span>{t("gallery.step1")}</span>
              </div>
              <div className="imagine-gallery-empty-step">
                <span className="imagine-gallery-empty-step-index">2</span>
                <span>{t("gallery.step2")}</span>
              </div>
              <div className="imagine-gallery-empty-step">
                <span className="imagine-gallery-empty-step-index">3</span>
                <span>{t("gallery.step3")}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groupedItems.map(group => (
                <section key={group.dateKey} className="imagine-gallery-date-group">
                  <div className="imagine-gallery-date-divider">
                    <span>{group.label}</span>
                    <span className="imagine-meta-chip font-mono text-[10px]">{t("gallery.itemCount", { count: group.items.length })}</span>
                  </div>

                  <div className="imagine-gallery-grid grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((item) => (
                      <AssetCard
                        key={item.id}
                        canceling={cancelingItemIdSet.has(item.id)}
                        inCompare={compareItemIdSet.has(item.id)}
                        item={item}
                        priority={priorityItemIdSet.has(item.id)}
                        selected={selectedItemIdSet.has(item.id)}
                        selectedProvider={selectedProvider}
                        providerLabelsByKey={providerLabelsByKey}
                        onApplyVideoReference={onApplyVideoReference}
                        onCancel={onCancelItem}
                        onCaptureVideoFrame={onCaptureVideoFrame}
                        onDelete={onDeleteItem}
                        onDownload={onDownloadItem}
                        onImageQuickEdit={onImageQuickEdit}
                        onAddToLibrary={onAddToLibrary}
                        onOpenFullscreen={onOpenFullscreen}
                        onOpenPanorama={onOpenPanorama}
                        onOpenSettings={onOpenSettings}
                        onPromoteOriginal={onPromoteOriginal}
                        onOpenReferencePreview={(previewItem, index) => setReferencePreview({ itemId: previewItem.id, index })}
                        onRetry={onRetryItem}
                        onReuseTask={onReuseTask}
                        onSaveVoiceProfile={onSaveVoiceProfile}
                        onToggleCompare={onToggleCompare}
                        onToggleSelect={onToggleSelect}
                        onUseAgentReference={onUseAgentReference}
                      />
                    ))}
                  </div>
                </section>
            ))}

            {hasMoreItems && (
              <button
                type="button"
                onClick={() =>
                  setVisibleItemState({
                    filterKey,
                    limit: Math.min(visibleItemLimit + visibleItemsStep, filteredItems.length),
                  })
                }
                className="imagine-secondary-action mx-auto mb-2 rounded-lg border px-4 py-2 text-xs font-semibold transition"
              >
                {t("gallery.loadMore", { current: Math.min(visibleItemLimit, filteredItems.length), total: filteredItems.length })}
              </button>
            )}
          </div>
        )}
      </div>

      {selectedReferencePreview && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--iw-bg)]/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            aria-label={t("gallery.closeReferencePreview")}
            onClick={() => setReferencePreview(null)}
          />
          <div className="relative flex max-h-[92vh] w-[min(1200px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-white/10 bg-[var(--iw-panel)] shadow-2xl">
            <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
              <span className="font-mono text-[10px] text-[var(--iw-muted)]">
                {referencePreviewIndex + 1} / {referencePreviewMedia.length}
              </span>
              <button
                type="button"
                onClick={() => setReferencePreview(null)}
                className="rounded-lg border border-white/10 bg-[var(--iw-panel)]/80 p-2 text-[var(--iw-text)] transition hover:bg-[var(--iw-panel-soft)]"
                aria-label={t("gallery.closeReferencePreview")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
              {hasMultipleReferencePreviews && (
                <button
                  type="button"
                  onClick={showPreviousReference}
                  className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[var(--iw-bg)]/75 text-[var(--iw-text)] transition hover:bg-[var(--iw-panel)]"
                  aria-label={t("gallery.previousReference")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {selectedReferencePreview.type === "image" ? (
                <PreviewImage
                  src={selectedReferencePreview.url}
                  alt={t("gallery.referenceImageAlt", { index: referencePreviewIndex + 1 })}
                  className="max-h-[72vh] w-full object-contain"
                />
              ) : selectedReferencePreview.type === "video" ? (
                <video src={selectedReferencePreview.url} controls className="max-h-[72vh] w-full object-contain" />
              ) : (
                <div className="flex min-h-60 w-full flex-col items-center justify-center gap-3 text-[var(--iw-tone-neutral-text)]">
                  <Music className="h-9 w-9" />
                  <audio src={selectedReferencePreview.url} controls className="w-full max-w-lg" />
                </div>
              )}
              {hasMultipleReferencePreviews && (
                <button
                  type="button"
                  onClick={showNextReference}
                  className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[var(--iw-bg)]/75 text-[var(--iw-text)] transition hover:bg-[var(--iw-panel)]"
                  aria-label={t("gallery.nextReference")}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-white/10 bg-[var(--iw-bg)] p-3">
              {referencePreviewMedia.map((reference, index) => (
                <button
                  key={`${referencePreviewItem?.id ?? "reference"}_${index}`}
                  type="button"
                  onClick={() => setReferencePreview(current => current ? { ...current, index } : current)}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-[var(--iw-panel-soft)] transition ${
                    index === referencePreviewIndex
                      ? "border-cyan-300 ring-2 ring-cyan-300/30"
                      : "border-white/10 opacity-65 hover:opacity-100"
                  }`}
                  aria-label={`${t("gallery.viewReference")} ${index + 1}`}
                >
                  {reference.type === "image" ? (
                    <PreviewImage src={reference.url} alt={t("gallery.referenceImageAlt", { index: index + 1 })} className="h-full w-full object-cover" />
                  ) : reference.type === "video" ? (
                    <video src={reference.url} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <Music className="m-auto h-full w-4 text-[var(--iw-muted)]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
