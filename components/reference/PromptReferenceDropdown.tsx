import { Music } from "lucide-react";
import PreviewImage from "@/components/PreviewImage";
import AtDropdownShell, { AtDropdownHeader } from "@/components/reference/AtDropdownShell";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import {
  getMediaReferencePromptToken,
  getMediaReferenceType,
  mediaReferenceLabel,
  type MediaReferenceType,
} from "@/lib/media-references";
import {
  BOARD_PROMPT_REFERENCE_GROUP_ORDER,
  type BoardPromptReference,
  type BoardPromptReferenceSource,
  resolveBoardPromptReferenceGroup,
} from "@/lib/board/prompt-references";

interface PromptReferenceDropdownProps {
  acceptedMediaTypes?: ReadonlyArray<MediaReferenceType>;
  references: Array<ReferenceImageRef | BoardPromptReference>;
  search: string;
  onSelect: (index: number) => void;
}

interface FilteredReferenceItem {
  reference: ReferenceImageRef | BoardPromptReference;
  index: number;
  token: string;
}

function filterReferences(
  references: Array<ReferenceImageRef | BoardPromptReference>,
  search: string,
  acceptedMediaTypes?: ReadonlyArray<MediaReferenceType>,
): FilteredReferenceItem[] {
  const query = search.trim().toLowerCase();
  const acceptedTypeSet = acceptedMediaTypes ? new Set(acceptedMediaTypes) : null;
  return references
    .map((reference, index) => ({ reference, index, token: getMediaReferencePromptToken(index) }))
    .filter(item => !acceptedTypeSet || acceptedTypeSet.has(getMediaReferenceType(item.reference)))
    .filter(
      item =>
        query.length === 0 ||
        item.token.toLowerCase().includes(query) ||
        item.reference.id.toLowerCase().includes(query) ||
        (resolveBoardPromptReferenceGroup(item.reference)?.includes(query) ?? false),
    );
}

function groupFilteredReferences(items: FilteredReferenceItem[]): Map<BoardPromptReferenceSource, FilteredReferenceItem[]> {
  const groups = new Map<BoardPromptReferenceSource, FilteredReferenceItem[]>();
  for (const item of items) {
    const group = resolveBoardPromptReferenceGroup(item.reference);
    if (!group) continue;
    const bucket = groups.get(group) ?? [];
    bucket.push(item);
    groups.set(group, bucket);
  }
  return groups;
}

function ReferenceRow({ item, onSelect }: { item: FilteredReferenceItem; onSelect: (index: number) => void }) {
  const group = resolveBoardPromptReferenceGroup(item.reference);
  const mediaType = getMediaReferenceType(item.reference);
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(item.index)}
      className="imagine-at-dropdown-item nodrag"
    >
      <div className="imagine-at-dropdown-thumb">
        {mediaType === "image" ? (
          <PreviewImage src={item.reference.url} alt={item.token} className="h-full w-full object-cover" />
        ) : mediaType === "video" ? (
          <video src={item.reference.url} muted className="h-full w-full object-cover" />
        ) : (
          <Music className="h-4 w-4 text-[var(--iw-faint)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[10px] font-bold text-[var(--iw-accent-strong)]">{item.token}</p>
        <p className="truncate text-[9px] text-[var(--iw-faint)]">
          {mediaReferenceLabel(mediaType)} · {group ? item.reference.id : ("sourceLabel" in item.reference && item.reference.sourceLabel) || item.reference.id}
        </p>
      </div>
    </button>
  );
}

function ReferenceList({
  filtered,
  onSelect,
}: {
  filtered: FilteredReferenceItem[];
  onSelect: (index: number) => void;
}) {
  const grouped = groupFilteredReferences(filtered);
  const useGroupedLayout = grouped.size > 0;

  if (!useGroupedLayout) {
    return (
      <>
        {filtered.map(item => (
          <ReferenceRow key={`${item.reference.id}:${item.index}`} item={item} onSelect={onSelect} />
        ))}
      </>
    );
  }

  const ungrouped = filtered.filter(item => !resolveBoardPromptReferenceGroup(item.reference));

  return (
    <>
      {BOARD_PROMPT_REFERENCE_GROUP_ORDER.map(group => {
        const items = grouped.get(group);
        if (!items?.length) return null;
        return (
          <section key={group} className="imagine-at-dropdown-group">
            <p className="imagine-at-dropdown-group-label">{group}</p>
            {items.map(item => (
              <ReferenceRow key={`${group}:${item.reference.id}:${item.index}`} item={item} onSelect={onSelect} />
            ))}
          </section>
        );
      })}
      {ungrouped.length > 0 ? (
        <section className="imagine-at-dropdown-group">
          <p className="imagine-at-dropdown-group-label">参考媒体</p>
          {ungrouped.map(item => (
            <ReferenceRow key={`other:${item.reference.id}:${item.index}`} item={item} onSelect={onSelect} />
          ))}
        </section>
      ) : null}
    </>
  );
}

export default function PromptReferenceDropdown({ acceptedMediaTypes, references, search, onSelect }: PromptReferenceDropdownProps) {
  const filtered = filterReferences(references, search, acceptedMediaTypes);

  if (references.length === 0) {
    return (
      <AtDropdownShell empty>
        连接参考媒体、拖入画板资产，或从库中选取作品后，用 @图片N 指定引用
      </AtDropdownShell>
    );
  }

  if (filtered.length === 0) {
    return <AtDropdownShell empty>未找到匹配的已导入参考媒体</AtDropdownShell>;
  }

  return (
    <AtDropdownShell header={<AtDropdownHeader title="选择引用对象" count={filtered.length} />}>
      <ReferenceList filtered={filtered} onSelect={onSelect} />
    </AtDropdownShell>
  );
}
