"use client";

import { useLayoutEffect } from "react";
import { applyThemeClassesToDom, resolveThemeMode } from "@/lib/theme-mode";

/** Applies shell/agent theme classes once before paint; avoids root React state on toggle. */
export default function ThemeDomSync() {
  useLayoutEffect(() => {
    applyThemeClassesToDom(resolveThemeMode());
  }, []);

  return null;
}