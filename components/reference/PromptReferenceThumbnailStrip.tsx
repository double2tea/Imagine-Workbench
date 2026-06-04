import { Film, Music } from "lucide-react";
import type { ReactNode } from "react";
import PreviewImage from "@/components/PreviewImage";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import {
  getMediaReferencePromptToken,
  getMediaReferenceType,
  mediaReferenceLabel,
  type MediaReferenceType,
} from "@/lib/media-references";

export interface PromptReferenceThumbnail {
  index: number;
  reference: ReferenceImageRef;
  token: string;
}

export function resolvePromptReferenceThumbnails(
  prompt: string,
  references: ReadonlyArray<ReferenceImageRef>,
  acceptedMediaTypes?: ReadonlyArray<MediaReferenceType>,
): PromptReferenceThumbnail[] {
  const seen = new Set<number>();
  const matches: PromptReferenceThumbnail[] = [];
  const acceptedTypeSet = acceptedMediaTypes ? new Set(acceptedMediaTypes) : null;
  for (const match of prompt.matchAll(/@图片(\d+)/g)) {
    const parsed = Number(match[1]);
    if (!Number.isInteger(parsed) || parsed < 1) continue;
    const index = parsed - 1;
    if (seen.has(index)) continue;
    const reference = references[index];
    if (!reference) continue;
    if (acceptedTypeSet && !acceptedTypeSet.has(getMediaReferenceType(reference))) continue;
    seen.add(index);
    matches.push({ index, reference, token: getMediaReferencePromptToken(index) });
  }
  return matches;
}

function renderReferenceChip(thumbnail: PromptReferenceThumbnail): ReactNode {
  const { index, reference, token } = thumbnail;
  const type = getMediaReferenceType(reference);
  return (
    <span
      key={`${token}:${reference.id}:${reference.url}:${index}`}
      className="relative mx-0.5 inline-flex h-8 w-8 translate-y-1 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-slate-950 align-baseline shadow-sm"
      title={`${token} · ${mediaReferenceLabel(type)} · ${reference.id}`}
    >
      {type === "image" ? (
        <PreviewImage src={reference.url} alt={token} className="h-full w-full object-cover" />
      ) : type === "video" ? (
        <Film className="h-4 w-4 text-violet-200" />
      ) : (
        <Music className="h-4 w-4 text-cyan-200" />
      )}
      <span className="absolute bottom-0 right-0 rounded-tl bg-black/65 px-1 text-[8px] font-semibold leading-3 text-white">
        {index + 1}
      </span>
    </span>
  );
}

interface PromptReferenceInlineOverlayProps {
  acceptedMediaTypes?: ReadonlyArray<MediaReferenceType>;
  className?: string;
  prompt: string;
  references: ReadonlyArray<ReferenceImageRef>;
}

export default function PromptReferenceInlineOverlay({
  acceptedMediaTypes,
  className = "",
  prompt,
  references,
}: PromptReferenceInlineOverlayProps) {
  const thumbnailByIndex = new Map(
    resolvePromptReferenceThumbnails(prompt, references, acceptedMediaTypes).map(thumbnail => [thumbnail.index, thumbnail]),
  );
  if (thumbnailByIndex.size === 0) return null;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of prompt.matchAll(/@图片(\d+)/g)) {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push(prompt.slice(lastIndex, matchIndex));
    }
    const parsed = Number(match[1]);
    const thumbnail = Number.isInteger(parsed) ? thumbnailByIndex.get(parsed - 1) : undefined;
    parts.push(thumbnail ? renderReferenceChip(thumbnail) : matchText);
    lastIndex = matchIndex + matchText.length;
  }
  if (lastIndex < prompt.length) parts.push(prompt.slice(lastIndex));

  return (
    <div className={`pointer-events-none absolute inset-0 z-20 overflow-hidden whitespace-pre-wrap break-words text-[var(--iw-text)] ${className}`}>
      {parts}
    </div>
  );
}
