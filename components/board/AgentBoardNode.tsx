import { Bot, Send } from "lucide-react";
import type { BoardAgentNode } from "@/lib/board";

interface AgentBoardNodeProps {
  node: BoardAgentNode;
  onSend: () => void;
  onUpdate: (instruction: string) => void;
}

export default function AgentBoardNode({ node, onSend, onUpdate }: AgentBoardNodeProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 bg-slate-950 p-3">
      <textarea
        value={node.instruction}
        onChange={(event) => onUpdate(event.target.value)}
        className="nodrag nowheel min-h-0 flex-1 resize-none rounded-md border border-slate-800 bg-slate-900 p-2 text-xs leading-5 text-slate-100 outline-none placeholder:text-slate-600 focus:border-slate-600"
        placeholder="给 Agent 的任务；可连接图片作为上下文"
      />
      <button
        type="button"
        onClick={onSend}
        className="nodrag flex h-8 items-center justify-center gap-1.5 rounded-md border border-purple-400/30 bg-purple-500/15 text-xs font-semibold text-purple-100 transition hover:bg-purple-500/25"
      >
        <Bot className="h-3.5 w-3.5" />
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
