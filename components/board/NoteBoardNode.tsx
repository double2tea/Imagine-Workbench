import { memo } from "react";
import { FileText } from "lucide-react";
import DebouncedBoardTextarea from "@/components/board/DebouncedBoardTextarea";
import type { BoardNoteNode } from "@/lib/board";

interface NoteBoardNodeProps {
  node: BoardNoteNode;
  onChange: (body: string) => void;
}

const NoteBoardNode = memo(function NoteBoardNode({ node, onChange }: NoteBoardNodeProps) {
  if (node.variant === "transcript") {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-cyan-950/24 text-slate-100 imagine-board-node-note">
        <div className="shrink-0 border-b border-cyan-300/14 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-100">
            <FileText className="h-3.5 w-3.5" />
            转写结果
          </div>
          {node.source && (
            <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 font-mono text-[9px] text-cyan-100/58">
              <span className="max-w-full truncate">model: {node.source.model}</span>
              <span className="max-w-full truncate">asset: {node.source.assetId}</span>
            </div>
          )}
        </div>
        <DebouncedBoardTextarea
          commitId={node.id}
          value={node.body}
          onChange={onChange}
          className="min-h-0 flex-1 resize-none bg-transparent p-3 text-sm leading-6 text-slate-100 outline-none"
          placeholder="转写文本"
        />
      </div>
    );
  }

  return (
    <DebouncedBoardTextarea
      commitId={node.id}
      value={node.body}
      onChange={onChange}
      className="h-full w-full resize-none bg-amber-50 p-3 text-sm leading-6 text-slate-950 outline-none imagine-board-node-note"
      placeholder="笔记"
    />
  );
});

export default NoteBoardNode;
