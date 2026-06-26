import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { createPostgresWorkspaceStorageRepository } from "@/lib/storage/postgres/repository";
import type { WorkspaceStorageRepository } from "@/lib/storage/repository";
import { assertTeamRole, requireTeamSession, type TeamRole, type TeamSessionContext } from "@/lib/storage/team-auth";

export interface TeamWorkspaceStorageContext {
  config: PostgresStorageConfig;
  queryable: PostgresQueryable;
  repository: WorkspaceStorageRepository;
  session: TeamSessionContext;
  targetKind: "postgres";
}

export async function createTeamWorkspaceStorageContext(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  options: { minimumRole?: TeamRole } = {},
): Promise<TeamWorkspaceStorageContext> {
  const session = await requireTeamSession(queryable, request);
  assertTeamRole(session, options.minimumRole ?? "viewer");
  return {
    config,
    queryable,
    repository: createPostgresWorkspaceStorageRepository(queryable, config, session.workspaceId),
    session,
    targetKind: "postgres",
  };
}
