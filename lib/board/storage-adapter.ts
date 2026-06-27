import type { BoardDocument, BoardSummary } from "@/lib/board/types";
import {
  deleteBoardFromDB,
  getBoardFromDB,
  listBoardSummariesFromDB,
  saveBoardToDB,
} from "@/lib/board/persistence";
import {
  TeamStorageClientError,
  createTeamBoardDocument,
  deleteTeamBoardDocument,
  fetchTeamBoardDocument,
  fetchTeamBoardSummaries,
  readTeamCsrfToken,
  saveTeamBoardDocument,
} from "@/lib/storage/team-client";

export interface BoardStorageAdapter {
  createBoard: (board: BoardDocument) => Promise<void>;
  deleteBoard: (boardId: string) => Promise<void>;
  getBoard: (boardId: string) => Promise<BoardDocument | null>;
  listBoardSummaries: () => Promise<BoardSummary[]>;
  saveBoard: (board: BoardDocument) => Promise<void>;
}

export const indexedDbBoardStorageAdapter: BoardStorageAdapter = {
  createBoard: saveBoardToDB,
  deleteBoard: deleteBoardFromDB,
  getBoard: getBoardFromDB,
  listBoardSummaries: listBoardSummariesFromDB,
  saveBoard: saveBoardToDB,
};

export function createTeamBoardStorageAdapter(): BoardStorageAdapter {
  const versions = new Map<string, number>();
  return {
    async createBoard(board) {
      const result = await createTeamBoardDocument(board, requireTeamCsrfToken());
      versions.set(result.board.id, result.version);
    },
    async deleteBoard(boardId) {
      await deleteTeamBoardDocument(boardId, requireTeamCsrfToken());
      versions.delete(boardId);
    },
    async getBoard(boardId) {
      try {
        const result = await fetchTeamBoardDocument(boardId);
        versions.set(result.board.id, result.version);
        return result.board;
      } catch (error) {
        if (error instanceof TeamStorageClientError && error.code === "team_board_not_found") return null;
        throw error;
      }
    },
    async listBoardSummaries() {
      const result = await fetchTeamBoardSummaries();
      return result.boards;
    },
    async saveBoard(board) {
      const version = versions.get(board.id);
      const result = version === undefined
        ? await createTeamBoardDocument(board, requireTeamCsrfToken())
        : await saveTeamBoardDocument(board, version, requireTeamCsrfToken());
      versions.set(result.board.id, result.version);
    },
  };
}

function requireTeamCsrfToken(): string {
  const token = readTeamCsrfToken();
  if (!token) throw new Error("Team CSRF token is required");
  return token;
}
