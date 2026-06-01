import { ChevronDown, ChevronLeft, ChevronRight, Image as ImageIcon, X } from "lucide-react";
import { useMemo, useState } from "react";
import AssetCard from "@/components/assets/AssetCard";
import AssetSelectionBar from "@/components/assets/AssetSelectionBar";
import AssetToolbar, { type AssetDatePreset, type AssetStatusFilter, type AssetTypeFilter } from "@/components/assets/AssetToolbar";
import ComparePanel, { type CompareViewType } from "@/components/assets/ComparePanel";
import PreviewImage from "@/components/PreviewImage";
import type { StorageItem } from "@/lib/db";
import type { AiProvider } from "@/lib/providers/model-catalog";

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
  itemsCount: number;
  dateOptions: Array<{ value: string; label: string; count: number }>;
  modelOptions: string[];
  searchQuery: string;
  selectedCount: number;
  selectedItemIdSet: ReadonlySet<string>;
  selectedProvider: AiProvider;
  statusCounts: Record<StorageItem["status"], number>;
  typeCounts: Record<StorageItem["type"], number>;
  isCompareMode: boolean;
  initialVisibleItems?: number;
  onApplyVideoReference: (item: StorageItem) => void;
  onBatchDelete: () => void;
  onBatchDownloadZip: () => void;
  onCancelItem: (item: StorageItem) => void;
  onClearSelection: () => void;
  onDeleteItem: (item: StorageItem) => void;
  onDeleteItemsByStatus: (statuses: StorageItem["status"][]) => void;
  onDownloadItem: (item: StorageItem) => void;
  onExportMetadata: () => void;
  onLaunchMaskEditor: (imageUrl: string, id: string) => void;
  onOpenFullscreen: (item: StorageItem) => void;
  onResetCompare: () => void;
  onRetryItem: (item: StorageItem) => void;
  onReuseTask: (item: StorageItem) => void;
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
  onToggleSelect: (id: string) => void;
  onUseAgentReference: (item: StorageItem) => void;
  visibleItemsStep?: number;
  formatModelLabel: (value: string, fallbackProvider: AiProvider) => string;
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
  itemsCount,
  dateOptions,
  modelOptions,
  searchQuery,
  selectedCount,
  selectedItemIdSet,
  selectedProvider,
  statusCounts,
  typeCounts,
  isCompareMode,
  initialVisibleItems = DEFAULT_VISIBLE_ITEMS,
  onApplyVideoReference,
  onBatchDelete,
  onBatchDownloadZip,
  onCancelItem,
  onClearSelection,
  onDeleteItem,
  onDeleteItemsByStatus,
  onDownloadItem,
  onExportMetadata,
  onLaunchMaskEditor,
  onOpenFullscreen,
  onResetCompare,
  onRetryItem,
  onReuseTask,
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
}: AssetGalleryWorkspaceProps) {
  const [referencePreview, setReferencePreview] = useState<{ itemId: string; index: number } | null>(null);
  const [collapsedDateKeys, setCollapsedDateKeys] = useState<Set<string>>(() => new Set());
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
  const referencePreviewUrls = referencePreviewItem?.generationRequest?.referenceImages ?? [];
  const referencePreviewIndex =
    referencePreview && referencePreviewUrls.length > 0
      ? Math.min(referencePreview.index, referencePreviewUrls.length - 1)
      : 0;
  const referencePreviewUrl = referencePreviewUrls[referencePreviewIndex];
  const hasMultipleReferencePreviews = referencePreviewUrls.length > 1;
  const showPreviousReference = () => {
    setReferencePreview(current => {
      if (!current || referencePreviewUrls.length === 0) return current;
      return { ...current, index: (referencePreviewIndex - 1 + referencePreviewUrls.length) % referencePreviewUrls.length };
    });
  };
  const showNextReference = () => {
    setReferencePreview(current => {
      if (!current || referencePreviewUrls.length === 0) return current;
      return { ...current, index: (referencePreviewIndex + 1) % referencePreviewUrls.length };
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
        label: dateKey === "unknown" ? "未知日期" : dateKey,
        items: groupItems,
      }))
      .sort((a, b) => {
        if (a.dateKey === "unknown") return 1;
        if (b.dateKey === "unknown") return -1;
        return b.dateKey.localeCompare(a.dateKey);
      });
  }, [visibleItems]);
  const toggleDateGroup = (dateKey: string) => {
    setCollapsedDateKeys(current => {
      const next = new Set(current);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  return (
    <section className="imagine-gallery-panel flex min-w-0 flex-col gap-4">
      <AssetToolbar
        assetDateEnd={assetDateEnd}
        assetDatePreset={assetDatePreset}
        assetDateStart={assetDateStart}
        assetModelFilter={assetModelFilter}
        assetStatusFilter={assetStatusFilter}
        dateOptions={dateOptions}
        filterType={filterType}
        itemsCount={itemsCount}
        modelOptions={modelOptions}
        searchQuery={searchQuery}
        selectedProvider={selectedProvider}
        statusCounts={statusCounts}
        typeCounts={typeCounts}
        deleteItemsByStatus={onDeleteItemsByStatus}
        exportMetadataJson={onExportMetadata}
        formatModelLabel={formatModelLabel}
        setAssetDateEnd={onSetAssetDateEnd}
        setAssetDatePreset={onSetAssetDatePreset}
        setAssetDateStart={onSetAssetDateStart}
        setAssetModelFilter={onSetAssetModelFilter}
        setAssetStatusFilter={onSetAssetStatusFilter}
        setFilterType={onSetFilterType}
        setSearchQuery={onSetSearchQuery}
      />

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
          <div className="imagine-gallery-empty flex min-h-[calc(100vh-390px)] flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/28 p-6 text-center text-slate-500">
            <ImageIcon className="mb-3 h-9 w-9 text-slate-700" />
            <p className="text-sm font-semibold text-slate-400">暂无生成的创意文件</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-600">写下创意设想并生成，文件将实时存档至本地 IndexedDB。</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groupedItems.map(group => {
              const isCollapsed = collapsedDateKeys.has(group.dateKey);
              return (
                <section key={group.dateKey} className="imagine-gallery-date-group rounded-lg border border-slate-800/70 bg-slate-950/18">
                  <button
                    type="button"
                    onClick={() => toggleDateGroup(group.dateKey)}
                    className="flex w-full items-center justify-between gap-3 border-b border-slate-800/70 px-3 py-2.5 text-left"
                    aria-expanded={!isCollapsed}
                  >
                    <span className="flex items-center gap-2">
                      <ChevronDown className={`h-4 w-4 text-slate-500 transition ${isCollapsed ? "-rotate-90" : ""}`} />
                      <span className="text-xs font-semibold text-slate-300">{group.label}</span>
                    </span>
                    <span className="rounded-md bg-slate-900 px-2 py-1 font-mono text-[10px] text-slate-500">{group.items.length} 项</span>
                  </button>

                  {!isCollapsed && (
                    <div className="imagine-gallery-grid grid grid-cols-1 items-stretch gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                      {group.items.map((item) => (
                        <AssetCard
                          key={item.id}
                          canceling={cancelingItemIdSet.has(item.id)}
                          inCompare={compareItemIdSet.has(item.id)}
                          item={item}
                          priority={priorityItemIdSet.has(item.id)}
                          selected={selectedItemIdSet.has(item.id)}
                          selectedProvider={selectedProvider}
                          onApplyVideoReference={onApplyVideoReference}
                          onCancel={onCancelItem}
                          onDelete={onDeleteItem}
                          onDownload={onDownloadItem}
                          onLaunchMaskEditor={onLaunchMaskEditor}
                          onOpenFullscreen={onOpenFullscreen}
                          onOpenReferencePreview={(previewItem, index) => setReferencePreview({ itemId: previewItem.id, index })}
                          onRetry={onRetryItem}
                          onReuseTask={onReuseTask}
                          onToggleCompare={onToggleCompare}
                          onToggleSelect={onToggleSelect}
                          onUseAgentReference={onUseAgentReference}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}

            {hasMoreItems && (
              <button
                type="button"
                onClick={() =>
                  setVisibleItemState({
                    filterKey,
                    limit: Math.min(visibleItemLimit + visibleItemsStep, filteredItems.length),
                  })
                }
                className="mx-auto mb-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-blue-400/45 hover:text-blue-100"
              >
                加载更多 {Math.min(visibleItemLimit, filteredItems.length)} / {filteredItems.length}
              </button>
            )}
          </div>
        )}
      </div>

      {referencePreviewUrl && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-zoom-out"
            aria-label="关闭参考图预览"
            onClick={() => setReferencePreview(null)}
          />
          <div className="relative flex max-h-[92vh] w-[min(1200px,calc(100vw-32px))] flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-2xl">
            <div className="flex h-12 items-center justify-between border-b border-white/10 px-4">
              <span className="font-mono text-xs text-slate-300">
                {referencePreviewIndex + 1} / {referencePreviewUrls.length}
              </span>
              <button
                type="button"
                onClick={() => setReferencePreview(null)}
                className="rounded-lg border border-white/10 bg-slate-900/80 p-2 text-slate-200 transition hover:bg-slate-800"
                aria-label="关闭参考图预览"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
              {hasMultipleReferencePreviews && (
                <button
                  type="button"
                  onClick={showPreviousReference}
                  className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/75 text-slate-100 transition hover:bg-slate-900"
                  aria-label="上一张参考图"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <PreviewImage
                src={referencePreviewUrl}
                alt={`参考图 ${referencePreviewIndex + 1}`}
                className="max-h-[72vh] w-full object-contain"
              />
              {hasMultipleReferencePreviews && (
                <button
                  type="button"
                  onClick={showNextReference}
                  className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-950/75 text-slate-100 transition hover:bg-slate-900"
                  aria-label="下一张参考图"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            <div className="no-scrollbar flex gap-2 overflow-x-auto border-t border-white/10 bg-slate-950 p-3">
              {referencePreviewUrls.map((url, index) => (
                <button
                  key={`${referencePreviewItem?.id ?? "reference"}_${index}`}
                  type="button"
                  onClick={() => setReferencePreview(current => current ? { ...current, index } : current)}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-slate-900 transition ${
                    index === referencePreviewIndex
                      ? "border-cyan-300 ring-2 ring-cyan-300/30"
                      : "border-white/10 opacity-65 hover:opacity-100"
                  }`}
                  aria-label={`查看参考图 ${index + 1}`}
                >
                  <PreviewImage src={url} alt={`参考图 ${index + 1}`} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
