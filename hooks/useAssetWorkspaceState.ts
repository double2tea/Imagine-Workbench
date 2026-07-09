import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { AssetDatePreset, AssetStatusFilter, AssetTypeFilter } from "@/components/assets/AssetToolbar";
import type { CompareViewType } from "@/components/assets/ComparePanel";
import type { StorageItem } from "@/lib/db";
import { t } from "@/lib/i18n";

interface AssetStats {
  dateOptions: Array<{ value: string; label: string; count: number }>;
  modelOptions: string[];
  statusUniverseCount: number;
  typeUniverseCount: number;
  typeCounts: Record<StorageItem["type"], number>;
  statusCounts: Record<StorageItem["status"], number>;
}

interface GalleryFilterSnapshot {
  assetDateEnd: string;
  assetDatePreset: AssetDatePreset;
  assetDateStart: string;
  assetModelFilter: string;
  assetStatusFilter: AssetStatusFilter;
  filterType: AssetTypeFilter;
  searchQuery: string;
}

const GALLERY_FILTERS_SESSION_KEY = "imagine_gallery_filters_v1";

const STATUS_KEYS: StorageItem["status"][] = ["complete", "failed", "pending", "processing"];
const TYPE_KEYS: StorageItem["type"][] = ["audio", "image", "transcript", "video"];

function getAssetDateKey(createdAt: string): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return "unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAssetDateLabel(value: string): string {
  if (value === "unknown") return t("common.notices.unknownDate");
  return value;
}

function todayDateKey(): string {
  return getAssetDateKey(new Date().toISOString());
}

