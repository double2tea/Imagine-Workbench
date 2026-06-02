import PreviewImage from "@/components/PreviewImage";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { BoardPromptReference } from "@/lib/board/prompt-references";

interface PromptReferenceDropdownProps {
  references: Array<ReferenceImageRef | BoardPromptReference>;
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
      <div className="imagine-at-dropdown imagine-at-dropdown-empty">
        连接参考图、拖入画板资产，或从画廊生成作品后，用 @图片N 指定引用
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="imagine-at-dropdown imagine-at-dropdown-empty">
        未找到匹配的已导入参考图
      </div>
    );
  }

  return (
    <div className="imagine-at-dropdown">
      <p className="mb-1 flex items-center justify-between px-1 text-[9px] font-bold uppercase tracking-wider text-[var(--iw-accent-strong)]">
        <span>选择引用对象</span>
        <span className="font-mono text-[8px] font-normal normal-case tracking-normal text-[var(--iw-faint)]">
          {filtered.length} 张
        </span>
      </p>
      {filtered.map(({ reference, index, token }) => (
        <button
          key={reference.id}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(index)}
          className="imagine-at-dropdown-item nodrag"
        >
          <div className="imagine-at-dropdown-thumb">
            <PreviewImage src={reference.url} alt={token} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[10px] font-bold text-[var(--iw-accent-strong)]">@{token}</p>
            <p className="truncate text-[9px] text-[var(--iw-faint)]">
              {"sourceLabel" in reference && reference.sourceLabel ? reference.sourceLabel : reference.id}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}