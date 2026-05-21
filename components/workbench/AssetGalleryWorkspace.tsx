import { Image as ImageIcon } from "lucide-react";
import AssetCard from "@/components/assets/AssetCard";
import AssetSelectionBar from "@/components/assets/AssetSelectionBar";
import AssetToolbar, { type AssetStatusFilter, type AssetTypeFilter } from "@/components/assets/AssetToolbar";
import ComparePanel, { type CompareViewType } from "@/components/assets/ComparePanel";
import type { StorageItem } from "@/lib/db";
import type { AiProvider } from "@/lib/providers/model-catalog";

interface AssetGalleryWorkspaceProps {
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
  modelOptions: string[];
  searchQuery: string;
  selectedCount: number;
  selectedItemIdSet: ReadonlySet<string>;
  selectedProvider: AiProvider;
  statusCounts: Record<StorageItem["status"], number>;
  typeCounts: Record<StorageItem["type"], number>;
  isCompareMode: boolean;
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
  onSetAssetModelFilter: (value: string) => void;
  onSetAssetStatusFilter: (value: AssetStatusFilter) => void;
  onSetCompareSliderPos: (value: number) => void;
  onSetCompareViewType: (value: CompareViewType) => void;
  onSetFilterType: (value: AssetTypeFilter) => void;
  onSetSearchQuery: (value: string) => void;
  onToggleCompare: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onUseAgentReference: (item: StorageItem) => void;
  formatModelLabel: (value: string, fallbackProvider: AiProvider) => string;
}

export default function AssetGalleryWorkspace({
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
  modelOptions,
  searchQuery,
  selectedCount,
  selectedItemIdSet,
  selectedProvider,
  statusCounts,
  typeCounts,
  isCompareMode,
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
  onSetAssetModelFilter,
  onSetAssetStatusFilter,
  onSetCompareSliderPos,
  onSetCompareViewType,
  onSetFilterType,
  onSetSearchQuery,
  onToggleCompare,
  onToggleSelect,
  onUseAgentReference,
  formatModelLabel,
}: AssetGalleryWorkspaceProps) {
  return (
    <section className="imagine-gallery-panel flex min-w-0 flex-col gap-4">
      <AssetToolbar
        assetModelFilter={assetModelFilter}
        assetStatusFilter={assetStatusFilter}
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
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-600">在左侧写下创意设想并生成，文件将实时存档至本地 IndexedDB。</p>
          </div>
        ) : (
          <div className="imagine-gallery-grid grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <AssetCard
                key={item.id}
                canceling={cancelingItemIdSet.has(item.id)}
                inCompare={compareItemIdSet.has(item.id)}
                item={item}
                selected={selectedItemIdSet.has(item.id)}
                selectedProvider={selectedProvider}
                onApplyVideoReference={onApplyVideoReference}
                onCancel={onCancelItem}
                onDelete={onDeleteItem}
                onDownload={onDownloadItem}
                onLaunchMaskEditor={onLaunchMaskEditor}
                onOpenFullscreen={onOpenFullscreen}
                onRetry={onRetryItem}
                onToggleCompare={onToggleCompare}
                onToggleSelect={onToggleSelect}
                onUseAgentReference={onUseAgentReference}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
