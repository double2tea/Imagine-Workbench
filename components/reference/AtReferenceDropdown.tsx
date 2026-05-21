import PreviewImage from "@/components/PreviewImage";
import type { StorageItem } from "@/lib/db";

interface AtReferenceDropdownProps {
  items: StorageItem[];
  search: string;
  onSelect: (item: StorageItem) => void;
}

export default function AtReferenceDropdown({ items, search, onSelect }: AtReferenceDropdownProps) {
  const query = search.toLowerCase();
  const filtered = items.filter(item =>
    item.id.toLowerCase().includes(query) ||
    item.prompt.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    return (
      <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#0e0e12] border border-white/5 rounded-xl p-3 text-center text-[11px] text-slate-550 select-none shadow-xl z-50">
        🔍 未找到可引用的完成图像
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 bottom-full mb-2 bg-[#0e0e15]/95 backdrop-blur-md border border-blue-500/30 rounded-xl shadow-2xl p-2.5 z-50 max-h-52 overflow-y-auto w-full select-none flex flex-col gap-1.5">
      <p className="text-[9px] font-bold text-blue-400 px-2 uppercase tracking-wider mb-1 flex items-center justify-between">
        <span>📎 快捷@引用参考图 (Select reference image)</span>
        <span className="text-[8px] text-slate-400 font-mono">共 {filtered.length} 张可用</span>
      </p>
      {filtered.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className="w-full flex items-center gap-2.5 p-1.5 hover:bg-white/5 hover:border-white/10 rounded-lg text-left transition select-none cursor-pointer border border-transparent"
        >
          <div className="h-8 w-8 rounded overflow-hidden bg-slate-950 shrink-0 border border-white/5">
            <PreviewImage src={item.url} alt="at option" className="h-full w-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono font-bold text-blue-400 truncate">ID: {item.id.substring(0, 12)}</p>
            <p className="text-[9px] text-slate-400 truncate">{item.prompt}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
