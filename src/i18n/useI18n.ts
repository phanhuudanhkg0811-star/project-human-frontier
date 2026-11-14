import { useUiStore } from '../store/uiStore.ts';
import { dictionaries } from './dictionaries.ts';
import type { Locale, TranslationVars } from './types.ts';

export function translate(locale: Locale, key: string, vars?: TranslationVars): string {
  const dict = dictionaries[locale];
  const fallbackDict = dictionaries.vi;
  const template = dict[key] ?? fallbackDict[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, token: string) => {
    const replacement = vars[token];
    return replacement === undefined ? match : String(replacement);
  });
}

export function pickText(vi: string, en: string | undefined, locale: Locale): string {
  if (locale === 'en' && typeof en === 'string' && en.trim().length > 0) {
    return en;
  }
  return vi;
}

export function useI18n() {
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);

  return {
    locale,
    setLocale,
    t: (key: string, vars?: TranslationVars) => translate(locale, key, vars),
    pickText: (vi: string, en?: string) => pickText(vi, en, locale),
  };
}
