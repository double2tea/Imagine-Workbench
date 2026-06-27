import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import {
  PostgresStorageConfigError,
  requireTeamSecretEncryptionKey,
  resolvePostgresStorageConfig,
} from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import type { WorkspaceSettingGroup } from "@/lib/storage/schema";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import {
  listTeamSecrets,
  saveTeamSecret,
  type TeamSecretListOptions,
} from "@/lib/storage/team-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const options = parseTeamSecretListOptions(new URL(request.url).searchParams);
    const result = await withPostgresClient(config, client => listTeamSecrets(client, config, request, options));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team secret list failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const input = await readTeamSecretRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const encryptionKey = requireTeamSecretEncryptionKey(process.env);
    const result = await withPostgresClient(config, client => saveTeamSecret(client, config, request, input, encryptionKey));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team secret save failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

function parseTeamSecretListOptions(searchParams: URLSearchParams): TeamSecretListOptions {
  return {
    groups: groupParams(searchParams),
    keys: repeatedTextParam(searchParams, "key"),
  };
}

function repeatedTextParam(searchParams: URLSearchParams, name: string): string[] | undefined {
  const values = searchParams.getAll(name).map(value => value.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function groupParams(searchParams: URLSearchParams): WorkspaceSettingGroup[] | undefined {
  const groups = repeatedTextParam(searchParams, "group");
  if (!groups) return undefined;
  return groups.map(group => {
    if (isWorkspaceSettingGroup(group)) return group;
    throw badRequest("Invalid team secret group", "invalid_team_secret_query");
  });
}

async function readTeamSecretRequestJson(request: Request): Promise<{ group: WorkspaceSettingGroup; key: string; value: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Invalid team secret request", "invalid_team_secret_request");
  }
  if (!isRecord(body) || typeof body.key !== "string" || typeof body.value !== "string" || !isWorkspaceSettingGroup(body.group)) {
    throw badRequest("Invalid team secret request", "invalid_team_secret_request");
  }
  return {
    group: body.group,
    key: body.key,
    value: body.value,
  };
}

function isWorkspaceSettingGroup(value: unknown): value is WorkspaceSettingGroup {
  return value === "agent" || value === "model-cache" || value === "provider" || value === "ui" || value === "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
