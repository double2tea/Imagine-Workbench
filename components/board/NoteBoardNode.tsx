import { memo, useEffect, useState } from "react";
import { Check, Copy, FileText } from "lucide-react";
import DebouncedBoardTextarea from "@/components/board/DebouncedBoardTextarea";
import type { BoardNoteNode } from "@/lib/board";

interface NoteBoardNodeProps {
  node: BoardNoteNode;
  onChange: (body: string) => void;
}

const NoteBoardNode = memo(function NoteBoardNode({ node, onChange }: NoteBoardNodeProps) {
  const [didCopy, setDidCopy] = useState(false);

  useEffect(() => {
    if (!didCopy) return;
    const timeout = window.setTimeout(() => setDidCopy(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [didCopy]);

  const copyBody = async (): Promise<void> => {
    await navigator.clipboard.writeText(node.body);
    setDidCopy(true);
  };

  const copyButton = (
    <button
      type="button"
      className="nodrag nopan flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--iw-border)] bg-[var(--iw-panel-soft)] text-[var(--iw-muted)] transition hover:border-cyan-400/45 hover:text-[var(--iw-text)]"
      title="复制文本"
      aria-label="复制文本"
      onClick={(event) => {
        event.stopPropagation();
        void copyBody();
      }}
      onPointerDown={event => event.stopPropagation()}
    >
      {didCopy ? <Check className="imagine-tone-icon h-3.5 w-3.5" data-tone="success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );

  if (node.variant === "transcript") {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--iw-panel)] text-[var(--iw-text)]">
        <div className="shrink-0 border-b border-[var(--iw-border)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--iw-text)]">
              <FileText className="imagine-tone-icon h-3.5 w-3.5 shrink-0" data-tone="info" />
              <span className="truncate">转写结果</span>
            </div>
            {copyButton}
          </div>
          {node.source && (
            <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 font-mono text-[9px] text-[var(--iw-muted)]">
              <span className="max-w-full truncate">model: {node.source.model}</span>
              <span className="max-w-full truncate">asset: {node.source.assetId}</span>
            </div>
          )}
        </div>
        <DebouncedBoardTextarea
          commitId={node.id}
          value={node.body}
          onChange={onChange}
          className="nodrag nowheel nopan min-h-0 flex-1 resize-none overflow-y-auto overscroll-contain bg-transparent p-3 text-sm leading-6 text-[var(--iw-text)] outline-none placeholder:text-[var(--iw-faint)]"
          placeholder="转写文本"
        />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--iw-panel)] text-[var(--iw-text)]">
      <div className="absolute right-2 top-2 z-10">{copyButton}</div>
      <DebouncedBoardTextarea
        commitId={node.id}
        value={node.body}
        onChange={onChange}
        className="nodrag nowheel nopan h-full w-full resize-none overflow-y-auto overscroll-contain bg-transparent p-3 pr-11 text-sm leading-6 text-[var(--iw-text)] outline-none placeholder:text-[var(--iw-faint)]"
        placeholder="笔记"
      />
    </div>
  );
});

export default NoteBoardNode;
