import { memo } from "react";
import DebouncedBoardTextarea from "@/components/board/DebouncedBoardTextarea";
import type { BoardNoteNode } from "@/lib/board";

interface NoteBoardNodeProps {
  node: BoardNoteNode;
  onChange: (body: string) => void;
}

const NoteBoardNode = memo(function NoteBoardNode({ node, onChange }: NoteBoardNodeProps) {
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
