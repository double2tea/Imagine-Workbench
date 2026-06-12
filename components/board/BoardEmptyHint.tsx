"use client";

import { useEffect, useState } from "react";
import { Bot, FileText, ImagePlus, Layers3, MousePointerClick, Plus, Upload, type LucideIcon } from "lucide-react";

const BOARD_HANDLES_HINT_KEY = "imagine_board_handles_hint_seen";

interface StartAction {
  description: string;
  icon: LucideIcon;
  label: string;
}

interface BoardEmptyHintProps {
  onQuickInsert?: () => void;
}

const START_ACTIONS: readonly StartAction[] = [
  { icon: Upload, label: "导入媒体", description: "顶栏或拖入" },
  { icon: MousePointerClick, label: "双击空白", description: "快速插入" },
  { icon: ImagePlus, label: "生成节点", description: "图像/视频/音频" },
  { icon: Layers3, label: "参考整理", description: "分组与连线" },
  { icon: FileText, label: "提示笔记", description: "沉淀想法" },
  { icon: Bot, label: "交给 Agent", description: "继续编排" },
] as const;

function readHandlesHintSeen(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(BOARD_HANDLES_HINT_KEY) === "1";
}

export default function BoardEmptyHint({ onQuickInsert }: BoardEmptyHintProps) {
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
      <div
        className="imagine-board-empty-hint-card pointer-events-auto"
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
      >
        <p className="text-sm font-semibold text-[var(--iw-text)]">从一个动作开始</p>
        <p className="mt-2 text-xs leading-5 text-[var(--iw-muted)]">
          顶栏导入、拖入文件、粘贴媒体，或双击空白处插入节点。
        </p>
        {onQuickInsert ? (
          <button
            type="button"
            onClick={onQuickInsert}
            className="board-empty-start-action mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--iw-border)] text-xs font-semibold text-[var(--iw-text)] transition"
          >
            <Plus className="h-3.5 w-3.5" />
            打开插入菜单
          </button>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-1.5 text-left">
          {START_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <span
                key={action.label}
                className="board-empty-start-step rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] px-2 py-1.5 text-[11px] font-semibold text-[var(--iw-text)]"
              >
                <Icon className="h-3.5 w-3.5 text-[var(--iw-muted)]" />
                <span className="min-w-0">
                  <span className="block truncate">{action.label}</span>
                  <span className="block truncate text-[10px] font-medium text-[var(--iw-faint)]">{action.description}</span>
                </span>
              </span>
            );
          })}
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
