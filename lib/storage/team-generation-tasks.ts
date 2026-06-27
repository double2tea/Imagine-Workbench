import { ApiError } from "@/lib/api/errors";
import {
  applyGenerationTaskUpdate,
  type GenerationTask,
  type GenerationTaskUpdate,
} from "@/lib/generation-tasks";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceGenerationTaskListOptions } from "@/lib/storage/repository";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import type {
  TeamGenerationTaskListResult,
  TeamGenerationTaskMutationResult,
} from "@/lib/storage/team-generation-task-types";

export interface TeamGenerationTaskSaveInput {
  task: GenerationTask;
}

export interface TeamGenerationTaskUpdateInput {
  update: GenerationTaskUpdate;
}

export async function listTeamGenerationTasks(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  options: WorkspaceGenerationTaskListOptions,
): Promise<TeamGenerationTaskListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "viewer" });
  const records = await context.repository.generationTasks.list(options);
  return {
    limit: options.limit ?? 100,
    offset: options.offset ?? 0,
    targetKind: "postgres",
    tasks: records.map(record => record.task),
    workspaceId: context.session.workspaceId,
  };
}

export async function saveTeamGenerationTask(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: TeamGenerationTaskSaveInput,
): Promise<TeamGenerationTaskMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  await context.repository.generationTasks.put(input.task);
  return {
    targetKind: "postgres",
    task: input.task,
    workspaceId: context.session.workspaceId,
  };
}

export async function updateTeamGenerationTask(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  taskId: string,
  input: TeamGenerationTaskUpdateInput,
): Promise<TeamGenerationTaskMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  const current = await context.repository.generationTasks.get(taskId);
  if (!current) throw new ApiError(404, "team_generation_task_not_found", "Team generation task not found");
  const next = applyGenerationTaskUpdate(current.task, input.update);
  if (input.update.status === "canceled") {
    await context.queryable.query("begin");
    try {
      await context.repository.generationTasks.put(next);
      await recordTeamAuditEvent(context.queryable, {
        eventType: "team_generation_task.cancel",
        metadata: {
          boardId: current.task.source.boardId ?? null,
          mediaType: current.task.mediaType,
          nextStatus: next.status,
          previousStatus: current.task.status,
          taskId,
        },
        userId: context.session.userId,
        workspaceId: context.session.workspaceId,
      });
      await context.queryable.query("commit");
    } catch (error) {
      await context.queryable.query("rollback");
      throw error;
    }
  } else {
    await context.repository.generationTasks.put(next);
  }
  return {
    targetKind: "postgres",
    task: next,
    workspaceId: context.session.workspaceId,
  };
}

export async function deleteTeamGenerationTask(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  taskId: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  const current = await context.repository.generationTasks.get(taskId);
  if (!current) throw new ApiError(404, "team_generation_task_not_found", "Team generation task not found");
  await context.queryable.query("begin");
  try {
    await context.repository.generationTasks.delete(taskId);
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_generation_task.delete",
      metadata: {
        boardId: current.task.source.boardId ?? null,
        mediaType: current.task.mediaType,
        status: current.task.status,
        taskId,
      },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await context.queryable.query("commit");
  } catch (error) {
    await context.queryable.query("rollback");
    throw error;
  }
}
