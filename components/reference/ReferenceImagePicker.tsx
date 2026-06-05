import type { ChangeEvent, DragEvent } from "react";
import { CloudUpload, Layers, Music, X } from "lucide-react";
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
  onClear: () => void;
  onDropAsset?: (asset: DraggedReferenceAsset) => void;
  onDropFiles?: (files: File[]) => void;
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
  onClear,
  onDropAsset,
  onDropFiles,
  onRemove,
  onRoleChange,
  onUpload,
  acceptedMediaTypes = ["image"],
}: ReferenceImagePickerProps) {
  const canAdd = maxCount > 0 && references.length < maxCount;
  const visibleReferences = maxCount > 0 ? references.slice(0, maxCount) : references;
  const accept = acceptedMediaTypes.map(type => `${type}/*`).join(",");

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
        {references.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-red-300 transition hover:text-red-200 cursor-pointer"
          >
            {clearLabel}
          </button>
        )}
      </div>

      {references.length > 0 ? (
        <div className="imagine-reference-grid">
          {visibleReferences.map((reference, index) => {
            const isStart = roleMode && reference.role === "start";
            const isEnd = roleMode && reference.role === "end";
            const mediaType = getMediaReferenceType(reference);
            const token = getMediaReferencePromptToken(index, mediaType);

            return (
              <div
                key={reference.id}
                className={`imagine-reference-thumb relative aspect-square rounded-lg border overflow-hidden bg-cover bg-center group transition-all duration-300 ${
                  isStart
                    ? "border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]"
                    : isEnd
                    ? "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                    : "border-white/10"
                }`}
                style={mediaType === "image" ? { backgroundImage: `url(${reference.url})` } : undefined}
              >
                {mediaType === "video" && <video src={reference.url} muted className="h-full w-full object-cover" />}
                {mediaType === "audio" && (
                  <div className="flex h-full w-full items-center justify-center bg-black/30">
                    <Music className="h-5 w-5 text-violet-100" />
                  </div>
                )}
                {/* intentional image-overlay for contrast on arbitrary generated thumbs; black + white + role colors (emerald/amber/red) ensure legibility independent of theme vars (see design + pr1 review) */}
                <button
                  type="button"
                  onClick={() => onRemove(reference.id)}
                  className="absolute top-1 right-1 bg-red-600/95 text-white rounded-md p-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition cursor-pointer hover:scale-105 z-10"
                  title="移除该图"
                >
                  <X className="h-3 w-3" />
                </button>

                {roleMode ? (
                  <button
                    type="button"
                    onClick={() => onRoleChange?.(reference.id, getNextRole(reference))}
                    className={`absolute inset-x-0 bottom-0 py-1 text-[8px] font-sans font-bold text-center text-white backdrop-blur-subtle cursor-pointer transition-colors ${
                      isStart ? "bg-emerald-600/80" : isEnd ? "bg-amber-600/80" : "bg-black/60 hover:bg-black/80"
                    }`}
                    title="点击切换：首帧 / 尾帧 / 普通参考"
                  >
                    {isStart ? `首帧 ${token}` : isEnd ? `尾帧 ${token}` : `${mediaReferenceLabel(mediaType)} ${token}`}
                  </button>
                ) : (
                  <div className="absolute bottom-0 inset-x-0 bg-black/65 text-[8px] font-mono text-slate-300 truncate px-1 py-0.5 text-center">
                    {token}
                  </div>
                )}
              </div>
            );
          })}

          {canAdd && (
            <label className="imagine-reference-add-tile">
              <span className="font-bold text-lg leading-none">+</span>
              <span className="mt-0.5 text-[8px] font-semibold">{addLabel}</span>
              <input type="file" accept={accept} onChange={onUpload} className="hidden" />
            </label>
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
                  <input type="file" accept={accept} onChange={onUpload} className="hidden" />
                </label>
              ) : (
                <span>{uploadLabel}</span>
              )}
          </span>
          <span className="mt-1 hidden text-[9px] text-[var(--iw-faint)] sm:inline">{emptyHelp}</span>
        </div>
      )}
    </div>
  );
}
