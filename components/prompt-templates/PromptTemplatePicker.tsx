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

interface PromptTemplatePickerProps {
  accent?: "blue" | "teal" | "violet";
  compact?: boolean;
  onApply: (template: PromptTemplate, mode: PromptTemplateApplyMode) => void;
}

export interface PromptTemplatePickerHandle {
  close: () => void;
  open: (search?: string) => void;
}

const accentClass: Record<NonNullable<PromptTemplatePickerProps["accent"]>, string> = {
  blue: "border-blue-400/25 bg-blue-500/12 text-blue-200 hover:bg-blue-500/18",
  teal: "border-teal-400/25 bg-teal-500/12 text-teal-200 hover:bg-teal-500/18",
  violet: "border-violet-400/25 bg-violet-500/12 text-violet-200 hover:bg-violet-500/18",
};

const panelWidth = 480;
const panelGap = 8;

function getPanelPosition(anchor: HTMLButtonElement): { left: number; top: number } {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  return {
    left: Math.max(panelGap, Math.min(rect.right - panelWidth, viewportWidth - panelWidth - panelGap)),
    top: rect.bottom + panelGap,
  };
}

const PromptTemplatePicker = forwardRef<PromptTemplatePickerHandle, PromptTemplatePickerProps>(function PromptTemplatePicker(
  { accent = "blue", compact = false, onApply },
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
        className="fixed z-[120] grid w-[min(30rem,calc(100vw-2rem))] grid-cols-1 gap-2 rounded-xl border border-[var(--iw-border)] bg-[var(--iw-panel)] p-3 shadow-2xl lg:grid-cols-[11rem_minmax(0,1fr)]"
        style={{ left: position.left, top: position.top }}
      >
        <div className="lg:col-span-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
            <BookOpenText className="h-4 w-4 text-[var(--iw-muted)]" />
            <span>提示词模板库</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-[var(--iw-muted)] hover:border-[var(--iw-border)] hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
            aria-label="关闭提示词模板库"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <label className="lg:col-span-2 flex h-8 items-center gap-2 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 text-[var(--iw-muted)]">
          <Search className="h-3.5 w-3.5" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模板"
            className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[var(--iw-text)] outline-none placeholder:text-[var(--iw-faint)]"
          />
        </label>

        <div className="no-scrollbar flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          <button
            type="button"
            onClick={() => setCategoryId("all")}
            data-active={categoryId === "all"}
            className="h-8 shrink-0 rounded-lg border border-[var(--iw-border)] px-2 text-left text-[11px] font-semibold text-[var(--iw-muted)] data-[active=true]:bg-[var(--iw-panel-soft)] data-[active=true]:text-[var(--iw-text)]"
          >
            全部
          </button>
          {PROMPT_TEMPLATE_CATEGORIES.map(category => (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryId(category.id)}
              data-active={categoryId === category.id}
              className="h-8 shrink-0 rounded-lg border border-[var(--iw-border)] px-2 text-left text-[11px] font-semibold text-[var(--iw-muted)] data-[active=true]:bg-[var(--iw-panel-soft)] data-[active=true]:text-[var(--iw-text)]"
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 gap-2">
          <div className="no-scrollbar flex max-h-36 flex-col gap-1 overflow-auto">
            {visibleTemplates.map(template => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                data-active={selectedTemplate?.id === template.id}
                className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2 text-left transition data-[active=true]:border-blue-400/35 data-[active=true]:bg-blue-500/10"
              >
                <span className="block truncate text-xs font-semibold text-[var(--iw-text)]">{template.title}</span>
                <span className="mt-0.5 block truncate text-[10px] text-[var(--iw-muted)]">{template.scene}</span>
              </button>
            ))}
            {visibleTemplates.length === 0 && (
              <div className="rounded-lg border border-dashed border-[var(--iw-border)] p-3 text-center text-[11px] text-[var(--iw-muted)]">
                没有匹配模板
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-2">
            <p className="line-clamp-4 whitespace-pre-wrap text-[11px] leading-5 text-[var(--iw-text)]">
              {selectedTemplate?.positivePrompt ?? "选择模板后预览内容"}
            </p>
            {selectedTemplate?.negativePrompt && (
              <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[var(--iw-muted)]">
                反向：{selectedTemplate.negativePrompt}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => applyTemplate("insert")}
              disabled={!selectedTemplate}
              className="flex h-8 items-center gap-1.5 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-[11px] font-semibold text-[var(--iw-text)] hover:bg-[var(--iw-panel)] disabled:text-[var(--iw-faint)]"
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
              插入
            </button>
            <button
              type="button"
              onClick={() => applyTemplate("replace")}
              disabled={!selectedTemplate}
              className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[11px] font-semibold text-white hover:bg-blue-500 disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
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
        className={`imagine-secondary-action flex h-7 items-center gap-1 rounded-md border px-2.5 text-[11px] font-semibold transition ${accentClass[accent]}`}
      >
        <BookOpenText className="h-3 w-3" />
        <span>{compact ? "模板" : "提示词模板"}</span>
      </button>
      {panel}
    </div>
  );
});

export default PromptTemplatePicker;
