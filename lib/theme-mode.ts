"use client";

import { useCallback, useLayoutEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "imagine_theme_mode";
const DEFAULT_THEME: ThemeMode = "dark";
export const IMAGINE_THEME_CHANGE_EVENT = "imagine-theme-change";

const THEME_SURFACE_SELECTOR =
  ".imagine-workbench-shell, .imagine-agent-dock, .imagine-agent-dock-panel, .imagine-agent-dock-idle-orb";

export function readStoredThemeMode(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

export function readDocumentThemeMode(): ThemeMode | null {
  if (typeof document === "undefined") return null;
  const attr = document.documentElement.getAttribute("data-imagine-theme");
  return attr === "light" || attr === "dark" ? attr : null;
}

export function resolveThemeMode(): ThemeMode {
  return readStoredThemeMode() ?? readDocumentThemeMode() ?? DEFAULT_THEME;
}

export function applyThemeClassesToDom(mode: ThemeMode): void {
  if (typeof document === "undefined") return;
  const isLight = mode === "light";
  document.querySelectorAll(THEME_SURFACE_SELECTOR).forEach(element => {
    element.classList.toggle("imagine-theme-light", isLight);
    element.classList.toggle("imagine-theme-dark", !isLight);
  });
}

export function persistThemeMode(mode: ThemeMode): void {
  window.localStorage.setItem(STORAGE_KEY, mode);
  const root = window.document.documentElement;
  root.setAttribute("data-imagine-theme", mode);
  root.style.colorScheme = mode;
  applyThemeClassesToDom(mode);
  window.dispatchEvent(new CustomEvent<ThemeMode>(IMAGINE_THEME_CHANGE_EVENT, { detail: mode }));
}

export function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark";
}

function readThemeChangeEvent(event: Event): ThemeMode | null {
  const detail = (event as CustomEvent<ThemeMode>).detail;
  return detail === "light" || detail === "dark" ? detail : null;
}

export function useThemeMode(): { themeMode: ThemeMode; toggleThemeMode: () => void } {
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME);

  useLayoutEffect(() => {
    setThemeMode(current => {
      const next = resolveThemeMode();
      return current === next ? current : next;
    });

    const onThemeChange = (event: Event): void => {
      const next = readThemeChangeEvent(event) ?? resolveThemeMode();
      setThemeMode(current => (current === next ? current : next));
    };

    window.addEventListener(IMAGINE_THEME_CHANGE_EVENT, onThemeChange);
    return () => window.removeEventListener(IMAGINE_THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  const toggleThemeMode = useCallback(() => {
    const next: ThemeMode = resolveThemeMode() === "light" ? "dark" : "light";
    persistThemeMode(next);
  }, []);

  return { themeMode, toggleThemeMode };
}

/** For React Flow colorMode and other surfaces that need React state on theme change. */
export function useThemeModeSnapshot(): ThemeMode {
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME);

  useLayoutEffect(() => {
    setThemeMode(current => {
      const next = resolveThemeMode();
      return current === next ? current : next;
    });

    const onThemeChange = (event: Event): void => {
      const next = readThemeChangeEvent(event) ?? resolveThemeMode();
      setThemeMode(current => (current === next ? current : next));
    };

    window.addEventListener(IMAGINE_THEME_CHANGE_EVENT, onThemeChange);
    return () => window.removeEventListener(IMAGINE_THEME_CHANGE_EVENT, onThemeChange);
  }, []);

  return themeMode;
}