"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const DEFAULT_DELAY_MS = 400;

export function useDebouncedTextCommit(
  committedValue: string,
  onCommit: (value: string) => void,
  delayMs: number = DEFAULT_DELAY_MS,
): {
  flush: (value?: string) => void;
  getValue: () => string;
  setValue: (value: string) => void;
  value: string;
} {
  const [draft, setDraft] = useState(committedValue);
  const timerRef = useRef<number | null>(null);
  const committedRef = useRef(committedValue);
  const draftRef = useRef(committedValue);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useLayoutEffect(() => {
    committedRef.current = committedValue;
    if (timerRef.current === null) {
      setDraft(committedValue);
    }
  }, [committedValue]);

  const flush = useCallback((value?: string) => {
    const pending = value ?? draftRef.current;
    if (value !== undefined) {
      draftRef.current = value;
      setDraft(value);
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pending !== committedRef.current) {
      committedRef.current = pending;
      onCommitRef.current(pending);
    }
  }, []);

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

  const getValue = useCallback(() => draft, [draft]);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = draftRef.current;
    if (pending !== committedRef.current) {
      committedRef.current = pending;
      onCommitRef.current(pending);
    }
  }, []);

  return { flush, getValue, setValue, value: draft };
}
