import { badRequest, type ApiError } from "./errors";

export function audioOperationApiError(error: unknown): ApiError | null {
  if (!(error instanceof Error)) return null;

  switch (error.message) {
    case "Voice cloning requires confirming reference audio authorization first":
      return badRequest(error.message, "voice_clone_consent_required");
    case "Voice profile IDs must be resolved before audio operation":
      return badRequest(error.message, "unresolved_voice_profile");
    case "MiMo built-in TTS does not accept reference media":
    case "MiMo voice design does not accept reference media":
    case "MiMo ASR reference audio must be a base64 data URI":
    case "MiMo ASR supports wav or mp3 audio references only":
    case "MiMo ASR reference audio payload is required":
    case "MiMo ASR reference audio base64 payload exceeds 10MB":
    case "Seed Audio does not support video references":
    case "Seed Audio image references cannot be mixed with audio references or speaker IDs":
    case "Seed Audio supports wav, mp3, pcm, or ogg_opus formats":
      return badRequest(error.message, "unsupported_reference_media");
    case "MiMo voice clone requires exactly one audio reference":
    case "MiMo ASR requires exactly one audio reference":
    case "Seed Audio supports at most one image reference":
    case "Seed Audio supports at most three audio references including speaker IDs":
    case "Seed Audio voice clone requires an audio reference or speaker ID":
      return badRequest(error.message, "invalid_reference_media_count");
    default:
      if (
        error.message.endsWith("audio operation is not supported yet") ||
        error.message.includes("audio operation currently supports MiMo-compatible")
      ) {
        return badRequest(error.message, "unsupported_audio_operation");
      }
      return null;
  }
}
