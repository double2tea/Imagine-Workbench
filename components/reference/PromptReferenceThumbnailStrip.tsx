import type { ReactNode } from "react";
import MediaReferenceThumbnail from "@/components/reference/MediaReferenceThumbnail";
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

const promptReferenceTokenPattern = /@(图片|视频|音频)(\d+)/g;

export function resolvePromptReferenceThumbnails(
  prompt: string,
  references: ReadonlyArray<ReferenceImageRef>,
  acceptedMediaTypes?: ReadonlyArray<MediaReferenceType>,
): PromptReferenceThumbnail[] {
  const seen = new Set<number>();
  const matches: PromptReferenceThumbnail[] = [];
  const acceptedTypeSet = acceptedMediaTypes ? new Set(acceptedMediaTypes) : null;
  for (const match of prompt.matchAll(promptReferenceTokenPattern)) {
    const parsed = Number(match[2]);
    if (!Number.isInteger(parsed) || parsed < 1) continue;
    const index = parsed - 1;
    if (seen.has(index)) continue;
    const reference = references[index];
    if (!reference) continue;
    if (acceptedTypeSet && !acceptedTypeSet.has(getMediaReferenceType(reference))) continue;
    seen.add(index);
    matches.push({
      index,
      reference,
      token: getMediaReferencePromptToken(index, getMediaReferenceType(reference)),
    });
  }
  return matches;
}

function renderReferenceChip(thumbnail: PromptReferenceThumbnail): ReactNode {
  const { index, reference, token } = thumbnail;
  const type = getMediaReferenceType(reference);
  return (
    <span
      key={`${token}:${reference.id}:${reference.url}:${index}`}
      className="relative inline text-transparent"
      title={`${token} · ${mediaReferenceLabel(type)} · ${reference.id}`}
    >
      {token}
      <span className="absolute left-1/2 top-1/2 inline-flex h-8 w-8 -translate-x-1/2 -translate-y-[42%] items-center justify-center overflow-hidden rounded-md border border-white/15 bg-slate-950 align-baseline shadow-sm">
        <MediaReferenceThumbnail reference={reference} alt={token} className="h-full w-full" />
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/65 px-1 text-[9px] font-semibold leading-3 text-white">
          {index + 1}
        </span>
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
  for (const match of prompt.matchAll(promptReferenceTokenPattern)) {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      parts.push(prompt.slice(lastIndex, matchIndex));
    }
    const parsed = Number(match[2]);
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
