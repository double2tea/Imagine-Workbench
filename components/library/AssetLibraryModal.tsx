"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Heart, Image as ImageIcon, Music, Search, Trash2, Upload, Video, X } from "lucide-react";
import AudioWaveformPreview from "@/components/audio/AudioWaveformPreview";
import PreviewImage from "@/components/PreviewImage";
import {
  LIBRARY_ASSET_CATEGORIES,
  LIBRARY_ASSET_CATEGORY_LABELS,
  LIBRARY_ASSET_MEDIA_TYPE_LABELS,
  LIBRARY_ASSET_MEDIA_TYPES,
} from "@/lib/asset-library";
import type {
  LibraryAssetCategory,
  LibraryAssetMediaType,
  LibraryAssetRecord,
} from "@/lib/db";
import type { LibraryAssetEntry } from "@/hooks/useAssetLibrary";

type MediaFilter = "all" | LibraryAssetMediaType;
type CategoryFilter = "all" | LibraryAssetCategory;

interface AssetLibraryModalProps {
  entries: LibraryAssetEntry[];
  loading?: boolean;
  mode: "manage" | "select";
  open: boolean;
  title?: string;
  onClose: () => void;
  onImportFiles: (files: File[]) => Promise<unknown>;
  onRemove: (record: LibraryAssetRecord) => Promise<void>;
  onSelect?: (entry: LibraryAssetEntry) => void;
  onUpdate: (record: LibraryAssetRecord) => Promise<void>;
}

