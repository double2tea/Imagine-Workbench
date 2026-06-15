import type { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent } from "react";
import { CloudUpload, FolderHeart, Layers, Music, X } from "lucide-react";
import {
  type DraggedReferenceAsset,
  hasDraggedReferenceAsset,
  readDraggedReferenceAsset,
} from "@/components/reference/referenceDrag";
import { getMediaReferencePromptToken, getMediaReferenceType, mediaReferenceLabel, mediaReferenceTypeFromMime, type MediaReference, type MediaReferenceType } from "@/lib/media-references";

export interface ReferenceImageRef extends MediaReference {}

interface ReferenceImagePickerProps {
  addLabel: string;
  browseClassName: string;
  clearLabel: string;
  emptyHelp: string;
  emptyLabel: string;
  label: string;
  maxCount: number;
  references: ReferenceImageRef[];
  roleMode?: boolean;
  uploadLabel: string;
  libraryBrowseLabel: string;
  libraryTileLabel: string;
  onClear: () => void;
  onOpenLibrary?: () => void;
  onDropAsset?: (asset: DraggedReferenceAsset) => void;
  onDropFiles?: (files: File[]) => void;
  onReferenceEdit?: (reference: ReferenceImageRef) => void;
  onRemove: (id: string) => void;
  onRoleChange?: (id: string, role: ReferenceImageRef["role"]) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  acceptedMediaTypes?: MediaReferenceType[];
}

function getNextRole(reference: ReferenceImageRef): ReferenceImageRef["role"] {
  if (reference.role === "start") return "end";
  if (reference.role === "end") return "general";
  return "start";
}

function allowsMediaType(type: MediaReferenceType, acceptedMediaTypes: MediaReferenceType[]): boolean {
  return acceptedMediaTypes.includes(type);
}

function hasDraggedMediaFile(dataTransfer: DataTransfer, acceptedMediaTypes: MediaReferenceType[]): boolean {
  return (
    Array.from(dataTransfer.items).some(item => {
      if (item.kind !== "file") return false;
      if (item.type === "") return true;
      const type = mediaReferenceTypeFromMime(item.type);
      return type ? allowsMediaType(type, acceptedMediaTypes) : false;
    }) ||
    Array.from(dataTransfer.files).some(file => {
      const type = mediaReferenceTypeFromMime(file.type);
      return type ? allowsMediaType(type, acceptedMediaTypes) : false;
    })
  );
}

function readDraggedMediaFiles(dataTransfer: DataTransfer, acceptedMediaTypes: MediaReferenceType[]): File[] {
  const itemFiles = Array.from(dataTransfer.items)
    .filter(item => item.kind === "file")
    .map(item => item.getAsFile())
    .filter((file): file is File => {
      const type = file ? mediaReferenceTypeFromMime(file.type) : null;
      return file !== null && type !== null && allowsMediaType(type, acceptedMediaTypes);
    });

  if (itemFiles.length > 0) return itemFiles;
  return Array.from(dataTransfer.files).filter(file => {
    const type = mediaReferenceTypeFromMime(file.type);
    return type ? allowsMediaType(type, acceptedMediaTypes) : false;
  });
}

