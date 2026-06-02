"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const BOARD_SIDE_COLLAPSED_KEY = "imagine_board_side_collapsed";

interface BoardSidePanelProps {
  assetCount: number;
  assetsPanel: ReactNode;
  inspectorPanel: ReactNode;
}

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BOARD_SIDE_COLLAPSED_KEY) === "1";
}

export default function BoardSidePanel({ assetCount, assetsPanel, inspectorPanel }: BoardSidePanelProps) {
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      window.localStorage.setItem(BOARD_SIDE_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <aside
      data-collapsed={collapsed}
      style={{ width: collapsed ? 44 : 360 }}
      className="imagine-board-side-panel hidden min-h-0 w-full flex-col border-l border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-text)] lg:flex"
    >
      <button
        type="button"
        onClick={toggleCollapsed}
        className="imagine-board-side-collapse-btn"
        title={collapsed ? "展开检查器" : "收起检查器"}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      <div className="imagine-board-side-panel-body flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="imagine-board-side-panel-scroll min-h-0 flex-1 overflow-y-auto">
          {inspectorPanel}
          <div className="border-t border-[var(--iw-border)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--iw-faint)]">
              本地资产 <span className="font-mono normal-case tracking-normal text-[var(--iw-muted)]">{assetCount}</span>
            </p>
          </div>
          {assetsPanel}
        </div>
      </div>
    </aside>
  );
}