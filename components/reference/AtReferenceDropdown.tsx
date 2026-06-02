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
      <div className="imagine-at-dropdown imagine-at-dropdown-empty select-none">
        未找到可引用图片
      </div>
    );
  }

  return (
    <div className="imagine-at-dropdown select-none">
      <p className="mb-1 flex items-center justify-between px-1 text-[9px] font-bold uppercase tracking-wider text-[var(--iw-accent-strong)]">
        <span>快捷 @ 引用</span>
        <span className="font-mono text-[8px] font-normal normal-case tracking-normal text-[var(--iw-faint)]">
          {filtered.length} 张
        </span>
      </p>
      {filtered.map((item) => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(item)}
          className="imagine-at-dropdown-item nodrag"
        >
          <div className="imagine-at-dropdown-thumb">
            <PreviewImage src={item.url} alt="at option" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[10px] font-bold text-[var(--iw-accent-strong)]">
              {item.id.substring(0, 12)}
            </p>
            <p className="truncate text-[9px] text-[var(--iw-faint)]">{item.prompt}</p>
          </div>
        </button>
      ))}
    </div>
  );
}