export default function ReferenceImagePicker({
  addLabel,
  browseClassName,
  clearLabel,
  emptyHelp,
  emptyLabel,
  label,
  maxCount,
  references,
  roleMode = false,
  uploadLabel,
  libraryBrowseLabel,
  libraryTileLabel,
  onClear,
  onOpenLibrary,
  onDropAsset,
  onDropFiles,
  onReferenceEdit,
  onRemove,
  onRoleChange,
  onUpload,
  acceptedMediaTypes = ["image"],
}: ReferenceImagePickerProps) {
  const visibleReferenceItems = maxCount > 0
    ? references
      .map((reference, index) => ({ index, reference }))
      .filter(item => allowsMediaType(getMediaReferenceType(item.reference), acceptedMediaTypes))
      .slice(0, maxCount)
    : [];
  const canAdd = maxCount > 0 && visibleReferenceItems.length < maxCount;
  const accept = acceptedMediaTypes.map(type => `${type}/*`).join(",");
  const uploadInputLabel = `${label}：${uploadLabel}`;

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const asset = onDropAsset && hasDraggedReferenceAsset(event.dataTransfer)
      ? readDraggedReferenceAsset(event.dataTransfer)
      : null;
    const hasReferenceAsset = asset ? allowsMediaType(getMediaReferenceType(asset), acceptedMediaTypes) : false;
    const hasMediaFile = onDropFiles !== undefined && hasDraggedMediaFile(event.dataTransfer, acceptedMediaTypes);
    if (!hasReferenceAsset && !hasMediaFile) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    const handleDropAsset = onDropAsset;
    const asset = handleDropAsset ? readDraggedReferenceAsset(event.dataTransfer) : null;
    if (asset && handleDropAsset && allowsMediaType(getMediaReferenceType(asset), acceptedMediaTypes)) {
      event.preventDefault();
      handleDropAsset(asset);
      return;
    }

    const files = onDropFiles ? readDraggedMediaFiles(event.dataTransfer, acceptedMediaTypes) : [];
    if (files.length === 0) return;

    event.preventDefault();
    onDropFiles?.(files);
  };

  return (
    <div onDragOver={handleDragOver} onDrop={handleDrop}>
      <div className="flex items-center justify-between mb-2">
        <label className="imagine-reference-label">
          <Layers className="h-3.5 w-3.5 text-[var(--iw-faint)]" />
          {label}
        </label>
        {visibleReferenceItems.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer text-[10px] text-[var(--iw-tone-danger-text)] transition hover:text-[var(--iw-tone-danger-text)]"
          >
            {clearLabel}
          </button>
        )}
      </div>

      {visibleReferenceItems.length > 0 ? (
        <div className="imagine-reference-grid">
          {visibleReferenceItems.map(({ reference, index }) => {
            const isStart = roleMode && reference.role === "start";
            const isEnd = roleMode && reference.role === "end";
            const mediaType = getMediaReferenceType(reference);
            const token = getMediaReferencePromptToken(index, mediaType);
            const canEditReference = !roleMode && mediaType === "image" && onReferenceEdit !== undefined;
            const handleReferenceDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
              if (!canEditReference) return;
              const target = event.target;
              if (target instanceof HTMLElement && target.closest("button")) return;
              onReferenceEdit(reference);
            };
            const handleReferenceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
              if (!canEditReference || (event.key !== "Enter" && event.key !== " ")) return;
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              onReferenceEdit(reference);
            };

            return (
              <div
                key={reference.id}
                role={canEditReference ? "button" : undefined}
                tabIndex={canEditReference ? 0 : undefined}
                title={canEditReference ? "双击打开局部编辑、对比、裁切；键盘按 Enter 或 Space" : undefined}
                onDoubleClick={handleReferenceDoubleClick}
                onKeyDown={handleReferenceKeyDown}
                className={`imagine-reference-thumb relative aspect-square rounded-lg border overflow-hidden bg-cover bg-center group transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
                  isStart
                    ? "border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                    : isEnd
                    ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                    : "border-white/10"
                } ${canEditReference ? "cursor-pointer" : ""}`}
                style={mediaType === "image" ? { backgroundImage: `url(${reference.url})` } : undefined}
              >
                {mediaType === "video" && <video src={reference.url} muted className="h-full w-full object-cover" />}
                {mediaType === "audio" && (
                  <div className="flex h-full w-full items-center justify-center bg-black/30">
                    <Music className="h-5 w-5 text-[var(--iw-tone-violet-text)]" />
                  </div>
                )}
                {/* intentional image-overlay for contrast on arbitrary generated thumbs; black + white + role colors (emerald/amber/red) ensure legibility independent of theme vars (see design + pr1 review) */}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(reference.id);
                  }}
                  onDoubleClick={event => event.stopPropagation()}
                  className="absolute top-1 right-1 bg-red-600/95 text-white rounded-md p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition cursor-pointer hover:scale-105 z-10"
                  title="移除该图"
                >
                  <X className="h-3 w-3" />
                </button>

                {roleMode ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRoleChange?.(reference.id, getNextRole(reference));
                    }}
                    onDoubleClick={event => event.stopPropagation()}
                    className={`absolute inset-x-0 bottom-0 py-1 text-[9px] font-sans font-bold text-center text-white backdrop-blur-subtle cursor-pointer transition-colors ${
                      isStart ? "bg-emerald-600/80" : isEnd ? "bg-amber-600/80" : "bg-black/60 hover:bg-black/80"
                    }`}
                    title="点击切换：首帧 / 尾帧 / 普通参考"
                  >
                    {isStart ? `首帧 ${token}` : isEnd ? `尾帧 ${token}` : `${mediaReferenceLabel(mediaType)} ${token}`}
                  </button>
                ) : (
                  <div className="absolute bottom-0 inset-x-0 bg-black/65 text-[9px] font-mono text-slate-300 truncate px-1 py-0.5 text-center">
                    {token}
                  </div>
                )}
              </div>
            );
          })}

          {canAdd && (
            <>
              <label className="imagine-reference-add-tile">
                <span className="font-bold text-lg leading-none">+</span>
                <span className="mt-0.5 text-[9px] font-semibold">{addLabel}</span>
                <input
                  type="file"
                  name="reference-upload"
                  accept={accept}
                  aria-label={uploadInputLabel}
                  onChange={onUpload}
                  className="hidden"
                />
              </label>
              {onOpenLibrary && (
                <button
                  type="button"
                  onClick={onOpenLibrary}
                  className="imagine-reference-add-tile"
                >
                  <FolderHeart className="h-4 w-4" />
                  <span className="mt-0.5 text-[9px] font-semibold">{libraryTileLabel}</span>
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="imagine-upload-zone relative flex min-h-[76px] flex-col items-center justify-center rounded-lg border border-dashed p-3 text-center transition">
          <CloudUpload className="mb-1.5 h-5 w-5 text-[var(--iw-faint)]" />
          <span className="text-xs text-[var(--iw-muted)]">
            {emptyLabel}，或{" "}
              {maxCount > 0 ? (
                <label className={browseClassName}>
                  {uploadLabel}
                  <input
                    type="file"
                    name="reference-upload"
                    accept={accept}
                    aria-label={uploadInputLabel}
                    onChange={onUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <span>{uploadLabel}</span>
              )}
              {onOpenLibrary && maxCount > 0 ? (
                <>
                  {" / "}
                  <button type="button" onClick={onOpenLibrary} className={browseClassName}>
                    {libraryBrowseLabel}
                  </button>
                </>
              ) : null}
          </span>
          <span className="mt-1 hidden text-[9px] text-[var(--iw-faint)] sm:inline">{emptyHelp}</span>
        </div>
      )}
    </div>
  );
}
