#!/usr/bin/env node

const appUrl = requireEnv("APP_URL").replace(/\/+$/, "");
const setupToken = requireEnv("IMAGINE_TEAM_SETUP_TOKEN");
const response = await fetch(`${appUrl}/api/storage/team/migrations`, {
  headers: {
    origin: appUrl,
    "x-imagine-setup-token": setupToken,
  },
  method: "POST",
});

const body = await readJson(response);
if (!response.ok) {
  const code = typeof body?.code === "string" ? ` (${body.code})` : "";
  const message = typeof body?.error === "string" ? body.error : "PostgreSQL migration failed";
  throw new Error(`${message}${code}`);
}

const migrationStatus = body?.migrationStatus;
if (!isMigrationStatus(migrationStatus)) {
  throw new Error("PostgreSQL migration response is invalid");
}

const appliedCount = migrationStatus.appliedMigrationIds.length;
const pendingCount = migrationStatus.pendingMigrationIds.length;
console.log(`PostgreSQL migrations complete for app ${String(body.appVersion ?? "unknown")}.`);
console.log(`Schema version: ${migrationStatus.currentSchemaVersion}/${migrationStatus.requiredSchemaVersion}.`);
console.log(`Applied this run: ${appliedCount}. Pending: ${pendingCount}.`);
if (migrationStatus.unsupportedNewerSchema) {
  throw new Error("Database schema is newer than this app version supports");
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isMigrationStatus(value) {
  return value !== null &&
    typeof value === "object" &&
    Number.isInteger(value.currentSchemaVersion) &&
    Number.isInteger(value.requiredSchemaVersion) &&
    typeof value.unsupportedNewerSchema === "boolean" &&
    Array.isArray(value.appliedMigrationIds) &&
    Array.isArray(value.pendingMigrationIds) &&
    value.appliedMigrationIds.every(item => typeof item === "string") &&
    value.pendingMigrationIds.every(item => typeof item === "string");
}
