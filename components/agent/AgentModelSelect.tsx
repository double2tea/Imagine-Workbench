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
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}

export function AgentModelSelect({
  disabled = false,
  disabledHint,
  groups,
  hint,
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
    <div
      className={`imagine-agent-model-select-wrap pointer-events-auto min-w-0 ${hint ? "flex flex-col gap-1" : ""}`.trim()}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={event => onChange(event.target.value)}
      className={`imagine-agent-model-select pointer-events-auto ${disabled ? "imagine-agent-model-select--disabled" : ""} ${className}`.trim()}
      aria-label="Agent 对话模型"
      title={disabled ? disabledHint : hint}
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
    {hint ? (
      <span className="imagine-tone-icon text-[10px] leading-snug" data-tone="violet">{hint}</span>
    ) : null}
    </div>
  );
}
