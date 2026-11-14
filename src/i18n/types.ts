export type Locale = 'vi' | 'en';

export type TranslationVars = Readonly<Record<string, string | number>>;

export type TranslationDictionary = Readonly<Record<string, string>>;

export interface I18nDictionaries {
  readonly vi: TranslationDictionary;
  readonly en: TranslationDictionary;
}
