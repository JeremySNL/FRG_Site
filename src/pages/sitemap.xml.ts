/**
 * The XML sitemap.
 *
 * It is built by hand instead of with `@astrojs/sitemap` because the site
 * uses a custom locale routing scheme: every entry carries the `hreflang`
 * alternates of all the languages the content exists in.
 */
import type { APIRoute } from 'astro';

import {
  availableLocales,
  getCategories,
  getPages,
  getPosts,
  getTags,
} from '~/lib/content.ts';
import { defaultLocale, localeInfo, localePath } from '~/lib/locales.ts';
import { site } from '~/lib/site.ts';

interface Entry {
  /** The slug inside a locale, e.g. `actualidades/mi-noticia`. */
  slug: string;
  lastmod?: Date;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async () => {
  const contentLocales = await availableLocales();

  if (contentLocales.length === 0) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset></urlset>', {
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    });
  }

  // Same rule as the route enumerator: the slugs of the sitemap must always
  // come from the default locale, whatever order the collections came in.
  const source = contentLocales.includes(defaultLocale)
    ? defaultLocale
    : (contentLocales[0] ?? defaultLocale);

  const pages = await getPages(source);
  const posts = await getPosts(source);
  const categories = await getCategories(source);
  const tags = await getTags(source);

  const entries: Entry[] = [
    { slug: '', changefreq: 'weekly', priority: '1.0' },
    ...pages
      .filter((page) => page.data.slug !== '')
      .map((page) => ({
        slug: page.data.slug,
        changefreq: 'monthly' as const,
        priority: '0.8',
      })),
    ...posts.map((post) => ({
      slug: `actualidades/${post.data.slug}`,
      lastmod: post.data.date,
      changefreq: 'monthly' as const,
      priority: '0.6',
    })),
    ...categories.map((category) => ({
      slug: `category/${category.data.slug}`,
      changefreq: 'weekly' as const,
      priority: '0.4',
    })),
    ...tags.map((tag) => ({
      slug: `tag/${tag.data.slug}`,
      changefreq: 'weekly' as const,
      priority: '0.3',
    })),
  ];

  const urls = entries
    .flatMap((entry) =>
      contentLocales.map((locale) => {
        const location = new URL(localePath(locale, entry.slug), site.url).toString();

        const alternates = contentLocales
          .map(
            (alternate) =>
              `    <xhtml:link rel="alternate" hreflang="${localeInfo[alternate].hreflang}" href="${escapeXml(new URL(localePath(alternate, entry.slug), site.url).toString())}" />`,
          )
          .join('\n');

        return [
          '  <url>',
          `    <loc>${escapeXml(location)}</loc>`,
          entry.lastmod ? `    <lastmod>${entry.lastmod.toISOString()}</lastmod>` : '',
          `    <changefreq>${entry.changefreq}</changefreq>`,
          `    <priority>${entry.priority}</priority>`,
          alternates,
          '  </url>',
        ]
          .filter(Boolean)
          .join('\n');
      }),
    )
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls,
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
