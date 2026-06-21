"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CompositionEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import PromptReferenceDropdown from "@/components/reference/PromptReferenceDropdown";
import { useDebouncedTextCommit } from "@/hooks/useDebouncedTextCommit";
import type { BoardPromptReference } from "@/lib/board/prompt-references";
import {
  buildPromptReferenceTokenPattern,
  getMediaReferencePromptToken,
  getMediaReferenceType,
  mediaReferenceLabel,
} from "@/lib/media-references";
import { registerBoardTextCommit, unregisterBoardTextCommit } from "@/lib/board/text-flush-registry";
import { detectPromptTemplateSlashCommand, type PromptTemplateSlashCommand } from "@/lib/prompt-templates";
import { isPromptTemplatePickerInteractionActive } from "@/lib/prompt-template-picker-dom";

function detectAtSearch(value: string, caret: number): string | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/@([^\s@]*)$/);
  return match ? match[1] : null;
}

type PromptEditorPart =
  | { kind: "text"; text: string }
  | { index: number; kind: "reference"; reference: BoardPromptReference; token: string };

interface PromptReferenceTokenRange {
  end: number;
  start: number;
}

function getPromptEditorParts(prompt: string, references: readonly BoardPromptReference[]): PromptEditorPart[] {
  const parts: PromptEditorPart[] = [];
  const promptReferenceTokenPattern = buildPromptReferenceTokenPattern();
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

function findReferenceTokenBoundaryRange(
  prompt: string,
  caret: number,
  direction: "backward" | "forward",
  references: readonly BoardPromptReference[],
): PromptReferenceTokenRange | null {
  const promptReferenceTokenPattern = buildPromptReferenceTokenPattern();
  for (const match of prompt.matchAll(promptReferenceTokenPattern)) {
    const parsed = Number(match[2]);
    if (!Number.isInteger(parsed) || parsed < 1 || !references[parsed - 1]) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if ((direction === "backward" && end === caret) || (direction === "forward" && start === caret)) {
      return { start, end };
    }
  }
  return null;
}

function createReferenceChip(part: Extract<PromptEditorPart, { kind: "reference" }>): HTMLElement {
  const type = getMediaReferenceType(part.reference);
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.promptReferenceToken = part.token;
  chip.className = "relative mx-1 inline-flex h-8 w-8 translate-y-1 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-slate-950 align-baseline shadow-sm";
  chip.title = `${part.token} · ${mediaReferenceLabel(type)} · ${part.reference.id}`;

  if (type === "image" || (type === "video" && part.reference.url.startsWith("data:image/"))) {
    const image = document.createElement("img");
    image.src = part.reference.url;
    image.alt = part.token;
    image.draggable = false;
    image.className = "board-media-preview h-full w-full select-none object-cover";
    chip.append(image);
  } else if (type === "video") {
    const video = document.createElement("video");
    video.src = part.reference.url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.className = "h-full w-full object-cover";
    chip.append(video);
  } else {
    const audioMark = document.createElement("span");
    audioMark.className = "text-[10px] font-semibold uppercase tracking-wide text-[var(--iw-tone-info-text)]";
    audioMark.textContent = "AUD";
    chip.append(audioMark);
  }

  const indexBadge = document.createElement("span");
  indexBadge.className = "absolute bottom-0 right-0 rounded-tl bg-black/65 px-1 text-[8px] font-semibold leading-3 text-white";
  indexBadge.textContent = String(part.index + 1);
  chip.append(indexBadge);
  return chip;
}

function renderPromptEditorValue(editor: HTMLElement, prompt: string, references: readonly BoardPromptReference[]): void {
  const fragment = document.createDocumentFragment();
  for (const part of getPromptEditorParts(prompt, references)) {
    if (part.kind === "text") {
      fragment.append(document.createTextNode(part.text));
    } else {
      fragment.append(createReferenceChip(part));
    }
  }
  editor.replaceChildren(fragment);
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

function serializeEditorNodes(nodes: Iterable<Node>): string {
  let text = "";
  for (const node of nodes) {
    text += serializeEditorNode(node);
  }
  return text;
}

function getEditorPlainText(editor: HTMLElement): string {
  const text = serializeEditorNodes(editor.childNodes);
  return text === "\n" && editor.textContent === "" ? "" : text;
}

function getRangeTextOffset(editor: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.setEnd(container, offset);
  const fragment = range.cloneContents();
  return serializeEditorNodes(fragment.childNodes).length;
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

function getSelectedEditorText(editor: HTMLElement): string | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (range.collapsed) return "";
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  return serializeEditorNodes(range.cloneContents().childNodes);
}

function deleteEditorSelection(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
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
    placeholder = "Write prompt, use @ to reference",
    readOnly = false,
    references,
    value,
  },
  forwardedRef,
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const renderedValueRef = useRef<string | null>(null);
  const renderedReferencesSignatureRef = useRef("");
  const [atSearch, setAtSearch] = useState<string | null>(null);
  const [dropdownAnchor, setDropdownAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const { flush, getValue, setValue, value: draftValue } = useDebouncedTextCommit(value, onChange);
  const displayValue = readOnly ? value : draftValue;
  const referencesSignature = useMemo(
    () => references.map(reference => `${reference.id}:${reference.type}:${reference.url}`).join("|"),
    [references],
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
        const editor = editorRef.current;
        if (editor) {
          renderPromptEditorValue(editor, next, references);
          renderedValueRef.current = next;
          renderedReferencesSignatureRef.current = referencesSignature;
        }
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
    [displayValue.length, flush, getValue, readOnly, references, referencesSignature, value],
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const shouldRender = renderedValueRef.current !== displayValue || renderedReferencesSignatureRef.current !== referencesSignature;
    if (!shouldRender) return;
    const wasFocused = document.activeElement === editor;
    const selectionRange = wasFocused ? getEditorSelectionRange(editor) : null;
    renderPromptEditorValue(editor, displayValue, references);
    renderedValueRef.current = displayValue;
    renderedReferencesSignatureRef.current = referencesSignature;
    if (wasFocused) setEditorCaret(editor, selectionRange?.end ?? displayValue.length);
  }, [displayValue, references, referencesSignature]);

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

  const syncEditorValue = (): void => {
    const editor = editorRef.current;
    if (!editor) return;
    const selectionRange = getEditorSelectionRange(editor);
    const nextValue = getEditorPlainText(editor);
    const nextCaret = selectionRange?.end ?? nextValue.length;
    renderPromptEditorValue(editor, nextValue, references);
    renderedValueRef.current = nextValue;
    renderedReferencesSignatureRef.current = referencesSignature;
    setEditorCaret(editor, Math.min(nextCaret, nextValue.length));
    handleChange(nextValue, nextCaret);
  };

  const handleInput = (): void => {
    if (isComposingRef.current) return;
    syncEditorValue();
  };

  const handleCompositionStart = (_event: CompositionEvent<HTMLDivElement>): void => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (_event: CompositionEvent<HTMLDivElement>): void => {
    isComposingRef.current = false;
    syncEditorValue();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.nativeEvent.isComposing || isComposingRef.current) return;
    if (readOnly) return;
    if (event.key === "Backspace" || event.key === "Delete") {
      const editor = editorRef.current;
      if (!editor) return;
      const prompt = getEditorPlainText(editor);
      const selectionRange = getEditorSelectionRange(editor) ?? { start: prompt.length, end: prompt.length };
      let deleteStart = selectionRange.start;
      let deleteEnd = selectionRange.end;
      if (deleteStart === deleteEnd) {
        const direction = event.key === "Backspace" ? "backward" : "forward";
        const tokenRange = findReferenceTokenBoundaryRange(prompt, deleteStart, direction, references);
        if (tokenRange) {
          deleteStart = tokenRange.start;
          deleteEnd = tokenRange.end;
        } else if (direction === "backward" && deleteStart > 0) {
          deleteStart -= 1;
        } else if (direction === "forward" && deleteEnd < prompt.length) {
          deleteEnd += 1;
        } else {
          return;
        }
      }
      event.preventDefault();
      const nextPrompt = `${prompt.slice(0, deleteStart)}${prompt.slice(deleteEnd)}`;
      renderPromptEditorValue(editor, nextPrompt, references);
      renderedValueRef.current = nextPrompt;
      renderedReferencesSignatureRef.current = referencesSignature;
      setEditorCaret(editor, deleteStart);
      handleChange(nextPrompt, deleteStart);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    insertTextAtEditorSelection("\n");
    syncEditorValue();
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (isComposingRef.current) return;
    if (readOnly) return;
    event.preventDefault();
    insertTextAtEditorSelection(event.clipboardData.getData("text/plain"));
    syncEditorValue();
  };

  const writeSelectedTextToClipboard = (event: ClipboardEvent<HTMLDivElement>): boolean => {
    const editor = editorRef.current;
    if (!editor) return false;
    const selectedText = getSelectedEditorText(editor);
    if (selectedText === null || selectedText.length === 0) return false;
    event.preventDefault();
    event.clipboardData.setData("text/plain", selectedText);
    return true;
  };

  const handleCopy = (event: ClipboardEvent<HTMLDivElement>): void => {
    writeSelectedTextToClipboard(event);
  };

  const handleCut = (event: ClipboardEvent<HTMLDivElement>): void => {
    const hasSelection = writeSelectedTextToClipboard(event);
    if (!hasSelection || readOnly) return;
    deleteEditorSelection();
    syncEditorValue();
  };

  const handleSelectReference = (index: number): void => {
    const editor = editorRef.current;
    const caret = editor ? (getEditorSelectionRange(editor)?.end ?? displayValue.length) : displayValue.length;
    const searchLength = atSearch?.length ?? 0;
    const start = Math.max(0, caret - searchLength - 1);
    const reference = references[index];
    if (!reference) throw new Error("Selected reference media does not exist");
    const token = getMediaReferencePromptToken(index, getMediaReferenceType(reference));
    const nextPrompt = `${displayValue.slice(0, start)}${token} ${displayValue.slice(caret)}`;
    const nextCaret = start + `${token} `.length;
    if (editor) {
      renderPromptEditorValue(editor, nextPrompt, references);
      renderedValueRef.current = nextPrompt;
      renderedReferencesSignatureRef.current = referencesSignature;
    }
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
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={handleKeyDown}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onBlur={(event) => {
              if (readOnly) return;
              const nextFocusTarget = event.relatedTarget;
              flush();
              window.setTimeout(() => {
                if (isPromptTemplatePickerInteractionActive(nextFocusTarget)) return;
                setAtSearch(null);
                onSlashCommand?.(null);
              }, 120);
            }}
            className={`${className} relative z-10 overflow-auto whitespace-pre-wrap break-words caret-[var(--iw-text)] empty:before:text-[var(--iw-faint)] empty:before:content-[attr(data-placeholder)]`}
          />
        </div>
      </div>
    </div>
  );
});

export default BoardPromptTextarea;
