import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import {
  type GenerationTask,
  type GenerationTaskMediaType,
  type GenerationTaskStatus,
} from "@/lib/generation-tasks";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import type { WorkspaceGenerationTaskListOptions } from "@/lib/storage/repository";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import {
  listTeamGenerationTasks,
  saveTeamGenerationTask,
  type TeamGenerationTaskSaveInput,
} from "@/lib/storage/team-generation-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const options = parseTeamGenerationTaskListOptions(new URL(request.url).searchParams);
    const result = await withPostgresClient(config, client => listTeamGenerationTasks(client, config, request, options));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team generation task list failed");
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
    const input = await readTeamGenerationTaskSaveRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => saveTeamGenerationTask(client, config, request, input));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team generation task save failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

function parseTeamGenerationTaskListOptions(searchParams: URLSearchParams): WorkspaceGenerationTaskListOptions {
  return {
    boardId: optionalTextParam(searchParams, "boardId"),
    limit: integerParam(searchParams, "limit", 100, 1, 200),
    offset: integerParam(searchParams, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
    sourceBoardNodeIds: repeatedTextParam(searchParams, "sourceBoardNodeId"),
    statuses: statusParams(searchParams),
  };
}

function optionalTextParam(searchParams: URLSearchParams, name: string): string | undefined {
  const value = searchParams.get(name);
  return value === null ? undefined : value.trim();
}

function repeatedTextParam(searchParams: URLSearchParams, name: string): string[] | undefined {
  const values = searchParams.getAll(name).map(value => value.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function integerParam(searchParams: URLSearchParams, name: string, defaultValue: number, min: number, max: number): number {
  const rawValue = searchParams.get(name);
  if (rawValue === null || rawValue.trim() === "") return defaultValue;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`Invalid ${name}`, "invalid_team_generation_task_query");
  }
  return value;
}

function statusParams(searchParams: URLSearchParams): WorkspaceGenerationTaskListOptions["statuses"] {
  const statuses = repeatedTextParam(searchParams, "status");
  if (!statuses) return undefined;
  const result: GenerationTaskStatus[] = [];
  for (const status of statuses) {
    if (!isGenerationTaskStatus(status)) {
      throw badRequest("Invalid status", "invalid_team_generation_task_query");
    }
    result.push(status);
  }
  return result;
}

async function readTeamGenerationTaskSaveRequestJson(request: Request): Promise<TeamGenerationTaskSaveInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Invalid team generation task request", "invalid_team_generation_task_request");
  }
  if (!isRecord(body) || !isGenerationTask(body.task)) {
    throw badRequest("Invalid team generation task request", "invalid_team_generation_task_request");
  }
  return { task: body.task };
}

function isGenerationTask(value: unknown): value is GenerationTask {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isGenerationTaskMediaType(value.mediaType) &&
    typeof value.prompt === "string" &&
    typeof value.model === "string" &&
    isGenerationTaskStatus(value.status) &&
    typeof value.progress === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isGenerationTaskSource(value.source) &&
    Array.isArray(value.resultAssetIds) &&
    value.resultAssetIds.every(item => typeof item === "string") &&
    optionalString(value.activeResultAssetId) &&
    optionalString(value.operationName) &&
    optionalString(value.errorMessage) &&
    optionalString(value.legacyAssetId) &&
    (value.request === undefined || isRecord(value.request)) &&
    typeof value.canCancelRemote === "boolean"
  );
}

function isGenerationTaskSource(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.surface === "workspace" || value.surface === "board" || value.surface === "agent") &&
    optionalString(value.boardId) &&
    optionalString(value.boardNodeId) &&
    optionalString(value.resultStackKey)
  );
}

function isGenerationTaskMediaType(value: unknown): value is GenerationTaskMediaType {
  return value === "image" || value === "video" || value === "audio" || value === "transcript";
}

function isGenerationTaskStatus(value: unknown): value is GenerationTaskStatus {
  return value === "pending" || value === "processing" || value === "complete" || value === "failed" || value === "canceled";
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
