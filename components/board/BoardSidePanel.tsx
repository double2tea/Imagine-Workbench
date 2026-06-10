"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, PanelRight } from "lucide-react";

const BOARD_SIDE_COLLAPSED_KEY = "imagine_board_side_collapsed";
const BOARD_SIDE_TAB_KEY = "imagine_board_side_tab";

export type BoardSidePanelTab = "inspector" | "tasks" | "assets";

interface BoardSidePanelProps {
  assetsPanel: ReactNode;
  inspectorPanel: ReactNode;
  preserveTasksRevealKey?: string | null;
  onPreserveTasksRevealConsumed?: () => void;
  revealKey?: string | null;
  taskBadgeCount?: number;
  tasksPanel: ReactNode;
}

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BOARD_SIDE_COLLAPSED_KEY) === "1";
}

function readTabPreference(): BoardSidePanelTab {
  if (typeof window === "undefined") return "inspector";
  const stored = window.localStorage.getItem(BOARD_SIDE_TAB_KEY);
  if (stored === "tasks" || stored === "assets") return stored;
  return "inspector";
}

export default function BoardSidePanel({
  assetsPanel,
  inspectorPanel,
  preserveTasksRevealKey,
  onPreserveTasksRevealConsumed,
  revealKey,
  taskBadgeCount = 0,
  tasksPanel,
}: BoardSidePanelProps) {
  const [collapsedPreference, setCollapsedPreference] = useState(false);
  const [activeTab, setActiveTab] = useState<BoardSidePanelTab>("inspector");
  const [mobileOpen, setMobileOpen] = useState(false);
  const previousRevealKeyRef = useRef<string | null>(null);
  const collapsed = collapsedPreference && !revealKey;

  useEffect(() => {
    setCollapsedPreference(readCollapsedPreference());
    setActiveTab(readTabPreference());
  }, []);

  useEffect(() => {
    if (!revealKey) {
      previousRevealKeyRef.current = null;
      return;
    }
    if (previousRevealKeyRef.current === revealKey) return;
    previousRevealKeyRef.current = revealKey;
    const preserveTasksTab = preserveTasksRevealKey === revealKey;
    setActiveTab(current => preserveTasksTab && current === "tasks" ? current : "inspector");
    if (preserveTasksRevealKey) onPreserveTasksRevealConsumed?.();
  }, [onPreserveTasksRevealConsumed, preserveTasksRevealKey, revealKey]);

  const selectTab = (tab: BoardSidePanelTab) => {
    setActiveTab(tab);
    window.localStorage.setItem(BOARD_SIDE_TAB_KEY, tab);
  };

  const toggleCollapsed = () => {
    setCollapsedPreference(() => {
      const next = !collapsed;
      window.localStorage.setItem(BOARD_SIDE_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const tabBar = (
    <div className="imagine-board-side-tabs shrink-0 grid grid-cols-3 gap-1 p-2">
      <button
        type="button"
        data-active={activeTab === "inspector"}
        className="imagine-board-side-tab px-2"
        onClick={() => selectTab("inspector")}
      >
        检查器
      </button>
      <button
        type="button"
        data-active={activeTab === "tasks"}
        className="imagine-board-side-tab px-2"
        onClick={() => selectTab("tasks")}
      >
        任务{taskBadgeCount > 0 ? ` ${taskBadgeCount}` : ""}
      </button>
      <button
        type="button"
        data-active={activeTab === "assets"}
        className="imagine-board-side-tab px-2"
        onClick={() => selectTab("assets")}
      >
        本地资产
      </button>
    </div>
  );

  const panelBody = (
    <div className="imagine-board-side-panel-body flex min-h-0 min-w-0 flex-1 flex-col">
      {tabBar}
      <div className="imagine-board-side-panel-scroll min-h-0 flex-1 overflow-y-auto">
        {activeTab === "inspector" ? inspectorPanel : activeTab === "tasks" ? tasksPanel : assetsPanel}
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
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          aria-expanded={!collapsed}
        >
          <PanelRight className="h-4 w-4" />
          <span className="imagine-board-side-collapse-label">{collapsed ? "面板" : "收起"}</span>
          {collapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
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
