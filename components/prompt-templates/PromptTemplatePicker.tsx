"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpenText, CornerDownLeft, Pencil, Plus, Search, Trash2, WandSparkles, X } from "lucide-react";
import { useAlert, useConfirm } from "@/components/confirm/ConfirmProvider";
import { useTranslations, type TFunction } from "@/lib/i18n";
import {
  CUSTOM_PROMPT_TEMPLATES_CHANGE_EVENT,
  createCustomPromptTemplate,
  isUserPromptTemplate,
  readCustomPromptTemplates,
  updateCustomPromptTemplate,
  writeCustomPromptTemplates,
  type CustomPromptTemplate,
  type CustomPromptTemplateDraft,
} from "@/lib/custom-prompt-templates";
import {
  PROMPT_TEMPLATE_CATEGORIES,
  PROMPT_TEMPLATES,
  type PromptTemplate,
  type PromptTemplateApplyMode,
  type PromptTemplateCategoryId,
} from "@/lib/prompt-templates";
import { markPromptTemplatePickerPointerDown } from "@/lib/prompt-template-picker-dom";
import {
  deleteTeamPromptTemplate,
  fetchTeamPromptTemplates,
  fetchWorkspaceStorageRuntimeStatus,
  readTeamCsrfToken,
  saveTeamPromptTemplate,
} from "@/lib/storage/team-client";

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

function translatedTemplateField(
  template: PromptTemplate,
  field: "parameterHint" | "scene" | "title",
  t: TFunction,
): string {
  if (isUserPromptTemplate(template)) return template[field] ?? "";
  const key = `promptTemplates.templates.${template.id}.${field}`;
  const value = t(key);
  return value === key ? template[field] ?? "" : value;
}

function translatedCategoryLabel(categoryId: PromptTemplateCategoryId, t: TFunction): string {
  const key = `promptTemplates.categories.${categoryId}`;
  const value = t(key);
  return value === key ? categoryId : value;
}
const panelMaxHeight = 440;

type TemplateEditorMode = "create" | "edit";
type CustomTemplateStorageTarget = "indexeddb" | "postgres";

const emptyDraft: CustomPromptTemplateDraft = {
  title: "",
  scene: "",
  positivePrompt: "",
  negativePrompt: "",
  parameterHint: "",
};

function draftFromTemplate(template: CustomPromptTemplate): CustomPromptTemplateDraft {
  return {
    title: template.title,
    scene: template.scene,
    positivePrompt: template.positivePrompt,
    negativePrompt: template.negativePrompt ?? "",
    parameterHint: template.parameterHint ?? "",
  };
}

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

