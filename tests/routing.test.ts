import { describe, expect, it, vi } from 'vitest';

import type { CollectionEntry } from 'astro:content';

/**
 * The route enumerator and the sitemap must always describe the site from the
 * Spanish content: the collection iteration order is not guaranteed, so once a
 * second locale is materialized by `npm run translate`, picking
 * `availableLocales()[0]` would make the Spanish URLs switch their slugs to
 * whatever locale happens to sort first.
 */

const collections = new Map<string, unknown[]>();

vi.mock('astro:content', () => ({
  getCollection: (name: string, filter?: (entry: unknown) => boolean): Promise<unknown[]> => {
    const entries = collections.get(name) ?? [];
    return Promise.resolve(filter ? entries.filter(filter) : entries);
  },
  getEntry: (): Promise<undefined> => Promise.resolve(undefined),
}));

type PageMock = Pick<CollectionEntry<'pages'>, 'data'>;

/** Build a page entry with just the fields the helpers read. */
function page(locale: string, slug: string, order: number): PageMock {
  return { data: { locale, slug, order } as PageMock['data'] };
}

describe('enumerateStaticPaths', () => {
  it('enumerates from the default locale even when it is not first', async () => {
    // `en` is inserted first to simulate the non-deterministic collection
    // order that materializing translations can produce.
    collections.set('pages', [
      page('en', 'about-us', 1),
      page('es', 'nosotros', 1),
    ]);

    const { enumerateStaticPaths } = await import('../src/lib/routing.ts');
    const { defaultLocale } = await import('../src/lib/locales.ts');

    const paths = await enumerateStaticPaths();
    const slugs = paths
      .map(({ params }) => params.path ?? '')
      .filter((path) => path.endsWith('nosotros') || path.endsWith('about-us'));

    expect(slugs).toContain('nosotros');
    expect(slugs).not.toContain('about-us');
    expect(defaultLocale).toBe('es');
  });
});

describe('availableLocales', () => {
  it('reports a locale that only has posts, not only pages', async () => {
    collections.set('pages', [page('es', 'nosotros', 1)]);
    collections.set('posts', [
      { data: { locale: 'en' } } as unknown as CollectionEntry<'posts'>,
    ]);

    const { availableLocales } = await import('../src/lib/content.ts');
    const locales = await availableLocales();

    expect(locales).toContain('en');
    expect(locales).toContain('es');
  });
});
