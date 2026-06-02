"use client";

import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, PanelRight } from "lucide-react";

const BOARD_SIDE_COLLAPSED_KEY = "imagine_board_side_collapsed";
const BOARD_SIDE_INSPECTOR_HEIGHT_KEY = "imagine_board_inspector_height";
const DEFAULT_INSPECTOR_HEIGHT = 320;
const MIN_PANEL_SECTION_HEIGHT = 180;

interface BoardSidePanelProps {
  assetCount: number;
  assetsPanel: ReactNode;
  inspectorPanel: ReactNode;
  revealKey?: string | null;
}

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BOARD_SIDE_COLLAPSED_KEY) === "1";
}

function readInspectorHeightPreference(): number {
  if (typeof window === "undefined") return DEFAULT_INSPECTOR_HEIGHT;
  const stored = Number(window.localStorage.getItem(BOARD_SIDE_INSPECTOR_HEIGHT_KEY));
  return Number.isFinite(stored) && stored >= MIN_PANEL_SECTION_HEIGHT ? stored : DEFAULT_INSPECTOR_HEIGHT;
}

function clampInspectorHeight(value: number, panelHeight: number): number {
  const maxHeight = Math.max(MIN_PANEL_SECTION_HEIGHT, panelHeight - MIN_PANEL_SECTION_HEIGHT);
  return Math.min(Math.max(value, MIN_PANEL_SECTION_HEIGHT), maxHeight);
}

export default function BoardSidePanel({ assetCount, assetsPanel, inspectorPanel, revealKey }: BoardSidePanelProps) {
  const panelBodyRef = useRef<HTMLDivElement | null>(null);
  const [collapsedPreference, setCollapsedPreference] = useState(readCollapsedPreference);
  const [inspectorHeight, setInspectorHeight] = useState(readInspectorHeightPreference);
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = collapsedPreference && !revealKey;

  const toggleCollapsed = () => {
    setCollapsedPreference(() => {
      const next = !collapsed;
      window.localStorage.setItem(BOARD_SIDE_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const handleDividerPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const panelBody = panelBodyRef.current;
    if (!panelBody) return;
    event.preventDefault();
    const panelHeight = panelBody.getBoundingClientRect().height;
    const startY = event.clientY;
    const startHeight = inspectorHeight;

    const handlePointerMove = (moveEvent: globalThis.PointerEvent): void => {
      const nextHeight = clampInspectorHeight(startHeight + moveEvent.clientY - startY, panelHeight);
      setInspectorHeight(nextHeight);
    };
    const handlePointerUp = (upEvent: globalThis.PointerEvent): void => {
      const nextHeight = clampInspectorHeight(startHeight + upEvent.clientY - startY, panelHeight);
      setInspectorHeight(nextHeight);
      window.localStorage.setItem(BOARD_SIDE_INSPECTOR_HEIGHT_KEY, String(Math.round(nextHeight)));
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [inspectorHeight]);

  const panelBody = (
    <div ref={panelBodyRef} className="imagine-board-side-panel-body flex min-h-0 min-w-0 flex-1 flex-col">
      <section className="min-h-[180px] shrink-0 overflow-y-auto" style={{ flexBasis: inspectorHeight }}>
        {inspectorPanel}
      </section>
      <button
        type="button"
        className="h-2 shrink-0 cursor-row-resize border-y border-[var(--iw-border)] bg-[var(--iw-panel-soft)] transition hover:bg-[var(--iw-panel)]"
        title="调整检查器和本地资产高度"
        aria-label="调整检查器和本地资产高度"
        onPointerDown={handleDividerPointerDown}
      />
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--iw-faint)]">
            本地资产 <span className="font-mono normal-case tracking-normal text-[var(--iw-muted)]">{assetCount}</span>
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {assetsPanel}
        </div>
      </section>
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
