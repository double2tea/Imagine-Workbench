"use client";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import zhCommon from "@/messages/zh/common.json";
import zhConfirm from "@/messages/zh/confirm.json";
import zhCreation from "@/messages/zh/creation.json";
import zhBoard from "@/messages/zh/board.json";
import zhAgent from "@/messages/zh/agent.json";
import zhSettings from "@/messages/zh/settings.json";
import zhMedia from "@/messages/zh/media.json";
import enCommon from "@/messages/en/common.json";
import enConfirm from "@/messages/en/confirm.json";
import enCreation from "@/messages/en/creation.json";
import enBoard from "@/messages/en/board.json";
import enAgent from "@/messages/en/agent.json";
import enSettings from "@/messages/en/settings.json";
import enMedia from "@/messages/en/media.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Locale = "zh" | "en";
export type MessageNamespace =
  | "common"
  | "confirm"
  | "creation"
  | "board"
  | "agent"
  | "settings"
  | "media";

export type TFunction = (key: string, params?: Record<string, string | number>) => string;
export type TranslationsHook = { t: TFunction; locale: Locale };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "imagine_language";
const DEFAULT_LOCALE: Locale = "zh";
export const IMAGINE_LOCALE_CHANGE_EVENT = "imagine-locale-change";

const SUPPORTED_LOCALES: ReadonlySet<string> = new Set<Locale>(["zh", "en"]);

// ---------------------------------------------------------------------------
// Message catalogs
// ---------------------------------------------------------------------------

interface MessageCatalog {
  common: Record<string, unknown>;
  confirm: Record<string, unknown>;
  creation: Record<string, unknown>;
  board: Record<string, unknown>;
  agent: Record<string, unknown>;
  settings: Record<string, unknown>;
  media: Record<string, unknown>;
}

const MESSAGES: Record<Locale, MessageCatalog> = {
  zh: {
    common: zhCommon as Record<string, unknown>,
    confirm: zhConfirm as Record<string, unknown>,
    creation: zhCreation as Record<string, unknown>,
    board: zhBoard as Record<string, unknown>,
    agent: zhAgent as Record<string, unknown>,
    settings: zhSettings as Record<string, unknown>,
    media: zhMedia as Record<string, unknown>,
  },
  en: {
    common: enCommon as Record<string, unknown>,
    confirm: enConfirm as Record<string, unknown>,
    creation: enCreation as Record<string, unknown>,
    board: enBoard as Record<string, unknown>,
    agent: enAgent as Record<string, unknown>,
    settings: enSettings as Record<string, unknown>,
    media: enMedia as Record<string, unknown>,
  },
};

// ---------------------------------------------------------------------------
// Pure functions — no React dependency
// ---------------------------------------------------------------------------

export function isLocale(value: string): value is Locale {
  return value === "zh" || value === "en";
}

export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored !== null && isLocale(stored) ? stored : null;
}

export function readDocumentLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const attr = document.documentElement.lang;
  return isLocale(attr) ? attr : null;
}

/** Detect preferred locale from browser language settings. */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = navigator.language || "";
  return lang.startsWith("en") ? "en" : "zh";
}

/** Resolve locale: stored > document > navigator > default. */
export function resolveLocale(): Locale {
  return readStoredLocale() ?? readDocumentLocale() ?? detectBrowserLocale() ?? DEFAULT_LOCALE;
}

/** Persist locale to localStorage, update <html lang>, dispatch CustomEvent. */
export function persistLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch { /* storage unavailable */ }
  document.documentElement.lang = locale;
  window.dispatchEvent(new CustomEvent<Locale>(IMAGINE_LOCALE_CHANGE_EVENT, { detail: locale }));
}

function readLocaleChangeEvent(event: Event): Locale | null {
  const detail = (event as CustomEvent<Locale>).detail;
  return isLocale(detail) ? detail : null;
}

// ---------------------------------------------------------------------------
// Translation engine
// ---------------------------------------------------------------------------

/** Resolve a dotted key path against a nested object. */
function resolveKey(root: Record<string, unknown>, key: string): string | undefined {
  let current: unknown = root;
  const segments = key.split(".");
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (typeof current !== "object" || current === null) return undefined;
    const maybeNested = (current as Record<string, unknown>)[segment];
    if (maybeNested === undefined) {
      if (typeof current === "object" && current !== null) {
        const flatKey = segments.slice(i).join(".");
        const flatValue = (current as Record<string, unknown>)[flatKey];
        if (typeof flatValue === "string") return flatValue;
      }
      return undefined;
    }
    current = maybeNested;
  }
  return typeof current === "string" ? current : undefined;
}

