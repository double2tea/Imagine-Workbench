"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { WORKBENCH_DIALOG_TRANSITION, WORKBENCH_OVERLAY_TRANSITION } from "@/lib/workbench-motion";
import { useTranslations } from "@/lib/i18n";

export type ConfirmTone = "default" | "danger";
export type ConfirmKind = "confirm" | "alert";

export interface ConfirmRequest {
  kind?: ConfirmKind;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface ConfirmContextValue {
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  alert: (request: Omit<ConfirmRequest, "kind" | "cancelLabel"> & { dismissLabel?: string }) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslations("confirm");
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const close = useCallback((value: boolean) => {
    const nextFocusTarget = triggerRef.current;
    resolveRef.current?.(value);
    resolveRef.current = null;
    triggerRef.current = null;
    setRequest(null);
    if (nextFocusTarget?.isConnected) {
      window.setTimeout(() => {
        if (nextFocusTarget.isConnected) nextFocusTarget.focus();
      }, 0);
    }
  }, []);

  const confirm = useCallback((next: ConfirmRequest) => {
    return new Promise<boolean>(resolve => {
      if (resolveRef.current) {
        resolveRef.current(false);
      }
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      resolveRef.current = resolve;
      setRequest({ kind: "confirm", ...next });
    });
  }, []);

  const alert = useCallback(
    (next: Omit<ConfirmRequest, "kind" | "cancelLabel"> & { dismissLabel?: string }) =>
      confirm({
        kind: "alert",
        title: next.title,
        message: next.message,
        tone: next.tone,
        confirmLabel: next.dismissLabel ?? next.confirmLabel ?? t('defaults.dismissAlert'),
      }).then(() => undefined),
    [confirm],
  );

  const kind = request?.kind ?? "confirm";
  const isAlert = kind === "alert";
  const tone = request?.tone ?? "default";
  const title = request?.title ?? (isAlert ? t('titles.alert') : tone === "danger" ? t('titles.dangerConfirm') : t('titles.defaultConfirm'));
  const confirmLabel = request?.confirmLabel ?? (isAlert ? t('defaults.dismissAlert') : t('defaults.confirm'));
  const cancelLabel = request?.cancelLabel ?? t('defaults.cancel');

  useEffect(() => {
    if (!request) return;

    const panel = panelRef.current;
    const getFocusableElements = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          )
        : [];
    const focusTimer = window.setTimeout(() => {
      getFocusableElements()[0]?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent): void => {
      const focusable = getFocusableElements();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.key === "Escape") {
        event.preventDefault();
        close(isAlert);
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        return;
      }
      if (document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, isAlert, request]);

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      <AnimatePresence>
        {request ? (
          <motion.div
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={WORKBENCH_OVERLAY_TRANSITION}
            className="imagine-confirm-overlay fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => close(isAlert)}
          >
            <motion.div
              ref={panelRef}
              role={isAlert ? "alertdialog" : "dialog"}
              aria-modal="true"
              aria-labelledby="imagine-confirm-title"
              aria-describedby="imagine-confirm-message"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={WORKBENCH_DIALOG_TRANSITION}
              className="imagine-confirm-dialog w-full max-w-md rounded-xl border p-4"
              onClick={event => event.stopPropagation()}
            >
              <h2 id="imagine-confirm-title" className="text-sm font-semibold text-[var(--iw-text)]">
                {title}
              </h2>
              <p id="imagine-confirm-message" className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--iw-muted)]">
                {request.message}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                {!isAlert && (
                  <button
                    type="button"
                    autoFocus
                    className="imagine-secondary-action h-9 rounded-lg border border-[var(--iw-border)] px-3 text-[11px] font-semibold text-[var(--iw-text)]"
                    onClick={() => close(false)}
                  >
                    {cancelLabel}
                  </button>
                )}
                <button
                  type="button"
                  className={`h-9 rounded-lg px-3 text-[11px] font-semibold transition ${
                    tone === "danger" && !isAlert
                      ? "imagine-danger-action border border-red-500/30"
                      : "imagine-primary-action"
                  }`}
                  onClick={() => close(true)}
                >
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue["confirm"] {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return context.confirm;
}

export function useAlert(): ConfirmContextValue["alert"] {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useAlert must be used within ConfirmProvider");
  }
  return context.alert;
}
