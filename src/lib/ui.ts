/**
 * Interface strings for the site chrome (navigation, buttons, form labels,
 * accessibility text, …).
 *
 * Spanish is the source language and is always complete. The other locales
 * live in `src/i18n/<locale>.json` and are filled in by
 * `scripts/translate.mts`; anything still missing falls back to the Spanish
 * string, so a partially translated locale is never broken.
 */
import type { Locale } from './locales.ts';
import { defaultLocale } from './locales.ts';

import es from '../i18n/es.json';
import en from '../i18n/en.json';
import fr from '../i18n/fr.json';
import ja from '../i18n/ja.json';
import zhTW from '../i18n/zh-TW.json';

export interface UiStrings {
  skipToContent: string;
  openMenu: string;
  closeMenu: string;
  mainMenu: string;
  language: string;
  chooseLanguage: string;
  donate: string;
  quickLinks: string;
  contact: string;
  /** Heading of the impact/figures block on the home page. */
  statsTitle: string;
  /** Subtitle of the impact/figures block on the home page. */
  statsSubtitle: string;
  /** Badge over the featured general ambassador card. */
  ambassadorGeneralRole: string;
  /** Subheading above the country/area ambassador grid. */
  ambassadorAreaHeading: string;
  /** Introduction of the featured general ambassador; `{continent}` becomes the continent name. */
  ambassadorGeneralIntro: string;
  /** Contact page: contact details card. */
  contactInfoTitle: string;
  contactEmailLabel: string;
  contactPhoneLabel: string;
  contactAddressLabel: string;
  newsletterTitle: string;
  newsletterText: string;
  newsletterPlaceholder: string;
  newsletterSubmit: string;
  newsletterSuccess: string;
  newsletterError: string;
  copyright: string;
  readMore: string;
  viewProgram: string;
  latestPosts: string;
  allPosts: string;
  relatedPosts: string;
  categories: string;
  tags: string;
  share: string;
  publishedOn: string;
  notFoundTitle: string;
  notFoundText: string;
  backHome: string;
  /** Shown when an archive has no posts yet. */
  noPosts: string;
  /** Shown on the team page while the team members are not published yet. */
  teamEmpty: string;
  translationPendingTitle: string;
  translationPendingText: string;
  form: {
    name: string;
    phone: string;
    email: string;
    message: string;
    optional: string;
    required: string;
    submit: string;
    sending: string;
    success: string;
    error: string;
    rateLimited: string;
    invalidToken: string;
    /** Client-side validation: an empty required field. */
    fieldRequired: string;
    /** Client-side validation: a malformed e-mail address. */
    invalidEmail: string;
    contactTitle: string;
    contactText: string;
    donateTitle: string;
    donateText: string;
    donationType: string;
    donationTypePlaceholder: string;
    volunteerTitle: string;
    volunteerText: string;
    volunteerType: string;
    volunteerTypePlaceholder: string;
  };
}

/** Every field of the string table, optional at every level. */
export type PartialUiStrings = {
  [Key in keyof UiStrings]?: UiStrings[Key] extends Record<string, string>
    ? Partial<UiStrings[Key]>
    : UiStrings[Key];
};

/**
 * The string tables of the site.
 *
 * `scripts/translate.mts` writes the missing locales into the JSON files of
 * `src/i18n/`.
 */
const tables: Record<Locale, PartialUiStrings> = {
  es,
  en,
  fr,
  ja,
  'zh-TW': zhTW,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merge `overrides` on top of `base`, ignoring `undefined` values. */
function merge<T extends Record<string, unknown>>(
  base: T,
  overrides: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value)
        ? merge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }

  return result as T;
}

const cache = new Map<Locale, UiStrings>();

/**
 * Fully-populated UI strings for a locale. Any string that has not been
 * translated yet falls back to the Spanish original.
 */
export function getUi(locale: Locale): UiStrings {
  const cached = cache.get(locale);
  if (cached) return cached;

  const resolved = merge(
    es as unknown as Record<string, unknown>,
    tables[locale] ?? {},
  ) as unknown as UiStrings;

  cache.set(locale, resolved);
  return resolved;
}

export { defaultLocale };
