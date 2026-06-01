import { ImagePlus, Loader2, Play, Video } from "lucide-react";
import type { BoardGenerateNodeUpdate, BoardImageGenerateNode, BoardVideoGenerateNode } from "@/lib/board";

type GenerateNode = BoardImageGenerateNode | BoardVideoGenerateNode;

interface GenerateBoardNodeProps {
  node: GenerateNode;
  onExecute: () => void;
  onUpdate: (input: BoardGenerateNodeUpdate) => void;
}

function statusText(node: GenerateNode): string {
  if (node.status === "processing") return "Processing";
  if (node.status === "complete") return "Complete";
  if (node.status === "failed") return "Failed";
  return node.kind === "image-generate" ? "Image" : "Video";
}

export default function GenerateBoardNode({ node, onExecute, onUpdate }: GenerateBoardNodeProps) {
  const isProcessing = node.status === "processing";
  const paramSummary = node.kind === "image-generate"
    ? `${node.model} / ${node.imageResolution === "custom" ? node.customImageResolution : node.imageResolution}`
    : `${node.model} / ${node.aspectRatio}${node.videoDuration ? ` / ${node.videoDuration}s` : ""}`;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 bg-slate-950 p-3">
      <textarea
        value={node.prompt}
        onChange={(event) => onUpdate({ prompt: event.target.value })}
        className="nodrag nowheel min-h-0 flex-1 resize-none rounded-md border border-slate-800 bg-slate-900 p-2 text-xs leading-5 text-slate-100 outline-none placeholder:text-slate-600 focus:border-slate-600"
        placeholder="可直接写提示词，或连接 Prompt 输入"
      />
      <div className="grid grid-cols-[1fr_auto] items-center gap-2">
        <span className={`truncate text-[11px] ${node.status === "failed" ? "text-red-300" : "text-slate-500"}`}>
          {node.errorMessage ?? `${statusText(node)} / ${paramSummary}`}
        </span>
        <button
          type="button"
          onClick={onExecute}
          disabled={isProcessing}
          className="nodrag flex h-8 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500"
        >
          {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : node.kind === "image-generate" ? <ImagePlus className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
          <Play className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
