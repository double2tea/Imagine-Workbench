import AtDropdownShell, { AtDropdownHeader } from "@/components/reference/AtDropdownShell";
import MediaReferenceThumbnail from "@/components/reference/MediaReferenceThumbnail";
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
    item.prompt.toLowerCase().includes(query),
  );

  if (filtered.length === 0) {
    return <AtDropdownShell empty>未找到可引用图片</AtDropdownShell>;
  }

  return (
    <AtDropdownShell header={<AtDropdownHeader title="快捷 @ 引用" count={filtered.length} />}>
      {filtered.map(item => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(item)}
          className="imagine-at-dropdown-item nodrag select-none"
        >
          <div className="imagine-at-dropdown-thumb">
            <MediaReferenceThumbnail reference={item} alt="at option" className="h-full w-full" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[10px] font-bold text-[var(--iw-accent-strong)]">
              {item.id.substring(0, 12)}
            </p>
            <p className="truncate text-[9px] text-[var(--iw-faint)]">{item.prompt}</p>
          </div>
        </button>
      ))}
    </AtDropdownShell>
  );
}
