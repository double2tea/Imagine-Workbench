import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult, QueryResultRow } from "pg";

import type { PostgresQueryable } from "../lib/storage/postgres/connection";
import { hashTeamSessionToken } from "../lib/storage/team-auth";
import {
  deleteTeamVoiceProfile,
  listTeamVoiceProfiles,
  saveTeamVoiceProfile,
} from "../lib/storage/team-voice-profiles";
import {
  fetchTeamVoiceProfiles,
  saveTeamVoiceProfile as saveTeamVoiceProfileClient,
} from "../lib/storage/team-client";
import type { VoiceProfile } from "../lib/voice-profiles";
import { POST as postTeamVoiceProfile } from "../app/api/storage/team/voice-profiles/route";

const RAW_SESSION_TOKEN = "raw-session-token";
const WORKSPACE_ID = "workspace_1";
const PROFILE_ID = "voice_profile_1";

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

test("listTeamVoiceProfiles returns workspace-scoped voice profiles", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await listTeamVoiceProfiles(
    createTeamVoiceProfilesQueryable(queries),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
  );

  assert.equal(result.targetKind, "postgres");
  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.deepEqual(result.profiles.map(profile => profile.id), [PROFILE_ID]);
  assert.deepEqual(
    queries.find(query => query.text.startsWith("select profile from voice_profiles"))?.values,
    [WORKSPACE_ID, 100, 0],
  );
});

test("saveTeamVoiceProfile upserts an editor-scoped profile", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const result = await saveTeamVoiceProfile(
    createTeamVoiceProfilesQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    { profile: PROFILE },
  );

  const insert = queries.find(query => query.text.includes("insert into voice_profiles"));
  assert.equal(result.profile.id, PROFILE_ID);
  assert.deepEqual(insert?.values, [PROFILE_ID, WORKSPACE_ID, PROFILE, PROFILE.createdAt, PROFILE.updatedAt]);
});

test("deleteTeamVoiceProfile removes an editor-scoped profile with audit", async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  await deleteTeamVoiceProfile(
    createTeamVoiceProfilesQueryable(queries, { role: "editor" }),
    { databaseUrl: "postgres://localhost/imagine", mediaDir: "/srv/imagine/media" },
    requestWithSession(),
    PROFILE_ID,
  );

  assert.deepEqual(
    queries.find(query => query.text.startsWith("delete from voice_profiles"))?.values,
    [WORKSPACE_ID, PROFILE_ID],
  );
  assert.ok(queries.some(query => query.text === "begin"));
  assert.ok(queries.some(query => query.text === "commit"));
  assert.equal(queries.some(query => query.text === "rollback"), false);
  const audit = queries.find(query => query.text.startsWith("insert into audit_events"));
  assert.deepEqual(audit?.values, [
    WORKSPACE_ID,
    "user_1",
    "team_voice_profile.delete",
    JSON.stringify({
      profileId: PROFILE_ID,
      referenceAudioAssetCount: 1,
      sourceAssetCount: 1,
    }),
  ]);
});

test("team voice profile save route rejects missing CSRF before opening a database client", async () => {
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

    const response = await postTeamVoiceProfile(new Request("http://localhost:3000/api/storage/team/voice-profiles", {
      body: JSON.stringify({ profile: PROFILE }),
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

test("team voice profile client parses list responses and sends CSRF on save", async () => {
  const requests: Array<{ body?: string; headers?: HeadersInit; method?: string; url: string }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: init?.headers,
      method: init?.method,
      url: String(input),
    });
    return Response.json({
      profile: PROFILE,
      profiles: [PROFILE],
      targetKind: "postgres",
      workspaceId: WORKSPACE_ID,
    });
  };

  const listResult = await fetchTeamVoiceProfiles(fetcher);
  const saveResult = await saveTeamVoiceProfileClient(PROFILE, "csrf-token", fetcher);

  assert.deepEqual(listResult.profiles.map(profile => profile.id), [PROFILE_ID]);
  assert.equal(saveResult.profile.id, PROFILE_ID);
  assert.equal(requests[0]?.url, "/api/storage/team/voice-profiles");
  assert.equal(requests[1]?.method, "POST");
  assert.equal((requests[1]?.headers as Record<string, string> | undefined)?.["x-imagine-csrf-token"], "csrf-token");
  assert.deepEqual(JSON.parse(String(requests[1]?.body)) as unknown, { profile: PROFILE });
});

const PROFILE: VoiceProfile = {
  consentAcceptedAt: "2026-06-27T00:00:00.000Z",
  createdAt: "2026-06-27T00:00:00.000Z",
  description: "Warm cloned narration",
  id: PROFILE_ID,
  name: "Narration Voice",
  provider: "mimo",
  referenceAudioAssetIds: ["asset_audio_1"],
  source: "cloned",
  sourceAssetIds: ["asset_audio_1"],
  tags: ["narration"],
  updatedAt: "2026-06-27T00:00:00.000Z",
};

function requestWithSession(): Request {
  return new Request("http://localhost:3000/api/storage/team/voice-profiles", {
    headers: { cookie: `imagine_team_session=${RAW_SESSION_TOKEN}` },
  });
}

function createTeamVoiceProfilesQueryable(
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
      if (text.startsWith("select profile from voice_profiles")) {
        return typedQueryResult<T>([{ profile: PROFILE }]);
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
