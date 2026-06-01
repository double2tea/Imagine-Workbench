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
      className="nodrag nowheel h-full w-full resize-none bg-slate-950 p-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600"
      placeholder="写提示词，再连到生成节点"
    />
  );
}
