import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import type { GenerationTaskUpdate } from "@/lib/generation-tasks";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import {
  deleteTeamGenerationTask,
  updateTeamGenerationTask,
  type TeamGenerationTaskUpdateInput,
} from "@/lib/storage/team-generation-tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamGenerationTaskRouteContext {
  params: Promise<{
    taskId: string;
  }>;
}

export async function PATCH(request: Request, context: TeamGenerationTaskRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const input = await readTeamGenerationTaskUpdateRequestJson(request);
    const { taskId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => updateTeamGenerationTask(client, config, request, taskId, input));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team generation task update failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

export async function DELETE(request: Request, context: TeamGenerationTaskRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { taskId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    await withPostgresClient(config, client => deleteTeamGenerationTask(client, config, request, taskId));
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error, "Team generation task delete failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

async function readTeamGenerationTaskUpdateRequestJson(request: Request): Promise<TeamGenerationTaskUpdateInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Invalid team generation task request", "invalid_team_generation_task_request");
  }
  if (!isRecord(body) || !isGenerationTaskUpdate(body.update)) {
    throw badRequest("Invalid team generation task request", "invalid_team_generation_task_request");
  }
  return { update: body.update };
}

function isGenerationTaskUpdate(value: unknown): value is GenerationTaskUpdate {
  if (!isRecord(value)) return false;
  if ("id" in value || "createdAt" in value) return false;
  if ("mediaType" in value && !isGenerationTaskMediaType(value.mediaType)) return false;
  if ("prompt" in value && typeof value.prompt !== "string") return false;
  if ("model" in value && typeof value.model !== "string") return false;
  if ("status" in value && !isGenerationTaskStatus(value.status)) return false;
  if ("progress" in value && typeof value.progress !== "number") return false;
  if ("updatedAt" in value && typeof value.updatedAt !== "string") return false;
  if ("source" in value && !isGenerationTaskSource(value.source)) return false;
  if ("resultAssetIds" in value && (!Array.isArray(value.resultAssetIds) || !value.resultAssetIds.every(item => typeof item === "string"))) return false;
  if ("activeResultAssetId" in value && !optionalString(value.activeResultAssetId)) return false;
  if ("operationName" in value && !optionalString(value.operationName)) return false;
  if ("errorMessage" in value && !optionalString(value.errorMessage)) return false;
  if ("legacyAssetId" in value && !optionalString(value.legacyAssetId)) return false;
  if ("request" in value && value.request !== undefined && !isRecord(value.request)) return false;
  if ("canCancelRemote" in value && typeof value.canCancelRemote !== "boolean") return false;
  return true;
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

function isGenerationTaskMediaType(value: unknown): boolean {
  return value === "image" || value === "video" || value === "audio" || value === "transcript";
}

function isGenerationTaskStatus(value: unknown): boolean {
  return value === "pending" || value === "processing" || value === "complete" || value === "failed" || value === "canceled";
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
