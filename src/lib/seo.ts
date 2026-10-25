/**
 * SEO metadata helpers.
 *
 * The old site used Yoast Premium. The important pieces — titles, meta
 * descriptions, canonical URLs, Open Graph and Twitter cards, and the
 * `hreflang` alternates that GTranslate could not produce — are rebuilt here
 * from the content frontmatter.
 */
import { mediaUrl, site } from './site.ts';
import {
  alternateLinks,
  defaultLocale,
  localeInfo,
  localePath,
  type Locale,
} from './locales.ts';

export interface SeoInput {
  locale: Locale;
  /** The locale the content actually came from (may differ when untranslated). */
  contentLocale?: Locale;
  /** Slug of the page within the locale, used to build the canonical URL. */
  slug: string;
  title: string;
  description?: string;
  /** Absolute or site-relative image path. */
  image?: string;
  type?: 'website' | 'article';
  /** ISO date, used for `article:published_time`. */
  publishedTime?: string;
  /** True when the page must not be indexed. */
  noindex?: boolean;
}

export interface SeoMeta {
  title: string;
  description: string;
  canonical: string;
  image: string;
  type: 'website' | 'article';
  noindex: boolean;
  alternates: Array<{ hreflang: string; href: string }>;
}

/** Build the SEO metadata for a page. */
export function buildSeo(input: SeoInput, available: readonly Locale[]): SeoMeta {
  const contentLocale = input.contentLocale ?? input.locale;
  const title = input.title;
  const description = input.description?.trim() ?? '';
  const canonical = new URL(localePath(input.locale, input.slug), site.url).toString();

  return {
    title,
    description,
    canonical,
    image: mediaUrl(input.image ?? ''),
    type: input.type ?? 'website',
    // A page served in a locale it has not been translated into must not be
    // indexed, otherwise it competes with the Spanish original.
    noindex: input.noindex ?? contentLocale !== input.locale,
    alternates: alternateLinks(site.url, input.slug, available),
  };
}

/** The `<title>` of a page, including the site name. */
export function pageTitle(title: string, locale: Locale = defaultLocale): string {
  const info = localeInfo[locale];
  void info;
  return `${title} | ${site.name}`;
}

/** The JSON-LD organisation schema. */
export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'NGO',
    name: site.name,
    alternateName: site.shortName,
    url: site.url,
    description: site.mission,
    email: site.email,
    telephone: site.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.city,
      addressRegion: site.address.region,
      addressCountry: 'DO',
    },
    sameAs: [site.social.facebook, site.social.instagram],
  };
}

/** The JSON-LD schema for a blog post. */
export function articleSchema(input: {
  title: string;
  description?: string;
  url: string;
  image?: string;
  publishedTime: string;
  locale: Locale;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: input.title,
    description: input.description,
    url: input.url,
    image: input.image ? mediaUrl(input.image) : undefined,
    datePublished: input.publishedTime,
    inLanguage: localeInfo[input.locale].htmlLang,
    author: { '@type': 'Organization', name: site.name },
    publisher: { '@type': 'Organization', name: site.name },
  };
}

/** The JSON-LD schema for a list of posts (the blog index). */
export function itemListSchema(input: {
  name: string;
  items: Array<{ name: string; url: string }>;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    itemListElement: input.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}
