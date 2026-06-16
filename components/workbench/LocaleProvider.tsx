"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLocale, type Locale, type TFunction, useTranslations, type TranslationsHook } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Locale Context — provides reactive locale + setter to all children
// ---------------------------------------------------------------------------

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "zh",
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLocale();

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

/** Access locale state from context. */
export function useLocaleContext(): LocaleContextValue {
  return useContext(LocaleContext);
}

// Re-export hooks from lib/i18n for convenience
export { useTranslations, type TFunction, type TranslationsHook, type Locale };
