"use client";

import { useLayoutEffect } from "react";
import { applyThemeClassesToDom, IMAGINE_THEME_CHANGE_EVENT, resolveThemeMode, type ThemeMode } from "@/lib/theme-mode";

/** Applies shell/agent theme classes before paint and when theme or shells change. */
export default function ThemeDomSync() {
  useLayoutEffect(() => {
    const apply = (): void => {
      applyThemeClassesToDom(resolveThemeMode());
    };
    apply();
    const onThemeChange = (event: Event): void => {
      const detail = (event as CustomEvent<ThemeMode>).detail;
      if (detail === "light" || detail === "dark") {
        applyThemeClassesToDom(detail);
        return;
      }
      apply();
    };
    window.addEventListener(IMAGINE_THEME_CHANGE_EVENT, onThemeChange);
    return () => window.removeEventListener(IMAGINE_THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  return null;
}