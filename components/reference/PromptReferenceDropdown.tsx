import AtDropdownShell, { AtDropdownHeader } from "@/components/reference/AtDropdownShell";
import MediaReferenceThumbnail from "@/components/reference/MediaReferenceThumbnail";
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
import { useTranslations, t as globalT } from "@/lib/i18n";

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
    .map((reference, index) => ({
      reference,
      index,
      token: getMediaReferencePromptToken(index, getMediaReferenceType(reference)),
    }))
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
      onPointerDown={(event) => {
        event.preventDefault();
        if (event.pointerType !== "mouse") onSelect(item.index);
      }}
      onClick={() => onSelect(item.index)}
      className="imagine-at-dropdown-item nodrag"
    >
      <div className="imagine-at-dropdown-thumb">
        <MediaReferenceThumbnail reference={item.reference} alt={item.token} className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[10px] font-bold text-[var(--iw-accent-strong)]">{item.token}</p>
        <p className="truncate text-[9px] text-[var(--iw-faint)]">
          {mediaReferenceLabel(mediaType, globalT)} · {group ? item.reference.id : ("sourceLabel" in item.reference && item.reference.sourceLabel) || item.reference.id}
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
          <p className="imagine-at-dropdown-group-label">{globalT("reference.referenceMedia")}</p>
          {ungrouped.map(item => (
            <ReferenceRow key={`other:${item.reference.id}:${item.index}`} item={item} onSelect={onSelect} />
          ))}
        </section>
      ) : null}
    </>
  );
}

export default function PromptReferenceDropdown({ acceptedMediaTypes, references, search, onSelect }: PromptReferenceDropdownProps) {
  const { t } = useTranslations("common");
  const filtered = filterReferences(references, search, acceptedMediaTypes);

  if (references.length === 0) {
    return (
      <AtDropdownShell empty>
        {t("reference.atReferenceHint")}
      </AtDropdownShell>
    );
  }

  if (filtered.length === 0) {
    return <AtDropdownShell empty>{t("reference.noMatchFound")}</AtDropdownShell>;
  }

  return (
    <AtDropdownShell header={<AtDropdownHeader title={t("reference.selectReference")} count={filtered.length} />}>
      <ReferenceList filtered={filtered} onSelect={onSelect} />
    </AtDropdownShell>
  );
}
