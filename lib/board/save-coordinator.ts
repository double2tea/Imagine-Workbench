import type { BoardDocument } from "./types";

export interface BoardSaveCoordinator {
  save(board: BoardDocument): Promise<void>;
}

export function createBoardSaveCoordinator(saveBoard: (board: BoardDocument) => Promise<void>): BoardSaveCoordinator {
  let tail: Promise<void> = Promise.resolve();
  return {
    save(board) {
      const pending = tail.then(() => saveBoard(board));
      tail = pending.catch(() => undefined);
      return pending;
    },
  };
}
