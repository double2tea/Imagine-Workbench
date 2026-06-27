import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";

test("team migrate script posts setup token to the migration API", async () => {
  let observedOrigin: string | undefined;
  let observedSetupToken: string | undefined;
  const server = createServer((request, response) => {
    observedOrigin = request.headers.origin;
    observedSetupToken = request.headers["x-imagine-setup-token"] as string | undefined;
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/api/storage/team/migrations");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      appVersion: "0.1.0",
      migrationStatus: {
        appliedMigrationIds: ["0001_initial_team_storage"],
        currentSchemaVersion: 1,
        pendingMigrationIds: [],
        requiredSchemaVersion: 1,
        schemaTableExists: true,
        unsupportedNewerSchema: false,
      },
      mode: "postgres",
      targetKind: "postgres",
    }));
  });

  const appUrl = await listen(server);
  try {
    const result = await runTeamMigrateScript({
      APP_URL: appUrl,
      IMAGINE_TEAM_SETUP_TOKEN: "setup-token",
    });

    assert.equal(result.exitCode, 0);
    assert.equal(observedOrigin, appUrl);
    assert.equal(observedSetupToken, "setup-token");
    assert.match(result.stdout, /PostgreSQL migrations complete/);
    assert.equal(result.stderr, "");
  } finally {
    await close(server);
  }
});

test("team migrate script fails fast without setup token", async () => {
  const result = await runTeamMigrateScript({ APP_URL: "http://127.0.0.1:3000" });

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /IMAGINE_TEAM_SETUP_TOKEN is required/);
});

interface ScriptResult {
  exitCode: number | null;
  stderr: string;
  stdout: string;
}

function runTeamMigrateScript(env: Record<string, string>): Promise<ScriptResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/team-migrate.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", exitCode => resolve({ exitCode, stderr, stdout }));
  });
}

function listen(server: ReturnType<typeof createServer>): Promise<string> {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not bind to a TCP port"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
