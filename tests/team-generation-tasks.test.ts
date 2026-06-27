import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import { createGenerationTask, type GenerationTask } from "../lib/generation-tasks";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import {
  deleteTeamGenerationTask,
  listTeamGenerationTasks,
  saveTeamGenerationTask,
  updateTeamGenerationTask,
} from "../lib/storage/team-generation-tasks";
import { POST as postTeamGenerationTask } from "../app/api/storage/team/generation-tasks/route";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const TASK_ID = "task_1";

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

test("listTeamGenerationTasks returns workspace-scoped task records", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await listTeamGenerationTasks(
    createTeamGenerationTasksQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    {
      boardId: "board_1",
      limit: 20,
      offset: 3,
      sourceBoardNodeIds: ["node_1"],
      statuses: ["processing"],
    },
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(result.limit, 20);
  assert.equal(result.offset, 3);
  assert.deepEqual(result.tasks.map(task => task.id), [TASK_ID]);
  assert.deepEqual(
    queries.find(query => query.text.startsWith("select task from generation_tasks"))?.values,
    [WORKSPACE_ID, "board_1", ["node_1"], ["processing"], 20, 3],
  );
});

test("saveTeamGenerationTask writes an editor-scoped task", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const task = createTask({ status: "pending" });
  const result = await saveTeamGenerationTask(
    createTeamGenerationTasksQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { task },
  );

  const insert = queries.find(query => query.text.includes("insert into generation_tasks"));
  assert.equal(result.task.id, TASK_ID);
  assert.deepEqual(insert?.values, [TASK_ID, WORKSPACE_ID, task, "pending", "board_1"]);
});

test("updateTeamGenerationTask merges an editor-scoped task update", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await updateTeamGenerationTask(
    createTeamGenerationTasksQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    TASK_ID,
    { update: { progress: 150, status: "complete", resultAssetIds: ["asset_1", "asset_1"] } },
  );

  const insert = queries.find(query => query.text.includes("insert into generation_tasks"));
  const savedTask = insert?.values?.[2] as GenerationTask | undefined;
  assert.equal(result.task.status, "complete");
  assert.equal(result.task.progress, 100);
  assert.deepEqual(result.task.resultAssetIds, ["asset_1"]);
  assert.equal(savedTask?.status, "complete");
});

test("deleteTeamGenerationTask removes an editor-scoped task", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamGenerationTask(
    createTeamGenerationTasksQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    TASK_ID,
  );

  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from generation_tasks"))?.values,
    [WORKSPACE_ID, TASK_ID],
  );
});

test("team generation task save route rejects missing CSRF before opening a database client", async () => {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
  };
  try {
    process.env.APP_URL = "http://localhost:3000";
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";

    const response = await postTeamGenerationTask(new Request("http://localhost:3000/api/storage/team/generation-tasks", {
      body: JSON.stringify({ task: createTask() }),
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      method: "POST",
    }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      code: "invalid_csrf",
      error: "Valid CSRF token is required",
    });
  } finally {
    restoreEnv("APP_URL", originalEnv.APP_URL);
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/generation-tasks", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamGenerationTasksQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: { role?: "owner" | "admin" | "editor" | "viewer" } = {},
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text.includes("from sessions")) {
        return typedQueryResult<T>([{
          email: "editor@example.com",
          expires_at: "2026-07-03T00:00:00.000Z",
          role: options.role ?? "viewer",
          session_id: hashTeamSessionToken(RAW_SESSION_TOKEN),
          team_id: "team_1",
          user_id: "user_1",
          workspace_id: WORKSPACE_ID,
        }]);
      }
      if (text.startsWith("select task from generation_tasks")) {
        return typedQueryResult<T>([{ task: createTask({ status: "processing" }) }]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function createTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    ...createGenerationTask({
      createdAt: "2026-06-27T00:00:00.000Z",
      id: TASK_ID,
      mediaType: "image",
      model: "test-model",
      progress: 40,
      prompt: "test prompt",
      source: {
        boardId: "board_1",
        boardNodeId: "node_1",
        surface: "board",
      },
      status: "processing",
    }),
    ...overrides,
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
