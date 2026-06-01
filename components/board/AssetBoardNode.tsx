import { ImageIcon, VideoIcon } from "lucide-react";
import PreviewImage from "@/components/PreviewImage";
import type { BoardAssetNode } from "@/lib/board";

interface AssetBoardNodeProps {
  node: BoardAssetNode;
}

export default function AssetBoardNode({ node }: AssetBoardNodeProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-slate-950">
        {node.asset.type === "image" ? (
          <PreviewImage src={node.asset.url} alt={node.asset.prompt} className="h-full w-full object-contain" />
        ) : (
          <video src={node.asset.url} controls className="h-full w-full object-contain" />
        )}
      </div>
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-slate-800 px-3 text-[11px] text-slate-400">
        {node.asset.type === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : <VideoIcon className="h-3.5 w-3.5" />}
        <span className="truncate">{node.asset.prompt}</span>
      </div>
    </div>
  );
}
