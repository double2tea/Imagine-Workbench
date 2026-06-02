export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "imagine_theme_mode";

export function readStoredThemeMode(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

export function persistThemeMode(mode: ThemeMode): void {
  window.localStorage.setItem(STORAGE_KEY, mode);
  window.document.documentElement.setAttribute("data-imagine-theme", mode);
}

export function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark";
}