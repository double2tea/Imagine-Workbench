import { Check, ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import type { ModelOption } from "@/lib/providers/model-catalog";

export interface ModelOptionGroup {
  provider: string;
  label: string;
  options: ModelOption[];
}

interface ModelSelectComboboxProps {
  accent: "blue" | "cyan" | "violet";
  ariaLabel: string;
  groups: ModelOptionGroup[];
  value: string;
  onChange: (value: string) => void;
}

const focusClassByAccent: Record<ModelSelectComboboxProps["accent"], string> = {
  blue: "focus-within:border-blue-400/45",
  cyan: "focus-within:border-cyan-400/45",
  violet: "focus-within:border-violet-400/45",
};

export default function ModelSelectCombobox({
  accent,
  ariaLabel,
  groups,
  value,
  onChange,
}: ModelSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = groups.flatMap(group => group.options).find(option => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = groups
    .map(group => ({
      ...group,
      options: normalizedQuery
        ? group.options.filter(option =>
            option.label.toLowerCase().includes(normalizedQuery) ||
            option.value.toLowerCase().includes(normalizedQuery) ||
            option.value === value
          )
        : group.options,
    }))
    .filter(group => group.options.length > 0);

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        const relatedTarget = event.relatedTarget;
        if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setOpen(prev => !prev)}
        className={`imagine-select flex h-10 w-full min-w-0 items-center justify-between gap-2 overflow-hidden py-0 text-left font-mono text-[11px] ${focusClassByAccent[accent]}`}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? value}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+0.375rem)] z-50 w-full overflow-hidden rounded-lg border border-[var(--iw-border)] bg-[var(--iw-surface-raised)] shadow-2xl">
          <label className="flex h-9 items-center gap-2 border-b border-[var(--iw-border)] px-3 text-[var(--iw-muted)]">
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder="搜索模型"
              className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--iw-text)] outline-none placeholder:text-[var(--iw-faint)]"
              autoFocus
            />
          </label>
          <div className="max-h-60 overflow-y-auto p-1" role="listbox" aria-label={ariaLabel}>
            {filteredGroups.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-[var(--iw-muted)]">没有匹配模型</div>
            ) : (
              filteredGroups.map(group => (
                <div key={group.provider} className="py-1">
                  <div className="px-2 pb-1 pt-1 text-[10px] font-semibold text-[var(--iw-faint)]">{group.label}</div>
                  {group.options.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={option.value === value}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-[var(--iw-text)] transition-colors hover:bg-[var(--iw-panel-soft)]"
                    >
                      <span className="min-w-0 truncate font-mono">{option.label}</span>
                      {option.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--iw-accent)]" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
