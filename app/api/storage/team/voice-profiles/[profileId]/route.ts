import { apiErrorResponse } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { deleteTeamVoiceProfile } from "@/lib/storage/team-voice-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamVoiceProfileRouteContext {
  params: Promise<{ profileId: string }>;
}

export async function DELETE(request: Request, context: TeamVoiceProfileRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { profileId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    await withPostgresClient(config, client => deleteTeamVoiceProfile(client, config, request, profileId));
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error, "Team voice profile delete failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}
