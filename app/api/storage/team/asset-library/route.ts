import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import type {
  LibraryAssetCategory,
  LibraryAssetMediaType,
  LibraryAssetOrigin,
  LibraryAssetRecord,
} from "@/lib/db";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import type { WorkspaceStoragePageOptions } from "@/lib/storage/repository";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import {
  listTeamAssetLibrary,
  saveTeamAssetLibraryRecord,
  type TeamAssetLibrarySaveInput,
} from "@/lib/storage/team-asset-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const options = parseTeamAssetLibraryListOptions(new URL(request.url).searchParams);
    const result = await withPostgresClient(config, client => listTeamAssetLibrary(client, config, request, options));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team asset library list failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const input = await readTeamAssetLibrarySaveRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => saveTeamAssetLibraryRecord(client, config, request, input));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team asset library save failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

function parseTeamAssetLibraryListOptions(searchParams: URLSearchParams): WorkspaceStoragePageOptions {
  return {
    limit: integerParam(searchParams, "limit", 200, 1, 200),
    offset: integerParam(searchParams, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function integerParam(searchParams: URLSearchParams, name: string, defaultValue: number, min: number, max: number): number {
  const rawValue = searchParams.get(name);
  if (rawValue === null || rawValue.trim() === "") return defaultValue;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`Invalid ${name}`, "invalid_team_asset_library_query");
  }
  return value;
}

async function readTeamAssetLibrarySaveRequestJson(request: Request): Promise<TeamAssetLibrarySaveInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Invalid team asset library request", "invalid_team_asset_library_request");
  }
  if (!isRecord(body) || !isLibraryAssetRecord(body.record)) {
    throw badRequest("Invalid team asset library request", "invalid_team_asset_library_request");
  }
  return { record: body.record };
}

function isLibraryAssetRecord(value: unknown): value is LibraryAssetRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.assetId === "string" &&
    (value.sourceAssetId === undefined || typeof value.sourceAssetId === "string") &&
    isLibraryAssetOrigin(value.origin) &&
    isLibraryAssetMediaType(value.mediaType) &&
    isLibraryAssetCategory(value.category) &&
    typeof value.title === "string" &&
    typeof value.notes === "string" &&
    Array.isArray(value.tags) &&
    value.tags.every(tag => typeof tag === "string") &&
    typeof value.favorite === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isLibraryAssetOrigin(value: unknown): value is LibraryAssetOrigin {
  return value === "promoted" || value === "imported";
}

function isLibraryAssetMediaType(value: unknown): value is LibraryAssetMediaType {
  return value === "image" || value === "video" || value === "audio";
}

function isLibraryAssetCategory(value: unknown): value is LibraryAssetCategory {
  return value === "character" || value === "scene" || value === "prop" || value === "style" || value === "other";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
