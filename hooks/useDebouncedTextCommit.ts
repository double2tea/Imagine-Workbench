"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const DEFAULT_DELAY_MS = 400;

export function useDebouncedTextCommit(
  committedValue: string,
  onCommit: (value: string) => void,
  delayMs: number = DEFAULT_DELAY_MS,
): {
  flush: () => void;
  setValue: (value: string) => void;
  value: string;
} {
  const [draft, setDraft] = useState(committedValue);
  const timerRef = useRef<number | null>(null);
  const committedRef = useRef(committedValue);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useLayoutEffect(() => {
    committedRef.current = committedValue;
    if (timerRef.current === null) {
      setDraft(committedValue);
    }
  }, [committedValue]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (draft !== committedRef.current) {
      committedRef.current = draft;
      onCommitRef.current(draft);
    }
  }, [draft]);

  const setValue = useCallback((next: string) => {
    setDraft(next);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (next !== committedRef.current) {
        committedRef.current = next;
        onCommitRef.current(next);
      }
    }, delayMs);
  }, [delayMs]);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  return { flush, setValue, value: draft };
}