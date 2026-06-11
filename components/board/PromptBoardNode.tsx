import { memo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
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
  onAnalyzeMedia?: () => void | Promise<void>;
  onChange: (prompt: string) => void;
  onSelectReference?: (reference: BoardPromptReference, index: number) => void;
  references: BoardPromptReference[];
}

const PromptBoardNode = memo(function PromptBoardNode({ node, onAnalyzeMedia, onChange, onSelectReference, references }: PromptBoardNodeProps) {
  const textareaRef = useRef<BoardPromptTextareaHandle | null>(null);
  const templatePickerRef = useRef<PromptTemplatePickerHandle | null>(null);
  const slashCommandRef = useRef<PromptTemplateSlashCommand | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  const handleAnalyzeMedia = async (): Promise<void> => {
    if (!onAnalyzeMedia || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      await onAnalyzeMedia();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const headerRight = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void handleAnalyzeMedia()}
        disabled={!onAnalyzeMedia || isAnalyzing}
        className="imagine-header-button flex !h-7 !w-7 items-center justify-center !rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel)] text-teal-200 shadow-sm transition hover:bg-[var(--iw-panel-soft)] disabled:cursor-not-allowed disabled:opacity-45"
        title="分析连入媒体为 Note"
      >
        <Sparkles className={`h-3.5 w-3.5 ${isAnalyzing ? "animate-pulse" : ""}`} />
      </button>
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