function mediaIcon(type: LibraryAssetMediaType) {
  if (type === "image") return <ImageIcon className="h-3.5 w-3.5" />;
  if (type === "video") return <Video className="h-3.5 w-3.5" />;
  return <Music className="h-3.5 w-3.5" />;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function recordSearchText(entry: LibraryAssetEntry): string {
  const { record, item } = entry;
  return [
    record.title,
    record.notes,
    record.tags.join(" "),
    LIBRARY_ASSET_CATEGORY_LABELS[record.category],
    LIBRARY_ASSET_MEDIA_TYPE_LABELS[record.mediaType],
    item?.prompt,
    item?.model,
  ].join(" ").toLowerCase();
}

function actionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export default function AssetLibraryModal({
  entries,
  loading = false,
  mode,
  open,
  title = "素材库",
  onClose,
  onImportFiles,
  onRemove,
  onSelect,
  onUpdate,
}: AssetLibraryModalProps) {
  const [query, setQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState<LibraryAssetCategory>("other");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter(entry => {
      if (mediaFilter !== "all" && entry.record.mediaType !== mediaFilter) return false;
      if (categoryFilter !== "all" && entry.record.category !== categoryFilter) return false;
      if (favoritesOnly && !entry.record.favorite) return false;
      if (normalizedQuery && !recordSearchText(entry).includes(normalizedQuery)) return false;
      return true;
    });
  }, [categoryFilter, entries, favoritesOnly, mediaFilter, query]);

  const activeEntry = useMemo(() => {
    if (activeRecordId) {
      const found = entries.find(entry => entry.record.id === activeRecordId);
      if (found) return found;
    }
    return filteredEntries[0] ?? entries[0] ?? null;
  }, [activeRecordId, entries, filteredEntries]);

  useEffect(() => {
    if (!open) return;
    setActionError(null);
    const panel = panelRef.current;
    const focusTimer = window.setTimeout(() => {
      panel?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!activeEntry) {
      setDraftTitle("");
      setDraftCategory("other");
      setDraftNotes("");
      setDraftTags("");
      return;
    }
    setDraftTitle(activeEntry.record.title);
    setDraftCategory(activeEntry.record.category);
    setDraftNotes(activeEntry.record.notes);
    setDraftTags(activeEntry.record.tags.join(", "));
  }, [activeEntry]);

  if (!open) return null;

  const activeRecord = activeEntry?.record ?? null;
  const hasDraftChanges = activeRecord
    ? draftTitle !== activeRecord.title ||
      draftCategory !== activeRecord.category ||
      draftNotes !== activeRecord.notes ||
      draftTags !== activeRecord.tags.join(", ")
    : false;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      await onImportFiles(files);
    } catch (error) {
      setActionError(actionErrorMessage(error, "素材导入失败"));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!activeRecord || !hasDraftChanges) return;
    setBusy(true);
    setActionError(null);
    try {
      await onUpdate({
        ...activeRecord,
        title: draftTitle.trim() || activeRecord.title,
        category: draftCategory,
        notes: draftNotes,
        tags: draftTags.split(",").map(tag => tag.trim()).filter(tag => tag.length > 0),
      });
    } catch (error) {
      setActionError(actionErrorMessage(error, "保存素材信息失败"));
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async (record: LibraryAssetRecord) => {
    setBusy(true);
    setActionError(null);
    try {
      await onUpdate({ ...record, favorite: !record.favorite });
    } catch (error) {
      setActionError(actionErrorMessage(error, "更新收藏状态失败"));
    } finally {
      setBusy(false);
    }
  };

  const removeActive = async () => {
    if (!activeRecord) return;
    setBusy(true);
    setActionError(null);
    try {
      await onRemove(activeRecord);
      setActiveRecordId(null);
    } catch (error) {
      setActionError(actionErrorMessage(error, "移出素材库失败"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-6">
      <div
        ref={panelRef}
        className="flex h-[min(760px,92vh)] w-[min(1120px,96vw)] min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--iw-border)] bg-[var(--iw-panel)] shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--iw-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-[var(--iw-text)]">{title}</h2>
            <p className="mt-0.5 font-mono text-[10px] text-[var(--iw-faint)]">
              {entries.length} 项 · 图片/视频/音频
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              name="asset-library-import"
              multiple
              accept="image/*,video/*,audio/*"
              aria-label="导入素材到素材库"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="imagine-secondary-action flex h-9 items-center gap-1.5 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold"
            >
              <Upload className="h-3.5 w-3.5" />
              导入
            </button>
            <button
              type="button"
              onClick={onClose}
              className="imagine-secondary-action flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--iw-border)]"
              aria-label="关闭素材库"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="flex min-h-0 min-w-0 flex-col border-b border-[var(--iw-border)] lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--iw-border)] p-3">
              <label className="imagine-gallery-search">
                <Search className="h-4 w-4" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="搜索标题、标签、备注、模型..."
                  className="imagine-toolbar-search h-9 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] pr-4 text-xs text-[var(--iw-text)] outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  data-active={mediaFilter === "all"}
                  onClick={() => setMediaFilter("all")}
                  className="imagine-filter-chip"
                >
                  全部
                </button>
                {LIBRARY_ASSET_MEDIA_TYPES.map(type => (
                  <button
                    key={type}
                    type="button"
                    data-active={mediaFilter === type}
                    onClick={() => setMediaFilter(type)}
                    className="imagine-filter-chip flex items-center gap-1"
                  >
                    {mediaIcon(type)}
                    {LIBRARY_ASSET_MEDIA_TYPE_LABELS[type]}
                  </button>
                ))}
                <button
                  type="button"
                  data-active={favoritesOnly}
                  onClick={() => setFavoritesOnly(value => !value)}
                  className="imagine-filter-chip flex items-center gap-1"
                >
                  <Heart className="h-3 w-3" />
                  收藏
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  data-active={categoryFilter === "all"}
                  onClick={() => setCategoryFilter("all")}
                  className="imagine-filter-chip"
                >
                  全部分类
                </button>
                {LIBRARY_ASSET_CATEGORIES.map(category => (
                  <button
                    key={category}
                    type="button"
                    data-active={categoryFilter === category}
                    onClick={() => setCategoryFilter(category)}
                    className="imagine-filter-chip"
                  >
                    {LIBRARY_ASSET_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {loading ? (
                <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-8 text-center text-xs text-[var(--iw-muted)]">
                  正在加载素材库…
                </p>
              ) : filteredEntries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-8 text-center text-xs text-[var(--iw-muted)]">
                  暂无匹配素材
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {filteredEntries.map(entry => {
                    const selected = activeRecord?.id === entry.record.id;
                    return (
                      <button
                        key={entry.record.id}
                        type="button"
                        data-active={selected}
                        onClick={() => setActiveRecordId(entry.record.id)}
                        onDoubleClick={() => {
                          if (mode === "select") onSelect?.(entry);
                        }}
                        className="imagine-asset-card flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-left transition hover:border-[var(--iw-accent)] data-[active=true]:border-[var(--iw-accent)]"
                      >
                        <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-black/35">
                          {entry.item?.type === "image" ? (
                            <PreviewImage src={entry.item.url} alt={entry.record.title} className="h-full w-full object-cover" />
                          ) : entry.item?.type === "video" ? (
                            <video src={entry.item.url} muted preload="metadata" className="h-full w-full object-cover" />
                          ) : entry.item?.type === "audio" ? (
                            <AudioWaveformPreview src={entry.item.url} size="compact" tone="media" />
                          ) : (
                            mediaIcon(entry.record.mediaType)
                          )}
                          {entry.record.favorite && (
                            <span className="absolute right-2 top-2 rounded-md bg-black/55 p-1 text-rose-300">
                              <Heart className="h-3 w-3 fill-current" />
                            </span>
                          )}
                        </span>
                        <span className="flex min-h-[70px] min-w-0 flex-col gap-1 p-2">
                          <span className="truncate text-xs font-semibold text-[var(--iw-text)]">{entry.record.title}</span>
                          <span className="flex items-center gap-1.5 text-[10px] text-[var(--iw-muted)]">
                            {mediaIcon(entry.record.mediaType)}
                            <span>{LIBRARY_ASSET_CATEGORY_LABELS[entry.record.category]}</span>
                            <span className="font-mono text-[var(--iw-faint)]">{formatDate(entry.record.updatedAt)}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
            {actionError && (
              <p className="rounded-lg border border-[var(--iw-tone-danger-border)] bg-[var(--iw-tone-danger-surface)] px-3 py-2 text-xs text-[var(--iw-tone-danger-text)]">
                {actionError}
              </p>
            )}
            {activeEntry && activeRecord ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--iw-text)]">素材信息</p>
                    <p className="mt-1 font-mono text-[10px] text-[var(--iw-faint)]">
                      {LIBRARY_ASSET_MEDIA_TYPE_LABELS[activeRecord.mediaType]} · {activeRecord.origin === "imported" ? "本机导入" : "来自作品"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(activeRecord)}
                    disabled={busy}
                    className="imagine-secondary-action flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--iw-border)]"
                    aria-label={activeRecord.favorite ? "取消收藏" : "收藏素材"}
                  >
                    <Heart className={`h-3.5 w-3.5 ${activeRecord.favorite ? "fill-current text-rose-300" : ""}`} />
                  </button>
                </div>

                <label className="flex flex-col gap-1 text-[10px] font-semibold text-[var(--iw-muted)]">
                  标题
                  <input
                    value={draftTitle}
                    onChange={event => setDraftTitle(event.target.value)}
                    className="imagine-toolbar-search h-9 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 text-xs text-[var(--iw-text)] outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-semibold text-[var(--iw-muted)]">
                  分类
                  <select
                    value={draftCategory}
                    onChange={event => setDraftCategory(event.target.value as LibraryAssetCategory)}
                    className="imagine-toolbar-select h-9 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 text-xs text-[var(--iw-text)] outline-none"
                  >
                    {LIBRARY_ASSET_CATEGORIES.map(category => (
                      <option key={category} value={category}>{LIBRARY_ASSET_CATEGORY_LABELS[category]}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-semibold text-[var(--iw-muted)]">
                  标签
                  <input
                    value={draftTags}
                    onChange={event => setDraftTags(event.target.value)}
                    placeholder="逗号分隔"
                    className="imagine-toolbar-search h-9 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 text-xs text-[var(--iw-text)] outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[10px] font-semibold text-[var(--iw-muted)]">
                  备注
                  <textarea
                    value={draftNotes}
                    onChange={event => setDraftNotes(event.target.value)}
                    rows={4}
                    className="resize-none rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 py-2 text-xs text-[var(--iw-text)] outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={busy || !hasDraftChanges}
                  className="imagine-primary-action h-9 rounded-lg px-3 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  保存信息
                </button>
                {mode === "select" && (
                  <button
                    type="button"
                    onClick={() => onSelect?.(activeEntry)}
                    disabled={!activeEntry.item}
                    className="imagine-secondary-action flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" />
                    使用此素材
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void removeActive()}
                  disabled={busy}
                  className="imagine-danger-action flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  移出素材库
                </button>
              </>
            ) : (
              <p className="rounded-lg border border-dashed border-[var(--iw-border)] px-3 py-8 text-center text-xs text-[var(--iw-muted)]">
                选择一个素材后可编辑标题、分类、标签与备注
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
