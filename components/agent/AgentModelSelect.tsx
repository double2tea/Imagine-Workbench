"use client";

import { useMemo } from "react";
import type { AiProvider, ModelOption } from "@/lib/providers/model-catalog";

interface AgentModelGroup {
  provider: AiProvider;
  label: string;
  options: ModelOption[];
}

interface AgentModelSelectProps {
  disabled?: boolean;
  disabledHint?: string;
  groups: AgentModelGroup[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}

export function AgentModelSelect({
  disabled = false,
  disabledHint,
  groups,
  value,
  onChange,
  className = "",
  id = "agent-model-select",
}: AgentModelSelectProps) {
  const flatOptions = useMemo(
    () => groups.flatMap(group => group.options),
    [groups],
  );
  const knownValues = useMemo(
    () => new Set(flatOptions.map(option => option.value)),
    [flatOptions],
  );
  const hasKnownValue = knownValues.has(value);
  const missingCurrent = Boolean(value) && !hasKnownValue;

  if (groups.length === 0 && !missingCurrent && !value) return null;

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      className={`imagine-agent-model-select ${disabled ? "imagine-agent-model-select--disabled" : ""} ${className}`.trim()}
      aria-label="Agent 对话模型"
      title={disabled ? disabledHint : undefined}
    >
      {missingCurrent ? (
        <option value={value}>{value}（未在列表）</option>
      ) : null}
      {groups.map(group => (
        <optgroup key={group.provider} label={group.label}>
          {group.options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}