import { Search } from "lucide-react";
import type { StorageItem } from "@/lib/db";
import type { AiProvider } from "@/lib/providers/model-catalog";

export type AssetTypeFilter = "all" | "images" | "videos" | "audios" | "transcripts";
export type AssetStatusFilter = "all" | StorageItem["status"];
export type AssetDatePreset = "all" | "today" | "7d" | "30d" | "custom";

interface AssetToolbarProps {
  assetDateEnd: string;
  assetDatePreset: AssetDatePreset;
  assetDateStart: string;
  assetModelFilter: string;
  assetStatusFilter: AssetStatusFilter;
  dateOptions: Array<{ value: string; label: string; count: number }>;
  filterType: AssetTypeFilter;
  inFlightCount?: number;
  itemsCount: number;
  modelOptions: string[];
  searchQuery: string;
  selectedProvider: AiProvider;
  showGalleryHeader?: boolean;
  statusCounts: Record<StorageItem["status"], number>;
  typeCounts: Record<StorageItem["type"], number>;
  deleteItemsByStatus: (statuses: StorageItem["status"][]) => void;
  exportMetadataJson: () => void;
  formatModelLabel: (value: string, fallbackProvider: AiProvider) => string;
  setAssetDateEnd: (value: string) => void;
  setAssetDatePreset: (value: AssetDatePreset) => void;
  setAssetDateStart: (value: string) => void;
  setAssetModelFilter: (value: string) => void;
  setAssetStatusFilter: (value: AssetStatusFilter) => void;
  setFilterType: (value: AssetTypeFilter) => void;
  setSearchQuery: (value: string) => void;
}

const TYPE_FILTER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "images", label: "图片" },
  { value: "videos", label: "视频" },
  { value: "audios", label: "音频" },
  { value: "transcripts", label: "转写" },
] as const;

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "processing", label: "生成中" },
  { value: "pending", label: "排队" },
  { value: "failed", label: "失败" },
  { value: "complete", label: "已完成" },
] as const;

