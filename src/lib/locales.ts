/**
 * Locale registry and URL routing.
 *
 * Routing rules:
 *  - Spanish (`es`) is the default locale and lives at the site root, so the
 *    URLs that Google already indexed for years keep working untouched.
 *  - Every other locale is prefixed: `/en/…`, `/fr/…`, `/ja/…`, `/zh-TW/…`.
 *
 * Astro's built-in i18n routing is deliberately NOT used: it requires the
 * default locale's route files to sit at the root of `src/pages/` and every
 * other locale to duplicate them in a folder. This site is content-driven, so
 * a single dispatcher route (`src/pages/[...path].astro`) is used instead and
 * the locale is parsed out of the path here.
 */

import { defaultLocale, locales, type Locale } from './locale-registry.ts';

export { defaultLocale, locales } from './locale-registry.ts';
export type { Locale } from './locale-registry.ts';

export interface LocaleInfo {
  /** Name of the language in that language (shown in the switcher). */
  label: string;
  /** Name of the language in English (used for the `lang` attribute fallback). */
  labelEn: string;
  /** Value for the `lang` attribute. */
  htmlLang: string;
  /** Value for `og:locale`. */
  ogLocale: string;
  /** Value for `hreflang`. */
  hreflang: string;
}

export const localeInfo: Record<Locale, LocaleInfo> = {
  es: {
    label: 'Español',
    labelEn: 'Spanish',
    htmlLang: 'es',
    ogLocale: 'es_ES',
    hreflang: 'es',
  },
  en: {
    label: 'English',
    labelEn: 'English',
    htmlLang: 'en',
    ogLocale: 'en_US',
    hreflang: 'en',
  },
  fr: {
    label: 'Français',
    labelEn: 'French',
    htmlLang: 'fr',
    ogLocale: 'fr_FR',
    hreflang: 'fr',
  },
  ja: {
    label: '日本語',
    labelEn: 'Japanese',
    htmlLang: 'ja',
    ogLocale: 'ja_JP',
    hreflang: 'ja',
  },
  'zh-TW': {
    label: '繁體中文',
    labelEn: 'Traditional Chinese',
    htmlLang: 'zh-Hant',
    ogLocale: 'zh_TW',
    hreflang: 'zh-Hant',
  },
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** The parsed shape of an incoming request path. */
export interface RouteParts {
  locale: Locale;
  /** Path segments after the locale prefix, e.g. `['actualidades', 'hola']`. */
  segments: string[];
}

/**
 * Split a pathname into a locale and the remaining segments.
 *
 * `/`                  → { locale: 'es', segments: [] }
 * `/nosotros/`         → { locale: 'es', segments: ['nosotros'] }
 * `/en/nosotros/`      → { locale: 'en', segments: ['nosotros'] }
 * `/zh-TW/actualidades/` → { locale: 'zh-TW', segments: ['actualidades'] }
 */
export function parseRoute(pathname: string): RouteParts {
  const clean = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = clean === '' ? [] : clean.split('/');

  const first = parts[0];
  if (first !== undefined && isLocale(first)) {
    return { locale: first, segments: parts.slice(1) };
  }

  return { locale: defaultLocale, segments: parts };
}

/**
 * Build a public, trailing-slash URL for a locale + slug.
 *
 * `localePath('es', '')`            → `/`
 * `localePath('es', 'nosotros')`    → `/nosotros/`
 * `localePath('en', 'nosotros')`    → `/en/nosotros/`
 */
export function localePath(locale: Locale, slug = ''): string {
  const clean = slug.replace(/^\/+/, '').replace(/\/+$/, '');
  const prefix = locale === defaultLocale ? '' : `/${locale}`;
  if (clean === '') return prefix === '' ? '/' : `${prefix}/`;
  return `${prefix}/${clean}/`;
}

/** Same as {@link localePath} but absolute, using the configured site origin. */
export function absoluteLocalePath(origin: string, locale: Locale, slug = ''): string {
  return new URL(localePath(locale, slug), origin).toString();
}

/**
 * `<link rel="alternate" hreflang>` pairs for a slug.
 *
 * Returns one entry per locale plus `x-default`, which always points at the
 * Spanish version. This is the piece the old GTranslate setup could not do —
 * every language used to share a single URL.
 */
export function alternateLinks(
  origin: string,
  slug: string,
  available: readonly Locale[],
): Array<{ hreflang: string; href: string }> {
  const links = available.map((locale) => ({
    hreflang: localeInfo[locale].hreflang,
    href: absoluteLocalePath(origin, locale, slug),
  }));

  links.push({
    hreflang: 'x-default',
    href: absoluteLocalePath(origin, defaultLocale, slug),
  });

  return links;
}
