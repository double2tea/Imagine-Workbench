import { ApiError } from "@/lib/api/errors";

export interface TeamRateLimitPolicy {
  lockoutMs: number;
  maxAttempts: number;
  windowMs: number;
}

interface TeamRateLimitEntry {
  failedAttempts: number;
  lockedUntilMs: number;
  windowStartedAtMs: number;
}

export const TEAM_LOGIN_RATE_LIMIT: TeamRateLimitPolicy = {
  lockoutMs: 15 * 60 * 1000,
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
};

export const TEAM_SETUP_TOKEN_RATE_LIMIT: TeamRateLimitPolicy = {
  lockoutMs: 30 * 60 * 1000,
  maxAttempts: 5,
  windowMs: 30 * 60 * 1000,
};
export const TEAM_BOOTSTRAP_RATE_LIMIT = TEAM_SETUP_TOKEN_RATE_LIMIT;
export const TEAM_MIGRATION_RATE_LIMIT = TEAM_SETUP_TOKEN_RATE_LIMIT;

const attempts = new Map<string, TeamRateLimitEntry>();

export function assertTeamRateLimit(
  key: string,
  policy: TeamRateLimitPolicy,
  nowMs = Date.now(),
): void {
  const entry = readCurrentEntry(key, policy, nowMs);
  if (entry.lockedUntilMs > nowMs) {
    throw new ApiError(429, "team_rate_limited", "Too many attempts. Try again later.");
  }
}

export function recordTeamRateLimitFailure(
  key: string,
  policy: TeamRateLimitPolicy,
  nowMs = Date.now(),
): void {
  const entry = readCurrentEntry(key, policy, nowMs);
  const failedAttempts = entry.failedAttempts + 1;
  attempts.set(key, {
    failedAttempts,
    lockedUntilMs: failedAttempts >= policy.maxAttempts ? nowMs + policy.lockoutMs : entry.lockedUntilMs,
    windowStartedAtMs: entry.windowStartedAtMs,
  });
}

export function clearTeamRateLimit(key: string): void {
  attempts.delete(key);
}

export function resetTeamRateLimitsForTests(): void {
  attempts.clear();
}

export function teamRequestRateLimitKey(request: Request, scope: string, identifier = ""): string {
  return [
    scope,
    readClientAddress(request),
    identifier.trim().toLowerCase(),
  ].join(":");
}

function readCurrentEntry(
  key: string,
  policy: TeamRateLimitPolicy,
  nowMs: number,
): TeamRateLimitEntry {
  const entry = attempts.get(key);
  if (!entry || nowMs - entry.windowStartedAtMs >= policy.windowMs) {
    return {
      failedAttempts: 0,
      lockedUntilMs: 0,
      windowStartedAtMs: nowMs,
    };
  }
  return entry;
}

function readClientAddress(request: Request): string {
  void request;
  return "shared-client";
}
