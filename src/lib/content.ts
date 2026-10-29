/**
 * Content access helpers.
 *
 * Every collection is stored per locale under `src/content/<locale>/…`. These
 * helpers are the only place that knows about that layout, so components and
 * routes never have to filter collections by locale themselves.
 */
import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

import { defaultLocale, type Locale } from './locales.ts';

export type PageEntry = CollectionEntry<'pages'>;
export type PostEntry = CollectionEntry<'posts'>;
export type ProgramEntry = CollectionEntry<'programs'>;
export type TeamEntry = CollectionEntry<'team'>;
export type CategoryEntry = CollectionEntry<'categories'>;
export type TagEntry = CollectionEntry<'tags'>;

export type RoutableContentKind = 'pages' | 'posts' | 'categories' | 'tags';
export type DocumentLocaleIndex = Record<RoutableContentKind, Map<string, Locale[]>>;

export interface LocalizedEntry<T> {
  entry: T | undefined;
  /** Locale the entry actually comes from. */
  contentLocale: Locale;
}

async function withDefaultLocaleFallback<T>(
  locale: Locale,
  lookup: (locale: Locale) => Promise<T | undefined>,
): Promise<LocalizedEntry<T>> {
  const entry = await lookup(locale);
  if (entry || locale === defaultLocale) return { entry, contentLocale: locale };

  const fallback = await lookup(defaultLocale);
  return {
    entry: fallback,
    contentLocale: fallback ? defaultLocale : locale,
  };
}

/** Every locale that actually has content on disk. */
export async function availableLocales(): Promise<Locale[]> {
  const locales = new Set<Locale>();

  // Every collection counts, not only `pages`: a locale with posts but no
  // pages yet would otherwise be invisible to `resolveLocale` and render an
  // empty blog instead of falling back to Spanish.
  const collections = [
    'pages',
    'posts',
    'programs',
    'team',
    'categories',
    'tags',
  ] as const;
  for (const collection of collections) {
    for (const entry of await getCollection(collection)) {
      locales.add(entry.data.locale);
    }
  }

  return [...locales];
}

/**
 * The locale a request should render.
 *
 * When the requested locale has no content yet (the machine translation has
 * not run), the Spanish content is served instead and the page is marked as
 * `noindex` so search engines do not see a duplicate.
 */
export async function resolveLocale(requested: Locale): Promise<{
  locale: Locale;
  /** The locale the content actually came from. */
  contentLocale: Locale;
  /** True when the content is a fallback for a not-yet-translated locale. */
  isFallback: boolean;
}> {
  const locales = await availableLocales();

  if (locales.includes(requested)) {
    return { locale: requested, contentLocale: requested, isFallback: false };
  }

  if (locales.includes(defaultLocale)) {
    return { locale: requested, contentLocale: defaultLocale, isFallback: true };
  }

  return { locale: requested, contentLocale: requested, isFallback: false };
}

/** All pages of a locale, ordered by their navigation order. */
export async function getPages(locale: Locale): Promise<PageEntry[]> {
  const pages = await getCollection('pages', (entry) => entry.data.locale === locale);

  return pages.sort((a, b) => a.data.order - b.data.order);
}

/** A single page by its slug. The home page uses the empty slug. */
export async function getPage(
  locale: Locale,
  slug: string,
): Promise<PageEntry | undefined> {
  const pages = await getPages(locale);
  return pages.find((page) => page.data.slug === slug);
}

/** Get a page in the requested locale, falling back to Spanish per document. */
export function getPageWithFallback(
  locale: Locale,
  slug: string,
): Promise<LocalizedEntry<PageEntry>> {
  return withDefaultLocaleFallback(locale, (candidate) => getPage(candidate, slug));
}

