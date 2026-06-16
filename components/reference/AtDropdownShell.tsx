import type { ReactNode, WheelEvent } from "react";

interface AtDropdownShellProps {
  children: ReactNode;
  header?: ReactNode;
  empty?: boolean;
}

export function AtDropdownHeader({ count, title }: { count?: number; title: string }) {
  return (
    <p className="imagine-at-dropdown-header">
      <span>{title}</span>
      {count !== undefined ? (
        <span className="imagine-at-dropdown-header-meta">{count}</span>
      ) : null}
    </p>
  );
}

function stopWheelPropagation(event: WheelEvent<HTMLDivElement>): void {
  event.stopPropagation();
}

export default function AtDropdownShell({ children, header, empty = false }: AtDropdownShellProps) {
  const rootClass = `imagine-at-dropdown nowheel nodrag${empty ? " imagine-at-dropdown-empty" : ""}`;

  if (empty) {
    return <div className={rootClass}>{children}</div>;
  }

  return (
    <div className={rootClass}>
      {header}
      <div className="imagine-at-dropdown-scroll" onWheel={stopWheelPropagation}>
        {children}
      </div>
    </div>
  );
}
