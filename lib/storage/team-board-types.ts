import type { BoardSummary } from "@/lib/board/types";

export interface TeamBoardSummaryListResult {
  boards: BoardSummary[];
  limit: number;
  offset: number;
  targetKind: "postgres";
  workspaceId: string;
}
