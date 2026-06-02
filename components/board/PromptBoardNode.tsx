import { useRef, useState } from "react";
import PromptReferenceDropdown from "@/components/reference/PromptReferenceDropdown";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { BoardPromptNode } from "@/lib/board";

interface PromptBoardNodeProps {
  node: BoardPromptNode;
  onChange: (prompt: string) => void;
  references: ReferenceImageRef[];
}

export default function PromptBoardNode({ node, onChange, references }: PromptBoardNodeProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [atSearch, setAtSearch] = useState<string | null>(null);

  const handleChange = (value: string, caret: number | null): void => {
    onChange(value);
    if (caret === null) {
      setAtSearch(null);
      return;
    }
    const beforeCaret = value.slice(0, caret);
    const match = beforeCaret.match(/@([^\s@]*)$/);
    setAtSearch(match ? match[1] : null);
  };

  const handleSelectReference = (index: number): void => {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? node.prompt.length;
    const searchLength = atSearch?.length ?? 0;
    const start = Math.max(0, caret - searchLength - 1);
    const nextPrompt = `${node.prompt.slice(0, start)}@图片${index + 1} ${node.prompt.slice(caret)}`;
    const nextCaret = start + `@图片${index + 1} `.length;
    onChange(nextPrompt);
    setAtSearch(null);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  return (
    <div className="relative h-full">
      {atSearch !== null && (
        <div className="absolute left-2 right-2 top-2 z-30">
          <PromptReferenceDropdown references={references} search={atSearch} onSelect={handleSelectReference} />
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={node.prompt}
        onChange={(event) => handleChange(event.target.value, event.target.selectionStart)}
        onBlur={() => window.setTimeout(() => setAtSearch(null), 120)}
        className="nodrag nowheel h-full w-full resize-none imagine-board-input p-3 text-xs leading-5 outline-none placeholder:text-[var(--iw-faint)]"
        placeholder="写提示词，输入 @ 引用参考图"
      />
    </div>
  );
}
