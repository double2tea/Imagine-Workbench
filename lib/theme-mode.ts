"use client";

import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "imagine_theme_mode";
const DEFAULT_THEME: ThemeMode = "dark";

const themeListeners = new Set<() => void>();

function emitThemeChange(): void {
  themeListeners.forEach(listener => listener());
}

function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

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

export function persistThemeMode(mode: ThemeMode): void {
  window.localStorage.setItem(STORAGE_KEY, mode);
  const root = window.document.documentElement;
  root.setAttribute("data-imagine-theme", mode);
  root.style.colorScheme = mode;
  emitThemeChange();
}

export function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark";
}

function getThemeSnapshot(): ThemeMode {
  return resolveThemeMode();
}

function getServerThemeSnapshot(): ThemeMode {
  return DEFAULT_THEME;
}

/** Keeps React shell class, html[data-imagine-theme], and localStorage in sync. */
export function useThemeMode(): { themeMode: ThemeMode; toggleThemeMode: () => void } {
  const themeMode = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);

  useLayoutEffect(() => {
    persistThemeMode(resolveThemeMode());
  }, []);

  const toggleThemeMode = useCallback(() => {
    const next: ThemeMode = themeMode === "light" ? "dark" : "light";
    persistThemeMode(next);
  }, [themeMode]);

  return { themeMode, toggleThemeMode };
}