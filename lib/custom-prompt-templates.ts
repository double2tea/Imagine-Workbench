import type { PromptTemplate } from "./prompt-templates";

export interface CustomPromptTemplate extends PromptTemplate {
  category: "custom";
  createdAt: string;
  updatedAt: string;
}

export interface CustomPromptTemplateDraft {
  title: string;
  scene: string;
  positivePrompt: string;
  negativePrompt: string;
  parameterHint: string;
}

const CUSTOM_PROMPT_TEMPLATES_STORAGE_KEY = "imagine_custom_prompt_templates";
const CUSTOM_PROMPT_TEMPLATE_ID_PREFIX = "user-prompt-template-";
export const CUSTOM_PROMPT_TEMPLATES_CHANGE_EVENT = "imagine-custom-prompt-templates-change";

export function isUserPromptTemplate(template: PromptTemplate): template is CustomPromptTemplate {
  return template.category === "custom" && template.id.startsWith(CUSTOM_PROMPT_TEMPLATE_ID_PREFIX);
}

export function readCustomPromptTemplates(): CustomPromptTemplate[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(CUSTOM_PROMPT_TEMPLATES_STORAGE_KEY);
  if (!stored) return [];
  const parsed = JSON.parse(stored) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Custom prompt templates must be an array");
  return parsed.map(readCustomPromptTemplate);
}

export function createCustomPromptTemplate(draft: CustomPromptTemplateDraft): CustomPromptTemplate {
  const now = new Date().toISOString();
  return {
    ...normalizeCustomPromptTemplateDraft(draft),
    id: `${CUSTOM_PROMPT_TEMPLATE_ID_PREFIX}${crypto.randomUUID()}`,
    category: "custom",
    createdAt: now,
    updatedAt: now,
  };
}

export function updateCustomPromptTemplate(
  template: CustomPromptTemplate,
  draft: CustomPromptTemplateDraft,
): CustomPromptTemplate {
  return {
    ...template,
    ...normalizeCustomPromptTemplateDraft(draft),
    updatedAt: new Date().toISOString(),
  };
}

export function writeCustomPromptTemplates(templates: readonly CustomPromptTemplate[]): void {
  window.localStorage.setItem(CUSTOM_PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  window.dispatchEvent(new CustomEvent(CUSTOM_PROMPT_TEMPLATES_CHANGE_EVENT));
}

function normalizeCustomPromptTemplateDraft(draft: CustomPromptTemplateDraft): Omit<
  CustomPromptTemplate,
  "category" | "createdAt" | "id" | "updatedAt"
> {
  const title = draft.title.trim();
  const scene = draft.scene.trim();
  const positivePrompt = draft.positivePrompt.trim();
  if (!title || !scene || !positivePrompt) throw new Error("Custom prompt template requires title, scene, and prompt");
  const negativePrompt = draft.negativePrompt.trim();
  const parameterHint = draft.parameterHint.trim();
  return {
    title,
    scene,
    positivePrompt,
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(parameterHint ? { parameterHint } : {}),
  };
}

export function readCustomPromptTemplate(value: unknown): CustomPromptTemplate {
  if (typeof value !== "object" || value === null) throw new Error("Invalid custom prompt template");
  const record = value as Record<string, unknown>;
  const id = readString(record.id, "id");
  if (!id.startsWith(CUSTOM_PROMPT_TEMPLATE_ID_PREFIX)) throw new Error("Invalid custom prompt template id");
  return {
    id,
    category: "custom",
    title: readString(record.title, "title"),
    scene: readString(record.scene, "scene"),
    positivePrompt: readString(record.positivePrompt, "positivePrompt"),
    negativePrompt: readOptionalString(record.negativePrompt),
    parameterHint: readOptionalString(record.parameterHint),
    createdAt: readString(record.createdAt, "createdAt"),
    updatedAt: readString(record.updatedAt, "updatedAt"),
  };
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid custom prompt template ${field}`);
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
