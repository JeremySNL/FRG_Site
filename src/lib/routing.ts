/**
 * Route enumeration.
 *
 * The site has a single dispatcher route (`src/pages/[...path].astro`) that
 * serves every public URL. This module builds the list of paths that route
 * has to render.
 *
 * It lives outside the `.astro` file on purpose: Astro extracts
 * `getStaticPaths` into its own module, where only imported bindings are
 * available.
 */
import {
  availableLocales,
  getCategories,
  getPages,
  getPosts,
  getTags,
} from './content.ts';
import { defaultLocale, locales, type Locale } from './locales.ts';

/** Join path segments, skipping the empty ones. */
export function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/');
}

/** A path that the dispatcher route has to render. */
export interface StaticPath {
  params: { path: string | undefined };
}

/**
 * Every URL of the site, in every language.
 *
 * The languages that have not been translated yet are included as well: they
 * serve the Spanish content with a "translation in progress" notice and are
 * marked `noindex`, so the links of the language switcher keep working.
 */
export async function enumerateStaticPaths(): Promise<StaticPath[]> {
  const paths: StaticPath[] = [];
  const contentLocales = await availableLocales();
  // Collection iteration order is not guaranteed, so prefer the default
  // locale as the source of the URL structure instead of `[0]`: a translated
  // locale must never change the slugs of the Spanish URLs.
  const source = contentLocales.includes(defaultLocale)
    ? defaultLocale
    : (contentLocales[0] ?? defaultLocale);

  const pages = await getPages(source);
  const posts = await getPosts(source);
  const categories = await getCategories(source);
  const tags = await getTags(source);

  for (const locale of locales) {
    const prefix = locale === defaultLocale ? '' : locale;

    // The home page — `undefined` renders the site root.
    paths.push({ params: { path: prefix || undefined } });

    for (const page of pages) {
      if (page.data.slug === '') continue;
      paths.push({ params: { path: joinPath(prefix, page.data.slug) } });
    }

    for (const post of posts) {
      paths.push({
        params: { path: joinPath(prefix, 'actualidades', post.data.slug) },
      });
    }

    for (const category of categories) {
      paths.push({
        params: { path: joinPath(prefix, 'category', category.data.slug) },
      });
    }

    for (const tag of tags) {
      paths.push({ params: { path: joinPath(prefix, 'tag', tag.data.slug) } });
    }
  }

  return paths;
}

/** The locale a path belongs to, and the segments that follow it. */
export function describePath(path: string | undefined): {
  locale: Locale;
  segments: string[];
} {
  const clean = (path ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = clean === '' ? [] : clean.split('/');

  const first = parts[0];
  if (first !== undefined && (locales as readonly string[]).includes(first)) {
    return { locale: first as Locale, segments: parts.slice(1) };
  }

  return { locale: defaultLocale, segments: parts };
}
