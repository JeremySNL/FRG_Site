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

/** Every locale that actually has content on disk. */
export async function availableLocales(): Promise<Locale[]> {
  const locales = new Set<Locale>();

  for (const entry of await getCollection('pages')) {
    locales.add(entry.data.locale);
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

/** A tag by its slug. */
export async function getTag(
  locale: Locale,
  slug: string,
): Promise<TagEntry | undefined> {
  const entry = await getEntry('tags', `${locale}/tags/${slug}`);
  return entry ?? undefined;
}
