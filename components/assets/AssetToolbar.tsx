import { Search } from "lucide-react";
import type { StorageItem } from "@/lib/db";
import type { AiProvider } from "@/lib/providers/model-catalog";

export type AssetTypeFilter = "all" | "images" | "videos";
export type AssetStatusFilter = "all" | StorageItem["status"];

interface AssetToolbarProps {
  assetModelFilter: string;
  assetStatusFilter: AssetStatusFilter;
  filterType: AssetTypeFilter;
  itemsCount: number;
  modelOptions: string[];
  searchQuery: string;
  selectedProvider: AiProvider;
  statusCounts: Record<StorageItem["status"], number>;
  typeCounts: Record<StorageItem["type"], number>;
  deleteItemsByStatus: (statuses: StorageItem["status"][]) => void;
  exportMetadataJson: () => void;
  formatModelLabel: (value: string, fallbackProvider: AiProvider) => string;
  setAssetModelFilter: (value: string) => void;
  setAssetStatusFilter: (value: AssetStatusFilter) => void;
  setFilterType: (value: AssetTypeFilter) => void;
  setSearchQuery: (value: string) => void;
}

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "images", label: "图片" },
  { value: "videos", label: "视频" },
] as const;

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "pending" },
  { value: "processing", label: "processing" },
  { value: "failed", label: "failed" },
  { value: "complete", label: "complete" },
] as const;

export default function AssetToolbar({
  assetModelFilter,
  assetStatusFilter,
  filterType,
  itemsCount,
  modelOptions,
  searchQuery,
  selectedProvider,
  statusCounts,
  typeCounts,
  deleteItemsByStatus,
  exportMetadataJson,
  formatModelLabel,
  setAssetModelFilter,
  setAssetStatusFilter,
  setFilterType,
  setSearchQuery,
}: AssetToolbarProps) {
  const getTypeCount = (value: AssetTypeFilter): number => {
    if (value === "images") return typeCounts.image;
    if (value === "videos") return typeCounts.video;
    return itemsCount;
  };

  const getStatusCount = (value: AssetStatusFilter): number => {
    if (value === "all") return itemsCount;
    return statusCounts[value];
  };

  return (
    <div className="imagine-toolbar-surface rounded-xl dark-glass p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
            <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500">类型</span>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {TYPE_FILTER_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilterType(option.value)}
                  data-active={filterType === option.value}
                  className={`imagine-filter-chip h-7 rounded-md border px-2.5 text-xs transition focus:outline-none cursor-pointer ${
                    filterType === option.value
                      ? "border-slate-700 bg-slate-800/80 text-slate-100"
                      : "border-transparent text-slate-450 hover:border-slate-800 hover:bg-slate-900/70 hover:text-slate-200"
                  }`}
                >
                  <span>{option.label}</span>
                  <span className="ml-1 font-mono text-[10px] text-slate-500">{getTypeCount(option.value)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
            <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500">状态</span>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {STATUS_FILTER_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAssetStatusFilter(option.value)}
                  data-active={assetStatusFilter === option.value}
                  className={`imagine-filter-chip h-7 rounded-md border px-2.5 font-mono text-[10px] transition focus:outline-none cursor-pointer ${
                    assetStatusFilter === option.value
                      ? "border-slate-700 bg-slate-800/80 text-slate-100"
                      : "border-transparent text-slate-500 hover:border-slate-800 hover:bg-slate-900/70 hover:text-slate-200"
                  }`}
                >
                  <span>{option.label}</span>
                  <span className="ml-1 text-slate-500">{getStatusCount(option.value)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <select
              value={assetModelFilter}
              onChange={(e) => setAssetModelFilter(e.target.value)}
              className="imagine-toolbar-select h-9 min-w-0 rounded-lg border border-slate-800 bg-slate-950/55 px-3 font-mono text-[10px] text-slate-300 transition focus:border-blue-400/35 focus:outline-none"
            >
              <option value="all">全部模型</option>
              {modelOptions.map(model => (
                <option key={model} value={model}>{formatModelLabel(model, selectedProvider)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={exportMetadataJson}
              className="imagine-secondary-action h-9 rounded-lg border border-slate-800 bg-slate-950/55 px-3 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-900"
            >
              导出
            </button>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索提示词、模型..."
                className="imagine-toolbar-search h-9 w-full rounded-lg border border-slate-800 bg-slate-950/55 pl-9 pr-4 text-xs text-slate-200 placeholder-slate-600 transition focus:border-blue-400/35 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => deleteItemsByStatus(["failed", "pending"])}
              className="imagine-danger-action h-9 rounded-lg border border-red-500/20 bg-red-950/20 px-3 text-[10px] font-semibold text-red-300 transition hover:bg-red-950/35"
            >
              清失败
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
