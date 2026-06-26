import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { QueryResultRow } from "pg";
import { ApiError } from "@/lib/api/errors";
import type { PostgresQueryable } from "@/lib/storage/postgres/connection";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE_NAME = "imagine_team_session";
const CSRF_COOKIE_NAME = "imagine_team_csrf";
const CSRF_HEADER_NAME = "x-imagine-csrf-token";
const PASSWORD_HASH_PREFIX = "scrypt:v1";
const SCRYPT_KEY_LENGTH = 64;
export const TEAM_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export const TEAM_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface TeamAuthEnv {
  APP_URL?: string;
  IMAGINE_TRUSTED_ORIGINS?: string;
}

export interface TeamSessionContext {
  email: string;
  expiresAt: string;
  role: TeamRole;
  sessionId: string;
  teamId: string;
  userId: string;
  workspaceId: string;
}

interface TeamSessionRow extends QueryResultRow {
  email: string;
  expires_at: Date | string;
  role: TeamRole;
  session_id: string;
  team_id: string;
  user_id: string;
  workspace_id: string;
}

const ROLE_RANK: Record<TeamRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

export function createTeamSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createTeamCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTeamSessionToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

export function hashTeamCsrfToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

export async function hashTeamPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("Team password must be at least 12 characters");
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH);
  return `${PASSWORD_HASH_PREFIX}:${salt}:${Buffer.from(derived as Buffer).toString("base64url")}`;
}

export async function verifyTeamPassword(password: string, passwordHash: string): Promise<boolean> {
  const parts = passwordHash.split(":");
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== PASSWORD_HASH_PREFIX) {
    throw new Error("Unsupported team password hash");
  }
  const [, , salt, expectedHash] = parts;
  const expected = Buffer.from(expectedHash, "base64url");
  const actual = Buffer.from(await scrypt(password, salt, expected.byteLength) as Buffer);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

export function serializeTeamSessionCookie(token: string, expiresAt: Date, appUrl: string): string {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    expiresAt,
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsUrl(appUrl),
  });
}

export function serializeTeamCsrfCookie(token: string, expiresAt: Date, appUrl: string): string {
  return serializeCookie(CSRF_COOKIE_NAME, token, {
    expiresAt,
    httpOnly: false,
    sameSite: "lax",
    secure: isHttpsUrl(appUrl),
  });
}

export function readTeamSessionToken(req: Request): string | undefined {
  return parseCookieHeader(req.headers.get("cookie"))[SESSION_COOKIE_NAME];
}

export function assertTeamRole(context: TeamSessionContext, minimumRole: TeamRole): void {
  if (ROLE_RANK[context.role] < ROLE_RANK[minimumRole]) {
    throw new ApiError(403, "forbidden", `${minimumRole} role is required`);
  }
}

export function assertTrustedTeamRequestOrigin(req: Request, env: TeamAuthEnv): void {
  const trustedOrigins = readTrustedOrigins(env);
  const origin = req.headers.get("origin");
  if (origin && trustedOrigins.has(origin)) return;
  const referer = req.headers.get("referer");
  if (referer && trustedOrigins.has(new URL(referer).origin)) return;
  throw new ApiError(403, "untrusted_origin", "Request origin is not trusted");
}

export function assertTeamCsrf(req: Request): void {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const cookieToken = cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers.get(CSRF_HEADER_NAME)?.trim();
  if (cookieToken && headerToken && cookieToken === headerToken) return;
  throw new ApiError(403, "invalid_csrf", "Valid CSRF token is required");
}

export async function requireTeamSession(
  queryable: PostgresQueryable,
  req: Request,
  workspaceId?: string,
): Promise<TeamSessionContext> {
  const token = readTeamSessionToken(req);
  if (!token) throw new ApiError(401, "unauthorized", "Team session is required");
  const sessionId = hashTeamSessionToken(token);
  const result = await queryable.query<TeamSessionRow>(
    `select sessions.id as session_id, sessions.user_id, users.email, teams.id as team_id,
      teams.workspace_id, team_memberships.role, sessions.expires_at
     from sessions
     join users on users.id = sessions.user_id
     join team_memberships on team_memberships.user_id = users.id
     join teams on teams.id = team_memberships.team_id
     where sessions.id = $1
       and sessions.expires_at > now()
       and ($2::uuid is null or teams.workspace_id = $2::uuid)
     order by team_memberships.created_at asc
     limit 1`,
    [sessionId, workspaceId ?? null],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(401, "unauthorized", "Team session is invalid or expired");
  return {
    email: row.email,
    expiresAt: new Date(row.expires_at).toISOString(),
    role: row.role,
    sessionId: row.session_id,
    teamId: row.team_id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
  };
}

function readTrustedOrigins(env: TeamAuthEnv): Set<string> {
  const appUrl = env.APP_URL?.trim();
  if (!appUrl) throw new Error("APP_URL is required for team request origin checks");
  const origins = new Set<string>([new URL(appUrl).origin]);
  for (const value of (env.IMAGINE_TRUSTED_ORIGINS ?? "").split(",")) {
    const origin = value.trim();
    if (origin) origins.add(new URL(origin).origin);
  }
  return origins;
}

function parseCookieHeader(value: string | null): Record<string, string> {
  if (!value) return {};
  const cookies: Record<string, string> = {};
  for (const part of value.split(";")) {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(rawValue.join("=").trim());
  }
  return cookies;
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    expiresAt: Date;
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
  },
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Expires=${options.expiresAt.toUTCString()}`,
    "SameSite=Lax",
    ...(options.httpOnly ? ["HttpOnly"] : []),
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

function isHttpsUrl(value: string): boolean {
  return new URL(value).protocol === "https:";
}
