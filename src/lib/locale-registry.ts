/** Pure locale identifiers shared by the site runtime and translation tools. */
export const defaultLocale = 'es';

export const translationLocales = ['en', 'fr', 'ja', 'zh-TW'] as const;

export const locales = [defaultLocale, ...translationLocales] as const;

export type Locale = (typeof locales)[number];
export type TranslationLocale = (typeof translationLocales)[number];

/** Names used by the translation prompt, kept separate from UI locale metadata. */
export const translationLanguageNames: Record<TranslationLocale, string> = {
  en: 'English',
  fr: 'French',
  ja: 'Japanese',
  'zh-TW': 'Traditional Chinese (Taiwan)',
};
