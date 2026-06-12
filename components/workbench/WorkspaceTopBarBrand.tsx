"use client";

import ImagineMark from "@/components/brand/ImagineMark";

interface WorkspaceTopBarBrandProps {
  compact?: boolean;
  showBadge?: boolean;
  subtitle?: string;
}

export default function WorkspaceTopBarBrand({
  compact = false,
  showBadge = true,
  subtitle,
}: WorkspaceTopBarBrandProps) {
  return (
    <div className={`imagine-topbar-brand z-10 flex min-w-0 items-center gap-3 ${compact ? "imagine-topbar-brand--compact" : ""}`}>
      <div className="imagine-topbar-brand-mark relative flex shrink-0 items-center justify-center">
        <ImagineMark size="md" trackPointer />
      </div>
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-[var(--iw-text)]">
          <span className="truncate">Imagine Workbench</span>
          {showBadge ? <span className="imagine-workspace-badge shrink-0">v1.2</span> : null}
        </h1>
        {subtitle ? <p className="imagine-workspace-subtitle truncate">{subtitle}</p> : null}
      </div>
    </div>
  );
}
