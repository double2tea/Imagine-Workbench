import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import {
  listTeamVoiceProfiles,
  saveTeamVoiceProfile,
  type TeamVoiceProfileSaveInput,
} from "@/lib/storage/team-voice-profiles";
import type { VoiceProfile, VoiceProfileSource } from "@/lib/voice-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => listTeamVoiceProfiles(client, config, request));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team voice profile list failed");
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
    const input = await readTeamVoiceProfileSaveRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => saveTeamVoiceProfile(client, config, request, input));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team voice profile save failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

async function readTeamVoiceProfileSaveRequestJson(request: Request): Promise<TeamVoiceProfileSaveInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Invalid team voice profile request", "invalid_team_voice_profile_request");
  }
  if (!isRecord(body) || !isVoiceProfile(body.profile)) {
    throw badRequest("Invalid team voice profile request", "invalid_team_voice_profile_request");
  }
  return { profile: body.profile };
}

function isVoiceProfile(value: unknown): value is VoiceProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.provider === "string" &&
    value.provider.trim().length > 0 &&
    isVoiceProfileSource(value.source) &&
    Array.isArray(value.tags) &&
    value.tags.every(item => typeof item === "string") &&
    optionalString(value.description) &&
    optionalString(value.providerVoiceId) &&
    optionalString(value.designPrompt) &&
    Array.isArray(value.referenceAudioAssetIds) &&
    value.referenceAudioAssetIds.every(item => typeof item === "string") &&
    optionalStringArray(value.sourceAssetIds) &&
    optionalString(value.consentAcceptedAt) &&
    optionalString(value.previewAudioAssetId) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isVoiceProfileSource(value: unknown): value is VoiceProfileSource {
  return value === "designed" || value === "cloned" || value === "imported";
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every(item => typeof item === "string"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
