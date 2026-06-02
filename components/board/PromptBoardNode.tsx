import type { BoardPromptNode } from "@/lib/board";

interface PromptBoardNodeProps {
  node: BoardPromptNode;
  onChange: (prompt: string) => void;
}

export default function PromptBoardNode({ node, onChange }: PromptBoardNodeProps) {
  return (
    <textarea
      value={node.prompt}
      onChange={(event) => onChange(event.target.value)}
      className="nodrag nowheel h-full w-full resize-none imagine-board-input p-3 text-xs leading-5 outline-none placeholder:text-[var(--iw-faint)]"
      placeholder="写提示词，再连到生成节点"
    />
  );
}