function isInPresetRange(dateKey: string, preset: AssetDatePreset): boolean {
  if (preset === "all" || preset === "custom") return true;
  if (dateKey === "unknown") return false;
  const date = new Date(`${dateKey}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return false;
  const today = new Date(`${todayDateKey()}T00:00:00`);
  const days = Math.floor((today.getTime() - date.getTime()) / 86400000);
  if (preset === "today") return days === 0;
  if (preset === "7d") return days >= 0 && days <= 6;
  return days >= 0 && days <= 29;
}

function isAssetTypeFilter(value: unknown): value is AssetTypeFilter {
  return value === "all" || value === "images" || value === "videos" || value === "audios" || value === "transcripts";
}

function isAssetStatusFilter(value: unknown): value is AssetStatusFilter {
  return value === "all" || value === "complete" || value === "failed" || value === "pending" || value === "processing";
}

function isAssetDatePreset(value: unknown): value is AssetDatePreset {
  return value === "all" || value === "today" || value === "7d" || value === "30d" || value === "custom";
}

function readGalleryFilterSnapshot(): Partial<GalleryFilterSnapshot> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(GALLERY_FILTERS_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<GalleryFilterSnapshot>;
    return {
      assetDateEnd: typeof parsed.assetDateEnd === "string" ? parsed.assetDateEnd : undefined,
      assetDatePreset: isAssetDatePreset(parsed.assetDatePreset) ? parsed.assetDatePreset : undefined,
      assetDateStart: typeof parsed.assetDateStart === "string" ? parsed.assetDateStart : undefined,
      assetModelFilter: typeof parsed.assetModelFilter === "string" ? parsed.assetModelFilter : undefined,
      assetStatusFilter: isAssetStatusFilter(parsed.assetStatusFilter) ? parsed.assetStatusFilter : undefined,
      filterType: isAssetTypeFilter(parsed.filterType) ? parsed.filterType : undefined,
      searchQuery: typeof parsed.searchQuery === "string" ? parsed.searchQuery : undefined,
    };
  } catch {
    return {};
  }
}

function matchesType(item: StorageItem, filterType: AssetTypeFilter): boolean {
  if (filterType === "all") return true;
  if (filterType === "images") return item.type === "image";
  if (filterType === "videos") return item.type === "video";
  if (filterType === "audios") return item.type === "audio";
  return item.type === "transcript";
}

function matchesStatus(item: StorageItem, status: AssetStatusFilter): boolean {
  return status === "all" || item.status === status;
}

function matchesModel(item: StorageItem, model: string): boolean {
  return model === "all" || item.model === model;
}

function matchesDate(
  item: StorageItem,
  preset: AssetDatePreset,
  dateStart: string,
  dateEnd: string,
): boolean {
  const dateKey = getAssetDateKey(item.createdAt);
  if (!isInPresetRange(dateKey, preset)) return false;
  if (dateStart && dateKey < dateStart) return false;
  if (dateEnd && dateKey > dateEnd) return false;
  return true;
}

function matchesSearch(item: StorageItem, query: string): boolean {
  if (!query) return true;
  return item.prompt.toLowerCase().includes(query) || item.model.toLowerCase().includes(query);
}

export function useAssetWorkspaceState(items: StorageItem[]) {
  const initialFilters = useMemo(() => readGalleryFilterSnapshot(), []);
  const [filterType, setFilterType] = useState<AssetTypeFilter>(initialFilters.filterType ?? "all");
  const [assetStatusFilter, setAssetStatusFilter] = useState<AssetStatusFilter>(initialFilters.assetStatusFilter ?? "all");
  const [assetModelFilter, setAssetModelFilter] = useState(initialFilters.assetModelFilter ?? "all");
  const [assetDatePreset, setAssetDatePreset] = useState<AssetDatePreset>(initialFilters.assetDatePreset ?? "all");
  const [assetDateStart, setAssetDateStart] = useState(initialFilters.assetDateStart ?? "");
  const [assetDateEnd, setAssetDateEnd] = useState(initialFilters.assetDateEnd ?? "");
  const [searchQuery, setSearchQuery] = useState(initialFilters.searchQuery ?? "");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [compareItemIds, setCompareItemIds] = useState<string[]>([]);
  const [compareViewType, setCompareViewType] = useState<CompareViewType>("side-by-side");
  const [compareSliderPos, setCompareSliderPos] = useState(50);
  const [cancelingItemIds, setCancelingItemIds] = useState<string[]>([]);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const selectedItemIdSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const compareItemIdSet = useMemo(() => new Set(compareItemIds), [compareItemIds]);
  const cancelingItemIdSet = useMemo(() => new Set(cancelingItemIds), [cancelingItemIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const snapshot: GalleryFilterSnapshot = {
      assetDateEnd,
      assetDatePreset,
      assetDateStart,
      assetModelFilter,
      assetStatusFilter,
      filterType,
      searchQuery,
    };
    try {
      window.sessionStorage.setItem(GALLERY_FILTERS_SESSION_KEY, JSON.stringify(snapshot));
    } catch {
      /* storage unavailable */
    }
  }, [
    assetDateEnd,
    assetDatePreset,
    assetDateStart,
    assetModelFilter,
    assetStatusFilter,
    filterType,
    searchQuery,
  ]);

  const assetStats = useMemo<AssetStats>(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    const dateCounts = new Map<string, number>();
    const models = new Set<string>();
    const typeCounts: Record<StorageItem["type"], number> = { audio: 0, image: 0, transcript: 0, video: 0 };
    const statusCounts: Record<StorageItem["status"], number> = {
      complete: 0,
      failed: 0,
      pending: 0,
      processing: 0,
    };
    let statusUniverseCount = 0;
    let typeUniverseCount = 0;

    for (const item of items) {
      const dateKey = getAssetDateKey(item.createdAt);
      dateCounts.set(dateKey, (dateCounts.get(dateKey) ?? 0) + 1);
      models.add(item.model);

      const matchDate = matchesDate(item, assetDatePreset, assetDateStart, assetDateEnd);
      const matchSearch = matchesSearch(item, query);
      const matchModel = matchesModel(item, assetModelFilter);
      const matchType = matchesType(item, filterType);
      const matchStatus = matchesStatus(item, assetStatusFilter);

      // Status chips: ignore current status filter
      if (matchType && matchModel && matchDate && matchSearch) {
        statusUniverseCount += 1;
        statusCounts[item.status] += 1;
      }

      // Type chips: ignore current type filter
      if (matchStatus && matchModel && matchDate && matchSearch) {
        typeUniverseCount += 1;
        typeCounts[item.type] += 1;
      }
    }

    for (const key of STATUS_KEYS) {
      statusCounts[key] = statusCounts[key] ?? 0;
    }
    for (const key of TYPE_KEYS) {
      typeCounts[key] = typeCounts[key] ?? 0;
    }

    return {
      dateOptions: Array.from(dateCounts)
        .map(([value, count]) => ({ value, label: formatAssetDateLabel(value), count }))
        .sort((a, b) => {
          if (a.value === "unknown") return 1;
          if (b.value === "unknown") return -1;
          return b.value.localeCompare(a.value);
        }),
      modelOptions: Array.from(models).sort(),
      statusUniverseCount,
      typeUniverseCount,
      typeCounts,
      statusCounts,
    };
  }, [
    assetDateEnd,
    assetDatePreset,
    assetDateStart,
    assetModelFilter,
    assetStatusFilter,
    deferredSearchQuery,
    filterType,
    items,
  ]);

  const filteredItems = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    return items.filter(
      item =>
        matchesType(item, filterType) &&
        matchesStatus(item, assetStatusFilter) &&
        matchesModel(item, assetModelFilter) &&
        matchesDate(item, assetDatePreset, assetDateStart, assetDateEnd) &&
        matchesSearch(item, query),
    );
  }, [
    assetDateEnd,
    assetDatePreset,
    assetDateStart,
    assetModelFilter,
    assetStatusFilter,
    deferredSearchQuery,
    filterType,
    items,
  ]);

  const searchableReferenceImages = useMemo(
    () => items.filter(item => item.status === "complete" && item.type !== "transcript"),
    [items],
  );

  const compareItems = useMemo(() => {
    const itemById = new Map(items.map(item => [item.id, item]));
    return {
      first: itemById.get(compareItemIds[0]),
      second: itemById.get(compareItemIds[1]),
    };
  }, [compareItemIds, items]);

  return {
    assetDateEnd,
    assetDatePreset,
    assetDateStart,
    assetModelFilter,
    assetStats,
    assetStatusFilter,
    cancelingItemIdSet,
    cancelingItemIds,
    compareItemIdSet,
    compareItemIds,
    compareItems,
    compareSliderPos,
    compareViewType,
    filterType,
    filteredItems,
    isCompareMode,
    searchQuery,
    searchableReferenceImages,
    selectedItemIdSet,
    selectedItemIds,
    setAssetDateEnd,
    setAssetDatePreset,
    setAssetDateStart,
    setAssetModelFilter,
    setAssetStatusFilter,
    setCancelingItemIds,
    setCompareItemIds,
    setCompareSliderPos,
    setCompareViewType,
    setFilterType,
    setIsCompareMode,
    setSearchQuery,
    setSelectedItemIds,
  };
}
