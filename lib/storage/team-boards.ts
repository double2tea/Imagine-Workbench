import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceBoardListOptions } from "@/lib/storage/repository";
import type { TeamBoardSummaryListResult } from "@/lib/storage/team-board-types";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";

export async function listTeamBoardSummaries(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  options: WorkspaceBoardListOptions,
): Promise<TeamBoardSummaryListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "viewer" });
  const boards = await context.repository.boards.list(options);
  return {
    boards: boards.map(record => record.summary),
    limit: options.limit ?? 100,
    offset: options.offset ?? 0,
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}
