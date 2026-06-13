"use client";

import ImagineMark from "@/components/brand/ImagineMark";
import { APP_VERSION } from "@/lib/app-version";

interface WorkspaceTopBarBrandProps {
  compact?: boolean;
  showBadge?: boolean;
  subtitle?: string;
  version?: string;
}

export default function WorkspaceTopBarBrand({
  compact = false,
  showBadge = true,
  subtitle,
  version = APP_VERSION,
}: WorkspaceTopBarBrandProps) {
  const textClassName = compact ? "hidden min-w-0 xl:block" : "min-w-0";

  return (
    <div className={`imagine-topbar-brand z-10 flex min-w-0 items-center gap-3 ${compact ? "imagine-topbar-brand--compact" : ""}`}>
      <div className="imagine-topbar-brand-mark relative flex shrink-0 items-center justify-center">
        <ImagineMark size="md" trackPointer />
      </div>
      <div className={textClassName}>
        <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-[var(--iw-text)]">
          <span className="truncate">Imagine Workbench</span>
          {showBadge ? <span className="imagine-workspace-badge shrink-0">{version}</span> : null}
        </h1>
        {subtitle ? <p className="imagine-workspace-subtitle truncate">{subtitle}</p> : null}
      </div>
    </div>
  );
}
