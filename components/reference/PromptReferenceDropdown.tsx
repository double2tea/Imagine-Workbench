import PreviewImage from "@/components/PreviewImage";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";

interface PromptReferenceDropdownProps {
  references: ReferenceImageRef[];
  search: string;
  onSelect: (index: number) => void;
}

export default function PromptReferenceDropdown({ references, search, onSelect }: PromptReferenceDropdownProps) {
  const query = search.trim().toLowerCase();
  const filtered = references
    .map((reference, index) => ({ reference, index, token: `图片${index + 1}` }))
    .filter(item => item.token.toLowerCase().includes(query) || item.reference.id.toLowerCase().includes(query));

  if (references.length === 0) {
    return (
      <div className="absolute left-0 right-0 bottom-full mb-2 rounded-xl border border-white/5 bg-[#0e0e12] p-3 text-center text-[11px] text-slate-500 shadow-xl z-50">
        先拖入或上传参考图，再用 @图片N 指定引用位置
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="absolute left-0 right-0 bottom-full mb-2 rounded-xl border border-white/5 bg-[#0e0e12] p-3 text-center text-[11px] text-slate-500 shadow-xl z-50">
        未找到匹配的已导入参考图
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 bottom-full mb-2 flex max-h-52 w-full select-none flex-col gap-1.5 overflow-y-auto rounded-xl border border-blue-500/30 bg-[#0e0e15]/95 p-2.5 shadow-2xl backdrop-blur-md z-50">
      <p className="mb-1 flex items-center justify-between px-2 text-[9px] font-bold uppercase tracking-wider text-blue-400">
        <span>选择已导入参考图</span>
        <span className="font-mono text-[8px] text-slate-400">共 {filtered.length} 张</span>
      </p>
      {filtered.map(({ reference, index, token }) => (
        <button
          key={reference.id}
          type="button"
          onClick={() => onSelect(index)}
          className="flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg border border-transparent p-1.5 text-left transition hover:border-white/10 hover:bg-white/5"
        >
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-white/5 bg-slate-950">
            <PreviewImage src={reference.url} alt={token} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[10px] font-bold text-blue-400">@{token}</p>
            <p className="truncate text-[9px] text-slate-400">{reference.id}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