/** All posts of a locale, newest first. */
export async function getPosts(locale: Locale): Promise<PostEntry[]> {
  const posts = await getCollection('posts', (entry) => entry.data.locale === locale);

  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** A single post by its slug. */
export async function getPost(
  locale: Locale,
  slug: string,
): Promise<PostEntry | undefined> {
  const posts = await getPosts(locale);
  return posts.find((post) => post.data.slug === slug);
}

/** Get a post in the requested locale, falling back to Spanish per document. */
export function getPostWithFallback(
  locale: Locale,
  slug: string,
): Promise<LocalizedEntry<PostEntry>> {
  return withDefaultLocaleFallback(locale, (candidate) => getPost(candidate, slug));
}

/** All programs of a locale, ordered by their `order` field. */
export async function getPrograms(locale: Locale): Promise<ProgramEntry[]> {
  const programs = await getCollection(
    'programs',
    (entry) => entry.data.locale === locale,
  );

  return programs.sort((a, b) => a.data.order - b.data.order);
}

/** A program by its slug. */
export async function getProgram(
  locale: Locale,
  slug: string,
): Promise<ProgramEntry | undefined> {
  const programs = await getPrograms(locale);
  return programs.find((program) => program.data.slug === slug);
}

/** The team members of a locale. */
export async function getTeam(locale: Locale): Promise<TeamEntry[]> {
  const team = await getCollection('team', (entry) => entry.data.locale === locale);

  return team.sort((a, b) => a.data.order - b.data.order);
}

/** All categories of a locale. */
export async function getCategories(locale: Locale): Promise<CategoryEntry[]> {
  const categories = await getCollection(
    'categories',
    (entry) => entry.data.locale === locale,
  );

  return categories.sort((a, b) => a.data.order - b.data.order);
}

/** All tags of a locale. */
export async function getTags(locale: Locale): Promise<TagEntry[]> {
  return getCollection('tags', (entry) => entry.data.locale === locale);
}

/** The posts of a category, newest first. */
export async function getPostsByCategory(
  locale: Locale,
  categorySlug: string,
): Promise<PostEntry[]> {
  const posts = await getPosts(locale);

  return posts.filter((post) => post.data.categories.includes(categorySlug));
}

/** The posts of a tag, newest first. */
export async function getPostsByTag(
  locale: Locale,
  tagSlug: string,
): Promise<PostEntry[]> {
  const posts = await getPosts(locale);

  return posts.filter((post) => post.data.tags.includes(tagSlug));
}

/** A category by its slug. */
export async function getCategory(
  locale: Locale,
  slug: string,
): Promise<CategoryEntry | undefined> {
  const entry = await getEntry('categories', `${locale}/categories/${slug}`);
  return entry ?? undefined;
}

/** Get a category in the requested locale, falling back to Spanish per document. */
export function getCategoryWithFallback(
  locale: Locale,
  slug: string,
): Promise<LocalizedEntry<CategoryEntry>> {
  return withDefaultLocaleFallback(locale, (candidate) => getCategory(candidate, slug));
}

/** A tag by its slug. */
export async function getTag(
  locale: Locale,
  slug: string,
): Promise<TagEntry | undefined> {
  const entry = await getEntry('tags', `${locale}/tags/${slug}`);
  return entry ?? undefined;
}

/** Get a tag in the requested locale, falling back to Spanish per document. */
export function getTagWithFallback(
  locale: Locale,
  slug: string,
): Promise<LocalizedEntry<TagEntry>> {
  return withDefaultLocaleFallback(locale, (candidate) => getTag(candidate, slug));
}

let documentLocaleIndexPromise: Promise<DocumentLocaleIndex> | undefined;

/** Get per-document locale availability for routing, SEO, and sitemap output. */
export function getDocumentLocaleIndex(): Promise<DocumentLocaleIndex> {
  documentLocaleIndexPromise ??= buildDocumentLocaleIndex();
  return documentLocaleIndexPromise;
}

async function buildDocumentLocaleIndex(): Promise<DocumentLocaleIndex> {
  const index: DocumentLocaleIndex = {
    pages: new Map(),
    posts: new Map(),
    categories: new Map(),
    tags: new Map(),
  };

  const add = (kind: RoutableContentKind, slug: string, locale: Locale): void => {
    const locales = index[kind].get(slug) ?? [];
    if (!locales.includes(locale)) locales.push(locale);
    index[kind].set(slug, locales);
  };

  for (const entry of await getCollection('pages')) {
    add('pages', entry.data.slug, entry.data.locale);
  }
  for (const entry of await getCollection('posts')) {
    add('posts', entry.data.slug, entry.data.locale);
  }
  for (const entry of await getCollection('categories')) {
    add('categories', entry.data.slug, entry.data.locale);
  }
  for (const entry of await getCollection('tags')) {
    add('tags', entry.data.slug, entry.data.locale);
  }

  return index;
}
