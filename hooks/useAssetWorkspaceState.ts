import { useDeferredValue, useMemo, useState } from "react";
import type { AssetDateFilter, AssetStatusFilter, AssetTypeFilter } from "@/components/assets/AssetToolbar";
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

export function useAssetWorkspaceState(items: StorageItem[]) {
  const [filterType, setFilterType] = useState<AssetTypeFilter>("all");
  const [assetStatusFilter, setAssetStatusFilter] = useState<AssetStatusFilter>("all");
  const [assetModelFilter, setAssetModelFilter] = useState("all");
  const [assetDateFilter, setAssetDateFilter] = useState<AssetDateFilter>("all");
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
    const typeCounts: Record<StorageItem["type"], number> = { image: 0, video: 0 };
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
      if (assetStatusFilter !== "all" && item.status !== assetStatusFilter) return false;
      if (assetModelFilter !== "all" && item.model !== assetModelFilter) return false;
      if (assetDateFilter !== "all" && getAssetDateKey(item.createdAt) !== assetDateFilter) return false;
      if (!query) return true;

      return item.prompt.toLowerCase().includes(query) || item.model.toLowerCase().includes(query);
    });
  }, [assetDateFilter, assetModelFilter, assetStatusFilter, deferredSearchQuery, filterType, items]);

  const searchableReferenceImages = useMemo(
    () => items.filter(item => item.type === "image" && item.status === "complete"),
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
    assetDateFilter,
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
    setAssetDateFilter,
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
