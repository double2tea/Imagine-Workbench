import { memo, useRef } from "react";
import BoardPromptTextarea, { type BoardPromptTextareaHandle } from "@/components/board/BoardPromptTextarea";
import PromptTemplatePicker, { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import type { BoardPromptNode } from "@/lib/board";
import type { BoardPromptReference } from "@/lib/board/prompt-references";
import {
  applyPromptTemplateText,
  insertPromptTemplateText,
  type PromptTemplate,
  type PromptTemplateApplyMode,
  type PromptTemplateSlashCommand,
} from "@/lib/prompt-templates";

interface PromptBoardNodeProps {
  node: BoardPromptNode;
  onChange: (prompt: string) => void;
  onSelectReference?: (reference: BoardPromptReference, index: number) => void;
  references: BoardPromptReference[];
}

const PromptBoardNode = memo(function PromptBoardNode({ node, onChange, onSelectReference, references }: PromptBoardNodeProps) {
  const textareaRef = useRef<BoardPromptTextareaHandle | null>(null);
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const slashCommandRef = useRef<PromptTemplateSlashCommand | null>(null);

  const handleApplyPromptTemplate = (template: PromptTemplate, mode: PromptTemplateApplyMode): void => {
    const textarea = textareaRef.current;
    const currentPrompt = textarea?.getValue() ?? node.prompt;
    const slashCommand = slashCommandRef.current;
    if (slashCommand && mode === "insert") {
      const result = insertPromptTemplateText(currentPrompt, template.positivePrompt, slashCommand.start, slashCommand.end);
      textarea?.setValue(result.prompt);
      slashCommandRef.current = null;
      window.requestAnimationFrame(() => textareaRef.current?.focusAt(result.caret));
      return;
    }
    if (mode === "replace") {
      textarea?.setValue(applyPromptTemplateText(currentPrompt, template.positivePrompt, mode));
      slashCommandRef.current = null;
      return;
    }
    const selection = textarea?.getSelectionRange() ?? { start: currentPrompt.length, end: currentPrompt.length };
    const result = insertPromptTemplateText(currentPrompt, template.positivePrompt, selection.start, selection.end);
    textarea?.setValue(result.prompt);
    window.requestAnimationFrame(() => textareaRef.current?.focusAt(result.caret));
  };

  const handleSlashCommand = (command: PromptTemplateSlashCommand | null): void => {
    slashCommandRef.current = command;
    if (command) {
      templatePickerRef.current?.open(command.search);
    } else {
      templatePickerRef.current?.close();
    }
  };

  const headerRight = (
    <div className="flex items-center gap-1">
      <PromptTemplatePicker ref={templatePickerRef} accent="teal" compact onApply={handleApplyPromptTemplate} />
    </div>
  );

  return (
    <BoardPromptTextarea
      ref={textareaRef}
      commitId={node.id}
      value={node.prompt}
      onChange={onChange}
      onSelectReference={onSelectReference}
      onSlashCommand={handleSlashCommand}
      references={references}
      headerRight={headerRight}
      className="nodrag nowheel nopan h-full w-full resize-none overflow-y-auto overscroll-contain imagine-board-input !p-3 !pr-20 text-xs leading-5 outline-none placeholder:text-[var(--iw-faint)]"
      placeholder="写提示词，输入 @ 引用媒体"
    />
  );
});

export default PromptBoardNode;
