import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import type { WorkspaceBoardListOptions } from "@/lib/storage/repository";
import { readTeamBoardDocumentRequestJson } from "@/lib/storage/team-board-request";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { createTeamBoardDocument, listTeamBoardSummaries, resetTeamBoards } from "@/lib/storage/team-boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const config = resolvePostgresStorageConfig(process.env);
    const options = parseTeamBoardListOptions(new URL(request.url).searchParams);
    const result = await withPostgresClient(config, client => listTeamBoardSummaries(client, config, request, options));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team board list failed");
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
    const board = await readTeamBoardDocumentRequestJson(request);
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => createTeamBoardDocument(client, config, request, board));
    return Response.json(result, { status: 201 });
  } catch (error) {
    const response = apiErrorResponse(error, "Team board create failed");
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
    const result = await withPostgresClient(config, client => resetTeamBoards(client, config, request));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team boards reset failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

function parseTeamBoardListOptions(searchParams: URLSearchParams): WorkspaceBoardListOptions {
  return {
    ids: repeatedTextParam(searchParams, "id"),
    limit: integerParam(searchParams, "limit", 100, 1, 200),
    offset: integerParam(searchParams, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
  };
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
    throw badRequest(`Invalid ${name}`, "invalid_team_board_query");
  }
  return value;
}
