"use client";

import { useLayoutEffect } from "react";
import { resolveLocale } from "@/lib/i18n";

/** Applies the correct lang attribute to <html> before first paint. */
export default function LocaleDomSync() {
  useLayoutEffect(() => {
    document.documentElement.lang = resolveLocale();
  }, []);

  return null;
}
