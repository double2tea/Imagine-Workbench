import zhAgent from "@/messages/zh/agent.json";
import zhBoard from "@/messages/zh/board.json";
import zhCommon from "@/messages/zh/common.json";
import zhConfirm from "@/messages/zh/confirm.json";
import zhCreation from "@/messages/zh/creation.json";
import zhMedia from "@/messages/zh/media.json";
import zhSettings from "@/messages/zh/settings.json";
import enAgent from "@/messages/en/agent.json";
import enBoard from "@/messages/en/board.json";
import enCommon from "@/messages/en/common.json";
import enConfirm from "@/messages/en/confirm.json";
import enCreation from "@/messages/en/creation.json";
import enMedia from "@/messages/en/media.json";
import enSettings from "@/messages/en/settings.json";

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

export const STORAGE_KEY = "imagine_language";
export const DEFAULT_LOCALE: Locale = "zh";
export const IMAGINE_LOCALE_CHANGE_EVENT = "imagine-locale-change";

const SUPPORTED_LOCALES: ReadonlySet<string> = new Set<Locale>(["zh", "en"]);

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
    agent: zhAgent as Record<string, unknown>,
    board: zhBoard as Record<string, unknown>,
    common: zhCommon as Record<string, unknown>,
    confirm: zhConfirm as Record<string, unknown>,
    creation: zhCreation as Record<string, unknown>,
    media: zhMedia as Record<string, unknown>,
    settings: zhSettings as Record<string, unknown>,
  },
  en: {
    agent: enAgent as Record<string, unknown>,
    board: enBoard as Record<string, unknown>,
    common: enCommon as Record<string, unknown>,
    confirm: enConfirm as Record<string, unknown>,
    creation: enCreation as Record<string, unknown>,
    media: enMedia as Record<string, unknown>,
    settings: enSettings as Record<string, unknown>,
  },
};

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

export function detectBrowserLocale(): Locale {
  if (typeof window === "undefined" || typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = navigator.language || "";
  return lang.startsWith("en") ? "en" : "zh";
}

export function resolveLocale(): Locale {
  return readStoredLocale() ?? readDocumentLocale() ?? detectBrowserLocale() ?? DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch { /* storage unavailable */ }
  document.documentElement.lang = locale;
  window.dispatchEvent(new CustomEvent<Locale>(IMAGINE_LOCALE_CHANGE_EVENT, { detail: locale }));
}

function resolveKey(root: Record<string, unknown>, key: string): string | undefined {
  let current: unknown = root;
  const segments = key.split(".");
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (typeof current !== "object" || current === null) return undefined;
    const maybeNested = (current as Record<string, unknown>)[segment];
    if (maybeNested === undefined) {
      const flatKey = segments.slice(i).join(".");
      const flatValue = (current as Record<string, unknown>)[flatKey];
      return typeof flatValue === "string" ? flatValue : undefined;
    }
    current = maybeNested;
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in params ? String(params[name]) : `{${name}}`,
  );
}

function lookupTranslation(locale: Locale, namespace: MessageNamespace, key: string): string | undefined {
  const nsMessages = MESSAGES[locale]?.[namespace];
  const value = nsMessages ? resolveKey(nsMessages, key) : undefined;
  if (value !== undefined) return value;
  return locale === "zh" ? undefined : resolveKey(MESSAGES.zh[namespace], key);
}

function translateQualified(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const dotIndex = key.indexOf(".");
  if (dotIndex === -1) {
    const value = lookupTranslation(locale, "common", key);
    return interpolate(value ?? key, params);
  }

  const nsCandidate = key.slice(0, dotIndex);
  const restKey = key.slice(dotIndex + 1);
  if (SUPPORTED_LOCALES.has(nsCandidate)) {
    const value = lookupTranslation(locale, "common", key);
    return interpolate(value ?? key, params);
  }

  const namespace = nsCandidate as MessageNamespace;
  if (namespace in MESSAGES.zh) {
    const value = lookupTranslation(locale, namespace, restKey);
    return interpolate(value ?? key, params);
  }

  const value = lookupTranslation(locale, "common", key);
  return interpolate(value ?? key, params);
}

export function t(key: string, params?: Record<string, string | number>): string {
  return translateQualified(resolveLocale(), key, params);
}

export function createT(locale: Locale, namespace?: MessageNamespace): TFunction {
  if (!namespace) {
    return (key, params) => translateQualified(locale, key, params);
  }
  return (key, params) => {
    const value = lookupTranslation(locale, namespace, key);
    return interpolate(value ?? `${namespace}.${key}`, params);
  };
}

export const localeBootstrapScript = `(function(){try{var l=localStorage.getItem("${STORAGE_KEY}");if(l==="en"||l==="zh"){document.documentElement.lang=l;}else{var n=(navigator.language||"zh").slice(0,2);document.documentElement.lang=n==="en"?"en":"zh";}}catch(e){}})();`;
