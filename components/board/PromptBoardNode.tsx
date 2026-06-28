import { memo, useRef } from "react";
import { Play } from "lucide-react";
import BoardPromptTextarea, { type BoardPromptTextareaHandle } from "@/components/board/BoardPromptTextarea";
import PromptTemplatePicker, { type PromptTemplatePickerHandle } from "@/components/prompt-templates/PromptTemplatePicker";
import type { BoardPromptNode } from "@/lib/board";
import type { BoardPromptReference } from "@/lib/board/prompt-references";
import { useTranslations } from "@/lib/i18n";
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
  onExecute: () => void | Promise<void>;
  onSelectReference?: (reference: BoardPromptReference, index: number) => void;
  references: BoardPromptReference[];
}

const PromptBoardNode = memo(function PromptBoardNode({ node, onChange, onExecute, onSelectReference, references }: PromptBoardNodeProps) {
  const { t } = useTranslations("board");
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
      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          void onExecute();
        }}
        onPointerDown={event => event.stopPropagation()}
        className="nodrag nopan imagine-floating-card-action flex h-7 w-7 items-center justify-center"
        title={t("contextMenu.execute")}
      >
        <Play className="h-3.5 w-3.5" />
      </button>
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
      placeholder={t('node.promptPlaceholder')}
    />
  );
});

export default PromptBoardNode;
