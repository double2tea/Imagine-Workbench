import { badRequest } from "@/lib/api/errors";
import type { BoardDocument } from "@/lib/board/types";

export async function readTeamBoardDocumentRequestJson(request: Request): Promise<BoardDocument> {
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
