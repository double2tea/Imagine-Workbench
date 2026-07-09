"use client";

import { useState, type KeyboardEvent } from "react";

interface TruncatableErrorTextProps {
  className?: string;
  "data-tone"?: string;
  detail?: string;
  message: string;
}

export default function TruncatableErrorText({
  className,
  "data-tone": dataTone,
  detail,
  message,
}: TruncatableErrorTextProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = (): void => setExpanded(current => !current);
  const onKeyDown = (event: KeyboardEvent<HTMLParagraphElement>): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <p
      className={className}
      data-expanded={expanded ? "true" : "false"}
      data-tone={dataTone}
      title={expanded ? undefined : detail ?? message}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      {message}
    </p>
  );
}