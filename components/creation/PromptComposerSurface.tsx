import { useId, useState, type DragEvent, type ReactNode } from "react";
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
  mobileHint = "@ 可引用作品",
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
  const referenceThumbnails = resolvePromptReferenceThumbnails(prompt, references, acceptedMediaTypes);
  const emitSelection = (element: HTMLTextAreaElement): void => {
    onSelectionChange?.({ end: element.selectionEnd, start: element.selectionStart });
  };
  return (
    <div>
      {headerVariant === "toolbar" ? (
        <div className="mb-2 flex min-h-10 items-center justify-between gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5">
          <label htmlFor={textareaId} className="flex min-w-0 items-center gap-2">
            <span
              className="imagine-tone-surface flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
              data-tone={headerAccent}
            >
              {icon}
            </span>
            <span className="truncate text-xs font-semibold text-[var(--iw-text)]">{label}</span>
          </label>
          <div className="flex shrink-0 items-center rounded-md border border-[var(--iw-border)] bg-[var(--iw-surface-raised)] p-0.5">
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
            className={`imagine-field-textarea relative z-10 h-24 text-sm leading-6 caret-[var(--iw-text)] transition-all duration-200 ${
              isDragOver ? "scale-[1.01]" : ""
            } ${referenceThumbnails.length > 0 ? "!text-transparent" : ""}`}
          />
          <PromptReferenceInlineOverlay
            acceptedMediaTypes={acceptedMediaTypes}
            prompt={prompt}
            references={references}
            className="text-sm leading-6"
          />
        </div>
        <div className="imagine-field-shell-footer mt-2 flex items-center justify-between pt-2">
          <span className="hidden sm:inline">{desktopHint}</span>
          <span className="sm:hidden">{mobileHint}</span>
          <span>{prompt.length} 字符</span>
        </div>
      </div>
    </div>
  );
}
