import { Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export type WorkspaceNoticeType = "error" | "info" | "success";

export interface WorkspaceNotice {
  id: string;
  type: WorkspaceNoticeType;
  message: string;
}

interface WorkspaceNoticesProps {
  notices: WorkspaceNotice[];
  onDismiss: (id: string) => void;
}

export default function WorkspaceNotices({ notices, onDismiss }: WorkspaceNoticesProps) {
  return (
    <div className="fixed top-[72px] right-4 z-[70] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      <AnimatePresence>
        {notices.map(notice => (
          <motion.div
            key={notice.id}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 shadow-2xl backdrop-blur-xl ${
              notice.type === "error"
                ? "border-red-500/30 bg-red-950/80 text-red-100"
                : notice.type === "success"
                  ? "border-emerald-500/30 bg-emerald-950/80 text-emerald-100"
                  : "border-blue-500/30 bg-blue-950/80 text-blue-100"
            }`}
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
            <p className="min-w-0 flex-1 text-xs leading-5">{notice.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(notice.id)}
              className="rounded-md p-1 text-current/60 transition hover:bg-white/10 hover:text-current"
              title="关闭提示"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
