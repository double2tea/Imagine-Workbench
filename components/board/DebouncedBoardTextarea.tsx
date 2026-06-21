"use client";

import { useEffect } from "react";
import { useDebouncedTextCommit } from "@/hooks/useDebouncedTextCommit";
import { registerBoardTextCommit, unregisterBoardTextCommit } from "@/lib/board/text-flush-registry";

interface DebouncedBoardTextareaProps {
  className: string;
  commitId: string;
  name?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

export default function DebouncedBoardTextarea({ className, commitId, name, onChange, placeholder, value }: DebouncedBoardTextareaProps) {
  const { flush, getValue, setValue, value: draftValue } = useDebouncedTextCommit(value, onChange);

  useEffect(() => {
    registerBoardTextCommit(commitId, { flush, getValue });
    return () => unregisterBoardTextCommit(commitId);
  }, [commitId, flush, getValue]);

  return (
    <textarea
      name={name}
      value={draftValue}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => flush()}
      className={className}
      placeholder={placeholder}
    />
  );
}
