import { forwardRef } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import PromptTemplatePicker, {
  type PromptTemplatePickerAccent,
  type PromptTemplatePickerHandle,
} from "@/components/prompt-templates/PromptTemplatePicker";
import type { PromptTemplate, PromptTemplateApplyMode } from "@/lib/prompt-templates";

interface PromptComposerToolbarActionsProps {
  accent: PromptTemplatePickerAccent;
  isOptimizing: boolean;
  optimizeDisabled: boolean;
  optimizeLabel: string;
  onApplyTemplate: (template: PromptTemplate, mode: PromptTemplateApplyMode) => void;
  onOptimize: () => void;
}

const accentTextClass: Record<PromptTemplatePickerAccent, string> = {
  amber: "text-amber-300 hover:text-amber-200",
  blue: "text-blue-300 hover:text-blue-200",
  teal: "text-teal-300 hover:text-teal-200",
  violet: "text-violet-300 hover:text-violet-200",
};

const PromptComposerToolbarActions = forwardRef<PromptTemplatePickerHandle, PromptComposerToolbarActionsProps>(
  function PromptComposerToolbarActions(
    {
      accent,
      isOptimizing,
      optimizeDisabled,
      optimizeLabel,
      onApplyTemplate,
      onOptimize,
    },
    forwardedRef,
  ) {
    return (
      <>
        <PromptTemplatePicker
          ref={forwardedRef}
          accent={accent}
          compact
          triggerVariant="toolbar"
          onApply={onApplyTemplate}
        />
        <span className="h-4 w-px shrink-0 bg-[var(--iw-border)]" aria-hidden="true" />
        <button
          type="button"
          onClick={onOptimize}
          disabled={optimizeDisabled}
          className={`imagine-motion-interactive flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition ${
            optimizeDisabled
              ? "cursor-not-allowed text-[var(--iw-faint)]"
              : `cursor-pointer text-[var(--iw-muted)] hover:bg-[var(--iw-panel-soft)] ${accentTextClass[accent]}`
          }`}
        >
          {isOptimizing ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          <span>{optimizeLabel}</span>
        </button>
      </>
    );
  },
);

export default PromptComposerToolbarActions;
