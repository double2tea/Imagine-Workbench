import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import { listTeamAssets } from "@/lib/storage/team-assets";
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

function parseTeamAssetListOptions(searchParams: URLSearchParams): WorkspaceAssetListOptions {
  return {
    boardId: optionalTextParam(searchParams, "boardId"),
    ids: repeatedTextParam(searchParams, "id"),
    limit: integerParam(searchParams, "limit", 100, 1, 200),
    offset: integerParam(searchParams, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
    statuses: statusParams(searchParams),
  };
}

function optionalTextParam(searchParams: URLSearchParams, name: string): string | undefined {
  const value = searchParams.get(name)?.trim();
  return value || undefined;
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
