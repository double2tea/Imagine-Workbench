import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import {
  PostgresStorageConfigError,
  requireTeamSecretEncryptionKey,
  resolvePostgresStorageConfig,
} from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import type { TeamProviderTargetSaveInput } from "@/lib/storage/team-provider-target-types";
import {
  listTeamProviderTargets,
  saveTeamProviderTarget,
} from "@/lib/storage/team-provider-targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => listTeamProviderTargets(client, config, request));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team provider target list failed");
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
    const input = await readTeamProviderTargetRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const encryptionKey = requireTeamSecretEncryptionKey(process.env);
    const result = await withPostgresClient(config, client => saveTeamProviderTarget(client, config, request, input, encryptionKey));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team provider target save failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

async function readTeamProviderTargetRequestJson(request: Request): Promise<TeamProviderTargetSaveInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Invalid team provider target request", "invalid_team_provider_target_request");
  }
  if (!isRecord(body) || body.provider !== "runninghub" || typeof body.label !== "string" || typeof body.targetId !== "string" || !Array.isArray(body.bindings)) {
    throw badRequest("Invalid team provider target request", "invalid_team_provider_target_request");
  }
  if (body.targetType !== "ai-app" && body.targetType !== "workflow") {
    throw badRequest("Invalid team provider target request", "invalid_team_provider_target_request");
  }
  if (body.outputType !== "image" && body.outputType !== "video" && body.outputType !== "audio") {
    throw badRequest("Invalid team provider target request", "invalid_team_provider_target_request");
  }
  if (body.accessPassword !== undefined && typeof body.accessPassword !== "string") {
    throw badRequest("Invalid team provider target request", "invalid_team_provider_target_request");
  }
  return {
    accessPassword: body.accessPassword,
    bindings: body.bindings,
    label: body.label,
    outputType: body.outputType,
    provider: body.provider,
    targetId: body.targetId,
    targetType: body.targetType,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
