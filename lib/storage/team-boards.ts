import type { QueryResultRow } from "pg";
import { ApiError, badRequest } from "@/lib/api/errors";
import { createEmptyBoard, DEFAULT_BOARD_ID } from "@/lib/board/defaults";
import type { BoardDocument, BoardNode, BoardSummary } from "@/lib/board/types";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import type { WorkspaceBoardListOptions } from "@/lib/storage/repository";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import type { TeamBoardDocumentResult, TeamBoardResetResult, TeamBoardSummaryListResult } from "@/lib/storage/team-board-types";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";

interface TeamBoardDocumentRow extends QueryResultRow {
  board: BoardDocument;
  summary: BoardSummary | null;
  version: number | string;
}

interface TeamBoardVersionRow extends QueryResultRow {
  version: number | string;
}

interface TeamBoardExistsRow extends QueryResultRow {
  id: string;
}

interface TeamBoardCountRow extends QueryResultRow {
  board_count: number | string;
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
     left join board_summaries on board_summaries.workspace_id = boards.workspace_id and board_summaries.board_id = boards.id
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

export async function createTeamBoardDocument(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  board: BoardDocument,
): Promise<TeamBoardDocumentResult> {
  assertTeamBoardDocumentSafeForWrite(board);
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  const summary = toBoardSummary(board);
  await context.queryable.query("begin");
  try {
    const insertResult = await context.queryable.query<TeamBoardVersionRow>(
      `insert into boards (id, workspace_id, board, updated_at)
       values ($1, $2, $3, now())
       on conflict (workspace_id, id) do nothing
       returning version`,
      [board.id, context.session.workspaceId, board],
    );
    const version = insertResult.rows[0]?.version;
    if (version === undefined) {
      throw new ApiError(409, "team_board_already_exists", "Team board already exists");
    }
    await upsertTeamBoardSummary(context.queryable, board.id, context.session.workspaceId, summary);
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
    await upsertTeamBoardSummary(context.queryable, board.id, context.session.workspaceId, summary);
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

export async function deleteTeamBoardDocument(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  boardId: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  await context.queryable.query("begin");
  try {
    const result = await context.queryable.query<TeamBoardExistsRow>(
      "delete from boards where workspace_id = $1 and id = $2 returning id",
      [context.session.workspaceId, boardId],
    );
    if (!result.rows[0]) throw new ApiError(404, "team_board_not_found", "Team board was not found");
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_board.delete",
      metadata: { boardId },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await context.queryable.query("commit");
  } catch (error) {
    await context.queryable.query("rollback");
    throw error;
  }
}

export async function resetTeamBoards(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
): Promise<TeamBoardResetResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "admin" });
  const board = createEmptyBoard(DEFAULT_BOARD_ID);
  const summary = toBoardSummary(board);
  await context.queryable.query("begin");
  try {
    const countResult = await context.queryable.query<TeamBoardCountRow>(
      "select count(*) as board_count from boards where workspace_id = $1",
      [context.session.workspaceId],
    );
    const deletedBoardCount = numberFromDatabase(countResult.rows[0]?.board_count);
    await context.queryable.query("delete from boards where workspace_id = $1", [context.session.workspaceId]);
    const insertResult = await context.queryable.query<TeamBoardVersionRow>(
      `insert into boards (id, workspace_id, board, updated_at)
       values ($1, $2, $3, now())
       returning version`,
      [board.id, context.session.workspaceId, board],
    );
    const version = insertResult.rows[0]?.version;
    if (version === undefined) {
      throw new ApiError(500, "team_board_reset_failed", "Team board reset failed");
    }
    await upsertTeamBoardSummary(context.queryable, board.id, context.session.workspaceId, summary);
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_boards.reset",
      metadata: {
        defaultBoardId: DEFAULT_BOARD_ID,
        deletedBoardCount,
      },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await context.queryable.query("commit");
    return {
      board: redactTeamBoardDocument(board),
      deletedBoardCount,
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

async function upsertTeamBoardSummary(
  queryable: PostgresQueryable,
  boardId: string,
  workspaceId: string,
  summary: BoardSummary,
): Promise<void> {
  await queryable.query(
    `insert into board_summaries (board_id, workspace_id, summary, updated_at)
     values ($1, $2, $3, now())
     on conflict (workspace_id, board_id) do update
       set summary = excluded.summary, updated_at = now()`,
    [boardId, workspaceId, summary],
  );
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

function numberFromDatabase(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}
