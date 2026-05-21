import type { ChangeEvent } from "react";
import { CloudUpload, Layers, X } from "lucide-react";

export interface ReferenceImageRef {
  id: string;
  url: string;
  role?: "start" | "end" | "general";
}

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
  onRemove: (id: string) => void;
  onRoleChange?: (id: string, role: ReferenceImageRef["role"]) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}

function getNextRole(reference: ReferenceImageRef): ReferenceImageRef["role"] {
  if (reference.role === "start") return "end";
  if (reference.role === "end") return "general";
  return "start";
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
  onRemove,
  onRoleChange,
  onUpload,
}: ReferenceImagePickerProps) {
  const visibleReferences = references.slice(0, maxCount);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
          <Layers className="h-3.5 w-3.5 text-slate-400" />
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
        <div className="grid grid-cols-4 gap-2 rounded-lg border border-slate-800 bg-slate-950/45 p-2">
          {visibleReferences.map((reference) => {
            const isStart = roleMode && reference.role === "start";
            const isEnd = roleMode && reference.role === "end";

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
                style={{ backgroundImage: `url(${reference.url})` }}
              >
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
                    {isStart ? "🎬 首帧" : isEnd ? "🏁 尾帧" : "📎 普通参考"}
                  </button>
                ) : (
                  <div className="absolute bottom-0 inset-x-0 bg-black/65 text-[8px] font-mono text-slate-300 truncate px-1 py-0.5 text-center">
                    {reference.id.includes("upload") ? "Uploaded" : reference.id.substring(0, 10)}
                  </div>
                )}
              </div>
            );
          })}

          {references.length < maxCount && (
            <label className="relative aspect-square rounded-lg border border-dashed border-slate-700 bg-slate-900/40 transition hover:border-slate-500 hover:bg-slate-900 flex flex-col items-center justify-center cursor-pointer select-none">
              <span className="text-slate-400 font-bold text-lg leading-none">+</span>
              <span className="text-[8px] text-slate-500 font-semibold mt-0.5">{addLabel}</span>
              <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
            </label>
          )}
        </div>
      ) : (
        <div className="imagine-upload-zone relative flex min-h-[76px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/35 p-3 text-center transition hover:border-slate-600 hover:bg-slate-950/60">
          <CloudUpload className="mb-1.5 h-5 w-5 text-slate-500" />
          <span className="text-xs text-slate-300">
            {emptyLabel}，或{" "}
            <label className={browseClassName}>
              {uploadLabel}
              <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
            </label>
          </span>
          <span className="mt-1 text-[9px] text-slate-500">{emptyHelp}</span>
        </div>
      )}
    </div>
  );
}
