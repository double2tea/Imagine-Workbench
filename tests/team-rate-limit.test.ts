import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "../lib/api/errors";
import {
  assertTeamRateLimit,
  clearTeamRateLimit,
  recordTeamRateLimitFailure,
  resetTeamRateLimitsForTests,
  teamRequestRateLimitKey,
  type TeamRateLimitPolicy,
} from "../lib/storage/team-rate-limit";

const POLICY: TeamRateLimitPolicy = {
  lockoutMs: 1_000,
  maxAttempts: 3,
  windowMs: 5_000,
};

test("team rate limiter locks after repeated failures and resets after the window", () => {
  resetTeamRateLimitsForTests();
  const key = "team-login:127.0.0.1:owner@example.com";

  assert.doesNotThrow(() => assertTeamRateLimit(key, POLICY, 0));
  recordTeamRateLimitFailure(key, POLICY, 0);
  recordTeamRateLimitFailure(key, POLICY, 100);
  assert.doesNotThrow(() => assertTeamRateLimit(key, POLICY, 200));
  recordTeamRateLimitFailure(key, POLICY, 300);

  assert.throws(
    () => assertTeamRateLimit(key, POLICY, 400),
    (error: unknown) => error instanceof ApiError && error.status === 429 && error.code === "team_rate_limited",
  );
  assert.doesNotThrow(() => assertTeamRateLimit(key, POLICY, 1_301));

  recordTeamRateLimitFailure(key, POLICY, 6_000);
  assert.doesNotThrow(() => assertTeamRateLimit(key, POLICY, 6_100));
});

test("team rate limiter keys include client address and normalized identifier", () => {
  const request = new Request("http://localhost:3000/api/storage/team/session", {
    headers: { "x-forwarded-for": "192.168.1.7, 10.0.0.1" },
  });
  assert.equal(
    teamRequestRateLimitKey(request, "team-login", " Owner@Example.COM "),
    "team-login:192.168.1.7:owner@example.com",
  );
});

test("team rate limiter can be cleared after successful authentication", () => {
  resetTeamRateLimitsForTests();
  const key = "team-bootstrap:127.0.0.1:";

  recordTeamRateLimitFailure(key, POLICY, 0);
  recordTeamRateLimitFailure(key, POLICY, 100);
  clearTeamRateLimit(key);
  assert.doesNotThrow(() => assertTeamRateLimit(key, POLICY, 200));
});
