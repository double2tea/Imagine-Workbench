"use client";

import { useEffect } from "react";

export default function NextDevStylesheetErrorGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const handleError = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLLinkElement)) return;
      const href = target.href;
      if (!href.includes("/_next/static/css/")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    window.addEventListener("error", handleError, true);
    return () => window.removeEventListener("error", handleError, true);
  }, []);

  return null;
}