/** Replace {paramName} placeholders with values from params. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

/** Look up a translation. Falls back to zh, then returns the key itself. */
function lookupTranslation(locale: Locale, namespace: MessageNamespace, key: string): string | undefined {
  const nsMessages = MESSAGES[locale]?.[namespace];
  if (nsMessages) {
    const value = resolveKey(nsMessages, key);
    if (value !== undefined) return value;
  }
  // Fallback to zh if locale is not zh
  if (locale !== "zh") {
    const zhMessages = MESSAGES.zh[namespace];
    if (zhMessages) {
      const value = resolveKey(zhMessages, key);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

/** Non-React translation function. Use in lib/ modules and hooks. */
export function t(key: string, params?: Record<string, string | number>): string {
  const locale = resolveLocale();
  // If key contains a namespace prefix (e.g. "common.buttons.confirm"), split it
  const dotIndex = key.indexOf(".");
  if (dotIndex === -1) {
    // No namespace — try common first
    const value = lookupTranslation(locale, "common", key);
    return interpolate(value ?? key, params);
  }
  const nsCandidate = key.slice(0, dotIndex);
  const restKey = key.slice(dotIndex + 1);
  if (SUPPORTED_LOCALES.has(nsCandidate)) {
    // Not a namespace — treat whole key as common lookup
    const value = lookupTranslation(locale, "common", key);
    return interpolate(value ?? key, params);
  }
  // Try as namespace.key
  const ns = nsCandidate as MessageNamespace;
  if (ns in MESSAGES.zh) {
    const value = lookupTranslation(locale, ns, restKey);
    return interpolate(value ?? key, params);
  }
  // Fallback: treat as common key
  const value = lookupTranslation(locale, "common", key);
  return interpolate(value ?? key, params);
}

/** Scoped translation: prefixes namespace automatically. */
function createScopedT(locale: Locale, namespace: MessageNamespace): TFunction {
  return (key: string, params?: Record<string, string | number>): string => {
    const value = lookupTranslation(locale, namespace, key);
    return interpolate(value ?? `${namespace}.${key}`, params);
  };
}

/** Bootstrap script for layout.tsx <head>. Reads localStorage and sets <html lang> before React hydrates. */
export const localeBootstrapScript = `(function(){try{var l=localStorage.getItem("${STORAGE_KEY}");if(l==="en"||l==="zh"){document.documentElement.lang=l;}else{var n=(navigator.language||"zh").slice(0,2);document.documentElement.lang=n==="en"?"en":"zh";}}catch(e){}})();`;

// ---------------------------------------------------------------------------
// React Hooks
// ---------------------------------------------------------------------------

/** Read/set locale. Mirrors useThemeMode pattern exactly. */
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useLayoutEffect(() => {
    setLocaleState(current => {
      const next = resolveLocale();
      return current === next ? current : next;
    });

    const onLocaleChange = (event: Event): void => {
      const next = readLocaleChangeEvent(event) ?? resolveLocale();
      setLocaleState(current => (current === next ? current : next));
    };

    window.addEventListener(IMAGINE_LOCALE_CHANGE_EVENT, onLocaleChange);
    return () => window.removeEventListener(IMAGINE_LOCALE_CHANGE_EVENT, onLocaleChange);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
  }, []);

  return { locale, setLocale };
}

/** Primary hook for components. Returns reactive translation function. */
export function useTranslations(namespace?: MessageNamespace): TranslationsHook {
  const { locale } = useLocale();

  const scopedT: TFunction = useMemo(
    () => (namespace ? createScopedT(locale, namespace) : (key, params) => {
      // Without namespace, expect fully-qualified "ns.key.path"
      const dotIndex = key.indexOf(".");
      if (dotIndex === -1) {
        const value = lookupTranslation(locale, "common", key);
        return interpolate(value ?? key, params);
      }
      const nsCandidate = key.slice(0, dotIndex);
      const restKey = key.slice(dotIndex + 1);
      const ns = (SUPPORTED_LOCALES.has(nsCandidate) ? "common" : nsCandidate) as MessageNamespace;
      const actualKey = SUPPORTED_LOCALES.has(nsCandidate) ? key : restKey;
      const value = lookupTranslation(locale, ns in MESSAGES.zh ? ns : "common", actualKey);
      return interpolate(value ?? key, params);
    }),
    [locale, namespace],
  );

  return { t: scopedT, locale };
}