async function readCustomTemplateStorageTarget(): Promise<CustomTemplateStorageTarget> {
  const status = await fetchWorkspaceStorageRuntimeStatus();
  return status.targetKind === "postgres" ? "postgres" : "indexeddb";
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
  const [customTemplates, setCustomTemplates] = useState<CustomPromptTemplate[]>([]);
  const [customTemplateStorageTarget, setCustomTemplateStorageTarget] = useState<CustomTemplateStorageTarget | null>(null);
  const [editorMode, setEditorMode] = useState<TemplateEditorMode | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomPromptTemplateDraft>(emptyDraft);
  const { t } = useTranslations("creation");
  const confirmAction = useConfirm();
  const showAlert = useAlert();

  useEffect(() => {
    let isActive = true;
    const readTemplates = async (): Promise<void> => {
      try {
        const storageTarget = await readCustomTemplateStorageTarget();
        const templates = storageTarget === "postgres"
          ? (await fetchTeamPromptTemplates()).templates
          : readCustomPromptTemplates();
        if (!isActive) return;
        setCustomTemplateStorageTarget(storageTarget);
        setCustomTemplates(templates);
      } catch (error) {
        console.error("Custom prompt template read failed:", error);
        if (!isActive) return;
        setCustomTemplates([]);
      }
    };
    const handleTemplatesChange = (): void => {
      void readTemplates();
    };
    void readTemplates();
    window.addEventListener(CUSTOM_PROMPT_TEMPLATES_CHANGE_EVENT, handleTemplatesChange);
    return () => {
      isActive = false;
      window.removeEventListener(CUSTOM_PROMPT_TEMPLATES_CHANGE_EVENT, handleTemplatesChange);
    };
  }, []);

  const openPicker = (search?: string): void => {
    setQuery(typeof search === "string" ? search : "");
    setCategoryId("all");
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

  const templates = useMemo(() => [...PROMPT_TEMPLATES, ...customTemplates], [customTemplates]);

  const visibleTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return templates.filter(template => {
      if (categoryId !== "all" && template.category !== categoryId) return false;
      if (!normalizedQuery) return true;
      return [
        translatedTemplateField(template, "title", t),
        translatedTemplateField(template, "scene", t),
        template.positivePrompt,
        template.negativePrompt ?? "",
        translatedTemplateField(template, "parameterHint", t),
      ].join(" ").toLowerCase().includes(normalizedQuery);
    });
  }, [categoryId, query, t, templates]);

  const selectedTemplate =
    visibleTemplates.find(template => template.id === selectedId) ?? visibleTemplates[0] ?? null;
  const selectedUserTemplate = selectedTemplate && isUserPromptTemplate(selectedTemplate) ? selectedTemplate : null;
  const isDraftValid = Boolean(draft.title.trim() && draft.scene.trim() && draft.positivePrompt.trim());

  const applyTemplate = (mode: PromptTemplateApplyMode): void => {
    if (!selectedTemplate) return;
    onApply(selectedTemplate, mode);
    setIsOpen(false);
  };

  const openCreateEditor = (): void => {
    setCategoryId("custom");
    setEditingTemplateId(null);
    setDraft(emptyDraft);
    setEditorMode("create");
  };

  const openEditEditor = (): void => {
    if (!selectedUserTemplate) return;
    setEditingTemplateId(selectedUserTemplate.id);
    setDraft(draftFromTemplate(selectedUserTemplate));
    setEditorMode("edit");
  };

  const closeEditor = (): void => {
    setEditorMode(null);
    setEditingTemplateId(null);
    setDraft(emptyDraft);
  };

  const saveBrowserCustomPromptTemplate = (
    savedTemplate: CustomPromptTemplate,
    editingTemplate: CustomPromptTemplate | null,
  ): CustomPromptTemplate[] => {
    const nextTemplates = editorMode === "edit" && editingTemplate
      ? customTemplates.map(template => template.id === editingTemplate.id ? savedTemplate : template)
      : [...customTemplates, savedTemplate];
    writeCustomPromptTemplates(nextTemplates);
    return nextTemplates;
  };

  const saveTeamCustomPromptTemplate = async (savedTemplate: CustomPromptTemplate): Promise<CustomPromptTemplate[]> => {
    const csrfToken = readTeamCsrfToken();
    if (!csrfToken) throw new Error("CSRF token is required");
    await saveTeamPromptTemplate(savedTemplate, csrfToken);
    const result = await fetchTeamPromptTemplates();
    window.dispatchEvent(new CustomEvent(CUSTOM_PROMPT_TEMPLATES_CHANGE_EVENT));
    return result.templates;
  };

  const deleteBrowserCustomPromptTemplate = (templateId: string): CustomPromptTemplate[] => {
    const nextTemplates = customTemplates.filter(template => template.id !== templateId);
    writeCustomPromptTemplates(nextTemplates);
    return nextTemplates;
  };

  const deleteTeamCustomPromptTemplate = async (templateId: string): Promise<CustomPromptTemplate[]> => {
    const csrfToken = readTeamCsrfToken();
    if (!csrfToken) throw new Error("CSRF token is required");
    await deleteTeamPromptTemplate(templateId, csrfToken);
    const result = await fetchTeamPromptTemplates();
    window.dispatchEvent(new CustomEvent(CUSTOM_PROMPT_TEMPLATES_CHANGE_EVENT));
    return result.templates;
  };

  const saveCustomTemplate = async (): Promise<void> => {
    if (!isDraftValid) return;
    try {
      const storageTarget = customTemplateStorageTarget ?? await readCustomTemplateStorageTarget();
      const editingTemplate = editingTemplateId
        ? customTemplates.find(template => template.id === editingTemplateId) ?? null
        : null;
      if (editorMode === "edit" && !editingTemplate) throw new Error("Custom prompt template not found");
      const savedTemplate = editorMode === "edit" && editingTemplate
        ? updateCustomPromptTemplate(editingTemplate, draft)
        : createCustomPromptTemplate(draft);
      const nextTemplates = storageTarget === "postgres"
        ? await saveTeamCustomPromptTemplate(savedTemplate)
        : saveBrowserCustomPromptTemplate(savedTemplate, editingTemplate);
      setCustomTemplateStorageTarget(storageTarget);
      setCustomTemplates(nextTemplates);
      setSelectedId(savedTemplate.id);
      setCategoryId("custom");
      closeEditor();
    } catch (error) {
      console.error("Custom prompt template save failed:", error);
      void showAlert({ message: t("promptTemplates.customSaveFailed"), tone: "danger" });
    }
  };

  const deleteCustomTemplate = async (): Promise<void> => {
    if (!selectedUserTemplate) return;
    const confirmed = await confirmAction({
      message: t("promptTemplates.customDeleteConfirm", { title: selectedUserTemplate.title }),
      confirmLabel: t("promptTemplates.customDeleteButton"),
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const storageTarget = customTemplateStorageTarget ?? await readCustomTemplateStorageTarget();
      const nextTemplates = storageTarget === "postgres"
        ? await deleteTeamCustomPromptTemplate(selectedUserTemplate.id)
        : deleteBrowserCustomPromptTemplate(selectedUserTemplate.id);
      setCustomTemplateStorageTarget(storageTarget);
      setCustomTemplates(nextTemplates);
      setSelectedId(PROMPT_TEMPLATES[0]?.id ?? nextTemplates[0]?.id ?? "");
      closeEditor();
    } catch (error) {
      console.error("Custom prompt template delete failed:", error);
      void showAlert({ message: t("promptTemplates.customDeleteFailed"), tone: "danger" });
    }
  };

  const panel = isOpen && position
    ? createPortal(
      <div
        data-prompt-template-picker-surface="true"
        onPointerDownCapture={markPromptTemplatePickerPointerDown}
        className="imagine-motion-surface-reveal fixed z-[120] flex max-h-[min(27.5rem,calc(100vh-1rem))] w-[min(26.25rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-lg border border-[var(--iw-border)] bg-[var(--iw-surface-raised)] shadow-[0_22px_60px_rgba(15,23,42,0.28)] backdrop-blur-xl"
        style={{ left: position.left, top: position.top }}
      >
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--iw-border)] px-3">
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
            <BookOpenText className="h-4 w-4 text-[var(--iw-muted)]" />
            <span className="truncate">{t("promptTemplates.panelTitle")}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={openCreateEditor}
              className="imagine-motion-interactive flex h-7 items-center gap-1 rounded-md border border-transparent px-2 text-[11px] font-semibold text-[var(--iw-muted)] hover:border-[var(--iw-border)] hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("promptTemplates.customNewButton")}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="imagine-motion-interactive flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--iw-muted)] hover:border-[var(--iw-border)] hover:bg-[var(--iw-panel-soft)] hover:text-[var(--iw-text)]"
              aria-label={t("promptTemplates.closePanelAriaLabel")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 p-3">
          <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2.5 text-[var(--iw-muted)]">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("promptTemplates.searchPlaceholder")}
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
              {t("promptTemplates.allCategory")}
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
                {translatedCategoryLabel(category.id, t)}
              </button>
            ))}
          </div>

          {editorMode ? (
            <div className="no-scrollbar min-h-0 overflow-auto rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-3">
              <div className="grid gap-2">
                <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--iw-muted)]">
                  {t("promptTemplates.customTitleLabel")}
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft(current => ({ ...current, title: event.target.value }))}
                    className="h-8 rounded-md border border-[var(--iw-border)] bg-[var(--iw-surface-raised)] px-2 text-xs font-medium normal-case tracking-normal text-[var(--iw-text)] outline-none"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--iw-muted)]">
                  {t("promptTemplates.customSceneLabel")}
                  <input
                    value={draft.scene}
                    onChange={(event) => setDraft(current => ({ ...current, scene: event.target.value }))}
                    className="h-8 rounded-md border border-[var(--iw-border)] bg-[var(--iw-surface-raised)] px-2 text-xs font-medium normal-case tracking-normal text-[var(--iw-text)] outline-none"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--iw-muted)]">
                  {t("promptTemplates.customPromptLabel")}
                  <textarea
                    value={draft.positivePrompt}
                    onChange={(event) => setDraft(current => ({ ...current, positivePrompt: event.target.value }))}
                    className="min-h-24 resize-none rounded-md border border-[var(--iw-border)] bg-[var(--iw-surface-raised)] px-2 py-1.5 text-xs font-medium leading-5 normal-case tracking-normal text-[var(--iw-text)] outline-none"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--iw-muted)]">
                  {t("promptTemplates.customNegativeLabel")}
                  <textarea
                    value={draft.negativePrompt}
                    onChange={(event) => setDraft(current => ({ ...current, negativePrompt: event.target.value }))}
                    className="min-h-16 resize-none rounded-md border border-[var(--iw-border)] bg-[var(--iw-surface-raised)] px-2 py-1.5 text-xs font-medium leading-5 normal-case tracking-normal text-[var(--iw-text)] outline-none"
                  />
                </label>
                <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--iw-muted)]">
                  {t("promptTemplates.customParameterHintLabel")}
                  <input
                    value={draft.parameterHint}
                    onChange={(event) => setDraft(current => ({ ...current, parameterHint: event.target.value }))}
                    className="h-8 rounded-md border border-[var(--iw-border)] bg-[var(--iw-surface-raised)] px-2 text-xs font-medium normal-case tracking-normal text-[var(--iw-text)] outline-none"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 grid-cols-[9.5rem_minmax(0,1fr)] gap-2">
              <div className="no-scrollbar min-h-0 overflow-auto rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] p-1">
                {visibleTemplates.map(template => {
                  const title = translatedTemplateField(template, "title", t);
                  const scene = translatedTemplateField(template, "scene", t);
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedId(template.id)}
                      data-active={selectedTemplate?.id === template.id}
                      className="imagine-motion-interactive w-full rounded-md px-2 py-1.5 text-left hover:bg-[var(--iw-panel)] data-[active=true]:bg-[var(--iw-tone-accent-bg)]"
                    >
                      <span className="block truncate text-[11px] font-semibold text-[var(--iw-text)]">{title}</span>
                      <span className="mt-0.5 block truncate text-[9px] text-[var(--iw-muted)]">{scene}</span>
                    </button>
                  );
                })}
                {visibleTemplates.length === 0 && (
                  <div className="rounded-md border border-dashed border-[var(--iw-border)] p-3 text-center text-[11px] text-[var(--iw-muted)]">
                    {t("promptTemplates.noMatchMessage")}
                  </div>
                )}
              </div>

              <div className="min-h-0 overflow-hidden rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)]">
                <div className="flex items-start justify-between gap-2 border-b border-[var(--iw-border)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[var(--iw-text)]">
                      {selectedTemplate ? translatedTemplateField(selectedTemplate, "title", t) : t("promptTemplates.selectTemplatePlaceholder")}
                    </p>
                    {selectedTemplate && translatedTemplateField(selectedTemplate, "parameterHint", t) ? (
                      <p className="mt-0.5 truncate text-[9px] text-[var(--iw-muted)]">{translatedTemplateField(selectedTemplate, "parameterHint", t)}</p>
                    ) : null}
                  </div>
                  {selectedUserTemplate && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={openEditEditor}
                        className="imagine-motion-interactive flex h-7 w-7 items-center justify-center rounded-md text-[var(--iw-muted)] hover:bg-[var(--iw-panel)] hover:text-[var(--iw-text)]"
                        aria-label={t("promptTemplates.customEditButton")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteCustomTemplate()}
                        className="imagine-motion-interactive flex h-7 w-7 items-center justify-center rounded-md text-[var(--iw-muted)] hover:bg-[var(--iw-danger-soft)] hover:text-[var(--iw-danger)]"
                        aria-label={t("promptTemplates.customDeleteButton")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="no-scrollbar max-h-44 overflow-auto px-3 py-2">
                  <p className="whitespace-pre-wrap text-[11px] leading-5 text-[var(--iw-text)]">
                    {selectedTemplate?.positivePrompt ?? t("promptTemplates.selectTemplatePreview")}
                  </p>
                  {selectedTemplate?.negativePrompt && (
                    <p className="mt-2 border-t border-[var(--iw-border)] pt-2 text-[10px] leading-4 text-[var(--iw-muted)]">
                      {t("promptTemplates.negativePrefix")}{selectedTemplate.negativePrompt}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {editorMode ? (
            <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--iw-border)] pt-2">
              <button
                type="button"
                onClick={closeEditor}
                className="imagine-motion-interactive flex h-8 items-center gap-1.5 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 text-[11px] font-semibold text-[var(--iw-text)] hover:bg-[var(--iw-panel)]"
              >
                {t("promptTemplates.customCancelButton")}
              </button>
              <button
                type="button"
                onClick={saveCustomTemplate}
                disabled={!isDraftValid}
                className="imagine-primary-action imagine-motion-interactive flex h-8 items-center gap-1.5 px-3 text-[11px] font-semibold disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
                data-size="compact"
              >
                <WandSparkles className="h-3.5 w-3.5" />
                {editorMode === "edit" ? t("promptTemplates.customUpdateButton") : t("promptTemplates.customSaveButton")}
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--iw-border)] pt-2">
              <button
                type="button"
                onClick={() => applyTemplate("insert")}
                disabled={!selectedTemplate}
                className="imagine-motion-interactive flex h-8 items-center gap-1.5 rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 text-[11px] font-semibold text-[var(--iw-text)] hover:bg-[var(--iw-panel)] disabled:text-[var(--iw-faint)]"
              >
                <CornerDownLeft className="h-3.5 w-3.5" />
                {t("promptTemplates.insertButton")}
              </button>
              <button
                type="button"
                onClick={() => applyTemplate("replace")}
                disabled={!selectedTemplate}
                className="imagine-primary-action imagine-motion-interactive flex h-8 items-center gap-1.5 px-3 text-[11px] font-semibold disabled:bg-[var(--iw-panel-soft)] disabled:text-[var(--iw-faint)]"
                data-size="compact"
              >
                <WandSparkles className="h-3.5 w-3.5" />
                {t("promptTemplates.replaceButton")}
              </button>
            </div>
          )}
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
        <span>{compact ? t("promptTemplates.compactLabel") : t("promptTemplates.buttonLabel")}</span>
      </button>
      {panel}
    </div>
  );
});

export default PromptTemplatePicker;
