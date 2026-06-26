import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { BoardDocument, BoardSummary } from "../lib/board/types";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { listTeamBoardSummaries } from "../lib/storage/team-boards";
import { GET as getTeamBoards } from "../app/api/storage/team/boards/route";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const BOARD_ID = "board_1";

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: "SELECT",
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows,
  };
}

function typedQueryResult<T extends QueryResultRow>(rows: QueryResultRow[]): QueryResult<T> {
  return queryResult(rows) as QueryResult<T>;
}

test("listTeamBoardSummaries returns workspace-scoped board summaries for viewers", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await listTeamBoardSummaries(
    createTeamBoardsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    {
      ids: [BOARD_ID],
      limit: 10,
      offset: 3,
    },
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(result.limit, 10);
  assert.equal(result.offset, 3);
  assert.deepEqual(result.boards, [createBoardSummary()]);
  assert.deepEqual(
    queries.find(query => query.text.startsWith("select boards.board"))?.values,
    [WORKSPACE_ID, [BOARD_ID], 10, 3],
  );
});

test("team boards route rejects invalid query params before opening a database client", async () => {
  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
  };
  try {
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";

    const response = await getTeamBoards(new Request("http://localhost:3000/api/storage/team/boards?limit=0"));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "invalid_team_board_query",
      error: "Invalid limit",
    });
  } finally {
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/boards", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamBoardsQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "viewer@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: "viewer",
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.startsWith("select boards.board")) {
        return typedQueryResult<T>([{
          board: createBoardDocument(),
          summary: createBoardSummary(),
        }]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function createBoardSummary(): BoardSummary {
  return {
    createdAt: "2026-06-26T00:00:00.000Z",
    id: BOARD_ID,
    nodeCount: 1,
    title: "Shared Board",
    updatedAt: "2026-06-26T01:00:00.000Z",
  };
}

function createBoardDocument(): BoardDocument {
  return {
    config: {
      showGrid: true,
      showMiniMap: true,
      snapToGrid: true,
    },
    createdAt: "2026-06-26T00:00:00.000Z",
    edges: [],
    id: BOARD_ID,
    nodes: [{
      body: "notes",
      createdAt: "2026-06-26T00:00:00.000Z",
      id: "note_1",
      kind: "note",
      position: { x: 0, y: 0 },
      size: { height: 120, width: 240 },
      title: "Note",
      updatedAt: "2026-06-26T01:00:00.000Z",
    }],
    title: "Shared Board",
    updatedAt: "2026-06-26T01:00:00.000Z",
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
