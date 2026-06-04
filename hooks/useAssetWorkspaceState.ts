import { useDeferredValue, useMemo, useState } from "react";
import type { AssetDatePreset, AssetStatusFilter, AssetTypeFilter } from "@/components/assets/AssetToolbar";
import type { CompareViewType } from "@/components/assets/ComparePanel";
import type { StorageItem } from "@/lib/db";

interface AssetStats {
  dateOptions: Array<{ value: string; label: string; count: number }>;
  modelOptions: string[];
  typeCounts: Record<StorageItem["type"], number>;
  statusCounts: Record<StorageItem["status"], number>;
}

function getAssetDateKey(createdAt: string): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return "unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAssetDateLabel(value: string): string {
  if (value === "unknown") return "未知日期";
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

export function useAssetWorkspaceState(items: StorageItem[]) {
  const [filterType, setFilterType] = useState<AssetTypeFilter>("all");
  const [assetStatusFilter, setAssetStatusFilter] = useState<AssetStatusFilter>("all");
  const [assetModelFilter, setAssetModelFilter] = useState("all");
  const [assetDatePreset, setAssetDatePreset] = useState<AssetDatePreset>("all");
  const [assetDateStart, setAssetDateStart] = useState("");
  const [assetDateEnd, setAssetDateEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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

  const assetStats = useMemo<AssetStats>(() => {
    const dateCounts = new Map<string, number>();
    const models = new Set<string>();
    const typeCounts: Record<StorageItem["type"], number> = { audio: 0, image: 0, video: 0 };
    const statusCounts: Record<StorageItem["status"], number> = {
      complete: 0,
      failed: 0,
      pending: 0,
      processing: 0,
    };

    for (const item of items) {
      const dateKey = getAssetDateKey(item.createdAt);
      dateCounts.set(dateKey, (dateCounts.get(dateKey) ?? 0) + 1);
      models.add(item.model);
      typeCounts[item.type] += 1;
      statusCounts[item.status] += 1;
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
      typeCounts,
      statusCounts,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();

    return items.filter(item => {
      if (filterType === "images" && item.type !== "image") return false;
      if (filterType === "videos" && item.type !== "video") return false;
      if (filterType === "audios" && item.type !== "audio") return false;
      if (assetStatusFilter !== "all" && item.status !== assetStatusFilter) return false;
      if (assetModelFilter !== "all" && item.model !== assetModelFilter) return false;
      const dateKey = getAssetDateKey(item.createdAt);
      if (!isInPresetRange(dateKey, assetDatePreset)) return false;
      if (assetDateStart && dateKey < assetDateStart) return false;
      if (assetDateEnd && dateKey > assetDateEnd) return false;
      if (!query) return true;

      return item.prompt.toLowerCase().includes(query) || item.model.toLowerCase().includes(query);
    });
  }, [assetDateEnd, assetDatePreset, assetDateStart, assetModelFilter, assetStatusFilter, deferredSearchQuery, filterType, items]);

  const searchableReferenceImages = useMemo(
    () => items.filter(item => item.status === "complete"),
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
