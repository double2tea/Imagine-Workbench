import { useRef } from "react";
import BoardPromptTextarea from "@/components/board/BoardPromptTextarea";
import PromptTemplatePicker from "@/components/prompt-templates/PromptTemplatePicker";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import type { BoardPromptNode } from "@/lib/board";
import {
  applyPromptTemplateText,
  insertPromptTemplateText,
  type PromptTemplate,
  type PromptTemplateApplyMode,
} from "@/lib/prompt-templates";

interface PromptBoardNodeProps {
  node: BoardPromptNode;
  onChange: (prompt: string) => void;
  references: ReferenceImageRef[];
}

export default function PromptBoardNode({ node, onChange, references }: PromptBoardNodeProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleApplyPromptTemplate = (template: PromptTemplate, mode: PromptTemplateApplyMode): void => {
    const textarea = textareaRef.current;
    if (mode === "replace") {
      onChange(applyPromptTemplateText(node.prompt, template.positivePrompt, mode));
      return;
    }
    const selectionStart = textarea?.selectionStart ?? node.prompt.length;
    const selectionEnd = textarea?.selectionEnd ?? node.prompt.length;
    const result = insertPromptTemplateText(node.prompt, template.positivePrompt, selectionStart, selectionEnd);
    onChange(result.prompt);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(result.caret, result.caret);
    });
  };

  return (
    <BoardPromptTextarea
      ref={textareaRef}
      value={node.prompt}
      onChange={onChange}
      references={references}
      headerRight={<PromptTemplatePicker accent="teal" compact onApply={handleApplyPromptTemplate} />}
      placeholder="写提示词，输入 @ 引用参考图"
    />
  );
}