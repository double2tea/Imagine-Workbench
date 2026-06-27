import { apiErrorResponse, badRequest } from "@/lib/api/errors";
import { PostgresStorageConfigError, resolvePostgresStorageConfig } from "@/lib/storage/postgres/config";
import { withPostgresClient } from "@/lib/storage/postgres/connection";
import { readTeamBoardDocumentRequestJson } from "@/lib/storage/team-board-request";
import {
  assertTeamCsrf,
  assertTrustedTeamRequestOrigin,
} from "@/lib/storage/team-auth";
import { deleteTeamBoardDocument, getTeamBoardDocument, saveTeamBoardDocument } from "@/lib/storage/team-boards";

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

export async function DELETE(request: Request, context: TeamBoardRouteContext): Promise<Response> {
  try {
    assertTrustedTeamRequestOrigin(request, {
      APP_URL: process.env.APP_URL,
      IMAGINE_TRUSTED_ORIGINS: process.env.IMAGINE_TRUSTED_ORIGINS,
    });
    assertTeamCsrf(request);
    const { boardId } = await context.params;
    const config = resolvePostgresStorageConfig(process.env);
    await withPostgresClient(config, client => deleteTeamBoardDocument(client, config, request, boardId));
    return Response.json({ ok: true });
  } catch (error) {
    const response = apiErrorResponse(error, "Team board delete failed");
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
