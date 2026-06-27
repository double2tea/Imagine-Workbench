import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { CustomPromptTemplate } from "../lib/custom-prompt-templates";
import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import {
  fetchTeamPromptTemplates,
  saveTeamPromptTemplate as saveTeamPromptTemplateClient,
} from "../lib/storage/team-client";
import {
  deleteTeamPromptTemplate,
  listTeamPromptTemplates,
  saveTeamPromptTemplate,
} from "../lib/storage/team-prompt-templates";
import { POST as postTeamPromptTemplate } from "../app/api/storage/team/prompt-templates/route";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const TEMPLATE_ID = "user-prompt-template-template_1";

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

test("listTeamPromptTemplates returns workspace-scoped custom templates", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await listTeamPromptTemplates(
    createTeamPromptTemplatesQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.deepEqual(result.templates.map(template => template.id), [TEMPLATE_ID]);
  assert.deepEqual(
    queries.find(query => query.text.startsWith("select template from prompt_templates"))?.values,
    [WORKSPACE_ID],
  );
});

test("saveTeamPromptTemplate upserts an editor-scoped custom template", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await saveTeamPromptTemplate(
    createTeamPromptTemplatesQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { template: TEMPLATE },
  );

  const insert = queries.find(query => query.text.includes("insert into prompt_templates"));
  assert.equal(result.template.id, TEMPLATE_ID);
  assert.deepEqual(insert?.values, [TEMPLATE_ID, WORKSPACE_ID, TEMPLATE, TEMPLATE.createdAt, TEMPLATE.updatedAt]);
});

test("deleteTeamPromptTemplate removes an editor-scoped custom template with audit", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamPromptTemplate(
    createTeamPromptTemplatesQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    TEMPLATE_ID,
  );

  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from prompt_templates"))?.values,
    [WORKSPACE_ID, TEMPLATE_ID],
  );
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  const audit = queries.find(query => query.text.startsWith("insert into audit_events"));
  assert.deepEqual(audit?.values, [
    WORKSPACE_ID,
    "user_1",
    "team_prompt_template.delete",
    JSON.stringify({ templateId: TEMPLATE_ID }),
  ]);
});

test("team prompt template save route rejects missing CSRF before opening a database client", async () => {
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

    const response = await postTeamPromptTemplate(new Request("http://localhost:3000/api/storage/team/prompt-templates", {
      body: JSON.stringify({ template: TEMPLATE }),
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
    restoreEnv("IMAGINE_MAX_MEDIA_PAYLOAD_BYTES", originalEnv.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
  }
});

test("team prompt template client parses list responses and sends CSRF on save", async () => {
  const requests: Array<{ body?: string; headers?: HeadersInit; method?: string; url: string }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: init?.headers,
      method: init?.method,
      url: String(input),
    });
    return Response.json({
      targetKind: "postgres",
      template: TEMPLATE,
      templates: [TEMPLATE],
      workspaceId: WORKSPACE_ID,
    });
  };

  const listResult = await fetchTeamPromptTemplates(fetcher);
  const saveResult = await saveTeamPromptTemplateClient(TEMPLATE, "csrf-token", fetcher);

  assert.deepEqual(listResult.templates.map(template => template.id), [TEMPLATE_ID]);
  assert.equal(saveResult.template.id, TEMPLATE_ID);
  assert.equal(requests[0]?.url, "/api/storage/team/prompt-templates");
  assert.equal(requests[1]?.method, "POST");
  assert.equal((requests[1]?.headers as Record<string, string> | undefined)?.["x-imagine-csrf-token"], "csrf-token");
  assert.deepEqual(JSON.parse(String(requests[1]?.body)) as unknown, { template: TEMPLATE });
});

const TEMPLATE: CustomPromptTemplate = {
  category: "custom",
  createdAt: "2026-06-27T00:00:00.000Z",
  id: TEMPLATE_ID,
  parameterHint: "16:9",
  positivePrompt: "A structured cinematic scene",
  scene: "Cinematic",
  title: "Cinematic Scene",
  updatedAt: "2026-06-27T00:00:00.000Z",
};

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/prompt-templates", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamPromptTemplatesQueryable(
  queries: Array<{ text: string; values?: readonly unknown[] }> = [],
  options: { role?: "owner" | "admin" | "editor" | "viewer" } = {},
): PostgresQueryable {
  return {
    query: async <T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) => {
      queries.push({ text, values });
      if (text === "begin" || text === "commit" || text === "rollback") {
        return typedQueryResult<T>([]);
      }
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
      if (text.startsWith("select template from prompt_templates")) {
        return typedQueryResult<T>([{ template: TEMPLATE }]);
      }
      if (text.startsWith("insert into audit_events")) {
        return typedQueryResult<T>([]);
      }
      return typedQueryResult<T>([]);
    },
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
