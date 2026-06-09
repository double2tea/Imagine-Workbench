"use client";

import { useEffect, useState } from "react";

const BOARD_HANDLES_HINT_KEY = "imagine_board_handles_hint_seen";
const START_ACTIONS = ["导入媒体", "添加提示", "创建生成节点", "整理参考组", "写笔记", "交给 Agent"] as const;

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
        <p className="text-sm font-semibold text-[var(--iw-text)]">从一个动作开始</p>
        <p className="mt-2 text-xs leading-5 text-[var(--iw-muted)]">
          顶栏导入、拖入文件、粘贴媒体，或双击空白处插入节点。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-1.5 text-left">
          {START_ACTIONS.map(action => (
            <span
              key={action}
              className="rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-[11px] font-semibold text-[var(--iw-text)]"
            >
              {action}
            </span>
          ))}
        </div>
        {!handlesHintSeen && (
          <p className="mt-3 rounded-lg border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-3 py-2 text-[11px] leading-5 text-[var(--iw-muted)]">
            选中节点后，从边缘圆点拖出连线；拖到空白处会打开可连接节点。
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
