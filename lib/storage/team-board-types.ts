import type { BoardDocument, BoardSummary } from "@/lib/board/types";

export interface TeamBoardDocumentResult {
  board: BoardDocument;
  summary: BoardSummary;
  targetKind: "postgres";
  version: number;
  workspaceId: string;
}

export interface TeamBoardResetResult extends TeamBoardDocumentResult {
  deletedBoardCount: number;
}

export interface TeamBoardSummaryListResult {
  boards: BoardSummary[];
  limit: number;
  offset: number;
  targetKind: "postgres";
  workspaceId: string;
}
