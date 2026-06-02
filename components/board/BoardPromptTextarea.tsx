"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import PromptReferenceDropdown from "@/components/reference/PromptReferenceDropdown";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import { getReferencePromptToken } from "@/hooks/useReferenceState";
import { detectPromptTemplateSlashCommand, type PromptTemplateSlashCommand } from "@/lib/prompt-templates";

function detectAtSearch(value: string, caret: number): string | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/@([^\s@]*)$/);
  return match ? match[1] : null;
}

interface BoardPromptTextareaProps {
  className?: string;
  headerRight?: ReactNode;
  onChange: (value: string) => void;
  onSlashCommand?: (command: PromptTemplateSlashCommand | null) => void;
  placeholder?: string;
  readOnly?: boolean;
  references: ReferenceImageRef[];
  value: string;
}

const BoardPromptTextarea = forwardRef<HTMLTextAreaElement, BoardPromptTextareaProps>(function BoardPromptTextarea(
  {
    className = "nodrag nowheel h-full w-full resize-none imagine-board-input p-3 pr-20 text-xs leading-5 outline-none placeholder:text-[var(--iw-faint)]",
    headerRight,
    onChange,
    onSlashCommand,
    placeholder = "写提示词，输入 @ 引用连线/画板/画廊参考图",
    readOnly = false,
    references,
    value,
  },
  forwardedRef,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [atSearch, setAtSearch] = useState<string | null>(null);

  useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement, []);

  const handleChange = (nextValue: string, caret: number | null): void => {
    if (readOnly) return;
    onChange(nextValue);
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
    const caret = textarea?.selectionStart ?? value.length;
    const searchLength = atSearch?.length ?? 0;
    const start = Math.max(0, caret - searchLength - 1);
    const token = getReferencePromptToken(index);
    const nextPrompt = `${value.slice(0, start)}${token} ${value.slice(caret)}`;
    const nextCaret = start + `${token} `.length;
    onChange(nextPrompt);
    setAtSearch(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <div className="relative h-full min-h-0">
      {headerRight ? <div className="pointer-events-none absolute right-2 top-2 z-20 [&>*]:pointer-events-auto">{headerRight}</div> : null}
      <div className="relative flex h-full min-h-0 flex-col p-2 pt-2">
        {!readOnly && atSearch !== null ? (
          <PromptReferenceDropdown references={references} search={atSearch} onSelect={handleSelectReference} />
        ) : null}
        <textarea
          ref={textareaRef}
          value={value}
          readOnly={readOnly}
          onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
          onBlur={() => {
            if (readOnly) return;
            window.setTimeout(() => {
              setAtSearch(null);
              onSlashCommand?.(null);
            }, 120);
          }}
          className={className}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
});

export default BoardPromptTextarea;
