"use client";

import { useEffect, useState } from "react";

const BOARD_HANDLES_HINT_KEY = "imagine_board_handles_hint_seen";

function readHandlesHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(BOARD_HANDLES_HINT_KEY) === "1";
}

export default function BoardEmptyHint() {
  const [handlesHintSeen, setHandlesHintSeen] = useState(true);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      setHandlesHintSeen(readHandlesHintSeen());
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  const dismissHandlesHint = () => {
    window.localStorage.setItem(BOARD_HANDLES_HINT_KEY, "1");
    setHandlesHintSeen(true);
  };

  return (
    <div className="imagine-board-empty-hint">
      <div className="imagine-board-empty-hint-card pointer-events-auto">
        <p className="text-sm font-semibold text-[var(--iw-text)]">空白画板</p>
        <p className="mt-2 text-xs leading-5 text-[var(--iw-muted)]">
          顶栏「导入媒体」、拖入文件，或粘贴图片/视频/音频可添加资产节点；双击画布可插入工作流节点。拖出连线到空白处可自动创建目标节点。
        </p>
        {!handlesHintSeen && (
          <p className="mt-3 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 py-2 text-[11px] leading-5 text-[var(--iw-muted)]">
            选中节点后，悬停边缘圆点可拖出连线；连线默认在 hover 时显示。
          </p>
        )}
        {!handlesHintSeen && (
          <button
            type="button"
            onClick={dismissHandlesHint}
            className="imagine-secondary-action mt-3 h-8 w-full rounded-lg border border-[var(--iw-border)] text-[11px] font-semibold text-[var(--iw-text)] transition hover:bg-[var(--iw-panel-soft)]"
          >
            知道了
          </button>
        )}
      </div>
    </div>
  );
}