const DATE_PRESET_OPTIONS = [
  { value: "all", label: "不限" },
  { value: "today", label: "今天" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
] as const;

interface FilterChipProps {
  active: boolean;
  count?: number;
  empty?: boolean;
  label: string;
  onClick: () => void;
}

function FilterChip({ active, count, empty = false, label, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      data-active={active}
      data-empty={empty}
      onClick={onClick}
      className="imagine-filter-chip cursor-pointer transition-colors duration-150 focus:outline-none"
    >
      <span>{label}</span>
      {count !== undefined && <span className="imagine-filter-chip-count">{count}</span>}
    </button>
  );
}

export default function AssetToolbar({
  assetDateEnd,
  assetDatePreset,
  assetDateStart,
  assetModelFilter,
  assetStatusFilter,
  dateOptions,
  filterType,
  inFlightCount = 0,
  itemsCount,
  modelOptions,
  searchQuery,
  selectedProvider,
  showGalleryHeader = false,
  statusCounts,
  typeCounts,
  deleteItemsByStatus,
  exportMetadataJson,
  formatModelLabel,
  setAssetDateEnd,
  setAssetDatePreset,
  setAssetDateStart,
  setAssetModelFilter,
  setAssetStatusFilter,
  setFilterType,
  setSearchQuery,
}: AssetToolbarProps) {
  const getTypeCount = (value: AssetTypeFilter): number => {
    if (value === "images") return typeCounts.image;
    if (value === "videos") return typeCounts.video;
    if (value === "audios") return typeCounts.audio;
    if (value === "transcripts") return typeCounts.transcript;
    return itemsCount;
  };

  const getStatusCount = (value: AssetStatusFilter): number => {
    if (value === "all") return itemsCount;
    return statusCounts[value];
  };

  const showCustomDateRange =
    assetDatePreset === "custom" || assetDateStart.length > 0 || assetDateEnd.length > 0;
  const showFilterRows = itemsCount > 0 || searchQuery.trim().length > 0;

  const handleDateStartChange = (value: string) => {
    setAssetDatePreset("custom");
    setAssetDateStart(value);
  };

  const handleDateEndChange = (value: string) => {
    setAssetDatePreset("custom");
    setAssetDateEnd(value);
  };

  return (
    <div className="imagine-toolbar-surface rounded-xl dark-glass p-4">
      {showGalleryHeader && (
        <>
          <div className="imagine-toolbar-header hidden lg:flex">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-[var(--iw-text)]">作品画廊</h2>
              <p className="imagine-workspace-subtitle mt-0.5">按日期分组 · 悬停卡片操作</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {inFlightCount > 0 && (
                <span className="imagine-tone-icon font-mono text-[10px]" data-tone="info">{inFlightCount} 项进行中</span>
              )}
              <span className="imagine-meta-chip font-mono text-[10px]">{itemsCount} 项</span>
            </div>
          </div>
          <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
            <span className="text-sm font-semibold text-[var(--iw-text)]">画廊</span>
            <span className="imagine-meta-chip font-mono text-[10px]">
              {inFlightCount > 0 ? `${inFlightCount} 进行中 · ` : ""}
              {itemsCount} 项
            </span>
          </div>
        </>
      )}

      <div className="imagine-gallery-toolbar-actions">
        <div className="imagine-gallery-search">
          <Search className="h-4 w-4" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索提示词、模型..."
            className="imagine-toolbar-search h-9 rounded-lg border border-slate-800 bg-slate-950/55 pr-4 text-xs text-slate-200 placeholder-slate-600 transition-colors duration-150 focus:border-blue-400/35 focus:outline-none"
          />
        </div>
        <select
          value={assetModelFilter}
          onChange={(e) => setAssetModelFilter(e.target.value)}
          className="imagine-toolbar-select h-9 min-w-0 rounded-lg border border-slate-800 bg-slate-950/55 px-3 font-mono text-[10px] text-slate-300 transition-colors duration-150 focus:border-blue-400/35 focus:outline-none sm:min-w-[9rem]"
          aria-label="按模型筛选"
        >
          <option value="all">全部模型</option>
          {modelOptions.map(model => (
            <option key={model} value={model}>{formatModelLabel(model, selectedProvider)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportMetadataJson}
          className="imagine-secondary-action h-9 shrink-0 rounded-lg border border-slate-800 bg-slate-950/55 px-3 text-[10px] font-semibold text-slate-300 transition-colors duration-150 hover:bg-slate-900"
        >
          导出
        </button>
        <button
          type="button"
          onClick={() => deleteItemsByStatus(["failed", "pending"])}
          className="imagine-danger-action h-9 shrink-0 rounded-lg px-3 text-[10px] font-semibold transition-colors duration-150"
        >
          清失败
        </button>
      </div>

      {showFilterRows ? (
      <div className="imagine-gallery-filters">
        <div className="imagine-filter-row">
          <span className="imagine-filter-row-label">状态</span>
          <div className="imagine-filter-track" role="group" aria-label="按状态筛选">
            {STATUS_FILTER_OPTIONS.map(option => {
              const count = getStatusCount(option.value);
              return (
                <FilterChip
                  key={option.value}
                  active={assetStatusFilter === option.value}
                  count={count}
                  empty={option.value !== "all" && count === 0}
                  label={option.label}
                  onClick={() => setAssetStatusFilter(option.value)}
                />
              );
            })}
          </div>
        </div>

        <div className="imagine-filter-row">
          <span className="imagine-filter-row-label">类型</span>
          <div className="imagine-filter-track" role="group" aria-label="按媒体类型筛选">
            {TYPE_FILTER_OPTIONS.map(option => {
              const count = getTypeCount(option.value);
              return (
                <FilterChip
                  key={option.value}
                  active={filterType === option.value}
                  count={count}
                  empty={option.value !== "all" && count === 0}
                  label={option.label}
                  onClick={() => setFilterType(option.value)}
                />
              );
            })}
          </div>
        </div>

        <div className="imagine-filter-row">
          <span className="imagine-filter-row-label">
            时间
            <span className="mt-1 block font-mono text-[9px] font-normal normal-case tracking-normal text-[var(--iw-faint)]">
              {dateOptions.length} 天
            </span>
          </span>
          <div className="imagine-filter-track">
            {DATE_PRESET_OPTIONS.map(option => (
              <FilterChip
                key={option.value}
                active={
                  assetDatePreset === option.value && !assetDateStart && !assetDateEnd
                }
                label={option.label}
                onClick={() => {
                  setAssetDatePreset(option.value);
                  setAssetDateStart("");
                  setAssetDateEnd("");
                }}
              />
            ))}
            <FilterChip
              active={showCustomDateRange}
              label="自定义"
              onClick={() => {
                if (!showCustomDateRange) {
                  setAssetDatePreset("custom");
                }
              }}
            />
            {showCustomDateRange && (
              <div className="imagine-filter-date-range">
                <input
                  type="date"
                  value={assetDateStart}
                  onChange={(event) => handleDateStartChange(event.target.value)}
                  className="imagine-filter-date-input"
                  aria-label="开始日期"
                />
                <span className="font-mono text-[10px] text-[var(--iw-faint)]">至</span>
                <input
                  type="date"
                  value={assetDateEnd}
                  onChange={(event) => handleDateEndChange(event.target.value)}
                  className="imagine-filter-date-input"
                  aria-label="结束日期"
                />
              </div>
            )}
          </div>
        </div>
      </div>
      ) : (
        <p className="mt-2 text-[11px] leading-5 text-[var(--iw-faint)]">
          生成作品后，可按状态、类型与时间筛选。
        </p>
      )}
    </div>
  );
}
