import type { BoardNoteNode } from "@/lib/board";

interface NoteBoardNodeProps {
  node: BoardNoteNode;
  onChange: (body: string) => void;
}

export default function NoteBoardNode({ node, onChange }: NoteBoardNodeProps) {
  return (
    <textarea
      value={node.body}
      onChange={(event) => onChange(event.target.value)}
      className="h-full w-full resize-none bg-amber-50 p-3 text-sm leading-6 text-slate-950 outline-none"
      placeholder="Note"
    />
  );
}
