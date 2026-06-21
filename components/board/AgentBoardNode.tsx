import { memo } from "react";
import { Send } from "lucide-react";
import AgentIdentityMark from "@/components/agent/AgentIdentityMark";
import DebouncedBoardTextarea from "@/components/board/DebouncedBoardTextarea";
import type { BoardAgentNode } from "@/lib/board";
import { useTranslations } from "@/lib/i18n";

interface AgentBoardNodeProps {
  node: BoardAgentNode;
  onSend: () => void;
  onUpdate: (instruction: string) => void;
}

const AgentBoardNode = memo(function AgentBoardNode({ node, onSend, onUpdate }: AgentBoardNodeProps) {
  const { t } = useTranslations("board");
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <DebouncedBoardTextarea
        commitId={node.id}
        name={`board-agent-instruction-${node.id}`}
        value={node.instruction}
        onChange={onUpdate}
        className="nodrag nowheel min-h-0 flex-1 resize-none rounded-md imagine-board-input p-2 text-xs leading-5 outline-none placeholder:text-[var(--iw-faint)] focus:border-[var(--iw-border)]"
        placeholder={t('node.agentPlaceholder')}
      />
      <button
        type="button"
        onClick={onSend}
        className="imagine-tone-chip nodrag flex h-8 items-center justify-center gap-1.5 rounded-md border text-xs font-semibold transition"
        data-tone="violet"
      >
        <AgentIdentityMark variant="inline" />
        <Send className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

export default AgentBoardNode;
