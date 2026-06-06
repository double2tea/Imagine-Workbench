"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import MediaReferenceThumbnail from "@/components/reference/MediaReferenceThumbnail";
import PromptReferenceDropdown from "@/components/reference/PromptReferenceDropdown";
import { useDebouncedTextCommit } from "@/hooks/useDebouncedTextCommit";
import type { BoardPromptReference } from "@/lib/board/prompt-references";
import { getMediaReferencePromptToken, getMediaReferenceType, mediaReferenceLabel } from "@/lib/media-references";
import { registerBoardTextCommit, unregisterBoardTextCommit } from "@/lib/board/text-flush-registry";
import { detectPromptTemplateSlashCommand, type PromptTemplateSlashCommand } from "@/lib/prompt-templates";

function detectAtSearch(value: string, caret: number): string | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/@([^\s@]*)$/);
  return match ? match[1] : null;
}

const promptReferenceTokenPattern = /@(图片|视频|音频)(\d+)/g;

interface PromptReferenceThumbnail {
  index: number;
  reference: BoardPromptReference;
  token: string;
}

function resolvePromptReferenceThumbnails(prompt: string, references: readonly BoardPromptReference[]): PromptReferenceThumbnail[] {
  const seen = new Set<number>();
  const thumbnails: PromptReferenceThumbnail[] = [];
  for (const match of prompt.matchAll(promptReferenceTokenPattern)) {
    const parsed = Number(match[2]);
    if (!Number.isInteger(parsed) || parsed < 1) continue;
    const index = parsed - 1;
    if (seen.has(index)) continue;
    const reference = references[index];
    if (!reference) continue;
    seen.add(index);
    thumbnails.push({ index, reference, token: match[0] });
  }
  return thumbnails;
}

export interface BoardPromptTextareaHandle {
  flush: (value?: string) => void;
  focusAt: (caret: number) => void;
  getSelectionRange: () => { end: number; start: number };
  getValue: () => string;
  setValue: (value: string) => void;
}

interface BoardPromptTextareaProps {
  className?: string;
  commitId?: string;
  headerRight?: ReactNode;
  onChange: (value: string) => void;
  onSelectReference?: (reference: BoardPromptReference, index: number) => void;
  onSlashCommand?: (command: PromptTemplateSlashCommand | null) => void;
  placeholder?: string;
  readOnly?: boolean;
  references: BoardPromptReference[];
  value: string;
}

