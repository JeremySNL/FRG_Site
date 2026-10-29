import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildSeo } from '../src/lib/seo.ts';

const collections = new Map<string, unknown[]>();

vi.mock('astro:content', () => ({
  getCollection: (
    name: string,
    filter?: (entry: unknown) => boolean,
  ): Promise<unknown[]> => {
    const entries = collections.get(name) ?? [];
    return Promise.resolve(filter ? entries.filter(filter) : entries);
  },
  getEntry: (): Promise<undefined> => Promise.resolve(undefined),
}));

function page(locale: string, slug: string, order = 1) {
  return { data: { locale, slug, order } };
}

function post(locale: string, slug: string) {
  return {
    data: {
      locale,
      slug,
      date: new Date('2026-01-01T00:00:00.000Z'),
      categories: [],
      tags: [],
    },
  };
}

beforeEach(() => {
  collections.clear();
  vi.resetModules();
});

describe('sitemap locale availability', () => {
  it('omits URLs and alternates for pages without a translation', async () => {
    const locales = ['es', 'en', 'fr', 'ja', 'zh-TW'];
    collections.set('pages', [
      ...locales.map((locale) => page(locale, 'inicio')),
      page('es', 'politica-de-etica-y-seguridad'),
    ]);
    collections.set('posts', [
      ...locales.map((locale) => post(locale, 'historia-traducida')),
      post('es', 'historia-solo-espanol'),
    ]);
    collections.set('categories', []);
    collections.set('tags', []);

    const { GET } = await import('../src/pages/sitemap.xml.ts');
    const response = await GET({} as never);
    const xml = await response.text();
    const policyEntry = xml.match(
      /<url>\s*<loc>https:\/\/fundacionrosariogaton\.org\/politica-de-etica-y-seguridad\/<\/loc>[\s\S]*?<\/url>/,
    )?.[0];

    expect(policyEntry).toBeDefined();
    expect(policyEntry).toContain('hreflang="es"');
    expect(policyEntry).toContain('hreflang="x-default"');
    expect(policyEntry).not.toContain('hreflang="en"');
    expect(xml).not.toContain(
      'https://fundacionrosariogaton.org/en/politica-de-etica-y-seguridad/',
    );
  });

  it('keeps all locale URLs and alternates for translated posts', async () => {
    const locales = ['es', 'en', 'fr', 'ja', 'zh-TW'];
    collections.set(
      'pages',
      locales.map((locale) => page(locale, 'inicio')),
    );
    collections.set(
      'posts',
      locales.map((locale) => post(locale, 'historia')),
    );
    collections.set('categories', []);
    collections.set('tags', []);

    const { GET } = await import('../src/pages/sitemap.xml.ts');
    const response = await GET({} as never);
    const xml = await response.text();
    const postEntries = xml.match(
      /<url>[\s\S]*?<loc>[^<]*\/actualidades\/historia\/<\/loc>[\s\S]*?<\/url>/g,
    );

    expect(postEntries).toHaveLength(locales.length);
    for (const locale of ['es', 'en', 'fr', 'ja', 'zh-Hant']) {
      expect(postEntries?.[0]).toContain(`hreflang="${locale}"`);
    }
    expect(postEntries?.[0]).toContain('hreflang="x-default"');
  });
});

describe('SEO for a document fallback', () => {
  it('marks fallback content noindex and links only to the source locale', () => {
    const seo = buildSeo(
      {
        locale: 'en',
        contentLocale: 'es',
        slug: 'politica-de-etica-y-seguridad',
        title: 'Ethics and Safety Policy',
      },
      ['es'],
    );

    expect(seo.noindex).toBe(true);
    expect(seo.alternates.map((alternate) => alternate.hreflang)).toEqual([
      'es',
      'x-default',
    ]);
  });
});
