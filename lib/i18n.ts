"use client";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  IMAGINE_LOCALE_CHANGE_EVENT,
  createT,
  isLocale,
  persistLocale,
  resolveLocale,
  type Locale,
  type MessageNamespace,
  type TFunction,
  type TranslationsHook,
} from "@/lib/i18n-core";

export {
  IMAGINE_LOCALE_CHANGE_EVENT,
  detectBrowserLocale,
  isLocale,
  localeBootstrapScript,
  persistLocale,
  readDocumentLocale,
  readStoredLocale,
  resolveLocale,
  t,
} from "@/lib/i18n-core";
export type { Locale, MessageNamespace, TFunction, TranslationsHook } from "@/lib/i18n-core";

function readLocaleChangeEvent(event: Event): Locale | null {
  const detail = (event as CustomEvent<Locale>).detail;
  return isLocale(detail) ? detail : null;
}

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

export function useTranslations(namespace?: MessageNamespace): TranslationsHook {
  const { locale } = useLocale();
  const scopedT: TFunction = useMemo(() => createT(locale, namespace), [locale, namespace]);

  return { t: scopedT, locale };
}
