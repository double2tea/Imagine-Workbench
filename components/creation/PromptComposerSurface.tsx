import { useId, useState, type DragEvent, type ReactNode } from "react";
import { useTranslations } from "@/lib/i18n";
import type { ReferenceImageRef } from "@/components/reference/ReferenceImagePicker";
import PromptReferenceInlineOverlay, {
  resolvePromptReferenceThumbnails,
} from "@/components/reference/PromptReferenceThumbnailStrip";
import { hasDraggedReferenceAsset } from "@/components/reference/referenceDrag";
import type { MediaReferenceType } from "@/lib/media-references";

export interface PromptComposerSelectionRange {
  end: number;
  start: number;
}

interface PromptComposerSurfaceProps {
  acceptedMediaTypes: ReadonlyArray<MediaReferenceType>;
  actions: ReactNode;
  atDropdownNode: ReactNode;
  desktopHint: string;
  headerAccent?: "blue" | "teal" | "violet" | "amber";
  headerVariant?: "plain" | "toolbar";
  icon: ReactNode;
  label: string;
  mobileHint?: string;
  name?: string;
  onChange: (value: string, caret: number) => void;
  onDropAsset: (event: DragEvent<HTMLTextAreaElement>) => void;
  onSelectionChange?: (selection: PromptComposerSelectionRange) => void;
  placeholder: string;
  prompt: string;
  references: ReadonlyArray<ReferenceImageRef>;
}

export default function PromptComposerSurface({
  acceptedMediaTypes,
  actions,
  atDropdownNode,
  desktopHint,
  headerAccent = "blue",
  headerVariant = "plain",
  icon,
  label,
  mobileHint,
  name = "prompt",
  onChange,
  onDropAsset,
  onSelectionChange,
  placeholder,
  prompt,
  references,
}: PromptComposerSurfaceProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaId = useId();
  const { t } = useTranslations("common");
  const referenceThumbnails = resolvePromptReferenceThumbnails(prompt, references, acceptedMediaTypes);
  const resolvedMobileHint = mobileHint ?? t("promptComposer.mobileHint");
  const charLabel = t("promptComposer.charCount");
  const emitSelection = (element: HTMLTextAreaElement): void => {
    onSelectionChange?.({ end: element.selectionEnd, start: element.selectionStart });
  };
  return (
    <div>
      {headerVariant === "toolbar" ? (
        <div className="mb-2 flex min-h-9 items-center justify-between gap-2">
          <label htmlFor={textareaId} className="flex min-w-0 items-center gap-2">
            <span
              className="imagine-tone-surface flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
              data-tone={headerAccent}
            >
              {icon}
            </span>
            <span className="iw-type-label truncate font-semibold text-[var(--iw-text)]">{label}</span>
          </label>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
          </div>
        </div>
      ) : (
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor={textareaId} className="flex items-center gap-1.5 imagine-section-label">
            {icon}
            {label}
          </label>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}

      <div
        className={`imagine-field-shell relative p-3 transition-all duration-200 ${
          isDragOver ? "border-[var(--iw-accent)]/40 ring-2 ring-[var(--iw-accent)]/30" : ""
        }`}
      >
        {atDropdownNode}
        <div className="relative">
          <textarea
            id={textareaId}
            name={name}
            value={prompt}
            onBlur={(event) => emitSelection(event.currentTarget)}
            onChange={(event) => {
              onChange(event.target.value, event.target.selectionStart);
              emitSelection(event.currentTarget);
            }}
            onClick={(event) => emitSelection(event.currentTarget)}
            onDragEnter={(event) => {
              if (!hasDraggedReferenceAsset(event.dataTransfer)) return;
              event.preventDefault();
              setIsDragOver(true);
            }}
            onDragOver={(event) => {
              if (!hasDraggedReferenceAsset(event.dataTransfer)) return;
              event.dataTransfer.dropEffect = "copy";
              event.preventDefault();
            }}
            onDragLeave={(event) => {
              const relatedTarget = event.relatedTarget;
              if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
                setIsDragOver(false);
              }
            }}
            onDrop={(event) => {
              setIsDragOver(false);
              onDropAsset(event);
            }}
            onKeyUp={(event) => emitSelection(event.currentTarget)}
            onSelect={(event) => emitSelection(event.currentTarget)}
            placeholder={placeholder}
            className={`imagine-field-textarea iw-type-body relative z-10 h-36 caret-[var(--iw-text)] transition-all duration-200 ${
              isDragOver ? "scale-[1.01]" : ""
            } ${referenceThumbnails.length > 0 ? "!text-transparent" : ""}`}
          />
          <PromptReferenceInlineOverlay
            acceptedMediaTypes={acceptedMediaTypes}
            prompt={prompt}
            references={references}
            className="iw-type-body"
          />
        </div>
        <div className="imagine-field-shell-footer mt-2 flex items-center justify-between pt-2">
          <span className="hidden sm:inline">{desktopHint}</span>
          <span className="sm:hidden">{resolvedMobileHint}</span>
          <span>{prompt.length} {charLabel}</span>
        </div>
      </div>
    </div>
  );
}
