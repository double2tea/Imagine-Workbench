"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  FolderHeart,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  List,
  Maximize2,
  Music,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
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
type ViewMode = "grid" | "list";

const MIN_GRID_CARD_SIZE = 140;
const MAX_GRID_CARD_SIZE = 280;
const DEFAULT_GRID_CARD_SIZE = 180;
const FIELD_LABEL_CLASS_NAME = "flex flex-col gap-1.5 text-[10px] font-semibold text-[var(--iw-muted)]";
const FIELD_CONTROL_CLASS_NAME = "rounded-lg border border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-panel-solid)_82%,transparent)] px-3 text-xs text-[var(--iw-text)] outline-none transition focus:border-[color-mix(in_srgb,var(--iw-accent)_58%,var(--iw-border))] focus:ring-2 focus:ring-[var(--iw-accent-soft)]";

interface AssetLibraryModalProps {
  entries: LibraryAssetEntry[];
  loading?: boolean;
  mode: "manage" | "select";
  open: boolean;
  title: string;
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

function originLabel(origin: LibraryAssetRecord["origin"]): string {
  return origin === "imported" ? "本机导入" : "来自作品";
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
  ].filter(Boolean).join(" ").toLowerCase();
}

function renderAssetThumbnail(entry: LibraryAssetEntry) {
  if (entry.item?.type === "image") {
    return <PreviewImage src={entry.item.url} alt={entry.record.title} className="h-full w-full object-cover" />;
  }
  if (entry.item?.type === "video") {
    return <video src={entry.item.url} muted preload="metadata" className="h-full w-full object-cover" />;
  }
  if (entry.item?.type === "audio") {
    return <AudioWaveformPreview src={entry.item.url} size="compact" tone="media" />;
  }
  return mediaIcon(entry.record.mediaType);
}

function renderAssetInspectorPreview(entry: LibraryAssetEntry) {
  if (entry.item?.type === "image") {
    return <PreviewImage src={entry.item.url} alt={entry.record.title} className="h-full w-full object-contain" />;
  }
  if (entry.item?.type === "video") {
    return <video src={entry.item.url} muted preload="metadata" className="h-full w-full object-contain" />;
  }
  if (entry.item?.type === "audio") {
    return <AudioWaveformPreview src={entry.item.url} size="compact" tone="media" className="h-full w-full" />;
  }
  return mediaIcon(entry.record.mediaType);
}

