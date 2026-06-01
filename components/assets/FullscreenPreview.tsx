import { Check, Copy, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import PreviewImage from "@/components/PreviewImage";
import type { StorageItem } from "@/lib/db";
import { formatDisplayedAspectRatio } from "@/lib/media-display";

interface FullscreenPreviewProps {
  item: StorageItem | null;
  onClose: () => void;
}

type CopyStatus = "idle" | "copied" | "failed";
type CopyResult = { itemId: string; status: Exclude<CopyStatus, "idle"> } | null;

export default function FullscreenPreview({ item, onClose }: FullscreenPreviewProps) {
  const [copyResult, setCopyResult] = useState<CopyResult>(null);

  const copyStatus: CopyStatus =
    copyResult !== null && copyResult.itemId === item?.id ? copyResult.status : "idle";

  const copyPrompt = (itemId: string, prompt: string) => {
    void navigator.clipboard.writeText(prompt).then(
      () => {
        setCopyResult({ itemId, status: "copied" });
        window.setTimeout(() => setCopyResult(null), 1600);
      },
      () => {
        setCopyResult({ itemId, status: "failed" });
        window.setTimeout(() => setCopyResult(null), 1600);
      },
    );
  };

  return (
    <AnimatePresence>
      {item && (
        <div className="fixed inset-0 z-50 flex bg-slate-950/95 p-2 backdrop-blur-md sm:p-4">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 z-10 rounded-lg border border-slate-800 bg-slate-900/90 p-2 text-slate-400 transition hover:text-white sm:right-6 sm:top-6"
            aria-label="关闭全屏预览"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3">
            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
              {item.type === "image" ? (
                <PreviewImage
                  src={item.url}
                  alt={item.prompt}
                  className="h-full w-full object-contain"
                />
              ) : (
                <video src={item.url} controls loop autoPlay className="h-full w-full object-contain" />
              )}
            </div>
            <div className="flex w-full max-w-6xl shrink-0 flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/88 px-3 py-2 text-slate-300 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="line-clamp-2 min-w-0 flex-1 text-xs italic leading-5 text-slate-200">
                &ldquo;{item.prompt}&rdquo;
              </p>
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                <span className="font-mono">ID: {item.id}</span>
                <span className="font-mono">模型: {item.model}</span>
                <span className="font-mono">比例: {formatDisplayedAspectRatio(item)}</span>
                <button
                  onClick={() => copyPrompt(item.id, item.prompt)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
                  title="复制 prompt"
                >
                  {copyStatus === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : "复制 Prompt"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