const BoardPromptTextarea = forwardRef<BoardPromptTextareaHandle, BoardPromptTextareaProps>(function BoardPromptTextarea(
  {
    className = "nodrag nowheel h-full w-full resize-none imagine-board-input !p-3 !pr-20 text-xs leading-5 outline-none placeholder:text-[var(--iw-faint)]",
    commitId,
    headerRight,
    onChange,
    onSelectReference,
    onSlashCommand,
    placeholder = "写提示词，输入 @ 引用连线 / 画板 / 库",
    readOnly = false,
    references,
    value,
  },
  forwardedRef,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [atSearch, setAtSearch] = useState<string | null>(null);
  const [dropdownAnchor, setDropdownAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const { flush, getValue, setValue, value: draftValue } = useDebouncedTextCommit(value, onChange);
  const displayValue = readOnly ? value : draftValue;
  const promptReferenceThumbnails = useMemo(
    () => resolvePromptReferenceThumbnails(displayValue, references),
    [displayValue, references],
  );
  const isAtSearchOpen = atSearch !== null;

  useEffect(() => {
    if (!commitId || readOnly) return;
    registerBoardTextCommit(commitId, { flush, getValue: () => (readOnly ? value : getValue()) });
    return () => unregisterBoardTextCommit(commitId);
  }, [commitId, flush, getValue, readOnly, value]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      flush,
      getValue: () => (readOnly ? value : getValue()),
      setValue: (next: string) => {
        if (readOnly) return;
        flush(next);
      },
      getSelectionRange: () => ({
        start: textareaRef.current?.selectionStart ?? displayValue.length,
        end: textareaRef.current?.selectionEnd ?? displayValue.length,
      }),
      focusAt: (caret: number) => {
        const element = textareaRef.current;
        element?.focus();
        element?.setSelectionRange(caret, caret);
      },
    }),
    [displayValue.length, flush, getValue, readOnly, value],
  );

  useLayoutEffect(() => {
    if (!isAtSearchOpen) {
      setDropdownAnchor(null);
      return;
    }
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    setDropdownAnchor({ left: rect.left, top: rect.top, width: rect.width });
  }, [isAtSearchOpen]);

  const handleChange = (nextValue: string, caret: number | null): void => {
    if (readOnly) return;
    setValue(nextValue);
    if (caret === null) {
      setAtSearch(null);
      onSlashCommand?.(null);
      return;
    }
    setAtSearch(detectAtSearch(nextValue, caret));
    onSlashCommand?.(detectPromptTemplateSlashCommand(nextValue, caret));
  };

  const handleSelectReference = (index: number): void => {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? displayValue.length;
    const searchLength = atSearch?.length ?? 0;
    const start = Math.max(0, caret - searchLength - 1);
    const reference = references[index];
    if (!reference) throw new Error("选择的参考媒体不存在");
    const token = getMediaReferencePromptToken(index, getMediaReferenceType(reference));
    const nextPrompt = `${displayValue.slice(0, start)}${token} ${displayValue.slice(caret)}`;
    const nextCaret = start + `${token} `.length;
    flush(nextPrompt);
    onSelectReference?.(reference, index);
    setAtSearch(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const atDropdownPortal = !readOnly && atSearch !== null && dropdownAnchor && typeof document !== "undefined"
    ? createPortal(
      <div
        className="nowheel nodrag"
        style={{
          position: "fixed",
          left: dropdownAnchor.left,
          top: dropdownAnchor.top,
          width: dropdownAnchor.width,
          zIndex: 80,
          transform: "translateY(calc(-100% - 8px))",
        }}
      >
        <PromptReferenceDropdown references={references} search={atSearch} onSelect={handleSelectReference} />
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={shellRef} className="relative h-full min-h-0">
      {headerRight ? <div className="pointer-events-none absolute right-2 top-2 z-20 [&>*]:pointer-events-auto">{headerRight}</div> : null}
      <div className="relative flex h-full min-h-0 flex-col p-2 pt-2">
        {atDropdownPortal}
        <div className="relative flex min-h-0 flex-1">
          <textarea
            ref={textareaRef}
            value={displayValue}
            readOnly={readOnly}
            onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
            onBlur={() => {
              if (readOnly) return;
              flush();
              window.setTimeout(() => {
                setAtSearch(null);
                onSlashCommand?.(null);
              }, 120);
            }}
            className={`${className} relative z-10 caret-[var(--iw-text)] ${promptReferenceThumbnails.length > 0 ? "!pb-14" : ""}`}
            placeholder={placeholder}
          />
          {promptReferenceThumbnails.length > 0 ? (
            <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex max-w-full items-center gap-1 overflow-hidden rounded-md border border-white/10 bg-slate-950/75 px-1.5 py-1 shadow-sm backdrop-blur">
              {promptReferenceThumbnails.map(thumbnail => {
                const type = getMediaReferenceType(thumbnail.reference);
                return (
                  <span
                    key={`${thumbnail.token}:${thumbnail.reference.id}:${thumbnail.reference.url}:${thumbnail.index}`}
                    className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-slate-950 shadow-sm"
                    title={`${thumbnail.token} · ${mediaReferenceLabel(type)} · ${thumbnail.reference.id}`}
                  >
                    <MediaReferenceThumbnail reference={thumbnail.reference} alt={thumbnail.token} className="h-full w-full" />
                    <span className="absolute bottom-0 right-0 rounded-tl bg-black/65 px-1 text-[8px] font-semibold leading-3 text-white">
                      {thumbnail.index + 1}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

export default BoardPromptTextarea;
