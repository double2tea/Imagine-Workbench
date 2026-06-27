import type { VoiceProfile } from "@/lib/voice-profiles";
import type { PostgresStorageConfig } from "@/lib/storage/postgres/config";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";
import { recordTeamAuditEvent } from "@/lib/storage/team-audit";
import { createTeamWorkspaceStorageContext } from "@/lib/storage/team-context";
import type {
  TeamVoiceProfileListResult,
  TeamVoiceProfileMutationResult,
} from "@/lib/storage/team-voice-profile-types";

export interface TeamVoiceProfileSaveInput {
  profile: VoiceProfile;
}

export async function listTeamVoiceProfiles(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
): Promise<TeamVoiceProfileListResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "viewer" });
  const records = await context.repository.voiceProfiles.list();
  return {
    profiles: records.map(record => record.profile),
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function saveTeamVoiceProfile(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  input: TeamVoiceProfileSaveInput,
): Promise<TeamVoiceProfileMutationResult> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  await context.repository.voiceProfiles.put({ profile: input.profile });
  return {
    profile: input.profile,
    targetKind: "postgres",
    workspaceId: context.session.workspaceId,
  };
}

export async function deleteTeamVoiceProfile(
  queryable: PostgresQueryable,
  config: PostgresStorageConfig,
  request: Request,
  profileId: string,
): Promise<void> {
  const context = await createTeamWorkspaceStorageContext(queryable, config, request, { minimumRole: "editor" });
  const existing = await context.repository.voiceProfiles.get(profileId);
  await context.queryable.query("begin");
  try {
    await context.repository.voiceProfiles.delete(profileId);
    await recordTeamAuditEvent(context.queryable, {
      eventType: "team_voice_profile.delete",
      metadata: {
        profileId,
        referenceAudioAssetCount: existing?.profile.referenceAudioAssetIds?.length ?? 0,
        sourceAssetCount: existing?.profile.sourceAssetIds?.length ?? 0,
      },
      userId: context.session.userId,
      workspaceId: context.session.workspaceId,
    });
    await context.queryable.query("commit");
  } catch (error) {
    await context.queryable.query("rollback");
    throw error;
  }
}
