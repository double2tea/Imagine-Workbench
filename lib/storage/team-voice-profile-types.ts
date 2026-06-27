import type { VoiceProfile } from "@/lib/voice-profiles";

export interface TeamVoiceProfileListResult {
  profiles: VoiceProfile[];
  targetKind: "postgres";
  workspaceId: string;
}

export interface TeamVoiceProfileMutationResult {
  profile: VoiceProfile;
  targetKind: "postgres";
  workspaceId: string;
}
