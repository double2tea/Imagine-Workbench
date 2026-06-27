import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import { readCustomPromptTemplate } from "@/lib/custom-prompt-templates";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import {
  listTeamPromptTemplates,
  saveTeamPromptTemplate,
  type TeamPromptTemplateSaveInput,
} from "@/lib/storage/team-prompt-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => listTeamPromptTemplates(client, config, request));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team prompt template list failed");
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
    const input = await readTeamPromptTemplateSaveRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => saveTeamPromptTemplate(client, config, request, input));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team prompt template save failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

async function readTeamPromptTemplateSaveRequestJson(request: Request): Promise<TeamPromptTemplateSaveInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Invalid team prompt template request", "invalid_team_prompt_template_request");
  }
  if (!isRecord(body)) throw badRequest("Invalid team prompt template request", "invalid_team_prompt_template_request");
  try {
    return { template: readCustomPromptTemplate(body.template) };
  } catch {
    throw badRequest("Invalid team prompt template request", "invalid_team_prompt_template_request");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
