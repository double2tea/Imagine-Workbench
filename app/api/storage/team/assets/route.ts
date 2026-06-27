import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import type { StorageItem, StorageItemMeta, StorageItemType } from "@/lib/db";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import {
  clearTeamAssets,
  listTeamAssets,
  repairTeamAssetSourceLinks,
  saveTeamAsset,
  type TeamAssetSaveInput,
} from "@/lib/storage/team-assets";
import type { WorkspaceAssetListOptions } from "@/lib/storage/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TeamAssetStatus = NonNullable<WorkspaceAssetListOptions["statuses"]>[number];

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const options = parseTeamAssetListOptions(new URL(request.url).searchParams);
    const result = await withPostgresClient(config, client => listTeamAssets(client, config, request, options));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team asset list failed");
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
    const input = await readTeamAssetSaveRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => saveTeamAsset(client, config, request, input));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team asset save failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => clearTeamAssets(client, config, request));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team assets clear failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    await readTeamAssetPatchRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => repairTeamAssetSourceLinks(client, config, request));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team asset update failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

function parseTeamAssetListOptions(searchParams: URLSearchParams): WorkspaceAssetListOptions {
  return {
    boardId: optionalBoardIdParam(searchParams, "boardId"),
    ids: repeatedTextParam(searchParams, "id"),
    limit: integerParam(searchParams, "limit", 100, 1, 200),
    offset: integerParam(searchParams, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
    statuses: statusParams(searchParams),
  };
}

function optionalBoardIdParam(searchParams: URLSearchParams, name: string): string | undefined {
  const value = searchParams.get(name);
  return value === null ? undefined : value.trim();
}

function repeatedTextParam(searchParams: URLSearchParams, name: string): string[] | undefined {
  const values = searchParams.getAll(name).map(value => value.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function integerParam(searchParams: URLSearchParams, name: string, defaultValue: number, min: number, max: number): number {
  const rawValue = searchParams.get(name);
  if (rawValue === null || rawValue.trim() === "") return defaultValue;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`Invalid ${name}`, "invalid_team_asset_query");
  }
  return value;
}

function statusParams(searchParams: URLSearchParams): WorkspaceAssetListOptions["statuses"] {
  const statuses = repeatedTextParam(searchParams, "status");
  if (!statuses) return undefined;
  const result: TeamAssetStatus[] = [];
  for (const status of statuses) {
    if (!isTeamAssetStatus(status)) throw badRequest("Invalid status", "invalid_team_asset_query");
    result.push(status);
  }
  return result;
}

function isTeamAssetStatus(value: string): value is TeamAssetStatus {
  return value === "complete" || value === "processing" || value === "pending" || value === "failed";
}

async function readTeamAssetSaveRequestJson(request: Request): Promise<TeamAssetSaveInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Invalid team asset request", "invalid_team_asset_request");
  }
  if (!isRecord(body) || !isStorageItem(body.asset)) {
    throw badRequest("Invalid team asset request", "invalid_team_asset_request");
  }
  return { item: body.asset };
}

async function readTeamAssetPatchRequestJson(request: Request): Promise<{ action: "repair-stale-source-links" }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw badRequest("Invalid team asset request", "invalid_team_asset_request");
  }
  if (!isRecord(body) || body.action !== "repair-stale-source-links") {
    throw badRequest("Invalid team asset request", "invalid_team_asset_request");
  }
  return { action: body.action };
}

function isStorageItem(value: unknown): value is StorageItem {
  return (
    isStorageItemMeta(value) &&
    typeof value.url === "string"
  );
}

function isStorageItemMeta(value: unknown): value is StorageItemMeta {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isStorageItemType(value.type) &&
    typeof value.prompt === "string" &&
    typeof value.model === "string" &&
    typeof value.aspectRatio === "string" &&
    typeof value.createdAt === "string" &&
    isStorageItemStatus(value.status) &&
    typeof value.progress === "number" &&
    (value.scope === "workspace" || value.scope === "board") &&
    typeof value.boardId === "string" &&
    typeof value.hasBlob === "boolean"
  );
}

function isStorageItemType(value: unknown): value is StorageItemType {
  return value === "image" || value === "video" || value === "audio" || value === "transcript";
}

function isStorageItemStatus(value: unknown): value is StorageItemMeta["status"] {
  return value === "complete" || value === "processing" || value === "pending" || value === "failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
