import type { QueryResultRow } from "pg";
import { ApiError, badRequest } from "@/lib/api/errors";
import type { BoardDocument, BoardNode, BoardSummary } from "@/lib/board/types";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceBoardListOptions } from "@/lib/storage/repository";
import type { TeamBoardDocumentResult, TeamBoardSummaryListResult } from "@/lib/storage/team-board-types";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";

interface TeamBoardDocumentRow extends QueryResultRow {
  board: BoardDocument;
  summary: BoardSummary | null;
  version: number | string;
}

interface TeamBoardVersionRow extends QueryResultRow {
  version: number | string;
}

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

export async function getTeamBoardDocument(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  boardId: string,
): Promise<TeamBoardDocumentResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "viewer" });
  const result = await context.queryable.query<TeamBoardDocumentRow>(
    `select boards.board, boards.version, board_summaries.summary
     from boards
     left join board_summaries on board_summaries.board_id = boards.id
     where boards.workspace_id = $1 and boards.id = $2`,
    [context.session.workspaceId, boardId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "team_board_not_found", "Team board was not found");
  const board = redactTeamBoardDocument(row.board);
  return {
    board,
    summary: row.summary ?? toBoardSummary(board),
    targetKind: "postgres",
    version: Number(row.version),
    workspaceId: context.session.workspaceId,
  };
}

export async function saveTeamBoardDocument(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  board: BoardDocument,
  expectedVersion: number,
): Promise<TeamBoardDocumentResult> {
  assertTeamBoardDocumentSafeForWrite(board);
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  const summary = toBoardSummary(board);
  await context.queryable.query("begin");
  try {
    const updateResult = await context.queryable.query<TeamBoardVersionRow>(
      `update boards
       set board = $3, version = version + 1, updated_at = now()
       where workspace_id = $1 and id = $2 and version = $4
       returning version`,
      [context.session.workspaceId, board.id, board, expectedVersion],
    );
    const version = updateResult.rows[0]?.version;
    if (version === undefined) {
      const existing = await context.queryable.query<TeamBoardVersionRow>(
        "select version from boards where workspace_id = $1 and id = $2",
        [context.session.workspaceId, board.id],
      );
      if (existing.rows[0]) {
        throw new ApiError(409, "team_board_version_conflict", "Team board version conflict");
      }
      throw new ApiError(404, "team_board_not_found", "Team board was not found");
    }
    await context.queryable.query(
      `insert into board_summaries (board_id, workspace_id, summary, updated_at)
       values ($1, $2, $3, now())
       on conflict (board_id) do update set summary = excluded.summary, updated_at = now()`,
      [board.id, context.session.workspaceId, summary],
    );
    await context.queryable.query("commit");
    return {
      board: redactTeamBoardDocument(board),
      summary,
      targetKind: "postgres",
      version: Number(version),
      workspaceId: context.session.workspaceId,
    };
  } catch (error) {
    await context.queryable.query("rollback");
    throw error;
  }
}

export function redactTeamBoardDocument(board: BoardDocument): BoardDocument {
  return {
    ...board,
    nodes: board.nodes.map(redactTeamBoardNode),
  };
}

function redactTeamBoardNode(node: BoardNode): BoardNode {
  if (node.kind !== "runninghub-app" || node.accessPassword === undefined) return node;
  const { accessPassword: _accessPassword, ...redactedNode } = node;
  return redactedNode;
}

function assertTeamBoardDocumentSafeForWrite(board: BoardDocument): void {
  for (const node of board.nodes) {
    if (node.kind === "runninghub-app" && node.accessPassword?.trim()) {
      throw badRequest("Team board secret fields are not supported yet", "team_board_secret_fields_unsupported");
    }
  }
}

function toBoardSummary(board: BoardDocument): BoardSummary {
  return {
    createdAt: board.createdAt,
    id: board.id,
    nodeCount: board.nodes.length,
    title: board.title,
    updatedAt: board.updatedAt,
  };
}
