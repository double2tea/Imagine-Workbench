import type { CustomPromptTemplate } from "@/lib/custom-prompt-templates";

export interface TeamPromptTemplateListResult {
  targetKind: "postgres";
  templates: CustomPromptTemplate[];
  workspaceId: string;
}

export interface TeamPromptTemplateMutationResult {
  targetKind: "postgres";
  template: CustomPromptTemplate;
  workspaceId: string;
}
