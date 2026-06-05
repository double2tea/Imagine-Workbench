"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import PromptReferenceDropdown from "@/components/reference/PromptReferenceDropdown";
import PromptReferenceInlineOverlay, { resolvePromptReferenceThumbnails } from "@/components/reference/PromptReferenceThumbnailStrip";
import { useDebouncedTextCommit } from "@/hooks/useDebouncedTextCommit";
import type { BoardPromptReference } from "@/lib/board/prompt-references";
import { getMediaReferencePromptToken, getMediaReferenceType } from "@/lib/media-references";
import { registerBoardTextCommit, unregisterBoardTextCommit } from "@/lib/board/text-flush-registry";
import { detectPromptTemplateSlashCommand, type PromptTemplateSlashCommand } from "@/lib/prompt-templates";

function detectAtSearch(value: string, caret: number): string | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/@([^\s@]*)$/);
  return match ? match[1] : null;
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
  overlayClassName?: string;
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
    overlayClassName = "p-3 pr-20 text-xs leading-5",
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
            className={`${className} relative z-10 caret-[var(--iw-text)] ${promptReferenceThumbnails.length > 0 ? "!text-transparent" : ""}`}
            placeholder={placeholder}
          />
          <PromptReferenceInlineOverlay
            prompt={displayValue}
            references={references}
            className={overlayClassName}
          />
        </div>
      </div>
    </div>
  );
});

export default BoardPromptTextarea;
