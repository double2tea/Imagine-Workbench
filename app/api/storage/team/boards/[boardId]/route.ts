import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import type { BoardDocument } from "@/lib/board/types";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { getTeamBoardDocument, saveTeamBoardDocument } from "@/lib/storage/team-boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamBoardRouteContext {
  params: Promise<{
    boardId: string;
  }>;
}

export async function GET(request: Request, context: TeamBoardRouteContext): Promise<Response> {
  try {
    const { boardId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => getTeamBoardDocument(client, config, request, boardId));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team board read failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

export async function PUT(request: Request, context: TeamBoardRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { boardId } = await context.params;
    const expectedVersion = parseIfMatchVersion(request.headers.get("if-match"));
    const board = await readTeamBoardDocumentRequestJson(request);
    if (board.id !== boardId) throw badRequest("Board id does not match route", "invalid_team_board_request");
    const config = resolvePostgresStorageConfig(process.env);
    const result = await withPostgresClient(config, client => saveTeamBoardDocument(client, config, request, board, expectedVersion));
    return Response.json(result);
  } catch (error) {
    const response = apiErrorResponse(error, "Team board save failed");
    return Response.json(response.body, {
      status: error instanceof PostgresStorageConfigError ? 400 : response.status,
    });
  }
}

function parseIfMatchVersion(value: string | null): number {
  const rawValue = value?.trim();
  if (!rawValue) throw badRequest("If-Match version is required", "missing_team_board_version");
  const version = Number(rawValue);
  if (!Number.isInteger(version) || version < 1) {
    throw badRequest("If-Match version is invalid", "invalid_team_board_version");
  }
  return version;
}

async function readTeamBoardDocumentRequestJson(request: Request): Promise<BoardDocument> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw badRequest("Invalid team board request", "invalid_team_board_request");
  }
  if (!isBoardDocument(value)) throw badRequest("Invalid team board request", "invalid_team_board_request");
  return value;
}

function isBoardDocument(value: unknown): value is BoardDocument {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    isRecord(value.config) &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    isRecord(value.viewport) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
