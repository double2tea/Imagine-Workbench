"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpenText, CornerDownLeft, Search, WandSparkles, X } from "lucide-react";
import {
  PROMPT_TEMPLATE_CATEGORIES,
  PROMPT_TEMPLATES,
  type PromptTemplate,
  type PromptTemplateApplyMode,
  type PromptTemplateCategoryId,
} from "@/lib/prompt-templates";

export type PromptTemplatePickerAccent = "amber" | "blue" | "teal" | "violet";

interface PromptTemplatePickerProps {
  accent?: PromptTemplatePickerAccent;
  compact?: boolean;
  triggerVariant?: "accent" | "toolbar";
  onApply: (template: PromptTemplate, mode: PromptTemplateApplyMode) => void;
}

export interface PromptTemplatePickerHandle {
  close: () => void;
  open: (search?: string) => void;
}

const toolbarClass =
  "imagine-motion-interactive flex h-7 items-center gap-1 rounded-md border border-transparent bg-transparent px-2.5 text-[11px] font-semibold text-[var(--iw-muted)] transition hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]";

const panelWidth = 420;
const panelGap = 8;
const panelMaxHeight = 440;

function getPanelPosition(anchor: HTMLButtonElement): { left: number; top: number } {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const belowTop = rect.bottom + panelGap;
  const top = belowTop + panelMaxHeight > viewportHeight - panelGap
    ? Math.max(panelGap, rect.top - panelMaxHeight - panelGap)
    : belowTop;
  return {
    left: Math.max(panelGap, Math.min(rect.right - panelWidth, viewportWidth - panelWidth - panelGap)),
    top,
  };
}

