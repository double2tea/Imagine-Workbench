import { useEffect, useRef } from "react";
import { Info, X } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
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

const AUTO_DISMISS_MS = 8000;

export default function WorkspaceNotices({ notices, onDismiss }: WorkspaceNoticesProps) {
  const { t } = useTranslations("common");
  const pausedRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const activeIds = new Set(notices.map(notice => notice.id));

    for (const notice of notices) {
      if (timeoutRef.current.has(notice.id)) continue;
      if (pausedRef.current.has(notice.id)) continue;
      const timer = setTimeout(() => {
        onDismiss(notice.id);
        timeoutRef.current.delete(notice.id);
      }, AUTO_DISMISS_MS);
      timeoutRef.current.set(notice.id, timer);
    }

    for (const [id, timer] of timeoutRef.current) {
      if (activeIds.has(id)) continue;
      clearTimeout(timer);
      timeoutRef.current.delete(id);
    }
    for (const id of pausedRef.current) {
      if (activeIds.has(id)) continue;
      pausedRef.current.delete(id);
    }
  }, [notices, onDismiss]);

  useEffect(() => {
    const timeouts = timeoutRef.current;
    return () => {
      for (const timer of timeouts.values()) {
        clearTimeout(timer);
      }
      timeouts.clear();
    };
  }, []);

  const pauseDismiss = (id: string): void => {
    pausedRef.current.add(id);
    const timer = timeoutRef.current.get(id);
    if (!timer) return;
    clearTimeout(timer);
    timeoutRef.current.delete(id);
  };

  const resumeDismiss = (id: string): void => {
    pausedRef.current.delete(id);
    if (timeoutRef.current.has(id)) return;
    const timer = setTimeout(() => {
      onDismiss(id);
      timeoutRef.current.delete(id);
    }, AUTO_DISMISS_MS);
    timeoutRef.current.set(id, timer);
  };

  const dismissNow = (id: string): void => {
    pausedRef.current.delete(id);
    const timer = timeoutRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeoutRef.current.delete(id);
    }
    onDismiss(id);
  };

  return (
    <div className="fixed top-[72px] right-4 z-[70] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      <AnimatePresence>
        {notices.map(notice => (
          <motion.div
            key={notice.id}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            onMouseEnter={() => pauseDismiss(notice.id)}
            onMouseLeave={() => resumeDismiss(notice.id)}
            className="imagine-tone-surface flex items-start gap-3 rounded-lg border px-3 py-2.5 shadow-2xl backdrop-blur-xl"
            data-tone={notice.type === "error" ? "danger" : notice.type}
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
            <p className="min-w-0 flex-1 text-xs leading-5">{notice.message}</p>
            <button
              type="button"
              onClick={() => dismissNow(notice.id)}
              className="rounded-md p-1 text-current/60 transition hover:bg-white/10 hover:text-current"
              title={t("notices.dismissNotice")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
