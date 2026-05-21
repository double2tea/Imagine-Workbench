import { X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import PreviewImage from "@/components/PreviewImage";
import type { StorageItem } from "@/lib/db";

interface FullscreenPreviewProps {
  item: StorageItem | null;
  onClose: () => void;
}

export default function FullscreenPreview({ item, onClose }: FullscreenPreviewProps) {
  return (
    <AnimatePresence>
      {item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4">
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-slate-400 hover:text-white rounded-lg p-2 bg-slate-900 border border-slate-800 transition"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="max-w-4xl max-h-[85vh] flex flex-col items-center justify-center gap-4">
            {item.type === "image" ? (
              <PreviewImage
                src={item.url}
                alt={item.prompt}
                className="rounded-lg max-h-[75vh] object-contain border border-slate-800"
              />
            ) : (
              <video
                src={item.url}
                controls
                loop
                autoPlay
                className="rounded-lg max-h-[75vh] border border-slate-800"
              />
            )}
            <div className="text-center w-full max-w-xl">
              <p className="text-xs text-slate-300 italic">&ldquo;{item.prompt}&rdquo;</p>
              <span className="text-[9px] font-mono text-slate-600 block mt-1.5">
                ID: {item.id} | 模型: {item.model} | Aspect Ratio: {item.aspectRatio}
              </span>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
