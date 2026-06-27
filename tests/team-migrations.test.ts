import assert from "node:assert/strict";
import test from "node:test";

import { resetTeamRateLimitsForTests } from "../lib/storage/team-rate-limit";

test("team migrations route rate-limits invalid setup token attempts with generic errors", async () => {
  resetTeamRateLimitsForTests();
  const originalEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    IMAGINE_MAX_MEDIA_PAYLOAD_BYTES: process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES,
    IMAGINE_MEDIA_DIR: process.env.IMAGINE_MEDIA_DIR,
    IMAGINE_STORAGE_TARGET: process.env.IMAGINE_STORAGE_TARGET,
    IMAGINE_TEAM_SETUP_TOKEN: process.env.IMAGINE_TEAM_SETUP_TOKEN,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
  };
  try {
    process.env.DATABASE_URL = "postgres://localhost/imagine";
    process.env.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES = "1048576";
    process.env.IMAGINE_MEDIA_DIR = "/srv/imagine/media";
    process.env.IMAGINE_STORAGE_TARGET = "postgres";
    process.env.IMAGINE_TEAM_SETUP_TOKEN = "setup-token";
    process.env.NEXT_PUBLIC_APP_VERSION = "0.1.0";
    const { POST: postMigrations } = await import("../app/api/storage/team/migrations/route");

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await postMigrations(invalidSetupTokenRequest());
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        code: "team_migration_failed",
        error: "PostgreSQL migration failed",
        mode: "postgres",
        targetKind: "postgres",
      });
    }

    const limitedResponse = await postMigrations(invalidSetupTokenRequest());
    assert.equal(limitedResponse.status, 429);
    assert.deepEqual(await limitedResponse.json(), {
      code: "team_rate_limited",
      error: "Too many attempts. Try again later.",
      mode: "postgres",
      targetKind: "postgres",
    });
  } finally {
    resetTeamRateLimitsForTests();
    restoreEnv("DATABASE_URL", originalEnv.DATABASE_URL);
    restoreEnv("IMAGINE_MAX_MEDIA_PAYLOAD_BYTES", originalEnv.IMAGINE_MAX_MEDIA_PAYLOAD_BYTES);
    restoreEnv("IMAGINE_MEDIA_DIR", originalEnv.IMAGINE_MEDIA_DIR);
    restoreEnv("IMAGINE_STORAGE_TARGET", originalEnv.IMAGINE_STORAGE_TARGET);
    restoreEnv("IMAGINE_TEAM_SETUP_TOKEN", originalEnv.IMAGINE_TEAM_SETUP_TOKEN);
    restoreEnv("NEXT_PUBLIC_APP_VERSION", originalEnv.NEXT_PUBLIC_APP_VERSION);
  }
});

function invalidSetupTokenRequest(): Request {
  return new Request("http://localhost:3000/api/storage/team/migrations", {
    headers: {
      "x-forwarded-for": "192.168.1.50",
      "x-imagine-setup-token": "wrong-token",
    },
    method: "POST",
  });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
