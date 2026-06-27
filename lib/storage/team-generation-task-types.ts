import type { GenerationTask } from "@/lib/generation-tasks";

export interface TeamGenerationTaskListResult {
  limit: number;
  offset: number;
  targetKind: "postgres";
  tasks: GenerationTask[];
  workspaceId: string;
}

export interface TeamGenerationTaskMutationResult {
  targetKind: "postgres";
  task: GenerationTask;
  workspaceId: string;
}