const PromptTemplatePicker = forwardRef<PromptTemplatePickerHandle, PromptTemplatePickerProps>(function PromptTemplatePicker(
  { accent = "blue", compact = false, triggerVariant = "accent", onApply },
  forwardedRef,
) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<PromptTemplateCategoryId | "all">("all");
  const [selectedId, setSelectedId] = useState(PROMPT_TEMPLATES[0]?.id ?? "");
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const openPicker = (search?: string): void => {
    if (typeof search === "string") setQuery(search);
    const button = buttonRef.current;
    if (button) setPosition(getPanelPosition(button));
    setIsOpen(true);
  };

  useImperativeHandle(forwardedRef, () => ({
    close: () => setIsOpen(false),
    open: openPicker,
  }));

  useLayoutEffect(() => {
    if (!isOpen) return;
    const updatePosition = (): void => {
      const button = buttonRef.current;
      if (button) setPosition(getPanelPosition(button));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  const visibleTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return PROMPT_TEMPLATES.filter(template => {
      if (categoryId !== "all" && template.category !== categoryId) return false;
      if (!normalizedQuery) return true;
      return [
        template.title,
        template.scene,
        template.positivePrompt,
        template.negativePrompt ?? "",
        template.parameterHint ?? "",
      ].join(" ").toLowerCase().includes(normalizedQuery);
    });
  }, [categoryId, query]);

  const selectedTemplate =
    visibleTemplates.find(template => template.id === selectedId) ?? visibleTemplates[0] ?? null;

  const applyTemplate = (mode: PromptTemplateApplyMode): void => {
    if (!selectedTemplate) return;
    onApply(selectedTemplate, mode);
    setIsOpen(false);
  };

  const panel = isOpen && position
    ? createPortal(
      <div
        className="imagine-motion-surface-reveal fixed z-[120] flex max-h-[min(27.5rem,calc(100vh-1rem))] w-[min(26.25rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-lg border border-[var(--iw-border)] bg-[var(--iw-surface-raised)] shadow-[0_22px_60px_rgba(15,23,42,0.28)] backdrop-blur-xl"
        style={{ left: position.left, top: position.top }}
      >
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--iw-border)] px-3">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
            <BookOpenText className="h-4 w-4 text-[var(--iw-muted)]" />
            <span className="truncate">提示词模板库</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
              className="imagine-motion-interactive flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--iw-muted)] hover:border-[var(--iw-border)] hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
            aria-label="关闭提示词模板库"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 p-3">
          <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-[var(--iw-muted)]">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索模板"
              className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--iw-text)] outline-none placeholder:text-[var(--iw-faint)]"
            />
          </label>

          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              data-active={categoryId === "all"}
              className="imagine-motion-interactive h-7 shrink-0 rounded-md border border-transparent px-2.5 text-[11px] font-semibold text-[var(--iw-muted)] hover:bg-[var(--iw-panel-soft)] data-[active=true]:border-[var(--iw-tone-accent-border)] data-[active=true]:bg-[var(--iw-tone-accent-bg)] data-[active=true]:text-[var(--iw-tone-accent-text)]"
              data-tone="accent"
            >
              全部
            </button>
            {PROMPT_TEMPLATE_CATEGORIES.map(category => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                data-active={categoryId === category.id}
                className="imagine-motion-interactive h-7 shrink-0 rounded-md border border-transparent px-2.5 text-[11px] font-semibold text-[var(--iw-muted)] hover:bg-[var(--iw-panel-soft)] data-[active=true]:border-[var(--iw-tone-accent-border)] data-[active=true]:bg-[var(--iw-tone-accent-bg)] data-[active=true]:text-[var(--iw-tone-accent-text)]"
                data-tone="accent"
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className="grid min-h-0 grid-cols-[9.5rem_minmax(0,1fr)] gap-2">
            <div className="no-scrollbar min-h-0 overflow-auto rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-1">
              {visibleTemplates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  data-active={selectedTemplate?.id === template.id}
                  className="imagine-motion-interactive w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--iw-panel)] data-[active=true]:bg-[var(--iw-tone-accent-bg)]"
                >
                  <span className="block truncate text-[11px] font-semibold text-[var(--iw-text)]">{template.title}</span>
                  <span className="mt-0.5 block truncate text-[9px] text-[var(--iw-muted)]">{template.scene}</span>
                </button>
              ))}
              {visibleTemplates.length === 0 && (
                <div className="rounded-md border border-dashed border-[var(--iw-border)] p-3 text-center text-[11px] text-[var(--iw-muted)]">
                  没有匹配模板
                </div>
              )}
            </div>

            <div className="min-h-0 overflow-hidden rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]">
              <div className="border-b border-[var(--iw-border)] px-3 py-2">
                <p className="truncate text-xs font-semibold text-[var(--iw-text)]">
                  {selectedTemplate?.title ?? "选择模板"}
                </p>
                {selectedTemplate?.parameterHint && (
                  <p className="mt-0.5 truncate text-[9px] text-[var(--iw-muted)]">{selectedTemplate.parameterHint}</p>
                )}
              </div>
              <div className="no-scrollbar max-h-44 overflow-auto px-3 py-2">
                <p className="whitespace-pre-wrap text-[11px] leading-5 text-[var(--iw-text)]">
                  {selectedTemplate?.positivePrompt ?? "选择模板后预览内容"}
                </p>
                {selectedTemplate?.negativePrompt && (
                  <p className="mt-2 border-t border-[var(--iw-border)] pt-2 text-[10px] leading-4 text-[var(--iw-muted)]">
                    反向：{selectedTemplate.negativePrompt}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--iw-border)] pt-2">
            <button
              type="button"
              onClick={() => applyTemplate("insert")}
              disabled={!selectedTemplate}
              className="imagine-motion-interactive flex h-8 items-center gap-1.5 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 text-[11px] font-semibold text-[var(--iw-text)] hover:bg-[var(--iw-panel)] disabled:text-[var(--iw-faint)]"
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
              插入
            </button>
            <button
              type="button"
              onClick={() => applyTemplate("replace")}
              disabled={!selectedTemplate}
              className="imagine-motion-interactive flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
            >
              <WandSparkles className="h-3.5 w-3.5" />
              替换
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="nodrag relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          openPicker();
        }}
        className={
          triggerVariant === "toolbar"
            ? toolbarClass
            : "imagine-tone-chip flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition"
        }
        data-tone={accent}
      >
        <BookOpenText className="h-3 w-3" />
        <span>{compact ? "模板" : "提示词模板"}</span>
      </button>
      {panel}
    </div>
  );
});

export default PromptTemplatePicker;
