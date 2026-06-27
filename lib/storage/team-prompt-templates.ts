import type { QueryResultRow } from "pg";
import { readCustomPromptTemplate, type CustomPromptTemplate } from "@/lib/custom-prompt-templates";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import type {
  TeamPromptTemplateListResult,
  TeamPromptTemplateMutationResult,
} from "@/lib/storage/team-prompt-template-types";

interface PromptTemplateRow extends QueryResultRow {
  template: CustomPromptTemplate;
}

export interface TeamPromptTemplateSaveInput {
  template: CustomPromptTemplate;
}

export async function listTeamPromptTemplates(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
): Promise<TeamPromptTemplateListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "viewer" });
  const result = await queryable.query<PromptTemplateRow>(
    "select template from prompt_templates where workspace_id = $1 order by updated_at desc",
    [context.session.workspaceId],
  );
  return {
    targetKind: "postgres",
    templates: result.rows.map(row => readCustomPromptTemplate(row.template)),
    workspaceId: context.session.workspaceId,
  };
}

export async function saveTeamPromptTemplate(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: TeamPromptTemplateSaveInput,
): Promise<TeamPromptTemplateMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  await queryable.query(
    `insert into prompt_templates (id, workspace_id, template, created_at, updated_at)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update
       set template = excluded.template, updated_at = excluded.updated_at
       where prompt_templates.workspace_id = excluded.workspace_id`,
    [
      input.template.id,
      context.session.workspaceId,
      input.template,
      input.template.createdAt,
      input.template.updatedAt,
    ],
  );
  return {
    targetKind: "postgres",
    template: input.template,
    workspaceId: context.session.workspaceId,
  };
}

export async function deleteTeamPromptTemplate(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  templateId: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  await queryable.query("begin");
  try {
    await queryable.query("delete from prompt_templates where workspace_id = $1 and id = $2", [
      context.session.workspaceId,
      templateId,
    ]);
    await recordTeamAuditEvent(queryable, {
      eventType: "team_prompt_template.delete",
      metadata: { templateId },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await queryable.query("commit");
  } catch (error) {
    await queryable.query("rollback");
    throw error;
  }
}
