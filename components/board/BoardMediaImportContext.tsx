"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { BoardPoint } from "@/lib/board";

export type OpenBoardMediaImport = (point?: BoardPoint) => void;

const BoardMediaImportContext = createContext<OpenBoardMediaImport | null>(null);

export function BoardMediaImportProvider({
  children,
  openImport,
}: {
  children: ReactNode;
  openImport: OpenBoardMediaImport;
}) {
  return (
    <BoardMediaImportContext.Provider value={openImport}>
      {children}
    </BoardMediaImportContext.Provider>
  );
}

export function useBoardMediaImport(): OpenBoardMediaImport | null {
  return useContext(BoardMediaImportContext);
}