import { apiErrorResponse } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { deleteTeamPromptTemplate } from "@/lib/storage/team-prompt-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamPromptTemplateRouteContext {
  params: Promise<{ templateId: string }>;
}

export async function DELETE(request: Request, context: TeamPromptTemplateRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { templateId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    await withPostgresClient(config, client => deleteTeamPromptTemplate(client, config, request, templateId));
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error, "Team prompt template delete failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}
