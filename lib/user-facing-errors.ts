import { t } from "@/lib/i18n-core";

type UserFacingErrorKind =
  | "apiKeyMissing"
  | "timeout"
  | "unauthorized"
  | "rateLimited"
  | "contentSafety"
  | "providerError"
  | "unknown";

function normalizeMessage(message: string | undefined): string {
  return message?.trim().toLowerCase() ?? "";
}

function classifyUserFacingError(message: string | undefined): UserFacingErrorKind {
  const normalized = normalizeMessage(message);
  if (!normalized) return "unknown";

  if (
    normalized.includes("api key") ||
    normalized.includes("apikey") ||
    normalized.includes("api_key") ||
    normalized.includes("key is required") ||
    normalized.includes("key required") ||
    normalized.includes("missing key") ||
    normalized.includes("no api key") ||
    normalized.includes("provide a custom api key") ||
    /api\s*key.*required/.test(normalized)
  ) {
    return "apiKeyMissing";
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("deadline exceeded") ||
    normalized.includes("time out")
  ) {
    return "timeout";
  }

  if (
    normalized.includes("unauthorized") ||
    normalized.includes("authentication failed") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("forbidden") ||
    /\b401\b/.test(normalized) ||
    /\b403\b/.test(normalized)
  ) {
    return "unauthorized";
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("quota exceeded") ||
    /\b429\b/.test(normalized)
  ) {
    return "rateLimited";
  }

  if (
    normalized.includes("image_unsafe") ||
    normalized.includes("content blocked") ||
    normalized.includes("content safety") ||
    normalized.includes("generated images appear to be unsafe") ||
    normalized.includes("moderation")
  ) {
    return "contentSafety";
  }

  if (
    normalized.includes("provider") ||
    normalized.includes("upstream") ||
    normalized.includes("internal server error") ||
    normalized.includes("service unavailable") ||
    /\b500\b/.test(normalized) ||
    /\b502\b/.test(normalized) ||
    /\b503\b/.test(normalized)
  ) {
    return "providerError";
  }

  return "unknown";
}

export function getUserFacingErrorSummary(message: string | undefined): string {
  const kind = classifyUserFacingError(message);
  return t(`common.userFacingErrors.${kind}`);
}

export function getUserFacingErrorDetail(message: string | undefined): string | undefined {
  const trimmed = message?.trim();
  return trimmed || undefined;
}