function renderAssetFullscreenMedia(entry: LibraryAssetEntry) {
  if (entry.item?.type === "image") {
    return <PreviewImage src={entry.item.url} alt={entry.record.title} className="h-full w-full object-contain" />;
  }
  if (entry.item?.type === "video") {
    return <video src={entry.item.url} controls autoPlay className="h-full w-full object-contain" />;
  }
  if (entry.item?.type === "audio") {
    return (
      <AudioWaveformPreview
        src={entry.item.url}
        size="full"
        tone="media"
        className="h-[min(52vh,420px)] max-h-full w-full max-w-5xl rounded-2xl"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70">
      {mediaIcon(entry.record.mediaType)}
    </div>
  );
}

function actionErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export default function AssetLibraryModal({
  entries,
  loading = false,
  mode,
  open,
  title,
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
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [gridCardSize, setGridCardSize] = useState(DEFAULT_GRID_CARD_SIZE);
  const [activeRecordId, setActiveRecordId] = useState<string | null | undefined>(undefined);
  const [fullscreenEntry, setFullscreenEntry] = useState<LibraryAssetEntry | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState<LibraryAssetCategory>("other");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [importing, setImporting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fullscreenCloseRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);

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
    if (activeRecordId === null) return null;
    if (activeRecordId) {
      const found = entries.find(entry => entry.record.id === activeRecordId);
      if (found) return found;
      return null;
    }
    return filteredEntries[0] ?? entries[0] ?? null;
  }, [activeRecordId, entries, filteredEntries]);

  const activeRecord = activeEntry?.record ?? null;
  const hasDraftChanges = activeRecord
    ? draftTitle !== activeRecord.title ||
      draftCategory !== activeRecord.category ||
      draftNotes !== activeRecord.notes ||
      draftTags !== activeRecord.tags.join(", ")
    : false;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || activeRecordId !== undefined || !activeEntry) return;
    setActiveRecordId(activeEntry.record.id);
  }, [activeEntry, activeRecordId, open]);

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
      if (fullscreenEntry) {
        setFullscreenEntry(null);
        return;
      }
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreenEntry, open]);

  useEffect(() => {
    if (!fullscreenEntry) return;
    const focusTimer = window.setTimeout(() => fullscreenCloseRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [fullscreenEntry]);

  useEffect(() => {
    setActionError(null);
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
  }, [activeEntry?.record.id]);

  if (!open) return null;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || importing) return;
    setImporting(true);
    setActionError(null);
    try {
      await onImportFiles(files);
    } catch (error) {
      setActionError(actionErrorMessage(error, "素材导入失败"));
    } finally {
      setImporting(false);
    }
  };

  const saveDraft = async () => {
    if (!activeRecord || !hasDraftChanges || savingDraft) return;
    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setActionError("标题不能为空");
      setDraftTitle(activeRecord.title);
      return;
    }
    const nextNotes = draftNotes.trim();
    const nextTags = draftTags.split(",").map(tag => tag.trim()).filter(tag => tag.length > 0);
    setSavingDraft(true);
    setActionError(null);
    try {
      await onUpdate({
        ...activeRecord,
        title: nextTitle,
        category: draftCategory,
        notes: nextNotes,
        tags: nextTags,
      });
      setDraftTitle(nextTitle);
      setDraftNotes(nextNotes);
      setDraftTags(nextTags.join(", "));
    } catch (error) {
      setActionError(actionErrorMessage(error, "保存素材信息失败"));
    } finally {
      setSavingDraft(false);
    }
  };

  const toggleFavorite = async (record: LibraryAssetRecord) => {
    if (togglingFavorite) return;
    setTogglingFavorite(true);
    setActionError(null);
    try {
      await onUpdate({ ...record, favorite: !record.favorite });
    } catch (error) {
      setActionError(actionErrorMessage(error, "更新收藏状态失败"));
    } finally {
      setTogglingFavorite(false);
    }
  };

  const removeActive = async () => {
    if (!activeRecord || removing) return;
    setRemoving(true);
    setActionError(null);
    try {
      await onRemove(activeRecord);
      setActiveRecordId(null);
    } catch (error) {
      setActionError(actionErrorMessage(error, "移出素材库失败"));
    } finally {
      setRemoving(false);
    }
  };

  const selectEntry = (entry: LibraryAssetEntry) => {
    if (activeRecord && activeRecord.id !== entry.record.id && hasDraftChanges) {
      setActionError("请先保存当前素材信息后再切换素材");
      return;
    }
    setActiveRecordId(entry.record.id);
  };

  const fullscreenOverlay = fullscreenEntry && typeof document !== "undefined"
    ? createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-library-fullscreen-title"
        className="fixed inset-0 z-[90] flex flex-col bg-slate-950/95 p-3 text-white backdrop-blur-md sm:p-5"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="min-w-0">
            <h3 id="asset-library-fullscreen-title" className="truncate text-sm font-semibold">
              {fullscreenEntry.record.title}
            </h3>
            <p className="mt-1 font-mono text-[10px] text-white/45">
              {LIBRARY_ASSET_MEDIA_TYPE_LABELS[fullscreenEntry.record.mediaType]} ·{" "}
              {LIBRARY_ASSET_CATEGORY_LABELS[fullscreenEntry.record.category]} · {formatDate(fullscreenEntry.record.updatedAt)}
            </p>
          </div>
          <button
            ref={fullscreenCloseRef}
            type="button"
            onClick={() => setFullscreenEntry(null)}
            className="imagine-secondary-action flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white"
            aria-label="关闭全屏预览"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center py-4">
          {renderAssetFullscreenMedia(fullscreenEntry)}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/72 p-3 backdrop-blur-md sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-library-modal-title"
        className="flex h-[min(820px,92vh)] w-[min(1240px,96vw)] min-w-0 flex-col overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--iw-border)_78%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--iw-panel-solid)_98%,transparent),color-mix(in_srgb,var(--iw-bg)_18%,var(--iw-panel)))] text-[var(--iw-text)] shadow-[0_32px_90px_rgba(0,0,0,0.34)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color-mix(in_srgb,var(--iw-border)_72%,transparent)] bg-[color-mix(in_srgb,var(--iw-panel-solid)_82%,transparent)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--iw-accent)_26%,var(--iw-border))] bg-[var(--iw-accent-soft)] text-[var(--iw-accent)]">
              <FolderHeart className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="asset-library-modal-title" className="truncate text-[15px] font-semibold text-[var(--iw-text)]">{title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[var(--iw-faint)]">
                <span>{entries.length} 项</span>
                <span className="h-1 w-1 rounded-full bg-[var(--iw-border)]" aria-hidden="true" />
                <span>图片 / 视频 / 音频</span>
                {filteredEntries.length !== entries.length && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-[var(--iw-border)]" aria-hidden="true" />
                    <span>{filteredEntries.length} 个匹配</span>
                  </>
                )}
              </div>
            </div>
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
              disabled={importing}
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

        <div className="grid min-h-0 flex-1 grid-cols-1 bg-[color-mix(in_srgb,var(--iw-bg)_34%,var(--iw-panel))] lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="flex min-h-0 min-w-0 flex-col border-b border-[var(--iw-border)] lg:border-b-0 lg:border-r">
            <div className="shrink-0 border-b border-[color-mix(in_srgb,var(--iw-border)_72%,transparent)] bg-[color-mix(in_srgb,var(--iw-panel)_72%,transparent)] p-4">
              <div className="rounded-xl border border-[color-mix(in_srgb,var(--iw-border)_82%,transparent)] bg-[color-mix(in_srgb,var(--iw-panel-solid)_70%,transparent)] p-3 shadow-[0_12px_28px_rgba(0,0,0,0.08)]">
              <label className="imagine-gallery-search">
                <Search className="h-4 w-4" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="搜索标题、标签、备注、模型..."
                  className="imagine-toolbar-search h-9 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] pr-4 text-xs text-[var(--iw-text)] outline-none"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-1.5">
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
              <div className="mt-2 flex flex-wrap gap-1.5">
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--iw-border)] pt-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-active={viewMode === "grid"}
                    onClick={() => setViewMode("grid")}
                    className="imagine-filter-chip flex items-center gap-1"
                    aria-label="网格显示"
                    title="网格显示"
                  >
                    <Grid2X2 className="h-3 w-3" />
                    网格
                  </button>
                  <button
                    type="button"
                    data-active={viewMode === "list"}
                    onClick={() => setViewMode("list")}
                    className="imagine-filter-chip flex items-center gap-1"
                    aria-label="列表显示"
                    title="列表显示"
                  >
                    <List className="h-3 w-3" />
                    列表
                  </button>
                </div>
                {viewMode === "grid" && (
                  <label className="flex items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--iw-muted)]">
                    <SlidersHorizontal className="h-3 w-3" />
                    大小
                    <input
                      type="range"
                      min={MIN_GRID_CARD_SIZE}
                      max={MAX_GRID_CARD_SIZE}
                      step={20}
                      value={gridCardSize}
                      onChange={event => setGridCardSize(Number(event.target.value))}
                      className="h-1 w-32 accent-[var(--iw-accent)]"
                      aria-label="调整网格素材大小"
                    />
                  </label>
                )}
              </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <p className="rounded-xl border border-dashed border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-panel)_64%,transparent)] px-3 py-12 text-center text-xs text-[var(--iw-muted)]">
                  正在加载素材库…
                </p>
              ) : filteredEntries.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-panel)_64%,transparent)] px-3 py-12 text-center text-xs text-[var(--iw-muted)]">
                  暂无匹配素材
                </p>
              ) : viewMode === "grid" ? (
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridCardSize}px, 1fr))` }}
                >
                  {filteredEntries.map(entry => {
                    const selected = activeRecord?.id === entry.record.id;
                    return (
                      <button
                        key={entry.record.id}
                        type="button"
                        data-active={selected}
                        onClick={() => selectEntry(entry)}
                        onDoubleClick={() => setFullscreenEntry(entry)}
                        className="group imagine-asset-card flex min-w-0 flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--iw-border)_82%,transparent)] bg-[color-mix(in_srgb,var(--iw-panel-solid)_76%,transparent)] text-left shadow-[0_14px_34px_rgba(0,0,0,0.10)] transition hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--iw-accent)_42%,var(--iw-border))] hover:shadow-[0_20px_46px_rgba(0,0,0,0.16)] data-[active=true]:border-[var(--iw-accent)] data-[active=true]:bg-[color-mix(in_srgb,var(--iw-accent)_8%,var(--iw-panel))] data-[active=true]:shadow-[0_0_0_3px_var(--iw-accent-soft),0_18px_44px_rgba(0,0,0,0.16)]"
                        title="双击全屏预览"
                      >
                        <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[color-mix(in_srgb,var(--iw-bg)_70%,#000)]">
                          {renderAssetThumbnail(entry)}
                          <span className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/52 to-transparent opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                          <span className="absolute bottom-2 right-2 rounded-md border border-white/15 bg-black/55 p-1 text-white/80 opacity-0 shadow-lg transition group-hover:opacity-100">
                            <Maximize2 className="h-3 w-3" />
                          </span>
                          {entry.record.favorite && (
                            <span className="absolute right-2 top-2 rounded-md border border-white/15 bg-black/55 p-1 text-rose-300 shadow-lg">
                              <Heart className="h-3 w-3 fill-current" />
                            </span>
                          )}
                        </span>
                        <span className="flex min-h-[76px] min-w-0 flex-col gap-1 border-t border-[color-mix(in_srgb,var(--iw-border)_68%,transparent)] p-2.5">
                          <span className="truncate text-[13px] font-semibold text-[var(--iw-text)]">{entry.record.title}</span>
                          <span className="flex items-center gap-1.5 text-[10px] text-[var(--iw-muted)]">
                            {mediaIcon(entry.record.mediaType)}
                            <span>{LIBRARY_ASSET_CATEGORY_LABELS[entry.record.category]}</span>
                            <span className="h-1 w-1 rounded-full bg-[var(--iw-border)]" aria-hidden="true" />
                            <span className="font-mono text-[var(--iw-faint)]">{formatDate(entry.record.updatedAt)}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredEntries.map(entry => {
                    const selected = activeRecord?.id === entry.record.id;
                    return (
                      <button
                        key={entry.record.id}
                        type="button"
                        data-active={selected}
                        onClick={() => selectEntry(entry)}
                        onDoubleClick={() => setFullscreenEntry(entry)}
                        className="imagine-asset-card grid min-w-0 grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--iw-border)_82%,transparent)] bg-[color-mix(in_srgb,var(--iw-panel-solid)_72%,transparent)] p-2 text-left shadow-[0_10px_24px_rgba(0,0,0,0.08)] transition hover:border-[color-mix(in_srgb,var(--iw-accent)_42%,var(--iw-border))] data-[active=true]:border-[var(--iw-accent)] data-[active=true]:bg-[color-mix(in_srgb,var(--iw-accent)_8%,var(--iw-panel))] data-[active=true]:shadow-[0_0_0_3px_var(--iw-accent-soft)]"
                        title="双击全屏预览"
                      >
                        <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--iw-bg)_70%,#000)]">
                          {renderAssetThumbnail(entry)}
                        </span>
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="truncate text-xs font-semibold text-[var(--iw-text)]">{entry.record.title}</span>
                          <span className="line-clamp-1 text-[10px] text-[var(--iw-muted)]">
                            {entry.record.tags.length > 0 ? entry.record.tags.join(", ") : entry.record.notes}
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] text-[var(--iw-faint)]">
                            {mediaIcon(entry.record.mediaType)}
                            <span>{LIBRARY_ASSET_CATEGORY_LABELS[entry.record.category]}</span>
                            <span className="font-mono">{formatDate(entry.record.updatedAt)}</span>
                          </span>
                        </span>
                        <span className="flex items-center gap-2 text-[var(--iw-muted)]">
                          {entry.record.favorite && <Heart className="h-3.5 w-3.5 fill-current text-rose-300" />}
                          <Maximize2 className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-[color-mix(in_srgb,var(--iw-panel-solid)_72%,transparent)] p-4">
            {actionError && (
              <p className="rounded-lg border border-[var(--iw-tone-danger-border)] bg-[var(--iw-tone-danger-surface)] px-3 py-2 text-xs text-[var(--iw-tone-danger-text)]">
                {actionError}
              </p>
            )}
            {activeEntry && activeRecord ? (
              <>
                <div className="overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--iw-border)_82%,transparent)] bg-[color-mix(in_srgb,var(--iw-panel)_82%,transparent)] shadow-[0_16px_36px_rgba(0,0,0,0.12)]">
                  <div className="relative flex aspect-[4/3] items-center justify-center bg-[color-mix(in_srgb,var(--iw-bg)_72%,#000)]">
                    {renderAssetInspectorPreview(activeEntry)}
                    <button
                      type="button"
                      onClick={() => setFullscreenEntry(activeEntry)}
                      className="absolute bottom-2 right-2 flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-black/55 px-2 text-[10px] font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black/70"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      预览
                    </button>
                  </div>
                  <div className="border-t border-[var(--iw-border)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--iw-text)]">{activeRecord.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[var(--iw-faint)]">
                          <span>{LIBRARY_ASSET_MEDIA_TYPE_LABELS[activeRecord.mediaType]}</span>
                          <span className="h-1 w-1 rounded-full bg-[var(--iw-border)]" aria-hidden="true" />
                          <span>{originLabel(activeRecord.origin)}</span>
                          <span className="h-1 w-1 rounded-full bg-[var(--iw-border)]" aria-hidden="true" />
                          <span>{formatDate(activeRecord.updatedAt)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleFavorite(activeRecord)}
                        disabled={togglingFavorite}
                        className="imagine-secondary-action flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--iw-border)]"
                        aria-label={activeRecord.favorite ? "取消收藏" : "收藏素材"}
                      >
                        <Heart className={`h-3.5 w-3.5 ${activeRecord.favorite ? "fill-current text-rose-300" : ""}`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[color-mix(in_srgb,var(--iw-border)_82%,transparent)] bg-[color-mix(in_srgb,var(--iw-panel)_76%,transparent)] p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--iw-accent)]" />
                    素材信息
                  </div>
                  <label className={FIELD_LABEL_CLASS_NAME}>
                    标题
                    <input
                      value={draftTitle}
                      onChange={event => setDraftTitle(event.target.value)}
                      className={`${FIELD_CONTROL_CLASS_NAME} h-9`}
                    />
                  </label>
                  <label className={`${FIELD_LABEL_CLASS_NAME} mt-3`}>
                    分类
                    <select
                      value={draftCategory}
                      onChange={event => setDraftCategory(event.target.value as LibraryAssetCategory)}
                      className={`${FIELD_CONTROL_CLASS_NAME} h-9`}
                    >
                      {LIBRARY_ASSET_CATEGORIES.map(category => (
                        <option key={category} value={category}>{LIBRARY_ASSET_CATEGORY_LABELS[category]}</option>
                      ))}
                    </select>
                  </label>
                  <label className={`${FIELD_LABEL_CLASS_NAME} mt-3`}>
                    标签
                    <input
                      value={draftTags}
                      onChange={event => setDraftTags(event.target.value)}
                      placeholder="逗号分隔"
                      className={`${FIELD_CONTROL_CLASS_NAME} h-9`}
                    />
                  </label>
                  <label className={`${FIELD_LABEL_CLASS_NAME} mt-3`}>
                    备注
                    <textarea
                      value={draftNotes}
                      onChange={event => setDraftNotes(event.target.value)}
                      rows={4}
                      className={`${FIELD_CONTROL_CLASS_NAME} resize-none py-2`}
                    />
                  </label>
                </div>
                <div className="grid gap-2">
                  <button
                    type="button"
                    onClick={() => void saveDraft()}
                    disabled={savingDraft || !hasDraftChanges}
                    className="imagine-primary-action h-10 rounded-lg px-3 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    保存信息
                  </button>
                  {mode === "select" && (
                    <button
                      type="button"
                      onClick={() => onSelect?.(activeEntry)}
                      disabled={!activeEntry.item}
                      className="imagine-secondary-action flex h-10 items-center justify-center gap-1.5 rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      使用此素材
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void removeActive()}
                    disabled={removing}
                    className="imagine-danger-action flex h-10 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    移出素材库
                  </button>
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--iw-border)] bg-[color-mix(in_srgb,var(--iw-panel)_64%,transparent)] px-3 py-10 text-center text-xs text-[var(--iw-muted)]">
                选择一个素材后可编辑标题、分类、标签与备注
              </p>
            )}
          </aside>
        </div>
      </div>
      {fullscreenOverlay}
    </div>
  );
}
