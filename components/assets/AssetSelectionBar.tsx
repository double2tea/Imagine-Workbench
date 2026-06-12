import { FileArchive, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

interface AssetSelectionBarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onDownloadZip: () => void;
}

export default function AssetSelectionBar({
  selectedCount,
  onClear,
  onDelete,
  onDownloadZip,
}: AssetSelectionBarProps) {
  return (
    <AnimatePresence initial={false}>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          className="imagine-selection-bar p-3 backdrop-blur-md"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-bold text-slate-100">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                已选中 {selectedCount} 项创意作品
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">可批量打包为 ZIP，或移除所选资产。</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onDownloadZip}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500"
              >
                <FileArchive className="h-3.5 w-3.5" />
                打包 ZIP
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="imagine-danger-action rounded-lg px-3 py-2 text-xs font-bold transition"
              >
                批量删除
              </button>
              <button
                type="button"
                onClick={onClear}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
                title="清空勾选"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
