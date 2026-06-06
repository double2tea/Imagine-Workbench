"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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

type PromptEditorPart =
  | { kind: "text"; text: string }
  | { index: number; kind: "reference"; reference: BoardPromptReference; token: string };

function getPromptEditorParts(prompt: string, references: readonly BoardPromptReference[]): PromptEditorPart[] {
  const parts: PromptEditorPart[] = [];
  let lastIndex = 0;
  for (const match of prompt.matchAll(promptReferenceTokenPattern)) {
    const matchText = match[0];
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) parts.push({ kind: "text", text: prompt.slice(lastIndex, matchIndex) });

    const parsed = Number(match[2]);
    const reference = Number.isInteger(parsed) ? references[parsed - 1] : undefined;
    if (reference) {
      parts.push({ index: parsed - 1, kind: "reference", reference, token: matchText });
    } else {
      parts.push({ kind: "text", text: matchText });
    }
    lastIndex = matchIndex + matchText.length;
  }
  if (lastIndex < prompt.length) parts.push({ kind: "text", text: prompt.slice(lastIndex) });
  return parts;
}

function serializeEditorNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof HTMLElement)) return "";
  const token = node.dataset.promptReferenceToken;
  if (token) return token;
  if (node.tagName === "BR") return "\n";
  let text = "";
  node.childNodes.forEach(child => {
    text += serializeEditorNode(child);
  });
  return text;
}

function getEditorPlainText(editor: HTMLElement): string {
  let text = "";
  editor.childNodes.forEach(child => {
    text += serializeEditorNode(child);
  });
  return text;
}

function getRangeTextOffset(editor: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.setEnd(container, offset);
  const fragment = range.cloneContents();
  let text = "";
  fragment.childNodes.forEach(child => {
    text += serializeEditorNode(child);
  });
  return text.length;
}

function getEditorSelectionRange(editor: HTMLElement): { end: number; start: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  const start = getRangeTextOffset(editor, range.startContainer, range.startOffset);
  const end = getRangeTextOffset(editor, range.endContainer, range.endOffset);
  return start <= end ? { start, end } : { start: end, end: start };
}

function setEditorCaret(editor: HTMLElement, caret: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let remaining = Math.max(0, caret);

  const findPosition = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        return true;
      }
      remaining -= length;
      return false;
    }
    if (!(node instanceof HTMLElement)) return false;
    const token = node.dataset.promptReferenceToken;
    if (token) {
      const parent = node.parentNode;
      if (!parent) return false;
      const childIndex = Array.from(parent.childNodes).indexOf(node);
      if (remaining <= token.length) {
        range.setStart(parent, childIndex + 1);
        return true;
      }
      remaining -= token.length;
      return false;
    }
    if (node.tagName === "BR") {
      if (remaining <= 1) {
        const parent = node.parentNode;
        if (!parent) return false;
        range.setStart(parent, Array.from(parent.childNodes).indexOf(node) + 1);
        return true;
      }
      remaining -= 1;
      return false;
    }
    for (const child of Array.from(node.childNodes)) {
      if (findPosition(child)) return true;
    }
    return false;
  };

  if (!findPosition(editor)) range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function insertTextAtEditorSelection(text: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStart(textNode, text.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
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
  const editorRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const [atSearch, setAtSearch] = useState<string | null>(null);
  const [dropdownAnchor, setDropdownAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const { flush, getValue, setValue, value: draftValue } = useDebouncedTextCommit(value, onChange);
  const displayValue = readOnly ? value : draftValue;
  const isAtSearchOpen = atSearch !== null;
  const editorParts = getPromptEditorParts(displayValue, references);

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
        start: editorRef.current ? (getEditorSelectionRange(editorRef.current)?.start ?? displayValue.length) : displayValue.length,
        end: editorRef.current ? (getEditorSelectionRange(editorRef.current)?.end ?? displayValue.length) : displayValue.length,
      }),
      focusAt: (caret: number) => {
        const element = editorRef.current;
        element?.focus();
        if (element) setEditorCaret(element, caret);
      },
    }),
    [displayValue.length, flush, getValue, readOnly, value],
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    const caret = pendingCaretRef.current;
    if (!editor || caret === null || document.activeElement !== editor) return;
    pendingCaretRef.current = null;
    setEditorCaret(editor, caret);
  }, [displayValue]);

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

  const handleInput = (): void => {
    const editor = editorRef.current;
    if (!editor) return;
    const selectionRange = getEditorSelectionRange(editor);
    const nextValue = getEditorPlainText(editor);
    pendingCaretRef.current = selectionRange?.end ?? nextValue.length;
    handleChange(nextValue, selectionRange?.end ?? null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (readOnly || event.key !== "Enter") return;
    event.preventDefault();
    insertTextAtEditorSelection("\n");
    handleInput();
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (readOnly) return;
    event.preventDefault();
    insertTextAtEditorSelection(event.clipboardData.getData("text/plain"));
    handleInput();
  };

  const handleSelectReference = (index: number): void => {
    const editor = editorRef.current;
    const caret = editor ? (getEditorSelectionRange(editor)?.end ?? displayValue.length) : displayValue.length;
    const searchLength = atSearch?.length ?? 0;
    const start = Math.max(0, caret - searchLength - 1);
    const reference = references[index];
    if (!reference) throw new Error("选择的参考媒体不存在");
    const token = getMediaReferencePromptToken(index, getMediaReferenceType(reference));
    const nextPrompt = `${displayValue.slice(0, start)}${token} ${displayValue.slice(caret)}`;
    const nextCaret = start + `${token} `.length;
    pendingCaretRef.current = nextCaret;
    flush(nextPrompt);
    onSelectReference?.(reference, index);
    setAtSearch(null);
    window.requestAnimationFrame(() => {
      editor?.focus();
      if (editor) setEditorCaret(editor, nextCaret);
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
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            contentEditable={!readOnly}
            data-placeholder={placeholder}
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => {
              if (readOnly) return;
              flush();
              window.setTimeout(() => {
                setAtSearch(null);
                onSlashCommand?.(null);
              }, 120);
            }}
            className={`${className} relative z-10 overflow-auto whitespace-pre-wrap break-words caret-[var(--iw-text)] empty:before:text-[var(--iw-faint)] empty:before:content-[attr(data-placeholder)]`}
          >
            {editorParts.map((part, index) => {
              if (part.kind === "text") return <span key={`text:${index}`}>{part.text}</span>;
              const type = getMediaReferenceType(part.reference);
              return (
                <span
                  key={`reference:${index}:${part.token}:${part.reference.id}:${part.reference.url}`}
                  contentEditable={false}
                  data-prompt-reference-token={part.token}
                  className="relative mx-1 inline-flex h-8 w-8 translate-y-1 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-slate-950 align-baseline shadow-sm"
                  title={`${part.token} · ${mediaReferenceLabel(type)} · ${part.reference.id}`}
                >
                  <MediaReferenceThumbnail reference={part.reference} alt={part.token} className="h-full w-full" />
                  <span className="absolute bottom-0 right-0 rounded-tl bg-black/65 px-1 text-[8px] font-semibold leading-3 text-white">
                    {part.index + 1}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

export default BoardPromptTextarea;
