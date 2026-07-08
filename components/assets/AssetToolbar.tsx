import { Search } from "lucide-react";
import type { StorageItem } from "@/lib/db";
import { useTranslations } from "@/lib/i18n";
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
  dateOptions: _dateOptions,
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
  const { t } = useTranslations("common");

  const TYPE_FILTER_OPTIONS = [
    { value: "all", label: t("library.all") },
    { value: "images", label: t("mediaTypeLabels.image") },
    { value: "videos", label: t("mediaTypeLabels.video") },
    { value: "audios", label: t("mediaTypeLabels.audio") },
    { value: "transcripts", label: t("mediaTypeLabels.transcript") },
  ] as const;

  const STATUS_FILTER_OPTIONS = [
    { value: "all", label: t("library.all") },
    { value: "processing", label: t("statusLabels.processing") },
    { value: "pending", label: t("statusLabels.pending") },
    { value: "failed", label: t("statusLabels.failed") },
    { value: "complete", label: t("statusLabels.complete") },
  ] as const;

  const DATE_PRESET_OPTIONS = [
    { value: "all", label: t("library.all") },
    { value: "today", label: t("gallery.dayCount", { count: 1 }) },
    { value: "7d", label: t("gallery.dayCount", { count: 7 }) },
    { value: "30d", label: t("gallery.dayCount", { count: 30 }) },
  ] as const;

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
  const handleDateStartChange = (value: string) => {
    setAssetDatePreset("custom");
    setAssetDateStart(value);
  };

  const handleDateEndChange = (value: string) => {
    setAssetDatePreset("custom");
    setAssetDateEnd(value);
  };

  return (
    <div className="imagine-toolbar-surface rounded-xl">
      {showGalleryHeader && (
        <>
          <div className="imagine-toolbar-header hidden lg:flex">
            <div>
              <h2 className="iw-type-label font-semibold tracking-tight text-[var(--iw-text)]">{t("gallery.title")}</h2>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {inFlightCount > 0 && (
                <span className="imagine-tone-icon iw-type-caption font-mono" data-tone="info">{t("gallery.inFlightCount", { count: inFlightCount })}</span>
              )}
              <span className="imagine-meta-chip iw-type-caption font-mono">{t("gallery.itemCount", { count: itemsCount })}</span>
            </div>
          </div>
          <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
            <span className="iw-type-label font-semibold text-[var(--iw-text)]">{t("gallery.mobileTitle")}</span>
            <span className="imagine-meta-chip iw-type-caption font-mono">
              {inFlightCount > 0 ? `${t("gallery.inFlightCount", { count: inFlightCount })} · ` : ""}
              {t("gallery.itemCount", { count: itemsCount })}
            </span>
          </div>
        </>
      )}

      <div className="imagine-gallery-toolbar-actions">
        <div className="imagine-gallery-search">
          <Search className="h-4 w-4" />
          <input
            type="text"
            name="asset-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("gallery.searchPlaceholder")}
            aria-label={t("gallery.searchPlaceholder")}
            className="imagine-toolbar-search h-9 pr-4 text-xs"
          />
        </div>
        <select
          name="asset-model-filter"
          value={assetModelFilter}
          onChange={(e) => setAssetModelFilter(e.target.value)}
          className="imagine-toolbar-select iw-type-caption h-9 min-w-0 px-3 font-mono sm:min-w-[9rem]"
          aria-label={t("gallery.filterByModel")}
        >
          <option value="all">{t("gallery.allModels")}</option>
          {modelOptions.map(model => (
            <option key={model} value={model}>{formatModelLabel(model, selectedProvider)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportMetadataJson}
          className="imagine-secondary-action iw-type-caption h-9 shrink-0 px-3 font-semibold"
        >
          {t("gallery.export")}
        </button>
        <button
          type="button"
          onClick={() => deleteItemsByStatus(["failed", "pending"])}
          className="imagine-danger-action iw-type-caption h-9 shrink-0 rounded-lg px-3 font-semibold transition-colors duration-150"
        >
          {t("gallery.clearFailed")}
        </button>
      </div>

      <div className="imagine-gallery-toolbar-mobile-actions mt-2 flex items-center gap-2 lg:hidden">
        <select
          name="asset-model-filter-mobile"
          value={assetModelFilter}
          onChange={(e) => setAssetModelFilter(e.target.value)}
          className="imagine-toolbar-select iw-type-caption h-9 min-w-0 flex-1 px-3 font-mono"
          aria-label={t("gallery.filterByModel")}
        >
          <option value="all">{t("gallery.allModels")}</option>
          {modelOptions.map(model => (
            <option key={model} value={model}>{formatModelLabel(model, selectedProvider)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportMetadataJson}
          className="imagine-secondary-action iw-type-caption h-9 shrink-0 px-2.5 font-semibold"
        >
          {t("gallery.export")}
        </button>
        <button
          type="button"
          onClick={() => deleteItemsByStatus(["failed", "pending"])}
          className="imagine-danger-action iw-type-caption h-9 shrink-0 rounded-lg px-2.5 font-semibold transition-colors duration-150"
        >
          {t("gallery.clearFailed")}
        </button>
      </div>

      <div className="imagine-gallery-filters">
        <div className="imagine-filter-segment" role="group" aria-label={t("gallery.filterStatus")}>
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

        <span className="imagine-toolbar-chip-divider" aria-hidden="true" />

        <div className="imagine-filter-segment" role="group" aria-label={t("gallery.filterType")}>
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

        <span className="imagine-toolbar-chip-divider" aria-hidden="true" />

        <div className="imagine-filter-segment imagine-filter-segment--time" role="group" aria-label={t("gallery.filterTime")}>
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
            label={t("gallery.customDate")}
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
                name="asset-date-start"
                value={assetDateStart}
                onChange={(event) => handleDateStartChange(event.target.value)}
                className="imagine-filter-date-input"
                aria-label={t("gallery.dateFrom")}
              />
              <span className="iw-type-caption font-mono text-[var(--iw-faint)]">{t("gallery.dateRangeSeparator")}</span>
              <input
                type="date"
                name="asset-date-end"
                value={assetDateEnd}
                onChange={(event) => handleDateEndChange(event.target.value)}
                className="imagine-filter-date-input"
                aria-label={t("gallery.dateTo")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
