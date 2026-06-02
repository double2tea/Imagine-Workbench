"use client";

import { useDebouncedTextCommit } from "@/hooks/useDebouncedTextCommit";

interface DebouncedBoardTextareaProps {
  className: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}

export default function DebouncedBoardTextarea({ className, onChange, placeholder, value }: DebouncedBoardTextareaProps) {
  const { flush, setValue, value: draftValue } = useDebouncedTextCommit(value, onChange);

  return (
    <textarea
      value={draftValue}
      onChange={(event) => setValue(event.target.value)}
      onBlur={flush}
      className={className}
      placeholder={placeholder}
    />
  );
}