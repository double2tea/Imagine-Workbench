import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { ApiError } from "../lib/api/errors";
import { DEFAULT_BOARD_ID } from "../lib/board/defaults";
import type { BoardDocument, BoardSummary } from "../lib/board/types";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import { createTeamBoardDocument, deleteTeamBoardDocument, getTeamBoardDocument, listTeamBoardSummaries, resetTeamBoards, saveTeamBoardDocument } from "../lib/storage/team-boards";
import { DELETE as resetTeamBoardsRoute, GET as getTeamBoards, POST as postTeamBoard } from "../app/api/storage/team/boards/route";
import { DELETE as deleteTeamBoard, PUT as putTeamBoard } from "../app/api/storage/team/boards/[boardId]/route";

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
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
  };
  try {
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES = "1048576";
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
    restoreEnv("IMAGINE_MAX_MEDIA_PAYLOAD_BYTES", originalEnv.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

test("getTeamBoardDocument returns a redacted versioned board document", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await getTeamBoardDocument(
    createTeamBoardsQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    BOARD_ID,
  );

  assert.equal(result.version, 7);
  assert.equal(result.board.nodes[0]?.kind, "runninghub-app");
  assert.equal("accessPassword" in (result.board.nodes[0] ?? {}), false);
  assert.deepEqual(result.summary, createBoardSummary());
  assert.match(
    queries.find(query => query.text.includes("left join board_summaries"))?.text ?? "",
    /board_summaries\.workspace_id = boards\.workspace_id/,
  );
});

test("createTeamBoardDocument inserts a new editor-scoped board", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const board = createBoardDocument({ includeSecret: false });
  const result = await createTeamBoardDocument(
    createTeamBoardsQueryable(queries, { insertVersion: 1, role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    board,
  );

  assert.equal(result.version, 1);
  const insertQuery = queries.find(query => query.text.trim().startsWith("insert into boards"));
  const summaryQuery = queries.find(query => query.text.trim().startsWith("insert into board_summaries"));
  assert.match(insertQuery?.text ?? "", /on conflict \(workspace_id, id\) do nothing/);
  assert.match(summaryQuery?.text ?? "", /on conflict \(workspace_id, board_id\) do update/);
  assert.deepEqual(insertQuery?.values, [BOARD_ID, WORKSPACE_ID, board]);
  assert.equal(queries.at(-1)?.text, "commit");
});

test("saveTeamBoardDocument updates only the expected board version", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const board = createBoardDocument({ includeSecret: false });
  const result = await saveTeamBoardDocument(
    createTeamBoardsQueryable(queries, { role: "editor", updateVersion: 8 }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    board,
    7,
  );

  assert.equal(result.version, 8);
  const updateQuery = queries.find(query => query.text.trim().startsWith("update boards"));
  assert.deepEqual(updateQuery?.values, [WORKSPACE_ID, BOARD_ID, board, 7]);
  assert.equal(queries.at(-1)?.text, "commit");
});

test("saveTeamBoardDocument rejects secret fields and version conflicts", async () => {
  await assert.rejects(
    () => saveTeamBoardDocument(
      createTeamBoardsQueryable(),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      createBoardDocument({ includeSecret: true }),
      7,
    ),
    (error: unknown) => error instanceof ApiError && error.status === 400 && error.code === "team_board_secret_fields_unsupported",
  );

  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await assert.rejects(
    () => saveTeamBoardDocument(
      createTeamBoardsQueryable(queries, { conflictVersion: 9, role: "editor" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      createBoardDocument({ includeSecret: false }),
      7,
    ),
    (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "team_board_version_conflict",
  );
  assert.equal(queries.at(-1)?.text, "rollback");
});

test("createTeamBoardDocument rejects existing boards and deleteTeamBoardDocument requires a match", async () => {
  const createQueries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await assert.rejects(
    () => createTeamBoardDocument(
      createTeamBoardsQueryable(createQueries, { role: "editor" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      createBoardDocument({ includeSecret: false }),
    ),
    (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "team_board_already_exists",
  );
  assert.equal(createQueries.at(-1)?.text, "rollback");

  await assert.rejects(
    () => deleteTeamBoardDocument(
      createTeamBoardsQueryable([], { role: "editor" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
      BOARD_ID,
    ),
    (error: unknown) => error instanceof ApiError && error.status === 404 && error.code === "team_board_not_found",
  );
});

test("deleteTeamBoardDocument deletes an editor-scoped board with audit", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamBoardDocument(
    createTeamBoardsQueryable(queries, { deleteFound: true, role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    BOARD_ID,
  );

  const deleteQuery = queries.find(query => query.text.startsWith("delete from boards"));
  assert.deepEqual(deleteQuery?.values, [WORKSPACE_ID, BOARD_ID]);
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  const audit = queries.find(query => query.text.trim().startsWith("insert into audit_events"));
  assert.deepEqual(audit?.values, [
    WORKSPACE_ID,
    "user_1",
    "team_board.delete",
    JSON.stringify({ boardId: BOARD_ID }),
  ]);
});

test("resetTeamBoards deletes workspace boards, recreates the default board, and records an audit event", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await resetTeamBoards(
    createTeamBoardsQueryable(queries, { insertVersion: 1, resetBoardCount: 2, role: "admin" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
  );

  assert.equal(result.deletedBoardCount, 2);
  assert.equal(result.board.id, DEFAULT_BOARD_ID);
  assert.equal(result.summary.id, DEFAULT_BOARD_ID);
  assert.equal(result.version, 1);
  assert.equal(queries.find(query => query.text.startsWith("delete from boards where workspace_id"))?.values?.[0], WORKSPACE_ID);
  const auditQuery = queries.find(query => query.text.trim().startsWith("insert into audit_events"));
  assert.deepEqual(auditQuery?.values, [
    WORKSPACE_ID,
    "user_1",
    "team_boards.reset",
    JSON.stringify({ defaultBoardId: DEFAULT_BOARD_ID, deletedBoardCount: 2 }),
  ]);
  assert.equal(queries.at(-1)?.text, "commit");
});

test("resetTeamBoards requires an admin-scoped session", async () => {
  await assert.rejects(
    () => resetTeamBoards(
      createTeamBoardsQueryable([], { role: "editor" }),
      { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
      requestWithSession(),
    ),
    (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === "forbidden",
  );
});

test("team board route rejects missing write versions before opening a database client", async () => {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES = "1048576";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";

    const response = await putTeamBoard(new Request("http://localhost:3000/api/storage/team/boards/board_1", {
      body: JSON.stringify(createBoardDocument({ includeSecret: false })),
      headers: {
        cookie: "imagine_team_csrf=csrf-token",
        origin: "http://localhost:3000",
        "x-imagine-csrf-token": "csrf-token",
      },
      method: "PUT",
    }), routeContext());
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      code: "missing_team_board_version",
      error: "If-Match version is required",
    });
  } finally {
    restoreEnv("APP_URL", originalEnv.APP_URL);
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_MAX_MEDIA_PAYLOAD_BYTES", originalEnv.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

test("team board create, reset, and delete routes reject missing CSRF before opening a database client", async () => {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES = "1048576";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";

    const createResponse = await postTeamBoard(new Request("http://localhost:3000/api/storage/team/boards", {
      body: JSON.stringify(createBoardDocument({ includeSecret: false })),
      headers: { origin: "http://localhost:3000" },
      method: "POST",
    }));
    assert.equal(createResponse.status, 403);
    assert.deepEqual(await createResponse.json(), {
      code: "invalid_csrf",
      error: "Valid CSRF token is required",
    });

    const resetResponse = await resetTeamBoardsRoute(new Request("http://localhost:3000/api/storage/team/boards", {
      headers: { origin: "http://localhost:3000" },
      method: "DELETE",
    }));
    assert.equal(resetResponse.status, 403);
    assert.deepEqual(await resetResponse.json(), {
      code: "invalid_csrf",
      error: "Valid CSRF token is required",
    });

    const deleteResponse = await deleteTeamBoard(new Request("http://localhost:3000/api/storage/team/boards/board_1", {
      headers: { origin: "http://localhost:3000" },
      method: "DELETE",
    }), routeContext());
    assert.equal(deleteResponse.status, 403);
    assert.deepEqual(await deleteResponse.json(), {
      code: "invalid_csrf",
      error: "Valid CSRF token is required",
    });
  } finally {
    restoreEnv("APP_URL", originalEnv.APP_URL);
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_MAX_MEDIA_PAYLOAD_BYTES", originalEnv.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/boards", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function routeContext(): { params: Promise<{ boardId: string }> } {
  return { params: Promise.resolve({ boardId: BOARD_ID }) };
}

function createTeamBoardsQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: {
    conflictVersion?: number;
    deleteFound?: boolean;
    insertVersion?: number;
    resetBoardCount?: number;
    role?: "owner" | "admin" | "editor" | "viewer";
    updateVersion?: number;
  } = {},
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text === "begin" || text === "commit" || text === "rollback") {
        return typedQueryResult<T>([]);
      }
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "viewer@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: options.role ?? "viewer",
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.trim().startsWith("update boards")) {
        return typedQueryResult<T>(
          options.updateVersion === undefined ? [] : [{ version: options.updateVersion }],
        );
      }
      if (text.trim().startsWith("insert into boards")) {
        return typedQueryResult<T>(
          options.insertVersion === undefined ? [] : [{ version: options.insertVersion }],
        );
      }
      if (text.startsWith("select count(*) as board_count from boards")) {
        return typedQueryResult<T>([{ board_count: options.resetBoardCount ?? 0 }]);
      }
      if (text.trim().startsWith("insert into audit_events")) {
        return typedQueryResult<T>([]);
      }
      if (text.startsWith("select version from boards")) {
        return typedQueryResult<T>(
          options.conflictVersion === undefined ? [] : [{ version: options.conflictVersion }],
        );
      }
      if (text.startsWith("delete from boards")) {
        return typedQueryResult<T>(options.deleteFound ? [{ id: BOARD_ID }] : []);
      }
      if (text.trim().startsWith("insert into board_summaries")) {
        return typedQueryResult<T>([]);
      }
      if (text.startsWith("select boards.board")) {
        return typedQueryResult<T>([{
          board: createBoardDocument({ includeSecret: true }),
          summary: createBoardSummary(),
          version: 7,
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

function createBoardDocument(options: { includeSecret: boolean }): BoardDocument {
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
      accessPassword: options.includeSecret ? "secret-password" : undefined,
      bindings: [],
      createdAt: "2026-06-26T00:00:00.000Z",
      id: "runninghub_1",
      kind: "runninghub-app",
      outputType: "image",
      position: { x: 0, y: 0 },
      prompt: "prompt",
      status: "idle",
      size: { height: 120, width: 240 },
      targetId: "app_1",
      targetType: "ai-app",
      title: "RunningHub",
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
