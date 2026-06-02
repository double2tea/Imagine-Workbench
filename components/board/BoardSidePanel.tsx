"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, PanelRight } from "lucide-react";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      window.localStorage.setItem(BOARD_SIDE_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const panelBody = (
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
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="imagine-board-mobile-panel-btn fixed bottom-4 right-4 z-40 flex h-11 items-center gap-2 rounded-full border border-[var(--iw-border)] bg-[var(--iw-panel)] px-4 text-xs font-semibold text-[var(--iw-text)] shadow-lg lg:hidden"
      >
        <PanelRight className="h-4 w-4" />
        面板
      </button>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="关闭侧栏"
          className="fixed inset-0 z-40 bg-black/45 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside
        data-collapsed={collapsed}
        data-mobile-open={mobileOpen}
        style={{ width: collapsed ? 44 : 360 }}
        className={`imagine-board-side-panel min-h-0 flex-col border-[var(--iw-border)] bg-[var(--iw-panel)] text-[var(--iw-text)] ${
          mobileOpen
            ? "fixed inset-y-0 right-0 z-50 flex w-[min(360px,92vw)] border-l shadow-2xl lg:static lg:z-auto lg:flex lg:w-auto lg:shadow-none"
            : "hidden min-h-0 border-l lg:flex"
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          className="imagine-board-side-collapse-btn hidden lg:flex"
          title={collapsed ? "展开检查器" : "收起检查器"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {mobileOpen ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex h-10 items-center justify-end border-b border-[var(--iw-border)] px-3 text-xs font-semibold text-[var(--iw-muted)] lg:hidden"
          >
            关闭
          </button>
        ) : null}
        {panelBody}
      </aside>
    </>
  );
}